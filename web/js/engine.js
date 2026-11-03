// Gloop Volley — moteur de jeu pur (aucun DOM, aucun hasard, pas d'horloge) : mêmes entrées => mêmes résultats.
// Repère : x vers la droite, y vers le HAUT, le sol est à y = 0. Le moteur avance par pas fixes de 1/60 s ("ticks").

export const C = Object.freeze({
  W: 800,            // largeur du terrain
  H: 450,            // hauteur visible du terrain
  NET_X: 400,        // position du filet
  NET_H: 80,         // hauteur du filet
  NET_HW: 4,         // demi-épaisseur du filet (le haut est arrondi)
  R: 48,             // rayon d'un gloop (demi-disque)
  BALL_R: 11,        // rayon du ballon
  SLIME_SPEED: 5,    // vitesse horizontale d'un gloop (unités / tick)
  JUMP_V: 10.5,      // vitesse initiale du saut
  SLIME_G: 0.55,     // gravité d'un gloop
  BALL_G: 0.22,      // gravité du ballon
  BALL_MAX: 13,      // vitesse maximale du ballon
  SLIME_BOUNCE: 1,   // élasticité ballon / gloop
  NET_BOUNCE: 0.85,  // élasticité ballon / filet
  WALL_BOUNCE: 0.9,  // élasticité ballon / murs
  SERVE_Y: 300,      // hauteur de lâcher du ballon
  SERVE_TICKS: 60,   // pause avant chaque service
  POINT_TICKS: 90,   // pause après chaque point
  TARGET: 7,         // points pour gagner (par défaut)
});

export const LEFT = 0;
export const RIGHT = 1;
export const NO_INPUT = Object.freeze({ left: false, right: false, up: false });

const HOME_X = [C.W / 4, (3 * C.W) / 4];
const SUBSTEPS = 2;

/** Crée une partie. `server` : côté qui sert en premier. */
export function createGame({ target = C.TARGET, server = LEFT } = {}) {
  const g = {
    slimes: [
      { x: HOME_X[LEFT], y: 0, vx: 0, vy: 0 },
      { x: HOME_X[RIGHT], y: 0, vx: 0, vy: 0 },
    ],
    ball: { x: 0, y: 0, vx: 0, vy: 0 },
    score: [0, 0],
    target,
    server,
    phase: 'serve',   // 'serve' | 'play' | 'point' | 'over'
    timer: 0,
    winner: null,
    lastScorer: null,
    lastTouch: null,  // dernier côté ayant touché le ballon
    rally: 0,         // nombre de touches depuis le service
    tick: 0,
  };
  placeBall(g);
  return g;
}

function placeBall(g) {
  g.ball.x = HOME_X[g.server];
  g.ball.y = C.SERVE_Y;
  g.ball.vx = 0;
  g.ball.vy = 0;
  g.timer = C.SERVE_TICKS;
  g.phase = 'serve';
  g.lastTouch = null;
  g.rally = 0;
}

function stepSlime(s, side, input) {
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  s.vx = dir * C.SLIME_SPEED;
  const lo = side === LEFT ? C.R : C.NET_X + C.NET_HW + C.R;
  const hi = side === LEFT ? C.NET_X - C.NET_HW - C.R : C.W - C.R;
  s.x = Math.min(hi, Math.max(lo, s.x + s.vx));
  if (s.y === 0 && s.vy === 0 && input.up) s.vy = C.JUMP_V;
  if (s.y > 0 || s.vy > 0) {
    s.vy -= C.SLIME_G;
    s.y += s.vy;
    if (s.y <= 0) {
      s.y = 0;
      s.vy = 0;
    }
  }
}

/** Rebond du ballon sur un disque (mobile ou non). Renvoie la vitesse relative d'impact, ou 0 s'il n'y a pas de contact. */
function bounceOnCircle(b, cx, cy, radius, cvx, cvy, e) {
  const dx = b.x - cx;
  const dy = b.y - cy;
  const min = radius + C.BALL_R;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min) return 0;
  const d = Math.sqrt(d2) || 1e-6;
  const nx = d2 === 0 ? 0 : dx / d;
  const ny = d2 === 0 ? 1 : dy / d;
  b.x = cx + nx * min;
  b.y = cy + ny * min;
  const vn = (b.vx - cvx) * nx + (b.vy - cvy) * ny;
  if (vn >= 0) return 0;
  b.vx -= (1 + e) * vn * nx;
  b.vy -= (1 + e) * vn * ny;
  return -vn;
}

function capSpeed(b) {
  const v = Math.sqrt(b.vx * b.vx + b.vy * b.vy); // pas de Math.hypot : son arrondi peut différer de celui de PHP
  if (v > C.BALL_MAX) {
    b.vx *= C.BALL_MAX / v;
    b.vy *= C.BALL_MAX / v;
  }
}

/**
 * Avance le ballon d'un demi-tick : gravité, murs, filet, et gloops si fournis.
 * Renvoie la liste des contacts : { kind: 'slime'|'net'|'wall', side?, power }.
 */
export function stepBall(b, slimes, dt = 1) {
  const contacts = [];
  b.vy -= C.BALL_G * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;

  if (b.x < C.BALL_R) {
    b.x = C.BALL_R;
    if (b.vx < 0) {
      b.vx = -b.vx * C.WALL_BOUNCE;
      contacts.push({ kind: 'wall', power: Math.abs(b.vx) });
    }
  } else if (b.x > C.W - C.BALL_R) {
    b.x = C.W - C.BALL_R;
    if (b.vx > 0) {
      b.vx = -b.vx * C.WALL_BOUNCE;
      contacts.push({ kind: 'wall', power: Math.abs(b.vx) });
    }
  }

  // Filet : le haut est un disque, le corps un rectangle.
  const capPower = bounceOnCircle(b, C.NET_X, C.NET_H, C.NET_HW, 0, 0, C.NET_BOUNCE);
  if (capPower > 0) contacts.push({ kind: 'net', power: capPower });
  if (b.y < C.NET_H && Math.abs(b.x - C.NET_X) < C.NET_HW + C.BALL_R) {
    const leftSide = b.x < C.NET_X;
    b.x = C.NET_X + (leftSide ? -1 : 1) * (C.NET_HW + C.BALL_R);
    if (leftSide ? b.vx > 0 : b.vx < 0) {
      contacts.push({ kind: 'net', power: Math.abs(b.vx) });
      b.vx = -b.vx * C.NET_BOUNCE;
    }
  }
  // Un ballon posé pile sur le haut du filet glisse d'un côté plutôt que de s'y équilibrer.
  if (Math.abs(b.x - C.NET_X) < 0.5 && Math.abs(b.y - (C.NET_H + C.NET_HW + C.BALL_R)) < 0.5 && Math.abs(b.vx) < 0.05) {
    b.vx = 0.4;
  }

  if (slimes) {
    for (let side = 0; side < 2; side++) {
      const s = slimes[side];
      if (b.y < s.y) continue; // sous le centre du disque : le gloop est un demi-disque
      const power = bounceOnCircle(b, s.x, s.y, C.R, s.vx, s.vy, C.SLIME_BOUNCE);
      if (power > 0) contacts.push({ kind: 'slime', side, power });
    }
  }
  capSpeed(b);
  return contacts;
}

/**
 * Prévision (sans gloops) : où et quand le ballon franchit la hauteur `y` en descendant ?
 * Renvoie { x, ticks, vx, vy } (position et vitesse au franchissement) ou null s'il ne la franchit pas dans l'horizon.
 */
export function predictCrossing(ball, y, horizon = 400) {
  const b = { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy };
  let ticks = 0;
  while (ticks < horizon) {
    const before = b.y;
    for (let i = 0; i < SUBSTEPS; i++) stepBall(b, null, 1 / SUBSTEPS);
    ticks++;
    if (b.vy < 0 && before >= y && b.y <= y) return { x: b.x, ticks, vx: b.vx, vy: b.vy };
    if (b.y <= C.BALL_R) return { x: b.x, ticks, vx: b.vx, vy: b.vy };
  }
  return null;
}

/**
 * Avance la partie d'un tick. `inputs` = [entréeGauche, entréeDroite].
 * Renvoie les événements de ce tick : serve, hit, net, wall, point, win.
 */
export function step(g, inputs) {
  const events = [];
  g.tick++;
  if (g.phase === 'over') return events;

  stepSlime(g.slimes[LEFT], LEFT, inputs[LEFT] ?? NO_INPUT);
  stepSlime(g.slimes[RIGHT], RIGHT, inputs[RIGHT] ?? NO_INPUT);

  if (g.phase === 'serve') {
    if (--g.timer <= 0) {
      g.phase = 'play';
      events.push({ type: 'serve', side: g.server });
    }
    return events;
  }
  if (g.phase === 'point') {
    if (--g.timer <= 0) {
      if (g.winner !== null) g.phase = 'over';
      else placeBall(g);
    }
    return events;
  }

  for (let i = 0; i < SUBSTEPS; i++) {
    for (const c of stepBall(g.ball, g.slimes, 1 / SUBSTEPS)) {
      if (c.kind === 'slime') {
        g.rally++;
        g.lastTouch = c.side;
        events.push({ type: 'hit', side: c.side, power: c.power });
      } else {
        events.push({ type: c.kind, power: c.power });
      }
    }
    if (g.ball.y <= C.BALL_R) {
      g.ball.y = C.BALL_R;
      const scorer = g.ball.x < C.NET_X ? RIGHT : LEFT;
      g.score[scorer]++;
      g.lastScorer = scorer;
      g.server = scorer;
      g.phase = 'point';
      g.timer = C.POINT_TICKS;
      events.push({ type: 'point', side: scorer, x: g.ball.x });
      if (g.score[scorer] >= g.target) {
        g.winner = scorer;
        events.push({ type: 'win', side: scorer });
      }
      break;
    }
  }
  return events;
}

/** Copie profonde (utile à l'IA et aux tests). */
export function cloneGame(g) {
  return structuredClone(g);
}
