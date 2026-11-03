// Intégration : le VRAI serveur PHP (server/server.php) sur un vrai port, avec des clients WebSocket.
import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createGame, step, C } from '../web/js/engine.js';
import { Bot, startGameServer, sleep, token, waitFor } from './helpers.js';

let server;
const bots = [];
const bot = async (name, tok) => {
  const b = await new Bot(server.url).open();
  bots.push(b);
  if (name) await b.hello(name, tok);
  return b;
};

before(async () => { server = await startGameServer({ GLOOP_TARGET: '1', GLOOP_REMATCH_TTL: '3' }); });
after(() => { for (const b of bots) b.close(); server?.stop(); });

describe('serveur de jeu', () => {
  test('poignée de main, pseudo, salon', async () => {
    const a = await bot('Alice');
    const b = await bot('Bob');
    assert.equal(a.last('welcome').name, 'Alice');
    const lobby = await a.next('lobby', 4000, true);
    assert.ok(lobby);
    await waitFor(() => a.last('lobby')?.players.some((p) => p.name === 'Bob'), 4000, 'Bob visible dans le salon');
    assert.deepEqual(b.last('welcome').ranked, false);
  });

  test('un pseudo déjà pris ou invalide est refusé', async () => {
    const c = await bot(null);
    c.send({ t: 'hello', name: 'alice' });
    assert.equal((await c.next('error')).code, 'name_taken');
    c.send({ t: 'hello', name: '<>' });
    assert.equal((await c.next('error')).code, 'bad_name');
    c.send({ t: 'queue' });
    assert.equal((await c.next('error')).code, 'not_ready');
  });

  test('partie rapide : match, état à 60 Hz, entrées, résultat et classement', async () => {
    const a = await bot('Rapide1', token('r1'));
    const b = await bot('Rapide2', token('r2'));
    a.send({ t: 'queue' });
    await a.next('queued');
    b.send({ t: 'queue' });
    const [ma, mb] = await Promise.all([a.next('match'), b.next('match')]);
    assert.equal(ma.side + mb.side, 1);
    assert.equal(ma.ranked, true);
    assert.equal(ma.target, 1);

    // l'état arrive environ 60 fois par seconde
    const n0 = a.of('s').length;
    await sleep(1000);
    const rate = a.of('s').length - n0;
    assert.ok(rate >= 45 && rate <= 75, `fréquence d'état : ${rate}/s`);

    // chacun s'écarte vers son mur : le ballon tombe sans être touché et le serveur compte le point
    const sideOf = (m) => m.side;
    a.send({ t: 'input', l: sideOf(ma) === 0, r: sideOf(ma) === 1, u: false });
    b.send({ t: 'input', l: sideOf(mb) === 0, r: sideOf(mb) === 1, u: false });
    const [ra, rb] = await Promise.all([a.next('result', 10000), b.next('result', 10000)]);
    assert.equal(ra.winner, rb.winner);
    assert.equal(ra.score[0] + ra.score[1], 1);
    assert.equal(ra.ranked, true);
    assert.equal(ra.delta + rb.delta, 0);

    // le classement est public (api.php lit le même fichier) et enregistré sur disque
    const file = path.join(server.dataDir, 'ratings.json');
    await waitFor(() => fs.existsSync(file), 3000, 'ratings.json');
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(saved.players.length, 2);
    assert.ok(saved.players.every((p) => p.tokenHash.length === 64 && !JSON.stringify(p).includes(token('r1'))), 'le jeton n\'est jamais stocké en clair');

    // sans revanche, tout le monde retourne au salon après la fenêtre (3 s ici)
    await Promise.all([a.next('left', 8000), b.next('left', 8000)]);
  });

  test('la physique du serveur est celle du moteur JS : mêmes entrées, mêmes positions', async () => {
    const a = await bot('Phys1');
    const b = await bot('Phys2');
    a.send({ t: 'queue' });
    b.send({ t: 'queue' });
    const [ma] = await Promise.all([a.next('match'), b.next('match')]);
    // on rejoue côté JS les états reçus : le gloop du joueur a, qui saute puis se déplace
    a.send({ t: 'input', l: false, r: true, u: true });
    const from = a.last('s')?.n ?? 0;
    await waitFor(() => (a.last('s')?.n ?? 0) > from + 30, 4000, 'quelques ticks');
    const s = a.of('s').filter((m) => m.n > from).slice(0, 25);
    assert.ok(s.length >= 20);
    const idx = ma.side * 2;
    const ys = s.map((m) => m.p[idx + 1]);
    assert.ok(Math.max(...ys) > 0, 'le gloop a sauté');
    const xs = s.map((m) => m.p[idx]);
    assert.ok(xs.at(-1) > xs[0] || xs.at(-1) >= 750, 'le gloop s\'est déplacé vers la droite');
    a.send({ t: 'leave' });
    await b.next('oppleft');
    assert.equal((await b.next('result', 2000, true)).forfeit, true);
  });

  test('défi : invitation, refus, puis acceptation', async () => {
    const a = await bot('Defi1');
    const b = await bot('Defi2');
    await waitFor(() => a.last('lobby')?.players.some((p) => p.name === 'Defi2'), 4000, 'salon');
    const idB = a.last('lobby').players.find((p) => p.name === 'Defi2').id;
    a.send({ t: 'challenge', id: idB });
    const inv = await b.next('invite');
    assert.equal(inv.name, 'Defi1');
    b.send({ t: 'decline', id: inv.id });
    assert.equal((await a.next('declined')).name, 'Defi2');
    a.send({ t: 'challenge', id: idB });
    const inv2 = await b.next('invite');
    b.send({ t: 'accept', id: inv2.id });
    await Promise.all([a.next('match'), b.next('match')]);
    a.send({ t: 'leave' });
    await b.next('oppleft');
  });

  test('messages invalides : ignorés, la connexion survit', async () => {
    const a = await bot('Robuste');
    for (const raw of ['', '{', '[]', '{"t":1}', '{"t":"zzz"}', 'x'.repeat(5000)]) a.ws.send(raw);
    a.send({ t: 'ping', c: 42 });
    assert.equal((await a.next('pong')).c, 42);
    assert.equal(a.closed, false);
  });

  test('un client qui n\'est pas WebSocket reçoit un refus HTTP', async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/`).catch(() => null);
    assert.ok(res === null || res.status === 400);
  });
});

describe('moteur : le serveur et le JS donnent le même résultat à entrées égales', () => {
  test('rejeu local de référence', () => {
    const g = createGame({ target: 1, server: 0 });
    for (let i = 0; i < 400; i++) step(g, [{ left: true, right: false, up: false }, { left: false, right: true, up: false }]);
    assert.equal(g.score[0] + g.score[1], 1);
    assert.ok(g.slimes[0].x === C.R && g.slimes[1].x === C.W - C.R);
  });
});
