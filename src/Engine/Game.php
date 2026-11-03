<?php

declare(strict_types=1);

namespace Gloop\Engine;

/**
 * Une partie de volley : deux gloops, un ballon, un score. Pas de hasard, pas d'horloge : mêmes entrées, mêmes résultats.
 * Port exact de createGame() / step() de web/js/engine.js (vérifié par des vecteurs générés depuis le JavaScript).
 */
final class Game
{
    /** @var array{Slime, Slime} */
    public readonly array $slimes;
    public readonly Ball $ball;
    /** @var array{int, int} */
    public array $score = [0, 0];
    public Phase $phase = Phase::Serve;
    public int $timer = 0;
    public ?Side $winner = null;
    public ?Side $lastScorer = null;
    public int $rally = 0;
    public int $tick = 0;

    public function __construct(public readonly int $target = Rules::TARGET, public Side $server = Side::Left)
    {
        $this->slimes = [new Slime(Side::Left->homeX()), new Slime(Side::Right->homeX())];
        $this->ball = new Ball();
        $this->placeBall();
    }

    private function placeBall(): void
    {
        $this->ball->x = $this->server->homeX();
        $this->ball->y = Rules::SERVE_Y;
        $this->ball->vx = 0.0;
        $this->ball->vy = 0.0;
        $this->timer = Rules::SERVE_TICKS;
        $this->phase = Phase::Serve;
        $this->rally = 0;
    }

    /**
     * Avance d'un tick (1/60 s) et renvoie ce qui s'est produit.
     *
     * @return list<GameEvent>
     */
    public function step(Input $left, Input $right): array
    {
        $events = [];
        $this->tick++;
        if ($this->phase === Phase::Over) {
            return $events;
        }
        $this->slimes[Side::Left->value]->step(Side::Left, $left);
        $this->slimes[Side::Right->value]->step(Side::Right, $right);

        if ($this->phase === Phase::Serve) {
            if (--$this->timer <= 0) {
                $this->phase = Phase::Play;
                $events[] = new GameEvent(EventType::Serve, $this->server);
            }

            return $events;
        }
        if ($this->phase === Phase::Point) {
            if (--$this->timer <= 0) {
                if ($this->winner !== null) {
                    $this->phase = Phase::Over;
                } else {
                    $this->placeBall();
                }
            }

            return $events;
        }

        for ($i = 0; $i < Rules::SUBSTEPS; $i++) {
            foreach ($this->ball->step($this->slimes, 1 / Rules::SUBSTEPS) as $contact) {
                if ($contact->kind === ContactKind::Slime) {
                    $this->rally++;
                    $events[] = new GameEvent(EventType::Hit, $contact->side, $contact->power);
                } else {
                    $events[] = new GameEvent(EventType::from($contact->kind->value), null, $contact->power);
                }
            }
            if ($this->ball->y <= Rules::BALL_R) {
                $this->ball->y = Rules::BALL_R;
                $scorer = $this->ball->x < Rules::NET_X ? Side::Right : Side::Left;
                $this->score[$scorer->value]++;
                $this->lastScorer = $scorer;
                $this->server = $scorer;
                $this->phase = Phase::Point;
                $this->timer = Rules::POINT_TICKS;
                $events[] = new GameEvent(EventType::Point, $scorer);
                if ($this->score[$scorer->value] >= $this->target) {
                    $this->winner = $scorer;
                    $events[] = new GameEvent(EventType::Win, $scorer);
                }
                break;
            }
        }

        return $events;
    }
}
