<?php

declare(strict_types=1);

namespace Gloop\Engine;

/** Le ballon : gravité, rebonds sur les murs, le filet (rectangle à sommet arrondi) et les gloops (demi-disques). */
final class Ball
{
    public function __construct(
        public float $x = 0.0,
        public float $y = 0.0,
        public float $vx = 0.0,
        public float $vy = 0.0,
    ) {
    }

    /**
     * Avance d'une fraction de tick. `$slimes` : [gauche, droite], ou null pour une trajectoire libre (prévisions).
     *
     * @param array{Slime, Slime}|null $slimes
     * @return list<Contact>
     */
    public function step(?array $slimes, float $dt = 1.0): array
    {
        $contacts = [];
        $this->vy -= Rules::BALL_G * $dt;
        $this->x += $this->vx * $dt;
        $this->y += $this->vy * $dt;

        if ($this->x < Rules::BALL_R) {
            $this->x = Rules::BALL_R;
            if ($this->vx < 0) {
                $this->vx = -$this->vx * Rules::WALL_BOUNCE;
                $contacts[] = new Contact(ContactKind::Wall, abs($this->vx));
            }
        } elseif ($this->x > Rules::W - Rules::BALL_R) {
            $this->x = Rules::W - Rules::BALL_R;
            if ($this->vx > 0) {
                $this->vx = -$this->vx * Rules::WALL_BOUNCE;
                $contacts[] = new Contact(ContactKind::Wall, abs($this->vx));
            }
        }

        $capPower = $this->bounceOnCircle(Rules::NET_X, Rules::NET_H, Rules::NET_HW, 0.0, 0.0, Rules::NET_BOUNCE);
        if ($capPower > 0) {
            $contacts[] = new Contact(ContactKind::Net, $capPower);
        }
        if ($this->y < Rules::NET_H && abs($this->x - Rules::NET_X) < Rules::NET_HW + Rules::BALL_R) {
            $leftSide = $this->x < Rules::NET_X;
            $this->x = Rules::NET_X + ($leftSide ? -1 : 1) * (Rules::NET_HW + Rules::BALL_R);
            if ($leftSide ? $this->vx > 0 : $this->vx < 0) {
                $contacts[] = new Contact(ContactKind::Net, abs($this->vx));
                $this->vx = -$this->vx * Rules::NET_BOUNCE;
            }
        }
        // Un ballon posé pile sur le haut du filet glisse d'un côté plutôt que de s'y équilibrer.
        if (
            abs($this->x - Rules::NET_X) < 0.5
            && abs($this->y - (Rules::NET_H + Rules::NET_HW + Rules::BALL_R)) < 0.5
            && abs($this->vx) < 0.05
        ) {
            $this->vx = 0.4;
        }

        if ($slimes !== null) {
            foreach ([Side::Left, Side::Right] as $side) {
                $s = $slimes[$side->value];
                if ($this->y < $s->y) {
                    continue;                                   // sous le centre : un gloop est un demi-disque
                }
                $power = $this->bounceOnCircle($s->x, $s->y, Rules::R, $s->vx, $s->vy, Rules::SLIME_BOUNCE);
                if ($power > 0) {
                    $contacts[] = new Contact(ContactKind::Slime, $power, $side);
                }
            }
        }
        $this->capSpeed();

        return $contacts;
    }

    /** Rebond sur un disque (éventuellement mobile) ; renvoie la vitesse d'impact, 0 sans contact. */
    private function bounceOnCircle(float $cx, float $cy, float $radius, float $cvx, float $cvy, float $e): float
    {
        $dx = $this->x - $cx;
        $dy = $this->y - $cy;
        $min = $radius + Rules::BALL_R;
        $d2 = $dx * $dx + $dy * $dy;
        if ($d2 >= $min * $min) {
            return 0.0;
        }
        $d = sqrt($d2);
        if ($d === 0.0) {
            $d = 1e-6;
        }
        $nx = $d2 === 0.0 ? 0.0 : $dx / $d;
        $ny = $d2 === 0.0 ? 1.0 : $dy / $d;
        $this->x = $cx + $nx * $min;
        $this->y = $cy + $ny * $min;
        $vn = ($this->vx - $cvx) * $nx + ($this->vy - $cvy) * $ny;
        if ($vn >= 0) {
            return 0.0;
        }
        $this->vx -= (1 + $e) * $vn * $nx;
        $this->vy -= (1 + $e) * $vn * $ny;

        return -$vn;
    }

    private function capSpeed(): void
    {
        $v = sqrt($this->vx * $this->vx + $this->vy * $this->vy);
        if ($v > Rules::BALL_MAX) {
            $this->vx *= Rules::BALL_MAX / $v;
            $this->vy *= Rules::BALL_MAX / $v;
        }
    }
}
