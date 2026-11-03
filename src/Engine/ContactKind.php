<?php

declare(strict_types=1);

namespace Gloop\Engine;

enum ContactKind: string
{
    case Slime = 'hit';
    case Net = 'net';
    case Wall = 'wall';
}
