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
    const gh = await ev('(() => { const a = document.querySelector(".foot a.gh"); return a && { href: a.href, target: a.target, rel: a.rel, text: a.textContent.trim(), visible: a.getBoundingClientRect().height > 0 }; })()');
    assert.equal(gh.href, 'https://github.com/OpenPrunus/gloop-volley');
    assert.equal(gh.target, '_blank');
    assert.match(gh.rel, /noopener/);
    assert.equal(gh.text, 'Voir le projet sur GitHub');
    assert.ok(gh.visible, 'le lien est visible dans le menu');
    const all = await ev('(() => { const a = document.querySelector(".foot a.all"); return a && { href: a.href, target: a.target, text: a.textContent.trim(), visible: a.getBoundingClientRect().height > 0 }; })()');
    assert.equal(all.href, 'https://games.prunus.dev/');
    assert.equal(all.target, '', 'même onglet');
    assert.equal(all.text, '← Tous les jeux');
    assert.ok(all.visible, 'le lien de retour est visible dans le menu');
    await shot('01-menu');
    await click('#opt-lang');
    assert.match(await ev('document.querySelector("[data-action=ai]").textContent'), /computer/);
    assert.equal(await ev('document.querySelector(".foot a.gh").textContent.trim()'), 'View the project on GitHub');
    assert.equal(await ev('document.querySelector(".foot a.all").textContent.trim()'), '← All games');
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

const touchEvent = (type, points) => call('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : points });
/** Pose un doigt en (x, y), le glisse de (dx, dy) en plusieurs étapes, le laisse `hold` ms, puis le lève. */
const drag = async (x, y, dx, dy, hold = 0, steps = 8) => {
  await touchEvent('touchStart', [{ x, y, id: 1 }]);
  for (let i = 1; i <= steps; i++) { await touchEvent('touchMove', [{ x: x + (dx * i) / steps, y: y + (dy * i) / steps, id: 1 }]); await sleep(14); }
  await sleep(hold);
  await touchEvent('touchEnd');
  await sleep(60);
};

describe('mobile : des gestes, pas de boutons', () => {
  const startAi = async (device) => {
    await open(device);
    await click('[data-action=ai]');
    await waitFor(async () => (await gstate())?.phase === 'play', 6000, 'service');
  };

  test('aucun bouton : glisser à droite puis à gauche déplace le gloop tant que le doigt reste décalé', async () => {
    for (const device of [PHONE_LANDSCAPE, PHONE_PORTRAIT]) {
      await startAi(device);
      assert.equal(await ev('document.getElementById("touch")'), null, 'la barre de boutons n\'existe plus');
      assert.equal(await ev('document.querySelectorAll("#stage button[data-k]").length'), 0);
      const c = { x: device.w / 2, y: device.h * 0.65 };
      const x0 = (await gstate()).x[0];
      await drag(c.x, c.y, 60, 4, 450);
      const right = (await gstate()).x[0];
      assert.ok(right > x0 + 60, `${device.w}x${device.h} : le gloop avance vers la droite (${Math.round(x0)} -> ${Math.round(right)})`);
      await drag(c.x, c.y, -60, 4, 450);
      assert.ok((await gstate()).x[0] < right - 60, 'et vers la gauche');
      const still = (await gstate()).x[0];
      await touchEvent('touchStart', [{ x: c.x, y: c.y, id: 1 }]);
      await sleep(500);
      await touchEvent('touchEnd');
      assert.ok(Math.abs((await gstate()).x[0] - still) < 8, 'un doigt immobile ne déplace pas le gloop');
    }
  });

  test('changer de sens sans lever le doigt : le point de départ suit le doigt', async () => {
    await startAi(PHONE_LANDSCAPE);
    const x0 = (await gstate()).x[0];
    await touchEvent('touchStart', [{ x: 400, y: 250, id: 1 }]);
    for (let i = 1; i <= 10; i++) { await touchEvent('touchMove', [{ x: 400 + i * 12, y: 250, id: 1 }]); await sleep(14); }    // loin à droite
    await sleep(300);
    const far = (await gstate()).x[0];
    for (let i = 1; i <= 10; i++) { await touchEvent('touchMove', [{ x: 520 - i * 4, y: 250, id: 1 }]); await sleep(14); }       // un petit retour suffit
    await sleep(350);
    await touchEvent('touchEnd');
    assert.ok(far > x0 + 40);
    assert.ok((await gstate()).x[0] < far, 'le gloop est repassé vers la gauche sans lever le doigt');
  });

  test('glisser vers le haut ou toucher fait sauter', async () => {
    for (const device of [PHONE_LANDSCAPE, PHONE_PORTRAIT]) {
      await startAi(device);
      const c = { x: device.w / 2, y: device.h * 0.7 };
      assert.equal((await gstate()).y[0], 0, 'au sol');
      await drag(c.x, c.y, 2, -80, 0);
      await sleep(120);
      assert.ok((await gstate()).y[0] > 10, `${device.w}x${device.h} : un coup de doigt vers le haut fait sauter`);
      await waitFor(async () => (await gstate()).y[0] === 0, 3000, 'retour au sol');
      await touchEvent('touchStart', [{ x: c.x, y: c.y, id: 1 }]);
      await sleep(70);
      await touchEvent('touchEnd');
      await sleep(120);
      assert.ok((await gstate()).y[0] > 10, 'un simple toucher fait sauter aussi');
    }
  });

  test('2 joueurs sur le même écran : chacun sa moitié (gauche = joueur 1, droite = joueur 2)', async () => {
    await open(PHONE_LANDSCAPE);
    await click('[data-action=local]');
    await waitFor(async () => (await gstate())?.phase === 'play', 6000, 'service');
    const before = await gstate();
    await drag(150, 250, 60, 0, 400);                       // moitié gauche : le joueur 1 va vers la droite
    const a = await gstate();
    assert.ok(a.x[0] > before.x[0] + 50, 'joueur 1 déplacé');
    assert.ok(Math.abs(a.x[1] - before.x[1]) < 8, 'joueur 2 immobile');
    await drag(700, 250, -60, 0, 400);                      // moitié droite : le joueur 2 va vers la gauche
    const b = await gstate();
    assert.ok(b.x[1] < a.x[1] - 50, 'joueur 2 déplacé');
    assert.ok(Math.abs(b.x[0] - a.x[0]) < 8, 'joueur 1 immobile');
    await drag(700, 300, 2, -80, 0);
    await sleep(120);
    assert.ok((await gstate()).y[1] > 10 && (await gstate()).y[0] === 0, 'le saut de la moitié droite ne concerne que le joueur 2');
    assert.equal(await ev('document.querySelector("#gesture-tip").textContent.includes("moitié")'), true, 'rappel : chacun sa moitié');
  });

  test('deux doigts : un pouce déplace, l\'autre fait sauter', async () => {
    await startAi(PHONE_LANDSCAPE);
    const x0 = (await gstate()).x[0];
    await touchEvent('touchStart', [{ x: 200, y: 280, id: 1 }]);
    await touchEvent('touchMove', [{ x: 260, y: 280, id: 1 }]);
    await touchEvent('touchStart', [{ x: 260, y: 280, id: 1 }, { x: 600, y: 300, id: 2 }]);
    for (let i = 1; i <= 6; i++) { await touchEvent('touchMove', [{ x: 260, y: 280, id: 1 }, { x: 600, y: 300 - i * 14, id: 2 }]); await sleep(14); }
    await sleep(200);
    const mid = await gstate();
    await touchEvent('touchEnd');
    assert.ok(mid.x[0] > x0 + 10, 'le premier doigt déplace');
    assert.ok(mid.y[0] > 5, 'le second fait sauter');
  });

  test('en pause, dans le menu et à la souris : aucun geste', async () => {
    await open(PHONE_PORTRAIT);
    await drag(200, 500, 80, -90, 100);
    assert.equal(await ev('window.__gloop.app.game'), null, 'le menu n\'est pas une partie');
    await open(DESKTOP);
    await click('[data-action=ai]');
    await waitFor(async () => (await gstate())?.phase === 'play', 6000, 'service');
    const x0 = (await gstate()).x[0];
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: 300, y: 400, button: 'left', clickCount: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 420, y: 400, button: 'left' });
    await sleep(300);
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 420, y: 400, button: 'left', clickCount: 1 });
    assert.ok(Math.abs((await gstate()).x[0] - x0) < 8, 'la souris ne pilote pas le gloop');
    assert.equal(await ev('document.querySelector("#gesture-tip").classList.contains("show")'), false, 'pas de rappel sur un ordinateur');
  });

  test('portrait : le menu décrit les gestes, le rappel s\'affiche en jeu, rien ne déborde', async () => {
    await open(PHONE_PORTRAIT);
    const o = await ev('({ sw: document.documentElement.scrollWidth, iw: innerWidth })');
    assert.ok(o.sw <= o.iw);
    const m = await rect('#menu');
    assert.ok(m.x >= 0 && m.x + m.w <= o.iw + 0.5);
    assert.match(await ev('document.querySelector(".touchhint").textContent'), /Sur téléphone|glisse/i);
    assert.equal(await ev('getComputedStyle(document.querySelector(".hint.keys")).display'), 'none', 'les touches du clavier sont masquées sur tactile');
    assert.notEqual(await ev('getComputedStyle(document.querySelector(".hint.rotate")).display'), 'none');
    await shot('06-phone-portrait');
    await click('[data-action=ai]');
    await waitFor(async () => (await gstate())?.phase === 'play', 6000, 'service');
    assert.equal(await ev('document.querySelector("#gesture-tip").classList.contains("show")'), true, 'rappel des gestes');
    assert.equal(await ev('getComputedStyle(document.querySelector("#rotate-tip")).display'), 'block', 'astuce de rotation');
    assert.equal(await ev('document.documentElement.scrollWidth <= innerWidth'), true);
    await shot('06b-phone-portrait-game');
  });

  test('plein écran : le bouton existe sur tactile, pas sur ordinateur, et les zones sûres sont prévues', async () => {
    await startAi(PHONE_LANDSCAPE);
    assert.equal(await ev('!document.querySelector("#fs-btn").hidden'), true, 'bouton plein écran en jeu sur téléphone');
    await open(DESKTOP);
    await click('[data-action=ai]');
    await waitFor(async () => (await gstate())?.phase === 'play', 6000, 'service');
    assert.equal(await ev('document.querySelector("#fs-btn").hidden'), true, 'pas de bouton plein écran avec une souris');
    const css = await ev('(() => { const t = [...document.styleSheets[0].cssRules].map((r) => r.cssText).join(" "); return t.includes("safe-area-inset-top") && t.includes("safe-area-inset-right"); })()');
    assert.equal(css, true, 'zones sûres (encoche) prises en compte');
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
