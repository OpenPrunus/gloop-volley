<?php

declare(strict_types=1);

namespace Gloop\Engine;

/** Constantes du terrain et de la physique : doivent rester identiques à `C` dans web/js/engine.js (les vecteurs de test le vérifient). */
final class Rules
{
    final public const float W = 800.0;
    final public const float H = 450.0;
    final public const float NET_X = 400.0;
    final public const float NET_H = 80.0;
    final public const float NET_HW = 4.0;
    final public const float R = 48.0;
    final public const float BALL_R = 11.0;
    final public const float SLIME_SPEED = 5.0;
    final public const float JUMP_V = 10.5;
    final public const float SLIME_G = 0.55;
    final public const float BALL_G = 0.22;
    final public const float BALL_MAX = 13.0;
    final public const float SLIME_BOUNCE = 1.0;
    final public const float NET_BOUNCE = 0.85;
    final public const float WALL_BOUNCE = 0.9;
    final public const float SERVE_Y = 300.0;
    final public const int SERVE_TICKS = 60;
    final public const int POINT_TICKS = 90;
    final public const int TARGET = 7;
    final public const int SUBSTEPS = 2;
    final public const int TICKS_PER_SECOND = 60;
}
