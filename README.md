# 🟢 Gloop Volley

A slime-volleyball game for the browser: two gloops, one net, first to 7 points. Play against the computer, with a friend on
the same screen, or **online** against other players (lobby, quick match, challenges and an Elo leaderboard).
French and English, keyboard and touch.

## Features

- **Against the computer** in three levels (the AI predicts the ball's landing point with the game's own physics and picks the return that clears the net and lands far from you).
- **Two players on one screen** (keyboard, or half of the screen each on a phone) and **touch gestures** on phones.
- **Online multiplayer**: a central PHP 8.5 server runs the match at 60 Hz and the browsers only send their keys.
  Lobby, quick match, challenges by clicking a nickname, rematch, ping display.
- **Ranked matches** with an Elo rating, without any account: each browser has a secret token (only its SHA-256 hash is stored)
  that reserves the nickname. Anti-collusion: gains shrink when the same two players meet again within 24 hours.
- Sounds are synthesized (no audio files), the game works offline in AI / 2-player modes.

## Quick start

```bash
git clone <this repository> gloop-volley
cd gloop-volley
docker compose up -d --build
```

Game: <http://localhost:8090> — game server: `ws://localhost:8091`. See [INSTALL.md](INSTALL.md) for a setup without Docker,
the configuration variables and a reverse-proxy example.

## Controls

| | Player 1 / single player | Player 2 (same screen) |
| --- | --- | --- |
| Move | ← → or **A D** / **Q D** | ← → |
| Jump | ↑ or **W** / **Z** (or space) | ↑ |
| Pause | Esc or P | |

On a phone there are no buttons: put a finger anywhere and slide it left or right to move (it works like a floating joystick: go further and the starting point follows your finger, so you can reverse without lifting it), swipe up or tap to jump. Two players on one phone each take half of the screen. A fullscreen button locks landscape on Android, the screen stays on while you play, notches and the home bar are respected.

## Architecture

```
web/                 website, served by Apache (PHP 8.5)
  index.php          single page (menu, lobby, game); injects the WebSocket URL (GLOOP_WS)
  api.php            leaderboard (JSON, GET only): reads ratings.json
  js/engine.js       the game: pure physics and rules, no DOM, deterministic (60 ticks / s)
  js/ai.js           the computer opponent (uses engine.js to simulate returns)
  js/render.js       Canvas rendering
  js/main.js         menus, game loop, keyboard / touch input, online mode
  js/gestures.js     touch gestures: floating joystick and jump (no on-screen buttons)
  js/net.js          WebSocket client
  js/i18n.js         French / English
server/server.php    entry point of the game server (a few lines of wiring)
src/                 all PHP code, PSR-4 namespace `Gloop\` (see below)
tests/               JS unit tests, PHP integration, browser tests; tests/php = PHPUnit
docs/                class diagrams (see below)
```

### The physics exist twice, and tests keep them identical

The browser plays against the AI and predicts the ball with `web/js/engine.js`; the server must replay a match
without running JavaScript, so `src/Engine/` is an exact PHP port. `npm run fixtures` plays seven full matches with the JS
engine (AI against AI, plus random-input chaos) and records the inputs, the positions and the events;
`tests/php/Engine/FixturesTest.php` replays the same inputs in PHP and compares every recorded state (1e-9) and event.
**If you change `engine.js`, port the change to `src/Engine/` and run `npm run fixtures`**, otherwise the PHP tests fail.

### PHP code (`src/`)

PHP 8.5, PSR-4 autoloading, PSR-12 style, `declare(strict_types=1)` everywhere, PHPStan level 8. Runtime dependencies are
the PSR interfaces `psr/log` (PSR-3) and `psr/clock` (PSR-20), and [`openprunus/arcade-core`](https://github.com/OpenPrunus/arcade-core),
the WebSocket server and support classes shared with Chicken Challenge (namespace `Arcade\`).

| Namespace | Role | Patterns |
| --- | --- | --- |
| `Gloop\Engine` | The game: `Game`, `Slime`, `Ball`, `Rules`, `Input`, enums `Side` / `Phase` / `EventType` | Value objects (`Input`, `Contact`, `GameEvent`) |
| `Gloop\Game` | The multiplayer server: `GameHub` (facade), `Lobby`, `Invitations`, `MatchQueue`, `MatchService`, `Room`, `RankingBook` | **Command** (one `Handler\*` per client message), **Factory** (`GameHub::create`) |
| `Gloop\Ranking` | `Elo`, `Ranking` (immutable), `Player`, `PairLimiter`, `RankingStore` | **Repository** (`RankingStore`), immutable objects updated with `clone with` |
| `Arcade\WebSocket`, `Arcade\Server` *(arcade-core)* | RFC 6455 codec and the `stream_select` server (`SocketServer`, run here at 60 Hz); it knows nothing about the game | **Adapter** (`Connection` implements `Transport`); the game plugs in through `Hub` (`GameHub`) and `Session` (`Client`) |
| `Gloop\Api` | `Board`: the public leaderboard | |
| `Arcade\Support` *(arcade-core)* | `Env`, `Nickname`, `SystemClock` (PSR-20), `StdoutLogger` (PSR-3), `AtomicFile` | Dependency injection of clock, logger and randomizer |

PHP 8.5 and recent features in use: the pipe operator (`Nickname::clean`), `clone with` on readonly classes (`Player`),
`#[\NoDiscard]` (`Ranking::record`), `array_find` / `array_any` / `array_all` / `array_last`, property hooks and asymmetric
visibility (`Client`, `RankingBook`, `Connection`), typed class constants, enums, `readonly` classes, `#[\Override]`,
`json_validate`, `new` in initializers and `Random\Randomizer` injection.

### How online play works

- The browser opens a WebSocket, sends `hello` (nickname + token) and joins the lobby. `queue` starts a quick match, `challenge`
  invites a player.
- During a match the client sends only its keys (`input`, when they change). The server steps the engine 60 times a second and
  sends the state (positions, ball, score, phase, events) to both players; each browser draws the state of 50 ms ago, interpolated
  between two server messages, so motion stays smooth.
- Nothing computed by the browser counts: a modified client can only press keys.
- A ranked match needs two different browsers that both have a token. Leaving mid-match is a forfeit.

### Class diagrams

Editable in [draw.io](https://app.diagrams.net), with PNG exports, in [`docs/diagrams/`](docs/diagrams): the game engine, the network layer and facade, and matches and ranking.

## Tests

```bash
npm run test:unit         # engine, AI, translations (node:test)
composer install && composer check   # PSR-12, PHPStan level 8, PHPUnit (incl. replay of the JS engine's games)
npm run test:integration  # the real PHP server on a real port, WebSocket clients
npm run test:browser      # headless Chrome: desktop, emulated phone, online match against a bot
```

`PHP_BIN` (default `php`) and `CHROME_BIN` (default `google-chrome`) select the executables; `SHOTS=/dir` saves screenshots.
CI runs all of them plus a smoke test of the Docker image.

## License

MIT, see [LICENSE](LICENSE).
