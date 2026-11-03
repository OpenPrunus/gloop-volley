<?php

declare(strict_types=1);

namespace Gloop\Game;

use Gloop\Engine\Rules;
use Gloop\Support\Env;

/** Réglages du serveur de jeu (durées en secondes). */
final readonly class HubConfig
{
    public function __construct(
        public int $target = Rules::TARGET,
        public int $maxClients = 300,
        public int $inviteTtl = 20,
        public int $rematchTtl = 30,
        public int $rateLimit = 150,
    ) {
    }

    public static function fromEnvironment(): self
    {
        return new self(
            target: (int) Env::number('GLOOP_TARGET', Rules::TARGET),
            inviteTtl: (int) Env::number('GLOOP_INVITE_TTL', 20),
            rematchTtl: (int) Env::number('GLOOP_REMATCH_TTL', 30),
        );
    }
}
