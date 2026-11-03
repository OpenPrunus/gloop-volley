<?php

declare(strict_types=1);

namespace Gloop\Game;

use Gloop\Engine\EventType;
use Gloop\Engine\GameEvent;
use Gloop\Engine\Input;
use Gloop\Engine\Phase;
use Gloop\Engine\Side;
use Gloop\Ranking\Participant;
use Gloop\Ranking\RankedMatch;
use Psr\Clock\ClockInterface;
use Psr\Log\LoggerInterface;
use Random\Randomizer;

/** Cycle de vie des matchs : création, tick du moteur, diffusion de l'état, résultat, forfait et revanche. */
final class MatchService
{
    /** @var list<Room> */
    private array $rooms = [];

    public function __construct(
        private readonly HubConfig $config,
        private readonly Lobby $lobby,
        private readonly MatchQueue $queue,
        private readonly Invitations $invitations,
        private readonly RankingBook $book,
        private readonly ClockInterface $clock,
        private readonly LoggerInterface $logger,
        private readonly Randomizer $randomizer,
    ) {
    }

    public function count(): int
    {
        return count($this->rooms);
    }

    /** Lance un match ; le côté de chacun et le premier serveur sont tirés au hasard. */
    public function start(Client $a, Client $b): Room
    {
        foreach ([$a, $b] as $client) {
            $this->queue->leave($client);
            $this->cancelInvitation($client);
        }
        [$left, $right] = $this->randomizer->getInt(0, 1) === 0 ? [$a, $b] : [$b, $a];
        $ranked = $a->hasToken && $b->hasToken && $a->tokenHash !== $b->tokenHash;
        $room = new Room([$left, $right], $ranked, $this->config->target, Side::from($this->randomizer->getInt(0, 1)));
        $this->open($room);
        $this->logger->info("Match {$left->name} vs {$right->name} (" . ($ranked ? 'ranked' : 'friendly') . ')');

        return $room;
    }

    private function open(Room $room): void
    {
        $this->rooms[] = $room;
        foreach ([Side::Left, Side::Right] as $side) {
            $player = $room->players[$side->value];
            $opponent = $room->opponentOf($side);
            $player->room = $room;
            $player->status = ClientStatus::Playing;
            $player->send(Event::Match, [
                'side' => $side->value,
                'target' => $room->game->target,
                'ranked' => $room->ranked,
                'opp' => ['name' => $opponent->name, 'rating' => $this->book->ranking->ratingOf((string) $opponent->name)],
            ]);
        }
        $this->lobby->dirty = true;
    }

    public function setInput(Client $client, Input $input): void
    {
        $room = $client->room;
        $side = $room?->sideOf($client);
        if ($room !== null && $side !== null && !$room->finished) {
            $room->inputs[$side->value] = $input;
        }
    }

    /** Un tick (1/60 s) pour tous les matchs : on avance le moteur et on envoie l'état aux deux joueurs. */
    public function tick(int $now): void
    {
        foreach ($this->rooms as $room) {
            $game = $room->game;
            $events = $game->step($room->inputs[0], $room->inputs[1]);
            foreach ($events as $event) {
                if ($event->type === EventType::Win && !$room->finished && $game->winner !== null) {
                    $this->finish($room, $game->winner, false, $now);
                }
            }
            $this->broadcast($room, $events);
            if ($room->finished && $now >= $room->closeAt) {
                $this->close($room);
            }
        }
    }

    /** @param list<GameEvent> $events */
    private function broadcast(Room $room, array $events): void
    {
        $game = $room->game;
        [$left, $right] = $game->slimes;
        $state = [
            'n' => $game->tick,
            'p' => [self::round($left->x), self::round($left->y), self::round($right->x), self::round($right->y)],
            'b' => [self::round($game->ball->x), self::round($game->ball->y)],
            'sc' => $game->score,
            'ph' => $game->phase->value,
            'lt' => $game->lastScorer?->value,
            'sv' => $game->server->value,
        ];
        if ($events !== []) {
            $state['ev'] = array_map(static fn (GameEvent $e): array => match ($e->type) {
                EventType::Hit => [$e->type->value, $e->side?->value, self::round($e->power)],
                EventType::Point, EventType::Win, EventType::Serve => [$e->type->value, $e->side?->value],
                default => [$e->type->value],
            }, $events);
        }
        foreach ($room->players as $player) {
            $player->send(Event::State, $state);
        }
    }

    private static function round(float $v): float
    {
        return round($v, 1);
    }

    /** Annonce le résultat et met à jour le classement. `$forfeit` : un joueur est parti avant la fin. */
    private function finish(Room $room, Side $winner, bool $forfeit, int $now): void
    {
        if ($room->finished) {
            return;
        }
        $room->finished = true;
        $room->closeAt = $now + $this->config->rematchTtl;
        $game = $room->game;
        $result = null;
        if ($room->ranked && (!$forfeit || array_sum($game->score) >= 2)) {
            [$a, $b] = $room->players;
            $result = $this->book->settle(
                new RankedMatch(
                    new Participant((string) $a->name, $a->tokenHash, $game->score[0]),
                    new Participant((string) $b->name, $b->tokenHash, $game->score[1]),
                    $winner === Side::Left,
                ),
                $now,
            );
        }
        foreach ([Side::Left, Side::Right] as $side) {
            $room->players[$side->value]->send(Event::Result, [
                'winner' => $winner->value,
                'forfeit' => $forfeit,
                'score' => $game->score,
                'ranked' => $room->ranked,
                ...($result !== null ? ['delta' => $result->deltas[$side->value], 'rating' => $result->ratings[$side->value]] : []),
            ]);
        }
    }

    /** Un joueur quitte (volontairement ou parce qu'il est déconnecté) : forfait s'il restait des points à jouer. */
    public function leave(Client $client, ?int $now = null): void
    {
        $room = $client->room;
        $side = $room?->sideOf($client);
        if ($room === null || $side === null) {
            return;
        }
        $now ??= $this->clock->now()->getTimestamp();
        if (!$room->finished) {
            $this->finish($room, $side->opposite(), true, $now);
        }
        $opponent = $room->opponentOf($side);
        $client->room = null;
        $client->status = $client->isNamed ? ClientStatus::Lobby : ClientStatus::New;
        if ($opponent->room === $room) {
            $opponent->room = null;
            $opponent->status = ClientStatus::Lobby;
            $opponent->send(Event::OpponentLeft);
        }
        $this->remove($room);
    }

    /** Demande de revanche ; quand les deux la demandent, un nouveau match commence avec les mêmes joueurs. */
    public function requestRematch(Client $client): void
    {
        $room = $client->room;
        $side = $room?->sideOf($client);
        if ($room === null || $side === null || !$room->finished) {
            return;
        }
        $room->rematch[$side->value] = true;
        $room->opponentOf($side)->send(Event::RematchAsk);
        if ($room->rematch[0] && $room->rematch[1]) {
            $this->remove($room);
            $this->open(new Room($room->players, $room->ranked, $this->config->target, Side::from($this->randomizer->getInt(0, 1))));
        }
    }

    /** Fin de la fenêtre de revanche : les deux joueurs retournent au salon. */
    private function close(Room $room): void
    {
        foreach ($room->players as $player) {
            if ($player->room === $room) {
                $player->room = null;
                $player->status = ClientStatus::Lobby;
                $player->send(Event::Left);
            }
        }
        $this->remove($room);
    }

    private function remove(Room $room): void
    {
        $this->rooms = array_values(array_filter($this->rooms, static fn (Room $r): bool => $r !== $room));
        $this->lobby->dirty = true;
    }

    private function cancelInvitation(Client $client): void
    {
        $invitation = $this->invitations->cancel($client);
        if ($invitation !== null) {
            $invitation->other($client)->send(Event::InviteCancel, ['id' => $client->id]);
            $this->lobby->dirty = true;
        }
    }

    /** Pour les tests et le journal : le match est-il terminé et réglé ? */
    public function isRunning(Room $room): bool
    {
        return in_array($room, $this->rooms, true) && $room->game->phase !== Phase::Over;
    }
}
