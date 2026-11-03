// Gloop Volley — application : menus, boucle de jeu, saisie (clavier / tactile) et mode en ligne.
import { C, LEFT, RIGHT, createGame, step } from './engine.js';
import { createAI } from './ai.js';
import * as i18n from './i18n.js';
import * as audio from './audio.js';
import { draw } from './render.js';
import { Net, playerToken } from './net.js';

const { t } = i18n;
const $ = (sel) => document.querySelector(sel);
const STEP_MS = 1000 / 60;
const RENDER_DELAY_MS = 50;        // retard d'affichage du mode en ligne : de quoi interpoler entre deux états du serveur
const PHASES = { s: 'serve', p: 'play', t: 'point', o: 'over' };

const canvas = $('#game');
const ctx = canvas.getContext('2d');
const panels = { menu: $('#menu'), online: $('#online'), pause: $('#pause'), over: $('#over') };

// ---------------------------------------------------------------- réglages
const opts = { level: 'normal', points: 7, name: '' };
try { Object.assign(opts, JSON.parse(localStorage.getItem('gloop.opts') ?? '{}')); } catch { /* réglages illisibles */ }
const saveOpts = () => { try { localStorage.setItem('gloop.opts', JSON.stringify(opts)); } catch { /* ignoré */ } };

// ---------------------------------------------------------------- état
const app = {
  mode: null,           // null | 'ai' | 'local' | 'online'
  game: null,
  ai: null,
  names: ['', ''],
  acc: 0,
  last: 0,
  prev: null,
  paused: false,
  overShown: false,
  over: null,           // résultat (mode en ligne)
};
const online = {
  status: 'idle',       // idle | connecting | hello | lobby | queued | waiting | playing
  me: null,
  side: 0,
  snaps: [],
  players: [],
  invite: null,
  ranked: false,
  oppLeft: false,
};

// ---------------------------------------------------------------- panneaux
function hidePanels() {
  for (const el of Object.values(panels)) el.hidden = true;
  $('#pause-btn').hidden = app.mode === null;
  updateTouch();
}

function refreshLabels() {
  i18n.apply(document);
  $('#opt-sound').textContent = `${t('sound')} : ${audio.isMuted() ? t('off') : t('on')}`;
  $('#opt-lang').textContent = `${t('language')} : ${i18n.getLang().toUpperCase()}`;
  $('#opt-level').value = opts.level;
  $('#opt-points').value = String(opts.points);
  $('#nick').value = opts.name ?? '';
  if (online.status === 'lobby' || online.status === 'queued' || online.status === 'waiting') renderLobby();
}

// ---------------------------------------------------------------- saisie
const keys = new Set();
const touch = { 1: { left: false, right: false, up: false }, 2: { left: false, right: false, up: false } };
const normKey = (e) => (e.key.length === 1 ? e.key.toLowerCase() : e.key);

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  const k = normKey(e);
  if (app.mode && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k)) e.preventDefault();
  audio.unlock();
  if ((k === 'Escape' || k === 'p') && app.mode && !e.repeat) {
    togglePause();
    return;
  }
  keys.add(k);
});
window.addEventListener('keyup', (e) => keys.delete(normKey(e)));
window.addEventListener('blur', () => {
  keys.clear();
  if (app.mode === 'ai' || app.mode === 'local') setPaused(true);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && (app.mode === 'ai' || app.mode === 'local')) setPaused(true);
});

function readInputs() {
  const any = (...names) => names.some((n) => keys.has(n));
  if (app.mode === 'local') {
    return [
      { left: any('a', 'q') || touch[1].left, right: any('d') || touch[1].right, up: any('w', 'z') || touch[1].up },
      { left: any('ArrowLeft') || touch[2].left, right: any('ArrowRight') || touch[2].right, up: any('ArrowUp') || touch[2].up },
    ];
  }
  return [
    { left: any('ArrowLeft', 'a', 'q') || touch[1].left, right: any('ArrowRight', 'd') || touch[1].right, up: any('ArrowUp', 'w', 'z', ' ') || touch[1].up },
    { left: false, right: false, up: false },
  ];
}

const isTouchDevice = () => window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

function updateTouch() {
  const el = $('#touch');
  const inGame = app.mode !== null && panels.menu.hidden && panels.online.hidden;
  el.hidden = !(inGame && isTouchDevice());
  el.classList.toggle('duo', app.mode === 'local');
  el.classList.toggle('solo', app.mode !== 'local');
}

for (const btn of document.querySelectorAll('#touch button')) {
  const { p, k } = btn.dataset;
  const set = (v) => {
    touch[p][k] = v;
    btn.classList.toggle('down', v);
  };
  btn.addEventListener('pointerdown', (e) => {
    audio.unlock();
    btn.setPointerCapture(e.pointerId);
    set(true);
    e.preventDefault();
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(ev, () => set(false));
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}

// ---------------------------------------------------------------- parties locales
function startLocal(mode) {
  closeOnlineSession();
  app.mode = mode;
  app.game = createGame({ target: Number(opts.points), server: Math.random() < 0.5 ? LEFT : RIGHT });
  app.ai = mode === 'ai' ? createAI(RIGHT, opts.level, (Math.random() * 2 ** 31) | 0) : null;
  app.names = mode === 'ai' ? [t('you'), t('cpu')] : [t('player1'), t('player2')];
  app.acc = 0;
  app.prev = null;
  app.paused = false;
  app.overShown = false;
  hidePanels();
}

function endSession() {
  app.mode = null;
  app.game = null;
  app.paused = false;
  hidePanels();
  panels.menu.hidden = false;
  updateTouch();
}

function setPaused(p) {
  if (!app.mode || app.mode === 'online' || app.game?.phase === 'over') return;
  app.paused = p;
  panels.pause.hidden = !p;
  if (!p) app.last = performance.now();
}

function togglePause() {
  if (app.mode === 'online') {
    panels.pause.hidden = !panels.pause.hidden;
    return;
  }
  setPaused(!app.paused);
}

function advanceLocal(dt) {
  const g = app.game;
  app.acc += dt;
  while (app.acc >= STEP_MS) {
    app.prev = snapshot(g);
    const [p1, p2] = readInputs();
    const events = step(g, [p1, app.mode === 'ai' ? app.ai.decide(g) : p2]);
    for (const e of events) playEvent(e.type, e.side, e.power ?? 0);
    app.acc -= STEP_MS;
  }
  if (g.phase === 'over' && !app.overShown) showLocalOver();
}

const snapshot = (g) => ({ slimes: g.slimes.map((s) => ({ x: s.x, y: s.y })), ball: { x: g.ball.x, y: g.ball.y } });

function playEvent(type, side, power) {
  switch (type) {
    case 'hit': return audio.play('hit', power);
    case 'net': return audio.play('net');
    case 'wall': return audio.play('wall');
    case 'serve': return audio.play('serve');
    case 'point': return audio.play('point');
    case 'win': {
      const mine = app.mode === 'local' || side === (app.mode === 'online' ? online.side : LEFT);
      return audio.play(mine ? 'win' : 'lose');
    }
    default: return undefined;
  }
}

function showLocalOver() {
  app.overShown = true;
  const g = app.game;
  $('#over-title').textContent = app.mode === 'ai' ? t(g.winner === LEFT ? 'youWin' : 'youLose') : t('playerWins', { name: app.names[g.winner] });
  $('#over-detail').textContent = `${g.score[0]} – ${g.score[1]}`;
  $('#over-again').textContent = t('playAgain');
  $('#over-again').disabled = false;
  $('#over-again').dataset.action = 'again';
  showPanel('over');
}

function showPanel(name) {
  for (const [key, el] of Object.entries(panels)) el.hidden = key !== name;
  $('#pause-btn').hidden = true;
  updateTouch();
}

// ---------------------------------------------------------------- mode en ligne
const net = new Net({
  onopen: () => {
    online.status = 'hello';
    setOnlineStatus('');
    $('#join').hidden = false;
    $('#lobby').hidden = true;
    $('#nick').focus();
  },
  onmessage: onServerMessage,
  onclose: (wasOpen) => {
    const inMatch = app.mode === 'online';
    closeOnlineSession();
    online.status = 'idle';
    if (inMatch || panels.online.hidden === false || wasOpen) {
      showPanel('online');
      $('#join').hidden = true;
      $('#lobby').hidden = true;
      setOnlineStatus(t(wasOpen ? 'disconnected' : 'unreachable'), true);
    }
  },
});

function setOnlineStatus(text, error = false) {
  const el = $('#online-status');
  el.textContent = text;
  el.classList.toggle('error', error);
}

function openOnline() {
  closeOnlineSession();
  app.mode = null;
  showPanel('online');
  online.status = 'connecting';
  $('#join').hidden = true;
  $('#lobby').hidden = true;
  $('#invite').hidden = true;
  setOnlineStatus(t('connecting'));
  net.connect();
}

function closeOnlineSession() {
  if (app.mode === 'online') {
    app.mode = null;
    app.game = null;
  }
  online.snaps = [];
  online.invite = null;
  net.resetInput();
}

function leaveOnline() {
  net.close();
  closeOnlineSession();
  online.status = 'idle';
  app.mode = null;
  showPanel('menu');
}

const ERRORS = { bad_name: 'errName', name_taken: 'errTaken', busy: 'errBusy', rate: 'errRate', full: 'errFull', not_ready: 'errGeneric' };

function onServerMessage(m) {
  switch (m.t) {
    case 'welcome':
      online.me = m;
      online.status = 'lobby';
      opts.name = m.name;
      saveOpts();
      $('#join').hidden = true;
      $('#lobby').hidden = false;
      setOnlineStatus('');
      renderLobby();
      loadBoard();
      break;
    case 'lobby':
      online.players = m.players;
      if (online.status === 'lobby' || online.status === 'queued' || online.status === 'waiting') renderLobby();
      break;
    case 'queued':
      online.status = 'queued';
      renderLobby();
      break;
    case 'unqueued':
      online.status = 'lobby';
      renderLobby();
      break;
    case 'waiting':
      online.status = 'waiting';
      setOnlineStatus(t('waitingAnswer', { name: m.name }));
      break;
    case 'invite':
      online.invite = m;
      $('#invite-text').textContent = t('invitedYou', { name: m.name });
      $('#invite').hidden = false;
      audio.play('click');
      break;
    case 'invite_cancel':
      online.invite = null;
      $('#invite').hidden = true;
      if (online.status === 'waiting') online.status = 'lobby';
      renderLobby();
      break;
    case 'declined':
      online.status = 'lobby';
      renderLobby();
      setOnlineStatus(t('declined', { name: m.name }));
      break;
    case 'match':
      startOnlineMatch(m);
      break;
    case 's':
      onState(m);
      break;
    case 'result':
      onResult(m);
      break;
    case 'oppleft':
      online.oppLeft = true;
      $('#over-again').disabled = true;
      break;
    case 'left':
      backToLobby();
      break;
    case 'error':
      setOnlineStatus(t(ERRORS[m.code] ?? 'errGeneric'), true);
      if (online.status === 'waiting') online.status = 'lobby';
      renderLobby();
      break;
    default:
      break;
  }
}

function renderLobby() {
  const status = online.status;
  $('#quick').textContent = t(status === 'queued' ? 'cancelSearch' : 'quickMatch');
  $('#quick').disabled = status === 'waiting';
  $('#my-rating').textContent = online.me ? `${online.me.name} · ${online.me.rating ?? '—'}${online.me.ranked ? '' : ' · ' + t('unranked')}` : '';
  if (status === 'queued') setOnlineStatus(t('searching'));
  else if (status === 'lobby') setOnlineStatus('');
  const list = $('#players');
  list.replaceChildren();
  if (online.players.length === 0) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = t('nobody');
    list.append(li);
  }
  for (const p of online.players) {
    const li = document.createElement('li');
    const label = document.createElement('span');
    const state = { lobby: 'waiting', queued: 'searchingState', playing: 'inMatch' }[p.status] ?? 'waiting';
    label.textContent = `${p.name}${p.rating ? ` (${p.rating})` : ''}`;
    const sub = document.createElement('span');
    sub.className = 'muted';
    sub.textContent = t(state);
    const btn = document.createElement('button');
    btn.className = 'btn small';
    btn.textContent = t('challenge');
    btn.disabled = !(p.status === 'lobby' || p.status === 'queued') || status === 'waiting';
    btn.addEventListener('click', () => net.send({ t: 'challenge', id: p.id }));
    li.append(label, sub, btn);
    list.append(li);
  }
}

async function loadBoard() {
  const body = $('#board');
  try {
    const res = await fetch('api.php', { cache: 'no-store' });
    if (!res.ok) throw new Error('http');
    const rows = await res.json();
    body.replaceChildren();
    if (!Array.isArray(rows) || rows.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      td.textContent = t('noScores');
      tr.append(td);
      body.append(tr);
      return;
    }
    for (const r of rows) {
      const tr = document.createElement('tr');
      for (const v of [r.rank, r.name, r.rating, `${r.wins} / ${r.losses}`]) {
        const td = document.createElement('td');
        td.textContent = String(v);
        tr.append(td);
      }
      body.append(tr);
    }
  } catch {
    body.replaceChildren();
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.textContent = t('boardUnavailable');
    tr.append(td);
    body.append(tr);
  }
}

function startOnlineMatch(m) {
  app.mode = 'online';
  app.game = null;
  app.paused = false;
  app.overShown = false;
  app.over = null;
  online.status = 'playing';
  online.side = m.side;
  online.ranked = m.ranked;
  online.oppLeft = false;
  online.snaps = [];
  online.invite = null;
  net.resetInput();
  const me = online.me?.name ?? t('you');
  app.names = m.side === LEFT ? [me, m.opp.name] : [m.opp.name, me];
  app.target = m.target;
  hidePanels();
  audio.unlock();
}

function onState(m) {
  if (app.mode !== 'online') return;
  online.snaps.push({ at: performance.now(), p: m.p, b: m.b, sc: m.sc, ph: m.ph, lt: m.lt });
  if (online.snaps.length > 12) online.snaps.shift();
  for (const ev of m.ev ?? []) playEvent(ev[0], ev[1], ev[2] ?? 0);
}

function onResult(m) {
  app.over = m;
  const mine = m.winner === online.side;
  const delay = m.forfeit ? 200 : 1800;           // laisse voir le dernier point avant d'afficher le résultat
  setTimeout(() => {
    if (app.mode !== 'online' || app.over !== m) return;
    app.overShown = true;
    $('#over-title').textContent = t(mine ? 'youWin' : 'youLose');
    const lines = [`${m.score[0]} – ${m.score[1]}`, m.forfeit && mine ? t('oppLeft') : '', m.delta !== undefined ? t('ratingDelta', { rating: m.rating, delta: (m.delta >= 0 ? '+' : '') + m.delta }) : (m.forfeit ? '' : t(m.ranked ? 'ranked' : 'unranked'))];
    $('#over-detail').textContent = lines.filter(Boolean).join(' · ');
    $('#over-again').textContent = t('rematch');
    $('#over-again').disabled = online.oppLeft;
    $('#over-again').dataset.action = 'rematch';
    showPanel('over');
  }, delay);
  if (!m.forfeit) audio.play(mine ? 'win' : 'lose');
}

function backToLobby() {
  app.mode = null;
  app.game = null;
  online.status = 'lobby';
  hidePanels();
  showPanel('online');
  $('#lobby').hidden = false;
  $('#join').hidden = true;
  renderLobby();
  loadBoard();
}

/** Vue interpolée du mode en ligne : on affiche l'état d'il y a RENDER_DELAY_MS, entre les deux messages qui l'encadrent. */
function onlineView() {
  const snaps = online.snaps;
  if (snaps.length === 0) return null;
  const target = performance.now() - RENDER_DELAY_MS;
  let a = snaps[0];
  let b = snaps[0];
  for (let i = 0; i < snaps.length; i++) {
    if (snaps[i].at <= target) a = b = snaps[i];
    if (snaps[i].at > target) {
      b = snaps[i];
      break;
    }
  }
  const k = b.at > a.at ? Math.min(1, Math.max(0, (target - a.at) / (b.at - a.at))) : 0;
  const lerp = (x, y) => x + (y - x) * k;
  const far = Math.abs(b.b[0] - a.b[0]) > 120 || Math.abs(b.b[1] - a.b[1]) > 120;      // le ballon vient d'être replacé : pas d'interpolation
  const last = snaps[snaps.length - 1];
  return {
    slimes: [{ x: lerp(a.p[0], b.p[0]), y: lerp(a.p[1], b.p[1]) }, { x: lerp(a.p[2], b.p[2]), y: lerp(a.p[3], b.p[3]) }],
    ball: far ? { x: b.b[0], y: b.b[1], vx: 0 } : { x: lerp(a.b[0], b.b[0]), y: lerp(a.b[1], b.b[1]), vx: (b.b[0] - a.b[0]) || 0 },
    score: last.sc,
    phase: PHASES[last.ph] ?? 'play',
    lastScorer: last.lt,
  };
}

// ---------------------------------------------------------------- rendu et boucle
function resize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(2, Math.round(rect.width * dpr));
  const h = Math.max(2, Math.round(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.setTransform(canvas.width / C.W, 0, 0, canvas.height / C.H, 0, 0);
}
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe(canvas);

const idleGame = createGame();
function currentView(now) {
  const base = { names: app.names, target: Number(app.target ?? opts.points), time: now, info: '', banner: '', hud: app.mode !== null };
  if (app.mode === 'online') {
    const v = onlineView();
    if (!v) return { ...base, slimes: idleGame.slimes, ball: idleGame.ball, score: [0, 0], phase: 'serve', lastScorer: null, banner: t('serving') };
    return { ...base, ...v, info: net.pingMs !== null ? t('ping', { ms: net.pingMs }) : '' };
  }
  const g = app.game ?? idleGame;
  const alpha = app.game && app.prev && !app.paused ? Math.min(1, app.acc / STEP_MS) : 1;
  const lerp = (a, b) => (app.prev && Math.abs(b - a) < 100 ? a + (b - a) * alpha : b);
  const slimes = g.slimes.map((s, i) => ({ x: lerp(app.prev?.slimes[i].x ?? s.x, s.x), y: lerp(app.prev?.slimes[i].y ?? s.y, s.y) }));
  const ball = { x: lerp(app.prev?.ball.x ?? g.ball.x, g.ball.x), y: lerp(app.prev?.ball.y ?? g.ball.y, g.ball.y), vx: g.ball.vx, vy: g.ball.vy };
  return { ...base, slimes, ball, score: g.score, phase: g.phase, lastScorer: g.lastScorer, target: g.target };
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(100, now - (app.last || now));
  app.last = now;
  if ((app.mode === 'ai' || app.mode === 'local') && !app.paused) advanceLocal(dt);
  if (app.mode === 'online') net.sendInput(readInputs()[0]);
  draw(ctx, currentView(now));
}

// ---------------------------------------------------------------- actions de l'interface
document.addEventListener('click', (e) => {
  const el = e.target instanceof Element ? e.target.closest('[data-action]') : null;
  if (!el) return;
  audio.unlock();
  audio.play('click');
  switch (el.dataset.action) {
    case 'ai': startLocal('ai'); break;
    case 'local': startLocal('local'); break;
    case 'online': openOnline(); break;
    case 'resume': panels.pause.hidden = true; setPaused(false); break;
    case 'again': startLocal(app.mode); break;
    case 'rematch':
      net.send({ t: 'rematch' });
      $('#over-again').disabled = true;
      break;
    case 'quit':
      if (app.mode === 'online') {
        net.send({ t: 'leave' });
        backToLobby();
      } else {
        endSession();
      }
      break;
    default: break;
  }
});

$('#pause-btn').addEventListener('click', () => togglePause());
$('#opt-level').addEventListener('change', (e) => { opts.level = e.target.value; saveOpts(); });
$('#opt-points').addEventListener('change', (e) => { opts.points = Number(e.target.value); saveOpts(); });
$('#opt-sound').addEventListener('click', () => { audio.unlock(); audio.setMuted(!audio.isMuted()); refreshLabels(); });
$('#opt-lang').addEventListener('click', () => { i18n.setLang(i18n.getLang() === 'fr' ? 'en' : 'fr'); refreshLabels(); });
$('#online-back').addEventListener('click', leaveOnline);
$('#quick').addEventListener('click', () => net.send({ t: online.status === 'queued' ? 'unqueue' : 'queue' }));
$('#invite-accept').addEventListener('click', () => {
  if (online.invite) net.send({ t: 'accept', id: online.invite.id });
  $('#invite').hidden = true;
});
$('#invite-decline').addEventListener('click', () => {
  if (online.invite) net.send({ t: 'decline', id: online.invite.id });
  online.invite = null;
  $('#invite').hidden = true;
});
$('#join').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#nick').value.trim();
  if (!name) {
    setOnlineStatus(t('errName'), true);
    return;
  }
  audio.unlock();
  net.send({ t: 'hello', name, token: playerToken() });
});

// ---------------------------------------------------------------- démarrage
i18n.setLang(i18n.detectLang());
refreshLabels();
resize();
requestAnimationFrame(frame);

// Accès pour les tests de bout en bout dans le navigateur.
window.__gloop = { app, online, opts, net };
