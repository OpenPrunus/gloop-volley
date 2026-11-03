<?php

declare(strict_types=1);

namespace Gloop\Game\Handler;

use Gloop\Game\Client;
use Gloop\Game\Event;
use Gloop\Game\Invitations;
use Gloop\Game\Lobby;

final readonly class DeclineHandler implements MessageHandler
{
    public function __construct(private Lobby $lobby, private Invitations $invitations)
    {
    }

    #[\Override]
    public function handle(Client $client, array $msg): void
    {
        $invitation = $client->invite;
        if ($invitation === null || $invitation->to !== $client || $invitation->from->id !== ($msg['id'] ?? null)) {
            return;
        }
        $this->invitations->cancel($client);
        $invitation->from->send(Event::Declined, ['name' => $client->name]);
        $this->lobby->dirty = true;
    }
}
