<?php

declare(strict_types=1);

// URL WebSocket vue par le navigateur (GLOOP_WS) ; vide = même hôte, port 8081 (ou /ws derrière HTTPS).
$ws = (string) getenv('GLOOP_WS');
?><!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
  <meta name="theme-color" content="#5ec3ff">
  <title>Gloop Volley</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath d='M2 26a14 14 0 0 1 28 0z' fill='%237ddc6b' stroke='%233f9f3b' stroke-width='2'/%3E%3Ccircle cx='21' cy='15' r='4' fill='%23fff' stroke='%23222'/%3E%3Ccircle cx='22' cy='15' r='2' fill='%23111'/%3E%3C/svg%3E">
  <link rel="stylesheet" href="css/style.css">
  <script>window.GLOOP_WS = <?= json_encode($ws, JSON_THROW_ON_ERROR | JSON_HEX_TAG | JSON_HEX_AMP) ?>;</script>
</head>
<body>
  <div id="stage">
    <canvas id="game" aria-label="Gloop Volley"></canvas>

    <div id="touch" hidden>
      <div class="pad p1">
        <button data-p="1" data-k="left" data-i18n-aria="left">◀</button>
        <button data-p="1" data-k="right" data-i18n-aria="right">▶</button>
        <button data-p="1" data-k="up" class="jump" data-i18n-aria="jump">▲</button>
      </div>
      <div class="pad p2">
        <button data-p="2" data-k="left" data-i18n-aria="left">◀</button>
        <button data-p="2" data-k="right" data-i18n-aria="right">▶</button>
        <button data-p="2" data-k="up" class="jump" data-i18n-aria="jump">▲</button>
      </div>
    </div>

    <button id="pause-btn" class="icon-btn" hidden aria-label="Pause">⏸</button>

    <section id="menu" class="panel">
      <h1 data-i18n="title">Gloop Volley</h1>
      <p class="tagline" data-i18n="tagline"></p>
      <div class="stack">
        <button class="btn primary" data-action="ai" data-i18n="vsAi"></button>
        <button class="btn" data-action="local" data-i18n="local2p"></button>
        <button class="btn" data-action="online" data-i18n="online"></button>
      </div>
      <div class="options">
        <label><span data-i18n="level"></span>
          <select id="opt-level">
            <option value="easy" data-i18n="easy"></option>
            <option value="normal" data-i18n="normal" selected></option>
            <option value="hard" data-i18n="hard"></option>
          </select>
        </label>
        <label><span data-i18n="points"></span>
          <select id="opt-points"><option>3</option><option>5</option><option selected>7</option><option>11</option></select>
        </label>
        <button class="btn small" id="opt-sound"></button>
        <button class="btn small" id="opt-lang"></button>
      </div>
      <p class="hint" data-i18n="controls"></p>
      <p class="hint" data-i18n="controls2p"></p>
      <p class="hint rotate" data-i18n="rotate"></p>
      <footer class="foot">
        <a class="gh" href="https://github.com/OpenPrunus/gloop-volley" target="_blank" rel="noopener noreferrer">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
          <span data-i18n="github"></span>
        </a>
        <span class="license" title="MIT License">MIT</span>
      </footer>
    </section>

    <section id="online" class="panel wide" hidden>
      <h2 data-i18n="online"></h2>
      <p id="online-status" class="status"></p>
      <form id="join" class="row">
        <input id="nick" maxlength="15" autocomplete="off" spellcheck="false" data-i18n-placeholder="nicknamePlaceholder">
        <button class="btn primary" type="submit" data-i18n="online"></button>
      </form>
      <div id="lobby" hidden>
        <div class="row">
          <button class="btn primary" id="quick" data-i18n="quickMatch"></button>
          <span id="my-rating" class="badge"></span>
        </div>
        <h3 data-i18n="lobby"></h3>
        <ul id="players" class="list"></ul>
        <h3 data-i18n="leaderboard"></h3>
        <table class="board"><thead><tr><th data-i18n="rank"></th><th data-i18n="name"></th><th data-i18n="elo"></th><th data-i18n="wl"></th></tr></thead><tbody id="board"></tbody></table>
      </div>
      <div id="invite" class="toast" hidden>
        <span id="invite-text"></span>
        <button class="btn small primary" id="invite-accept" data-i18n="accept"></button>
        <button class="btn small" id="invite-decline" data-i18n="decline"></button>
      </div>
      <button class="btn small" id="online-back" data-i18n="back"></button>
    </section>

    <section id="pause" class="panel small" hidden>
      <h2 data-i18n="pause"></h2>
      <div class="stack">
        <button class="btn primary" data-action="resume" data-i18n="resume"></button>
        <button class="btn" data-action="quit" data-i18n="quit"></button>
      </div>
    </section>

    <section id="over" class="panel small" hidden>
      <h2 id="over-title"></h2>
      <p id="over-detail" class="status"></p>
      <div class="stack">
        <button class="btn primary" id="over-again"></button>
        <button class="btn" data-action="quit" data-i18n="menu"></button>
      </div>
    </section>
  </div>
  <script type="module" src="js/main.js"></script>
</body>
</html>
