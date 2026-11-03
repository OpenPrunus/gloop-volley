<?php

declare(strict_types=1);

namespace Gloop\Engine;

/** Ce qui s'est passé pendant un tick (sons et animations côté client). */
enum EventType: string
{
    case Serve = 'serve';
    case Hit = 'hit';
    case Net = 'net';
    case Wall = 'wall';
    case Point = 'point';
    case Win = 'win';
}
