<?php

declare(strict_types=1);

namespace Gloop\Game\Handler;

use Gloop\Game\Client;
use Gloop\Game\Event;
use Gloop\Game\Invitations;
use Gloop\Game\Lobby;

/** Le joueur qui a lancé un défi le retire. */
final readonly class CancelHandler implements MessageHandler
{
    public function __construct(private Lobby $lobby, private Invitations $invitations)
    {
    }

    #[\Override]
    public function handle(Client $client, array $msg): void
    {
        $invitation = $client->invite;
        if ($invitation === null || $invitation->from !== $client) {
            return;
        }
        $this->invitations->cancel($client);
        $invitation->to->send(Event::InviteCancel, ['id' => $client->id]);
        $this->lobby->dirty = true;
    }
}
