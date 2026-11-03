<?php

declare(strict_types=1);

namespace Gloop\Game\Handler;

use Gloop\Game\Client;
use Gloop\Game\ClientStatus;
use Gloop\Game\Event;
use Gloop\Game\Lobby;
use Gloop\Game\MatchQueue;

final readonly class UnqueueHandler implements MessageHandler
{
    public function __construct(private Lobby $lobby, private MatchQueue $queue)
    {
    }

    #[\Override]
    public function handle(Client $client, array $msg): void
    {
        $this->queue->leave($client);
        if ($client->status === ClientStatus::Queued) {
            $client->status = ClientStatus::Lobby;
            $client->send(Event::Unqueued);
            $this->lobby->dirty = true;
        }
    }
}
