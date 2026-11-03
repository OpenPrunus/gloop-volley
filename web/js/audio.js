// Gloop Volley — effets sonores synthétisés (aucun fichier audio). Les navigateurs exigent un geste utilisateur : unlock().
let ctx = null;
let muted = false;
try { muted = localStorage.getItem('gloop.muted') === '1'; } catch { /* ignoré */ }

export function unlock() {
  if (ctx || typeof AudioContext === 'undefined') {
    if (ctx?.state === 'suspended') ctx.resume();
    return;
  }
  ctx = new AudioContext();
}

export function isMuted() {
  return muted;
}

export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('gloop.muted', m ? '1' : '0'); } catch { /* ignoré */ }
}

function tone(freq, dur, { type = 'sine', gain = 0.18, slide = 0, delay = 0 } = {}) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const SOUNDS = {
  hit: (p = 6) => tone(260 + p * 22, 0.09, { type: 'sine', gain: 0.2, slide: 120 }),
  net: () => tone(150, 0.1, { type: 'triangle', gain: 0.16 }),
  wall: () => tone(210, 0.06, { type: 'triangle', gain: 0.1 }),
  serve: () => tone(520, 0.07, { type: 'square', gain: 0.07 }),
  point: () => {
    tone(440, 0.14, { type: 'triangle', gain: 0.16 });
    tone(330, 0.2, { type: 'triangle', gain: 0.16, delay: 0.13 });
  },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, { type: 'triangle', gain: 0.16, delay: i * 0.11 })),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.22, { type: 'sawtooth', gain: 0.08, delay: i * 0.14 })),
  click: () => tone(700, 0.04, { type: 'square', gain: 0.05 }),
};

export function play(name, power) {
  SOUNDS[name]?.(power);
}
