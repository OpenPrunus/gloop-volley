// Génère tests/fixtures/engine-vectors.json : parties complètes rejouées par le moteur JS (la référence).
// Les tests PHP (tests/php/Engine/FixturesTest.php) rejouent les mêmes entrées avec le port PHP et comparent l'état.
// À relancer (npm run fixtures) chaque fois que web/js/engine.js change.
import { writeFileSync } from 'node:fs';
import { C, createGame, step } from '../../web/js/engine.js';
import { createAI, seeded } from '../../web/js/ai.js';

const SAMPLE_EVERY = 4;
const enc = (i) => (i.left ? 1 : 0) | (i.right ? 2 : 0) | (i.up ? 4 : 0);

function record(name, { target = 7, server = 0, ticks, decide }) {
  const g = createGame({ target, server });
  const inputs = [];
  const states = [];
  const events = [];
  for (let t = 0; t < ticks; t++) {
    const pair = decide(g, t);
    inputs.push([enc(pair[0]), enc(pair[1])]);
    for (const e of step(g, pair)) events.push([g.tick, e.type, e.side ?? null]);
    if (g.tick % SAMPLE_EVERY === 0 || g.phase === 'over') {
      states.push({
        tick: g.tick,
        slimes: g.slimes.map((s) => [s.x, s.y, s.vx, s.vy]),
        ball: [g.ball.x, g.ball.y, g.ball.vx, g.ball.vy],
        score: [...g.score],
        phase: g.phase,
        timer: g.timer,
        server: g.server,
        winner: g.winner,
        rally: g.rally,
      });
    }
  }
  return { name, target, server, inputs, states, events };
}

const aiScenario = (name, a, b, seed, ticks, target = 7) => {
  const ais = [createAI(0, a, seed), createAI(1, b, seed)];
  return record(name, { target, server: seed % 2, ticks, decide: (g) => [ais[0].decide(g), ais[1].decide(g)] });
};

/** Entrées aléatoires maintenues quelques ticks : exerce murs, filet, sauts incessants. */
function chaos(name, seed, ticks, target) {
  const rand = seeded(seed);
  const held = [{ left: false, right: false, up: false }, { left: false, right: false, up: false }];
  const left = [0, 0];
  return record(name, {
    target,
    server: seed % 2,
    ticks,
    decide: () => {
      for (const s of [0, 1]) {
        if (--left[s] <= 0) {
          held[s] = { left: rand() < 0.4, right: rand() < 0.4, up: rand() < 0.3 };
          left[s] = 3 + Math.floor(rand() * 25);
        }
      }
      return [{ ...held[0] }, { ...held[1] }];
    },
  });
}

const scenarios = [
  aiScenario('hard-vs-hard-1', 'hard', 'hard', 1, 3600),
  aiScenario('normal-vs-hard-2', 'normal', 'hard', 2, 3600),
  aiScenario('easy-vs-normal-3', 'easy', 'normal', 3, 3600),
  aiScenario('hard-vs-easy-full-match', 'hard', 'easy', 4, 9000, 3),
  chaos('chaos-1', 11, 2400, 7),
  chaos('chaos-2', 12, 2400, 2),
  chaos('chaos-3', 13, 2400, 1),
];

const out = new URL('./engine-vectors.json', import.meta.url);
writeFileSync(out, JSON.stringify({ constants: C, scenarios }));
const events = scenarios.flatMap((s) => s.events.map((e) => e[1]));
const count = (t) => events.filter((e) => e === t).length;
console.log(`engine-vectors.json: ${scenarios.length} scénarios, hit=${count('hit')} net=${count('net')} wall=${count('wall')} point=${count('point')} win=${count('win')}`);
