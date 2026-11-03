<?php

declare(strict_types=1);

namespace Gloop\Engine;

final readonly class GameEvent
{
    public function __construct(public EventType $type, public ?Side $side = null, public float $power = 0.0)
    {
    }
}
