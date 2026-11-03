<?php

declare(strict_types=1);

namespace Gloop\Game;

use Gloop\Engine\Game;
use Gloop\Engine\Input;
use Gloop\Engine\Side;

/** Un match en cours entre deux clients : la partie (moteur), les touches reçues, l'état du résultat et de la revanche. */
final class Room
{
    public readonly Game $game;
    /** @var array{Input, Input} dernières touches de chaque côté */
    public array $inputs;
    /** Le résultat a été communiqué aux joueurs. */
    public bool $finished = false;
    /** Fin de la fenêtre de revanche (horodatage), une fois le résultat connu. */
    public int $closeAt = 0;
    /** @var array{bool, bool} */
    public array $rematch = [false, false];

    /** @param array{Client, Client} $players joueur de gauche, joueur de droite */
    public function __construct(public readonly array $players, public readonly bool $ranked, int $target, Side $server)
    {
        $this->game = new Game($target, $server);
        $this->inputs = [Input::none(), Input::none()];
    }

    public function sideOf(Client $client): ?Side
    {
        return match ($client) {
            $this->players[0] => Side::Left,
            $this->players[1] => Side::Right,
            default => null,
        };
    }

    public function opponentOf(Side $side): Client
    {
        return $this->players[$side->opposite()->value];
    }
}
