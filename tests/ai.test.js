import test from 'node:test';
import assert from 'node:assert/strict';
import { C, LEFT, RIGHT, createGame, step } from '../web/js/engine.js';
import { createAI, seeded, LEVELS } from '../web/js/ai.js';

function match(levelL, levelR, seed, target = 7, maxTicks = 60 * 60 * 20) {
  const g = createGame({ target, server: seed % 2 });
  const ais = [createAI(LEFT, levelL, seed), createAI(RIGHT, levelR, seed)];
  let rallyMax = 0;
  while (g.phase !== 'over' && g.tick < maxTicks) {
    step(g, [ais[0].decide(g), ais[1].decide(g)]);
    rallyMax = Math.max(rallyMax, g.rally);
  }
  return { g, rallyMax };
}

test('le générateur à graine est déterministe et dans [0,1)', () => {
  const a = seeded(42), b = seeded(42);
  for (let i = 0; i < 100; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
  assert.notEqual(seeded(1)(), seeded(2)());
});

test('IA contre IA : les parties de niveaux différents se terminent', () => {
  const pairs = [['easy', 'normal'], ['normal', 'hard'], ['easy', 'hard'], ['easy', 'easy']];
  for (const [a, b] of pairs) {
    for (let seed = 1; seed <= 4; seed++) {
      const { g } = match(a, b, seed);
      assert.equal(g.phase, 'over', `${a} vs ${b} #${seed} terminée`);
      assert.ok(g.winner === LEFT || g.winner === RIGHT);
      assert.equal(Math.max(...g.score), g.target);
    }
  }
});

test('IA contre IA de même niveau : la partie progresse (des points sont marqués)', () => {
  for (const level of ['normal', 'hard']) {
    const { g } = match(level, level, 3, 7, 60 * 60 * 5);
    assert.ok(g.score[0] + g.score[1] >= 1, `${level}: ${g.score}`);
  }
});

test('l\'IA difficile échange réellement le ballon (échanges de plusieurs touches)', () => {
  let best = 0;
  for (let seed = 1; seed <= 6; seed++) best = Math.max(best, match('hard', 'hard', seed, 7, 60 * 60 * 3).rallyMax);
  assert.ok(best >= 6, `plus long échange : ${best}`);
});

test('l\'IA difficile bat l\'IA facile dans la grande majorité des parties', () => {
  let wins = 0;
  const N = 12;
  for (let seed = 1; seed <= N; seed++) {
    const hardLeft = seed % 2 === 0;
    const { g } = match(hardLeft ? 'hard' : 'easy', hardLeft ? 'easy' : 'hard', seed);
    if (g.winner === (hardLeft ? LEFT : RIGHT)) wins++;
  }
  assert.ok(wins >= N - 2, `${wins}/${N}`);
});

test('l\'IA normale bat l\'IA facile le plus souvent', () => {
  let wins = 0;
  const N = 12;
  for (let seed = 1; seed <= N; seed++) {
    const normalLeft = seed % 2 === 0;
    const { g } = match(normalLeft ? 'normal' : 'easy', normalLeft ? 'easy' : 'normal', seed);
    if (g.winner === (normalLeft ? LEFT : RIGHT)) wins++;
  }
  assert.ok(wins >= N * 0.65, `${wins}/${N}`);
});

test('l\'IA ne fait rien quand le point est joué', () => {
  const g = createGame();
  g.phase = 'point';
  assert.deepEqual(createAI(LEFT, 'hard').decide(g), { left: false, right: false, up: false });
});

test('un niveau inconnu retombe sur "normal"', () => {
  assert.doesNotThrow(() => createAI(LEFT, 'inconnu').decide(createGame()));
});

test('l\'IA reste dans son camp', () => {
  const g = createGame();
  const ai = createAI(RIGHT, 'hard', 3);
  for (let i = 0; i < 3000; i++) {
    step(g, [{ left: false, right: false, up: false }, ai.decide(g)]);
    assert.ok(g.slimes[RIGHT].x >= C.NET_X + C.NET_HW + C.R - 1e-9);
    if (g.phase === 'over') break;
  }
});
