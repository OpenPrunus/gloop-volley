<?php

declare(strict_types=1);

namespace Gloop\Engine;

/** Côté du filet : gauche ou droite. */
enum Side: int
{
    case Left = 0;
    case Right = 1;

    public function opposite(): self
    {
        return match ($this) {
            self::Left => self::Right,
            self::Right => self::Left,
        };
    }

    /** Position de départ d'un gloop de ce côté (et point de lâcher du ballon quand il sert). */
    public function homeX(): float
    {
        return match ($this) {
            self::Left => Rules::W / 4,
            self::Right => 3 * Rules::W / 4,
        };
    }
}
