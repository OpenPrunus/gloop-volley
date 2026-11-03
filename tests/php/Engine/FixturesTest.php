<?php

declare(strict_types=1);

namespace Gloop\Tests\Engine;

use Gloop\Engine\Game;
use Gloop\Engine\Input;
use Gloop\Engine\Rules;
use Gloop\Engine\Side;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Rejoue, avec le port PHP, des parties complètes enregistrées avec le moteur JavaScript (tests/fixtures/generate.js) :
 * mêmes entrées => mêmes positions, scores et événements. Si ce test échoue après un changement de web/js/engine.js :
 * porter le changement en PHP, puis `npm run fixtures`.
 */
final class FixturesTest extends TestCase
{
    private const float TOLERANCE = 1e-9;

    /** @return array<string, mixed> */
    private static function vectors(): array
    {
        $data = json_decode((string) file_get_contents(__DIR__ . '/../../fixtures/engine-vectors.json'), true, flags: JSON_THROW_ON_ERROR);
        self::assertIsArray($data);

        return $data;
    }

    /** @return iterable<string, array{string}> */
    public static function scenarios(): iterable
    {
        foreach (self::vectors()['scenarios'] as $scenario) {
            yield $scenario['name'] => [$scenario['name']];
        }
    }

    public function testConstantsMatchTheJavaScriptEngine(): void
    {
        $js = self::vectors()['constants'];
        $php = [
            'W' => Rules::W, 'H' => Rules::H, 'NET_X' => Rules::NET_X, 'NET_H' => Rules::NET_H, 'NET_HW' => Rules::NET_HW, 'R' => Rules::R,
            'BALL_R' => Rules::BALL_R, 'SLIME_SPEED' => Rules::SLIME_SPEED, 'JUMP_V' => Rules::JUMP_V, 'SLIME_G' => Rules::SLIME_G,
            'BALL_G' => Rules::BALL_G, 'BALL_MAX' => Rules::BALL_MAX, 'SLIME_BOUNCE' => Rules::SLIME_BOUNCE, 'NET_BOUNCE' => Rules::NET_BOUNCE,
            'WALL_BOUNCE' => Rules::WALL_BOUNCE, 'SERVE_Y' => Rules::SERVE_Y, 'SERVE_TICKS' => Rules::SERVE_TICKS,
            'POINT_TICKS' => Rules::POINT_TICKS, 'TARGET' => Rules::TARGET,
        ];
        foreach ($php as $name => $value) {
            $this->assertEqualsWithDelta($js[$name], $value, 0.0, $name);
        }
        $this->assertCount(count($js), $php, 'toutes les constantes du moteur JS sont couvertes');
    }

    #[DataProvider('scenarios')]
    public function testReplayMatchesTheJavaScriptEngine(string $name): void
    {
        $scenario = array_find(self::vectors()['scenarios'], static fn (array $s): bool => $s['name'] === $name);
        $this->assertNotNull($scenario);
        $game = new Game($scenario['target'], Side::from($scenario['server']));
        $expectedStates = [];
        foreach ($scenario['states'] as $state) {
            $expectedStates[$state['tick']] = $state;
        }
        $expectedEvents = [];
        foreach ($scenario['events'] as [$tick, $type, $side]) {
            $expectedEvents[$tick][] = [$type, $side];
        }

        foreach ($scenario['inputs'] as [$leftBits, $rightBits]) {
            $events = $game->step(Input::fromBits($leftBits), Input::fromBits($rightBits));
            $got = array_map(static fn ($e): array => [$e->type->value, $e->side?->value], $events);
            $this->assertSame($expectedEvents[$game->tick] ?? [], $got, "événements au tick {$game->tick}");
            if (isset($expectedStates[$game->tick])) {
                $this->assertState($expectedStates[$game->tick], $game);
            }
        }
        $this->assertGreaterThan(0, count($expectedStates));
    }

    /** @param array<string, mixed> $e */
    private function assertState(array $e, Game $g): void
    {
        $at = "tick {$e['tick']}";
        foreach ([0, 1] as $i) {
            $s = $g->slimes[$i];
            $this->assertEqualsWithDelta($e['slimes'][$i], [$s->x, $s->y, $s->vx, $s->vy], self::TOLERANCE, "gloop $i, $at");
        }
        $this->assertEqualsWithDelta($e['ball'], [$g->ball->x, $g->ball->y, $g->ball->vx, $g->ball->vy], self::TOLERANCE, "ballon, $at");
        $this->assertSame($e['score'], $g->score, "score, $at");
        $phase = match ($g->phase->value) {
            's' => 'serve',
            'p' => 'play',
            't' => 'point',
            'o' => 'over',
        };
        $this->assertSame($e['phase'], $phase, "phase, $at");
        $this->assertSame($e['timer'], $g->timer, "minuterie, $at");
        $this->assertSame($e['server'], $g->server->value, "serveur, $at");
        $this->assertSame($e['winner'], $g->winner?->value, "vainqueur, $at");
        $this->assertSame($e['rally'], $g->rally, "échange, $at");
    }
}
