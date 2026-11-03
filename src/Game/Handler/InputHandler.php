<?php

declare(strict_types=1);

namespace Gloop\Game\Handler;

use Gloop\Engine\Input;
use Gloop\Game\Client;
use Gloop\Game\MatchService;

/** Touches du joueur : le serveur ne reçoit rien d'autre pendant un match (il calcule tout le reste). */
final readonly class InputHandler implements MessageHandler
{
    public function __construct(private MatchService $matches)
    {
    }

    #[\Override]
    public function handle(Client $client, array $msg): void
    {
        $this->matches->setInput($client, new Input(($msg['l'] ?? false) === true, ($msg['r'] ?? false) === true, ($msg['u'] ?? false) === true));
    }
}
