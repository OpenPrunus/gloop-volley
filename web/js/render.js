// Gloop Volley — rendu Canvas. Tout est dessiné en coordonnées logiques du moteur (800 x 450) puis mis à l'échelle.
import { C } from './engine.js';

export const GROUND = 410; // ordonnée écran du sol (le moteur a son y = 0 ici, vers le haut)
export const COLORS = [
  { body: '#7ddc6b', dark: '#3f9f3b', light: '#c9f5b9' },
  { body: '#ff7ab8', dark: '#c23a82', light: '#ffd0e6' },
];

const sy = (y) => GROUND - y;

function drawSky(ctx, time) {
  const g = ctx.createLinearGradient(0, 0, 0, GROUND);
  g.addColorStop(0, '#5ec3ff');
  g.addColorStop(1, '#d9f3ff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, C.W, C.H);
  // soleil
  ctx.fillStyle = '#fff3a8';
  ctx.beginPath();
  ctx.arc(690, 70, 34, 0, Math.PI * 2);
  ctx.fill();
  // nuages qui dérivent lentement
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (const [x0, y0, s, sp] of [[80, 70, 1, 0.006], [330, 120, 0.8, 0.004], [560, 50, 1.2, 0.005]]) {
    const x = ((x0 + time * sp) % (C.W + 200)) - 100;
    ctx.beginPath();
    ctx.arc(x, y0, 18 * s, 0, Math.PI * 2);
    ctx.arc(x + 20 * s, y0 - 8 * s, 22 * s, 0, Math.PI * 2);
    ctx.arc(x + 44 * s, y0, 17 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  // collines
  ctx.fillStyle = '#9bd88a';
  ctx.beginPath();
  ctx.moveTo(0, GROUND);
  ctx.quadraticCurveTo(160, GROUND - 120, 340, GROUND);
  ctx.quadraticCurveTo(560, GROUND - 150, 800, GROUND);
  ctx.fill();
}

function drawGround(ctx) {
  ctx.fillStyle = '#f2d89b';
  ctx.fillRect(0, GROUND, C.W, C.H - GROUND);
  ctx.fillStyle = '#d9bd78';
  ctx.fillRect(0, GROUND, C.W, 4);
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(C.NET_X, GROUND + 4);
  ctx.lineTo(C.NET_X, C.H);
  ctx.stroke();
}

function drawNet(ctx) {
  const x = C.NET_X;
  const top = sy(C.NET_H);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(x - 14, top, 28, C.NET_H);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1;
  for (let i = 0; i < C.NET_H; i += 10) {
    ctx.beginPath();
    ctx.moveTo(x - 14, top + i);
    ctx.lineTo(x + 14, top + i);
    ctx.stroke();
  }
  ctx.fillStyle = '#f4f4f4';
  ctx.fillRect(x - C.NET_HW, top, C.NET_HW * 2, C.NET_H);
  ctx.fillStyle = '#e8453c';
  ctx.beginPath();
  ctx.arc(x, top, C.NET_HW + 1, 0, Math.PI * 2);
  ctx.fill();
}

function drawSlime(ctx, s, side, ball, mood) {
  const col = COLORS[side];
  const x = s.x;
  const y = sy(s.y);
  // ombre
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  const k = 1 - Math.min(0.5, s.y / 300);
  ctx.beginPath();
  ctx.ellipse(x, GROUND + 3, C.R * k, 6 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  // corps : demi-disque légèrement écrasé à l'atterrissage / étiré en l'air
  const stretch = s.y > 4 ? 1.06 : 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1 / stretch, stretch);
  const g = ctx.createRadialGradient(-C.R * 0.3, -C.R * 0.55, 4, 0, -C.R * 0.2, C.R * 1.1);
  g.addColorStop(0, col.light);
  g.addColorStop(0.35, col.body);
  g.addColorStop(1, col.dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, C.R, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = col.dark;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
  // œil tourné vers le ballon
  const dir = side === 0 ? 1 : -1;
  const ex = x + dir * 19;
  const ey = y - 30;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(ex, ey, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  const dx = ball.x - ex;
  const dy = sy(ball.y) - ey;
  const d = Math.hypot(dx, dy) || 1;
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(ex + (dx / d) * 4.5, ey + (dy / d) * 4.5, 5, 0, Math.PI * 2);
  ctx.fill();
  if (mood === 'sad') {
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + dir * 6, y - 12, 8, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  } else if (mood === 'happy') {
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + dir * 6, y - 14, 9, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  }
}

function drawBall(ctx, b, time) {
  const x = b.x;
  const y = sy(b.y);
  // ombre portée au sol
  const h = Math.min(1, b.y / 320);
  ctx.fillStyle = `rgba(0,0,0,${0.2 - h * 0.12})`;
  ctx.beginPath();
  ctx.ellipse(x, GROUND + 3, C.BALL_R * (1 - h * 0.4), 4 * (1 - h * 0.4), 0, 0, Math.PI * 2);
  ctx.fill();
  // indicateur quand le ballon sort par le haut
  if (y < 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.moveTo(x, 6);
    ctx.lineTo(x - 8, 20);
    ctx.lineTo(x + 8, 20);
    ctx.closePath();
    ctx.fill();
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((b.x + b.y * 0.5) * 0.06 + time * 0.0005 * (b.vx || 0));
  ctx.fillStyle = '#fffdf2';
  ctx.beginPath();
  ctx.arc(0, 0, C.BALL_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#e0a82e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, C.BALL_R, 0, Math.PI * 2);
  ctx.moveTo(-C.BALL_R, 0);
  ctx.quadraticCurveTo(0, -5, C.BALL_R, 0);
  ctx.moveTo(0, -C.BALL_R);
  ctx.quadraticCurveTo(6, 0, 0, C.BALL_R);
  ctx.stroke();
  ctx.restore();
}

function drawHud(ctx, v) {
  if (!v.hud) return;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.roundRect(C.W / 2 - 74, 10, 148, 50, 14);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.fillText(`${v.score[0]}  :  ${v.score[1]}`, C.W / 2, 46);
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS[0].dark;
  ctx.fillText(v.names[0] ?? '', 14, 28);
  ctx.textAlign = 'right';
  ctx.fillStyle = COLORS[1].dark;
  ctx.fillText(v.names[1] ?? '', C.W - 58, 28);   // le bouton pause occupe le coin
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.textAlign = 'center';
  ctx.fillText(`${v.target}`, C.W / 2, 74);
  if (v.info) {
    ctx.textAlign = 'right';
    ctx.fillText(v.info, C.W - 58, 46);
  }
}

/** Dessine une image complète. `v` : { slimes, ball, score, names, target, phase, winner, banner, info, time }. */
export function draw(ctx, v) {
  const time = v.time ?? 0;
  drawSky(ctx, time);
  drawGround(ctx);
  drawNet(ctx);
  const over = v.phase === 'over' || v.phase === 'point';
  const scorer = v.lastScorer;
  for (const side of [0, 1]) {
    const mood = over && scorer !== null && scorer !== undefined ? (side === scorer ? 'happy' : 'sad') : '';
    drawSlime(ctx, v.slimes[side], side, v.ball, mood);
  }
  drawBall(ctx, v.ball, time);
  drawHud(ctx, v);
  if (v.banner) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.strokeText(v.banner, C.W / 2, 160);
    ctx.fillStyle = '#fff';
    ctx.fillText(v.banner, C.W / 2, 160);
  }
}
