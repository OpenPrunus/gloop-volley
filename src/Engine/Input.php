<?php

declare(strict_types=1);

namespace Gloop\Engine;

/** Touches enfoncées par un joueur pendant un tick. */
final readonly class Input
{
    public function __construct(public bool $left = false, public bool $right = false, public bool $up = false)
    {
    }

    public static function none(): self
    {
        return new self();
    }

    /** Depuis le champ de 3 bits des vecteurs de test : 1 = gauche, 2 = droite, 4 = saut. */
    public static function fromBits(int $bits): self
    {
        return new self(($bits & 1) !== 0, ($bits & 2) !== 0, ($bits & 4) !== 0);
    }
}
