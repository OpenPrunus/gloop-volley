// Gloop Volley — client WebSocket du serveur multijoueur. Messages JSON ; `t` = type.

/** URL du serveur : réglable par window.GLOOP_WS (injectée par index.php), sinon même hôte (wss derrière HTTPS). */
export function serverUrl() {
  if (typeof window.GLOOP_WS === 'string' && window.GLOOP_WS) return window.GLOOP_WS;
  const { protocol, hostname, host } = window.location;
  return protocol === 'https:' ? `wss://${host}/ws` : `ws://${hostname}:8081`;
}

/** Jeton secret du navigateur (identité du joueur, sans compte) : généré une fois, gardé dans le localStorage. */
export function playerToken() {
  try {
    const saved = localStorage.getItem('gloop.token');
    if (saved && /^[A-Za-z0-9_-]{24,128}$/.test(saved)) return saved;
  } catch { /* stockage indisponible */ }
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  try { localStorage.setItem('gloop.token', token); } catch { /* ignoré */ }
  return token;
}

export class Net {
  /** @param {{onopen?:Function,onmessage:(m:object)=>void,onclose:(wasOpen:boolean)=>void}} handlers */
  constructor(handlers) {
    this.handlers = handlers;
    this.ws = null;
    this.opened = false;
    this.pingMs = null;
    this.pingTimer = null;
    this.lastInput = '';
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  connect(url = serverUrl()) {
    this.close();
    let ws;
    try {
      ws = new WebSocket(url);
    } catch {
      this.handlers.onclose(false);
      return;
    }
    this.ws = ws;
    this.opened = false;
    ws.onopen = () => {
      this.opened = true;
      this.handlers.onopen?.();
      this.pingTimer = setInterval(() => this.send({ t: 'ping', c: Math.round(performance.now()) }), 5000);
      this.send({ t: 'ping', c: Math.round(performance.now()) });
    };
    ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (!m || typeof m.t !== 'string') return;
      if (m.t === 'pong' && typeof m.c === 'number') this.pingMs = Math.max(0, Math.round(performance.now()) - m.c);
      this.handlers.onmessage(m);
    };
    ws.onclose = () => {
      clearInterval(this.pingTimer);
      if (this.ws === ws) {
        this.ws = null;
        this.handlers.onclose(this.opened);
      }
    };
    ws.onerror = () => { /* onclose suit toujours */ };
  }

  send(obj) {
    if (this.connected) this.ws.send(JSON.stringify(obj));
  }

  /** Envoie les touches si elles ont changé depuis le dernier envoi. */
  sendInput(input) {
    const key = `${+input.left}${+input.right}${+input.up}`;
    if (key === this.lastInput) return;
    this.lastInput = key;
    this.send({ t: 'input', l: input.left, r: input.right, u: input.up });
  }

  resetInput() {
    this.lastInput = '';
  }

  close() {
    clearInterval(this.pingTimer);
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = null;
      try { ws.close(); } catch { /* déjà fermée */ }
    }
  }
}
