// Navigateur : un vrai Chrome (headless) piloté par DevTools, sans dépendance. Le site est servi par `php -S`, le serveur de jeu
// est le vrai serveur PHP, et un robot Node joue l'adversaire en ligne.
//   npm run test:browser          (PHP_BIN et CHROME_BIN réglables ; SHOTS=/dossier enregistre des captures d'écran)
import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { Bot, PHP, ROOT, freePort, sleep, startGameServer, token, waitFor } from './helpers.js';

let BASE, chrome, php, game, tmpDir, cdp, nextId = 0;
const pending = new Map();
const errors = [];

before(async () => {
  game = await startGameServer();
  const port = await freePort();
  php = spawn(PHP, ['-S', `127.0.0.1:${port}`, '-t', path.join(ROOT, 'web')], {
    env: { ...process.env, GLOOP_WS: game.url, GLOOP_DATA_DIR: game.dataDir }, stdio: 'ignore',
  });
  BASE = `http://127.0.0.1:${port}`;
  await waitFor(async () => (await fetch(`${BASE}/`)).ok, 10000, 'site PHP');
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gloop-chrome-'));
  const dbg = await freePort();
  chrome = spawn(process.env.CHROME_BIN || 'google-chrome', [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run',
    `--remote-debugging-port=${dbg}`, `--user-data-dir=${tmpDir}`, 'about:blank',
  ], { stdio: 'ignore' });
  const tab = await waitFor(async () => (await (await fetch(`http://127.0.0.1:${dbg}/json`)).json()).find((t) => t.type === 'page'), 15000, 'Chrome');
  cdp = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { cdp.onopen = resolve; cdp.onerror = () => reject(new Error('DevTools')); });
  cdp.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(`${m.params.entry.text} ${m.params.entry.url ?? ''}`);
  };
  await call('Page.enable'); await call('Runtime.enable'); await call('Log.enable');
});
after(() => {
  try { cdp.close(); } catch { /* déjà fermé */ }
  for (const p of [chrome, php]) { try { p?.kill(); } catch { /* déjà arrêté */ } }
  game?.stop();
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignoré */ }
});

function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
    cdp.send(JSON.stringify({ id, method, params }));
  });
}
async function ev(expr) {
  const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`page : ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
  return r.result.value;
}
async function shot(name) {
  if (!process.env.SHOTS) return;
  fs.mkdirSync(process.env.SHOTS, { recursive: true });
  const { data } = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(process.env.SHOTS, `${name}.png`), Buffer.from(data, 'base64'));
}
const DESKTOP = { w: 1100, h: 700, touch: false };
const PHONE_LANDSCAPE = { w: 844, h: 390, touch: true };
const PHONE_PORTRAIT = { w: 390, h: 844, touch: true };

async function open(device, lang = 'fr') {
  await call('Emulation.setDeviceMetricsOverride', { width: device.w, height: device.h, deviceScaleFactor: 1, mobile: !!device.touch });
  await call('Emulation.setTouchEmulationEnabled', device.touch ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
  await call('Storage.clearDataForOrigin', { origin: new URL(BASE).origin, storageTypes: 'local_storage' });
  await call('Page.navigate', { url: `${BASE}/` });
  await waitFor(() => ev('document.readyState === "complete" && !!window.__gloop'), 10000, 'page chargée');
  await ev(`localStorage.setItem('gloop.lang', ${JSON.stringify(lang)}); location.reload()`);
  await waitFor(() => ev('document.readyState === "complete" && !!window.__gloop'), 10000, 'page rechargée');
}
const click = (sel) => ev(`document.querySelector(${JSON.stringify(sel)}).click()`);
const key = async (type, k) => call('Input.dispatchKeyEvent', { type, key: k, code: k.length === 1 ? `Key${k.toUpperCase()}` : k, windowsVirtualKeyCode: ({ ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, Escape: 27 })[k] ?? k.toUpperCase().charCodeAt(0) });
const rect = (sel) => ev(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; })()`);
const gstate = () => ev('(() => { const g = window.__gloop.app.game; return g && { x: [g.slimes[0].x, g.slimes[1].x], y: [g.slimes[0].y, g.slimes[1].y], phase: g.phase, tick: g.tick, score: g.score }; })()');

describe('page et mode local', () => {
  test('le menu s\'affiche, sans erreur, en français puis en anglais', async () => {
    errors.length = 0;
    await open(DESKTOP);
    assert.equal(await ev('document.title'), 'Gloop Volley');
    assert.match(await ev('document.querySelector("[data-action=ai]").textContent'), /ordinateur/);
    const c = await rect('#game');
    assert.ok(c.w > 600 && Math.abs(c.w / c.h - 16 / 9) < 0.02, `canvas 16/9 : ${c.w}x${c.h}`);
    await shot('01-menu');
    await click('#opt-lang');
    assert.match(await ev('document.querySelector("[data-action=ai]").textContent'), /computer/);
    assert.equal(await ev('document.documentElement.lang'), 'en');
    assert.deepEqual(errors, []);
  });

  test('contre l\'ordinateur : le clavier déplace le gloop et l\'IA joue', async () => {
    await open(DESKTOP);
    await ev('window.__gloop.opts.level = "hard"');
    await click('[data-action=ai]');
    await waitFor(async () => (await gstate())?.phase === 'play', 5000, 'service');
    const x0 = (await gstate()).x[0];
    await key('keyDown', 'ArrowRight');
    await sleep(300);
    await key('keyUp', 'ArrowRight');
    const x1 = (await gstate()).x[0];
    assert.ok(x1 > x0 + 40, `le gloop avance : ${x0} -> ${x1}`);
    await key('keyDown', 'ArrowUp');
    await waitFor(async () => (await gstate()).y[0] > 20, 2000, 'saut');
    await key('keyUp', 'ArrowUp');
    await sleep(1500);
    const g = await gstate();
    assert.ok(g.x[1] >= 408 && g.x[1] <= 752, 'l\'IA reste dans son camp');
    await shot('02-ai-game');
    assert.deepEqual(errors, []);
  });

  test('Échap met en pause : le jeu s\'arrête puis reprend', async () => {
    await open(DESKTOP);
    await click('[data-action=ai]');
    await waitFor(async () => (await gstate())?.tick > 30, 3000, 'jeu lancé');
    await key('keyDown', 'Escape'); await key('keyUp', 'Escape');
    await waitFor(() => ev('!document.getElementById("pause").hidden'), 2000, 'panneau de pause');
    const t0 = (await gstate()).tick;
    await sleep(500);
    assert.equal((await gstate()).tick, t0, 'plus aucun tick en pause');
    await click('[data-action=resume]');
    await waitFor(async () => (await gstate()).tick > t0 + 10, 2000, 'reprise');
  });

  test('2 joueurs : le joueur 1 (Q/D) et le joueur 2 (flèches) sont indépendants', async () => {
    await open(DESKTOP);
    await click('[data-action=local]');
    await waitFor(async () => (await gstate())?.phase === 'play', 5000, 'service');
    const s0 = await gstate();
    await key('keyDown', 'd'); await key('keyDown', 'ArrowLeft');
    await sleep(300);
    await key('keyUp', 'd'); await key('keyUp', 'ArrowLeft');
    const s1 = await gstate();
    assert.ok(s1.x[0] > s0.x[0] + 40 && s1.x[1] < s0.x[1] - 40, `${JSON.stringify(s0.x)} -> ${JSON.stringify(s1.x)}`);
    await shot('03-local-2p');
  });

  test('une partie jusqu\'au bout affiche l\'écran de fin et permet de rejouer', async () => {
    await open(DESKTOP);
    await ev('window.__gloop.opts.points = 3; window.__gloop.opts.level = "easy"');
    await click('[data-action=ai]');
    // on accélère : la partie se termine quand l'un des deux atteint la cible (on force le score pour ne pas attendre)
    await waitFor(async () => (await gstate())?.phase === 'play', 5000, 'service');
    await ev('(() => { const g = window.__gloop.app.game; g.score[0] = g.target - 1; g.ball.x = 600; g.ball.y = 12; g.ball.vy = -5; g.ball.vx = 0; g.slimes[1].x = 740; })()');
    await waitFor(() => ev('!document.getElementById("over").hidden'), 8000, 'écran de fin');
    assert.match(await ev('document.getElementById("over-title").textContent'), /Victoire/);
    await shot('04-over');
    await click('#over-again');
    await waitFor(async () => (await gstate())?.score.join() === '0,0', 3000, 'nouvelle partie');
  });
});

describe('mobile', () => {
  test('paysage : commandes tactiles visibles et fonctionnelles', async () => {
    await open(PHONE_LANDSCAPE);
    assert.equal(await ev('matchMedia("(pointer: coarse)").matches'), true);
    await click('[data-action=ai]');
    await waitFor(async () => (await gstate())?.phase === 'play', 5000, 'service');
    assert.equal(await ev('document.getElementById("touch").hidden'), false);
    const r = await rect('#touch button[data-p="1"][data-k="right"]');
    assert.ok(r.w >= 44 && r.h >= 44, `bouton assez grand : ${r.w}x${r.h}`);
    const x0 = (await gstate()).x[0];
    await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.cx, y: r.cy, id: 1 }] });
    await sleep(300);
    await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.ok((await gstate()).x[0] > x0 + 40, 'le doigt déplace le gloop');
    await shot('05-phone-landscape');
    const o = await ev('({ sw: document.documentElement.scrollWidth, iw: innerWidth })');
    assert.ok(o.sw <= o.iw, 'pas de défilement horizontal');
  });

  test('portrait : le menu tient dans la largeur et invite à tourner le téléphone', async () => {
    await open(PHONE_PORTRAIT);
    const o = await ev('({ sw: document.documentElement.scrollWidth, iw: innerWidth })');
    assert.ok(o.sw <= o.iw);
    const m = await rect('#menu');
    assert.ok(m.x >= 0 && m.x + m.w <= o.iw + 0.5);
    assert.notEqual(await ev('getComputedStyle(document.querySelector(".hint.rotate")).display'), 'none');
    await shot('06-phone-portrait');
  });
});

describe('en ligne (vrai serveur PHP, adversaire robot)', () => {
  test('rejoindre le salon, jouer une partie rapide contre un robot et voir le résultat classé', async () => {
    errors.length = 0;
    await open(DESKTOP);
    await click('[data-action=online]');
    await waitFor(() => ev('!document.getElementById("join").hidden'), 8000, 'connexion au serveur');
    await ev('document.getElementById("nick").value = "Navigateur"');
    await ev('document.getElementById("join").requestSubmit()');
    await waitFor(() => ev('!document.getElementById("lobby").hidden'), 5000, 'salon');
    await shot('07-lobby');

    const robot = await new Bot(game.url).open();
    await robot.hello('Robot', token('robot'));
    await waitFor(() => ev('[...document.querySelectorAll("#players li")].some((li) => li.textContent.includes("Robot"))'), 6000, 'robot visible');

    await click('#quick');
    robot.send({ t: 'queue' });
    const match = await robot.next('match', 8000);
    await waitFor(() => ev('window.__gloop.app.mode === "online"'), 5000, 'match côté navigateur');
    await waitFor(() => ev('window.__gloop.online.snaps.length > 10'), 4000, 'états du serveur reçus');
    await sleep(1200);
    await shot('08-online-game');

    // le navigateur envoie ses touches : le gloop du serveur bouge
    const mySide = await ev('window.__gloop.online.side');
    const xOf = () => ev('(() => { const s = window.__gloop.online.snaps.at(-1); return s.p[' + (mySide * 2) + ']; })()');
    const x0 = await xOf();
    await key('keyDown', mySide === 0 ? 'ArrowLeft' : 'ArrowRight');
    await sleep(400);
    await key('keyUp', mySide === 0 ? 'ArrowLeft' : 'ArrowRight');
    const x1 = await xOf();
    assert.ok(Math.abs(x1 - x0) > 20, `le serveur a déplacé mon gloop : ${x0} -> ${x1}`);

    // le robot quitte : victoire par forfait affichée
    robot.send({ t: 'leave' });
    await waitFor(() => ev('!document.getElementById("over").hidden'), 6000, 'écran de fin');
    assert.match(await ev('document.getElementById("over-detail").textContent'), /forfait|forfeit/i);
    await shot('09-online-over');
    assert.deepEqual(errors, []);
    robot.close();
  });

  test('défier un joueur du salon depuis le navigateur', async () => {
    await open(DESKTOP);
    await click('[data-action=online]');
    await waitFor(() => ev('!document.getElementById("join").hidden'), 8000, 'connexion');
    await ev('document.getElementById("nick").value = "Defieur"; document.getElementById("join").requestSubmit()');
    await waitFor(() => ev('!document.getElementById("lobby").hidden'), 5000, 'salon');
    const robot = await new Bot(game.url).open();
    await robot.hello('Cible');
    await waitFor(() => ev('[...document.querySelectorAll("#players li")].some((li) => li.textContent.includes("Cible"))'), 6000, 'cible visible');
    await ev('[...document.querySelectorAll("#players li")].find((li) => li.textContent.includes("Cible")).querySelector("button").click()');
    const inv = await robot.next('invite', 4000, true);
    robot.send({ t: 'accept', id: inv.id });
    await waitFor(() => ev('window.__gloop.app.mode === "online"'), 5000, 'match');
    robot.close();
    await waitFor(() => ev('!document.getElementById("over").hidden'), 6000, 'fin par forfait');
  });

  test('serveur injoignable : message clair, pas d\'erreur de script', async () => {
    await open(DESKTOP);
    await ev('window.GLOOP_WS = "ws://127.0.0.1:9"');
    await click('[data-action=online]');
    await waitFor(() => ev('/injoignable|unreachable/i.test(document.getElementById("online-status").textContent)'), 6000, 'message d\'erreur');
  });
});
