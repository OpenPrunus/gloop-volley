<?php

declare(strict_types=1);

namespace Gloop\Engine;

/** Phase d'une partie. Le code d'une lettre est celui du protocole réseau. */
enum Phase: string
{
    case Serve = 's';   // pause avant le service, ballon figé
    case Play = 'p';    // échange en cours
    case Point = 't';   // point marqué, pause
    case Over = 'o';    // partie terminée
}
