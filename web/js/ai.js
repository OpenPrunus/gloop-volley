// Gloop Volley — adversaire contrôlé par l'ordinateur.
// Il prévoit où le ballon va redescendre (même physique que le jeu), se place légèrement du côté du filet opposé
// à la trajectoire pour renvoyer vers l'adversaire, et saute au bon moment. Les niveaux dégradent sa précision,
// sa vitesse et sa réactivité ; le hasard vient d'un générateur à graine, donc une partie est rejouable.

import { C, LEFT, NO_INPUT, predictCrossing, stepBall } from './engine.js';

export const LEVELS = Object.freeze({
  easy: { speed: 0.62, react: 16, error: 38, jump: 0.8, noise: 60 },
  normal: { speed: 0.78, react: 10, error: 22, jump: 0.9, noise: 30 },
  hard: { speed: 1, react: 3, error: 9, jump: 0.97, noise: 6 },
});

/** Générateur pseudo-aléatoire déterministe (mulberry32) renvoyant des réels dans [0, 1). */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HIT_Y = C.R * 0.7; // hauteur à laquelle on veut intercepter le ballon
const CONTACT = C.R + C.BALL_R;
const OFFSETS = [8, 14, 20, 26, 32, 38, 44, 50];

/**
 * Pour un ballon qui arrive avec la vitesse (vx, vy) et que l'on frappe avec le côté du gloop situé à `offset` du ballon,
 * simule le renvoi (même physique que le jeu) et note le résultat : -Infinity si le ballon touche le filet ou retombe chez
 * nous, sinon la distance entre son point de chute et l'adversaire (plus il est loin de lui, mieux c'est).
 */
function scoreReturn(x, hit, offset, dir, opponentX) {
  const h = Math.sqrt(CONTACT * CONTACT - offset * offset);
  const nx = (dir * offset) / CONTACT;
  const ny = h / CONTACT;
  const vn = hit.vx * nx + hit.vy * ny;
  const b = { x, y: h, vx: hit.vx, vy: hit.vy };
  if (vn < 0) {
    b.vx -= 2 * vn * nx;
    b.vy -= 2 * vn * ny;
  }
  const v = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
  if (v > C.BALL_MAX) {
    b.vx *= C.BALL_MAX / v;
    b.vy *= C.BALL_MAX / v;
  }
  let crossed = false;
  for (let t = 0; t < 220; t++) {
    const before = b.x;
    const contacts = stepBall(b, null, 1);
    if (contacts.some((c) => c.kind === 'net')) return -Infinity;
    if ((before - C.NET_X) * (b.x - C.NET_X) <= 0) crossed = true;
    if (b.y <= C.BALL_R) return crossed ? Math.abs(b.x - opponentX) - (b.x < 0 || b.x > C.W ? 1e3 : 0) : -Infinity;
  }
  return crossed ? 0 : -Infinity;
}

export function createAI(side, level = 'normal', seed = 1) {
  const cfg = LEVELS[level] ?? LEVELS.normal;
  const rand = seeded(seed + side * 7919);
  const home = side === LEFT ? C.W / 4 : (3 * C.W) / 4;
  const sign = side === LEFT ? -1 : 1; // se placer du côté opposé au filet par rapport au ballon
  let target = home;
  let wait = 0;
  let moveBudget = 0;

  function plan(g) {
    const b = g.ball;
    if (g.phase === 'serve' && g.server !== side) return home;
    const hit = g.phase === 'serve' ? { x: b.x, ticks: 0, vx: 0, vy: -C.BALL_G * 50 } : predictCrossing(b, HIT_Y);
    if (!hit) return home;
    const mine = side === LEFT ? hit.x < C.NET_X : hit.x > C.NET_X;
    if (!mine) return home + (hit.x - C.W / 2) * 0.1; // le ballon va chez l'autre : retour au centre de son camp
    const opponentX = g.slimes[1 - side].x;
    let best = OFFSETS[0];
    let bestScore = -Infinity;
    for (const offset of OFFSETS) {
      const sc = scoreReturn(hit.x, hit, offset, -sign, opponentX);
      const noisy = sc === -Infinity ? sc : sc + rand() * cfg.noise;
      if (noisy > bestScore) {
        bestScore = noisy;
        best = offset;
      }
    }
    if (bestScore === -Infinity) best = 14 + rand() * 20; // aucun renvoi sûr : une chandelle
    return hit.x + sign * best + (rand() - 0.5) * 2 * cfg.error;
  }

  return {
    level,
    decide(g) {
      if (g.phase === 'over' || g.phase === 'point') return NO_INPUT;
      if (--wait <= 0) {
        target = plan(g);
        wait = cfg.react;
      }
      const me = g.slimes[side];
      const dx = target - me.x;
      const input = { left: false, right: false, up: false };
      moveBudget += cfg.speed;
      if (Math.abs(dx) > 5 && moveBudget >= 1) {
        moveBudget -= 1;
        if (dx < 0) input.left = true;
        else input.right = true;
      } else if (moveBudget > 2) {
        moveBudget = 2;
      }
      const b = g.ball;
      const close = Math.abs(b.x - me.x) < C.R * 0.95 && b.y < C.R + 70 && b.y > 18 && b.vy < 3;
      if (close && g.phase === 'play' && me.y === 0 && rand() < cfg.jump) input.up = true;
      return input;
    },
  };
}
