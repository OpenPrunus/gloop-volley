import test from 'node:test';
import assert from 'node:assert/strict';
import { C, LEFT, RIGHT, NO_INPUT, createGame, step, stepBall, predictCrossing, cloneGame } from '../web/js/engine.js';

const idle = [NO_INPUT, NO_INPUT];
function run(g, ticks, inputs = idle) {
  const events = [];
  for (let i = 0; i < ticks; i++) events.push(...step(g, inputs));
  return events;
}
function inPlay(g) {
  run(g, C.SERVE_TICKS);
  assert.equal(g.phase, 'play');
}
/** Écarte les gloops du point de chute du service, pour tester un ballon qui tombe au sol. */
function clearOfServe(g) {
  g.slimes[LEFT].x = C.R;
  g.slimes[RIGHT].x = C.W - C.R;
}

test('une nouvelle partie démarre en phase de service, le ballon immobile au-dessus du serveur', () => {
  const g = createGame();
  assert.equal(g.phase, 'serve');
  assert.deepEqual(g.score, [0, 0]);
  assert.equal(g.ball.x, C.W / 4);
  assert.equal(g.ball.y, C.SERVE_Y);
  run(g, C.SERVE_TICKS - 1);
  assert.equal(g.ball.y, C.SERVE_Y, 'ballon figé pendant la pause');
  const ev = run(g, 1);
  assert.deepEqual(ev, [{ type: 'serve', side: LEFT }]);
});

test('le serveur initial peut être le côté droit', () => {
  assert.equal(createGame({ server: RIGHT }).ball.x, (3 * C.W) / 4);
});

test('un ballon lâché sans rien faire tombe au sol et donne le point à l\'autre côté', () => {
  const g = createGame(); // ballon au-dessus du côté gauche
  clearOfServe(g);
  inPlay(g);
  const ev = run(g, 120).filter((e) => e.type === 'point');
  assert.equal(ev.length, 1);
  assert.equal(ev[0].side, RIGHT);
  assert.deepEqual(g.score, [0, 1]);
  assert.equal(g.server, RIGHT, 'celui qui marque sert');
});

test('après un point, pause puis nouveau service du marqueur', () => {
  const g = createGame();
  clearOfServe(g);
  inPlay(g);
  run(g, 120);
  assert.equal(g.phase, 'point');
  for (let i = 0; i < C.POINT_TICKS && g.phase === 'point'; i++) step(g, idle);
  assert.equal(g.phase, 'serve');
  assert.equal(g.ball.x, (3 * C.W) / 4);
  assert.equal(g.ball.y, C.SERVE_Y);
});

test('la partie se termine au nombre de points visé', () => {
  const g = createGame({ target: 2 });
  for (let i = 0; i < 2; i++) {
    g.server = LEFT;
    g.phase = 'serve';
    g.ball.x = C.W / 4; g.ball.y = C.SERVE_Y; g.ball.vx = 0; g.ball.vy = 0; g.timer = 1;
    clearOfServe(g);
    run(g, 400);
    run(g, C.POINT_TICKS);
  }
  assert.equal(g.winner, RIGHT);
  run(g, C.POINT_TICKS + 5);
  assert.equal(g.phase, 'over');
  assert.deepEqual(step(g, idle), [], 'plus rien ne bouge');
});

test('l\'événement "win" accompagne le dernier point', () => {
  const g = createGame({ target: 1 });
  clearOfServe(g);
  inPlay(g);
  const ev = run(g, 300).map((e) => e.type);
  assert.deepEqual(ev.filter((t) => t === 'point' || t === 'win'), ['point', 'win']);
});

test('un gloop reste dans son camp, filet et murs compris', () => {
  const g = createGame();
  run(g, 200, [{ left: false, right: true, up: false }, { left: true, right: false, up: false }]);
  assert.equal(g.slimes[LEFT].x, C.NET_X - C.NET_HW - C.R);
  assert.equal(g.slimes[RIGHT].x, C.NET_X + C.NET_HW + C.R);
  run(g, 200, [{ left: true, right: false, up: false }, { left: false, right: true, up: false }]);
  assert.equal(g.slimes[LEFT].x, C.R);
  assert.equal(g.slimes[RIGHT].x, C.W - C.R);
});

test('un gloop saute, retombe au sol, et ne peut pas sauter en l\'air', () => {
  const g = createGame();
  const jump = [{ left: false, right: false, up: true }, NO_INPUT];
  step(g, jump);
  assert.ok(g.slimes[LEFT].y > 0);
  let peak = 0;
  for (let i = 0; i < 100; i++) {
    step(g, jump);
    peak = Math.max(peak, g.slimes[LEFT].y);
  }
  assert.ok(peak > 80 && peak < 140, `sommet du saut plausible (${peak})`);
  // en maintenant la touche, il enchaîne les sauts mais ne s'envole pas indéfiniment
  assert.ok(peak < C.R * 3);
  run(g, 60);
  assert.equal(g.slimes[LEFT].y, 0);
});

test('le ballon rebondit sur un gloop et repart vers le haut', () => {
  const g = createGame();
  inPlay(g);
  g.ball.x = g.slimes[LEFT].x; g.ball.y = 130; g.ball.vx = 0; g.ball.vy = -6;
  const ev = run(g, 40).filter((e) => e.type === 'hit');
  assert.ok(ev.length >= 1);
  assert.equal(ev[0].side, LEFT);
  assert.ok(g.ball.vy > 0 || g.ball.y > 100, 'le ballon remonte');
});

test('frapper le ballon avec le côté du filet l\'envoie vers l\'adversaire', () => {
  const g = createGame();
  inPlay(g);
  const s = g.slimes[LEFT];
  g.ball.x = s.x + 25; g.ball.y = 60; g.ball.vx = 0; g.ball.vy = -4; // à droite du centre du gloop
  run(g, 3);
  assert.ok(g.ball.vx > 0, 'part vers la droite');
});

test('le ballon rebondit sur le filet et reste de son côté', () => {
  const b = { x: C.NET_X - 30, y: 30, vx: 8, vy: 0 };
  let touched = false;
  for (let i = 0; i < 20; i++) {
    for (const c of stepBall(b, null, 1)) if (c.kind === 'net') touched = true;
  }
  assert.ok(touched);
  assert.ok(b.x < C.NET_X - C.NET_HW, 'rejeté côté gauche');
  assert.ok(b.vx < 0);
});

test('le ballon qui passe au-dessus du filet continue de l\'autre côté', () => {
  const b = { x: C.NET_X - 60, y: 200, vx: 6, vy: 0 };
  for (let i = 0; i < 40; i++) stepBall(b, null, 1);
  assert.ok(b.x > C.NET_X);
});

test('les murs renvoient le ballon', () => {
  const b = { x: 30, y: 300, vx: -9, vy: 0 };
  for (let i = 0; i < 10; i++) stepBall(b, null, 1);
  assert.ok(b.vx > 0 && b.x >= C.BALL_R);
});

test('la vitesse du ballon est bornée', () => {
  const g = createGame();
  inPlay(g);
  for (let i = 0; i < 300; i++) {
    g.ball.vx = 30; g.ball.vy = -30;
    stepBall(g.ball, g.slimes, 1);
    assert.ok(Math.hypot(g.ball.vx, g.ball.vy) <= C.BALL_MAX + 1e-9);
  }
});

test('un ballon en équilibre sur le filet finit par glisser', () => {
  const b = { x: C.NET_X, y: C.NET_H + C.NET_HW + C.BALL_R, vx: 0, vy: 0 };
  let crossed = false;
  for (let i = 0; i < 400 && !crossed; i++) {
    stepBall(b, null, 1);
    if (b.y <= C.BALL_R) crossed = true;
  }
  assert.ok(crossed, 'le ballon tombe d\'un côté');
});

test('predictCrossing prévoit l\'atterrissage (trajectoire sans gloop)', () => {
  const g = createGame();
  g.ball = { x: 100, y: 300, vx: 3, vy: 0 };
  const p = predictCrossing(g.ball, 30);
  assert.ok(p && p.ticks > 10);
  const b = { ...g.ball };
  for (let i = 0; i < p.ticks; i++) stepBall(b, null, 1); // pas de substeps : approx
  assert.ok(Math.abs(b.x - p.x) < 40);
});

test('le moteur est déterministe', () => {
  const play = () => {
    const g = createGame();
    const inputs = [{ left: false, right: true, up: true }, { left: true, right: false, up: false }];
    for (let i = 0; i < 1500; i++) step(g, inputs);
    return JSON.stringify(g);
  };
  assert.equal(play(), play());
});

test('cloneGame est indépendant de l\'original', () => {
  const g = createGame();
  const c = cloneGame(g);
  run(c, 100);
  assert.equal(g.tick, 0);
});
