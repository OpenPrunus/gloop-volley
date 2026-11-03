// Gloop Volley — commandes tactiles par gestes, sans boutons.
// Le doigt est un joystick flottant : glisser à gauche ou à droite fait avancer le gloop tant que le doigt reste décalé du point de
// départ (le point suit le doigt si on va plus loin, pour pouvoir changer de sens sans lever le doigt). Glisser vers le haut ou
// toucher rapidement fait sauter. À deux sur le même écran, chaque joueur a sa moitié d'écran.

const DEAD = 10;        // px de décalage avant de bouger
const MAX_REACH = 22;  // px : au-delà, le point de départ suit le doigt (un retour de ~30 px suffit pour changer de sens)
const JUMP_FLICK = 34;  // px vers le haut pour sauter
const TAP_MS = 240;
const TAP_PX = 14;
const JUMP_HOLD_MS = 130;

/**
 * @param {Document} doc
 * @param {{touch: Record<number, {left: boolean, right: boolean, up: boolean}>, enabled: () => boolean, duo: () => boolean}} cfg
 *   touch : l'état lu par le jeu (joueur 1 et 2) ; enabled : les gestes sont actifs ; duo : deux joueurs sur le même écran.
 */
export function bindGestures(doc, { touch, enabled, duo }) {
  const pointers = new Map();

  function recompute() {
    for (const side of [1, 2]) {
      const dirs = [...pointers.values()].filter((p) => p.side === side).map((p) => p.dir);
      const left = dirs.includes('left');
      const right = dirs.includes('right');
      touch[side].left = left && !right;
      touch[side].right = right && !left;
    }
  }

  function jump(side) {
    touch[side].up = true;
    setTimeout(() => { touch[side].up = false; }, JUMP_HOLD_MS);
  }

  doc.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || !enabled()) return;
    if (e.target instanceof Element && e.target.closest('button, a, input, select, .panel')) return;
    const side = duo() && e.clientX > window.innerWidth / 2 ? 2 : 1;
    pointers.set(e.pointerId, { side, x0: e.clientX, y0: e.clientY, anchor: e.clientX, yRef: e.clientY, t0: performance.now(), moved: false, dir: null });
  });

  doc.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p || !enabled()) return;
    if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > TAP_PX) p.moved = true;
    let dx = e.clientX - p.anchor;
    if (Math.abs(dx) > MAX_REACH) {
      p.anchor = e.clientX - Math.sign(dx) * MAX_REACH;
      dx = e.clientX - p.anchor;
    }
    p.dir = dx > DEAD ? 'right' : dx < -DEAD ? 'left' : null;
    if (e.clientY > p.yRef) p.yRef = e.clientY;
    if (p.yRef - e.clientY >= JUMP_FLICK) {                // un coup de doigt vers le haut : saut
      p.yRef = e.clientY;
      jump(p.side);
    }
    recompute();
  });

  const end = (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    if (e.type === 'pointerup' && !p.moved && performance.now() - p.t0 < TAP_MS && enabled()) jump(p.side);     // un simple toucher : saut
    pointers.delete(e.pointerId);
    recompute();
  };
  doc.addEventListener('pointerup', end);
  doc.addEventListener('pointercancel', end);

  return {
    /** Relâche tout (changement d'écran, pause). */
    reset() {
      pointers.clear();
      for (const side of [1, 2]) Object.assign(touch[side], { left: false, right: false, up: false });
    },
  };
}
