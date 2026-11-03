<?php

declare(strict_types=1);

namespace Gloop\Tests\Engine;

use Gloop\Engine\Ball;
use Gloop\Engine\ContactKind;
use Gloop\Engine\EventType;
use Gloop\Engine\Game;
use Gloop\Engine\Input;
use Gloop\Engine\Phase;
use Gloop\Engine\Rules;
use Gloop\Engine\Side;
use PHPUnit\Framework\TestCase;

final class GameTest extends TestCase
{
    /** @return list<\Gloop\Engine\GameEvent> */
    private static function play(Game $g, int $ticks, ?Input $left = null, ?Input $right = null): array
    {
        $events = [];
        for ($i = 0; $i < $ticks; $i++) {
            array_push($events, ...$g->step($left ?? Input::none(), $right ?? Input::none()));
        }

        return $events;
    }

    /** Écarte les gloops du point de chute du service. */
    private static function clearOfServe(Game $g): void
    {
        [$left, $right] = $g->slimes;
        $left->x = Rules::R;
        $right->x = Rules::W - Rules::R;
    }

    public function testNewGameWaitsForTheServeWithAFrozenBall(): void
    {
        $g = new Game();
        $this->assertSame(Phase::Serve, $g->phase);
        $this->assertSame([Rules::W / 4, Rules::SERVE_Y], [$g->ball->x, $g->ball->y]);
        self::play($g, Rules::SERVE_TICKS - 1);
        $this->assertSame(Rules::SERVE_Y, $g->ball->y);
        $events = self::play($g, 1);
        $this->assertSame([EventType::Serve], array_map(static fn ($e): EventType => $e->type, $events));
        $this->assertSame(Phase::Play, $g->phase);
    }

    public function testTheScorerServesNext(): void
    {
        $g = new Game();
        self::clearOfServe($g);
        self::play($g, Rules::SERVE_TICKS + 120);
        $this->assertSame([0, 1], $g->score, 'le ballon tombe côté gauche : point à droite');
        $this->assertSame(Side::Right, $g->server);
        $this->assertSame(Side::Right, $g->lastScorer);
        for ($i = 0; $i < Rules::POINT_TICKS && $g->phase === Phase::Point; $i++) {
            $g->step(Input::none(), Input::none());
        }
        $this->assertSame(Phase::Serve, $g->phase);
        $this->assertSame(Side::Right->homeX(), $g->ball->x);
    }

    public function testMatchEndsAtTheTargetAndFreezes(): void
    {
        $g = new Game(1);
        self::clearOfServe($g);
        $events = self::play($g, Rules::SERVE_TICKS + 120);
        $this->assertSame([EventType::Serve, EventType::Point, EventType::Win], array_map(static fn ($e): EventType => $e->type, $events));
        $this->assertSame(Side::Right, $g->winner);
        self::play($g, Rules::POINT_TICKS + 5);
        $this->assertSame(Phase::Over, $g->phase);
        $score = $g->score;
        $this->assertSame([], self::play($g, 10));
        $this->assertSame($score, $g->score);
    }

    public function testSlimesStayInTheirHalf(): void
    {
        $g = new Game();
        self::play($g, 200, new Input(right: true), new Input(left: true));
        $this->assertSame(Rules::NET_X - Rules::NET_HW - Rules::R, $g->slimes[0]->x);
        $this->assertSame(Rules::NET_X + Rules::NET_HW + Rules::R, $g->slimes[1]->x);
        self::play($g, 200, new Input(left: true), new Input(right: true));
        $this->assertSame(Rules::R, $g->slimes[0]->x);
        $this->assertSame(Rules::W - Rules::R, $g->slimes[1]->x);
    }

    public function testSlimeJumpsAndLands(): void
    {
        $g = new Game();
        $g->step(new Input(up: true), Input::none());
        $this->assertGreaterThan(0, $g->slimes[0]->y);
        $peak = 0.0;
        for ($i = 0; $i < 80; $i++) {
            $g->step(Input::none(), Input::none());
            $peak = max($peak, $g->slimes[0]->y);
        }
        $this->assertGreaterThan(80, $peak);
        $this->assertLessThan(140, $peak);
        $this->assertSame(0.0, $g->slimes[0]->y);
    }

    public function testBallBouncesOnTheNetAndStaysOnItsSide(): void
    {
        $b = new Ball(Rules::NET_X - 30, 30.0, 8.0, 0.0);
        $touched = false;
        for ($i = 0; $i < 20; $i++) {
            foreach ($b->step(null) as $c) {
                $touched = $touched || $c->kind === ContactKind::Net;
            }
        }
        $this->assertTrue($touched);
        $this->assertLessThan(Rules::NET_X - Rules::NET_HW, $b->x);
        $this->assertLessThan(0, $b->vx);
    }

    public function testBallSpeedIsCapped(): void
    {
        $b = new Ball(100.0, 300.0, 40.0, -40.0);
        $b->step(null);
        $this->assertLessThanOrEqual(Rules::BALL_MAX + 1e-9, sqrt($b->vx ** 2 + $b->vy ** 2));
    }

    public function testBallBouncesOnASlimeWithTheNetSideSendingItAcross(): void
    {
        $g = new Game();
        self::play($g, Rules::SERVE_TICKS);
        $g->ball->x = $g->slimes[0]->x + 25;
        $g->ball->y = 60.0;
        $g->ball->vx = 0.0;
        $g->ball->vy = -4.0;
        $events = self::play($g, 3);
        $this->assertSame(EventType::Hit, $events[0]->type);
        $this->assertSame(Side::Left, $events[0]->side);
        $this->assertGreaterThan(0, $g->ball->vx);
        $this->assertSame(1, $g->rally);
    }

    public function testInputBitsDecode(): void
    {
        $this->assertEquals(new Input(true, false, true), Input::fromBits(5));
        $this->assertEquals(new Input(false, true, false), Input::fromBits(2));
        $this->assertEquals(Input::none(), Input::fromBits(0));
    }

    public function testSideHelpers(): void
    {
        $this->assertSame(Side::Right, Side::Left->opposite());
        $this->assertSame(Side::Left, Side::Right->opposite());
        $this->assertSame(200.0, Side::Left->homeX());
        $this->assertSame(600.0, Side::Right->homeX());
    }
}
