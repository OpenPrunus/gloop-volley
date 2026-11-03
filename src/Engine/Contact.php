<?php

declare(strict_types=1);

namespace Gloop\Engine;

/** Un contact du ballon pendant un demi-tick : avec un gloop (`side` renseigné), le filet ou un mur. */
final readonly class Contact
{
    public function __construct(public ContactKind $kind, public float $power, public ?Side $side = null)
    {
    }
}
