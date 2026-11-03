<?php

declare(strict_types=1);

namespace Gloop\Engine;

/** Un gloop : un demi-disque posé au sol (y = 0, vers le haut) qui se déplace et saute dans son camp. */
final class Slime
{
    public function __construct(
        public float $x,
        public float $y = 0.0,
        public float $vx = 0.0,
        public float $vy = 0.0,
    ) {
    }

    public function step(Side $side, Input $input): void
    {
        $dir = ($input->right ? 1 : 0) - ($input->left ? 1 : 0);
        $this->vx = $dir * Rules::SLIME_SPEED;
        $lo = $side === Side::Left ? Rules::R : Rules::NET_X + Rules::NET_HW + Rules::R;
        $hi = $side === Side::Left ? Rules::NET_X - Rules::NET_HW - Rules::R : Rules::W - Rules::R;
        $this->x = min($hi, max($lo, $this->x + $this->vx));
        if ($this->y === 0.0 && $this->vy === 0.0 && $input->up) {
            $this->vy = Rules::JUMP_V;
        }
        if ($this->y > 0 || $this->vy > 0) {
            $this->vy -= Rules::SLIME_G;
            $this->y += $this->vy;
            if ($this->y <= 0) {
                $this->y = 0.0;
                $this->vy = 0.0;
            }
        }
    }
}
