<?php

declare(strict_types=1);

namespace Gloop\Game\Handler;

use Gloop\Game\Client;
use Gloop\Game\MatchService;

final readonly class RematchHandler implements MessageHandler
{
    public function __construct(private MatchService $matches)
    {
    }

    #[\Override]
    public function handle(Client $client, array $msg): void
    {
        $this->matches->requestRematch($client);
    }
}
