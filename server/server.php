<?php

/**
 * Serveur multijoueur de Gloop Volley : WebSocket (RFC 6455) en PHP pur.
 *
 * - Salon : liste des joueurs connectés, défis par clic sur un pseudo, partie rapide (matchmaking).
 * - Match : le serveur fait tourner le moteur de jeu à 60 Hz (même physique que le navigateur), reçoit les touches des
 *   joueurs et leur renvoie l'état de la partie. Classement Elo pour les parties classées.
 *
 * Variables d'environnement : WS_PORT (8081), WS_ALLOWED_ORIGINS (liste séparée par des virgules, vide = tout),
 * GLOOP_DATA_DIR (dossier du classement). Le code est dans src/ (namespace Gloop\).
 */

declare(strict_types=1);

use Gloop\Game\GameHub;
use Gloop\Game\HubConfig;
use Gloop\Ranking\RankingStore;
use Gloop\Server\SocketServer;
use Gloop\Support\Env;
use Gloop\Support\StdoutLogger;
use Gloop\Support\SystemClock;
use Gloop\WebSocket\Handshake;

set_time_limit(0);
require __DIR__ . '/bootstrap.php';

$port = (int) Env::string('WS_PORT', '8081');
$origins = array_values(array_filter(array_map('trim', explode(',', Env::string('WS_ALLOWED_ORIGINS')))));
$dataDir = rtrim(Env::string('GLOOP_DATA_DIR', dirname(__DIR__) . '/web/data'), '/');
$store = new RankingStore($dataDir . '/ratings.json');

$hub = GameHub::create(HubConfig::fromEnvironment(), $store, new SystemClock(), new StdoutLogger());
try {
    $server = SocketServer::listen($port, $hub, new Handshake($origins));
} catch (RuntimeException $e) {
    fwrite(STDERR, $e->getMessage() . "\n");
    exit(1);
}

fwrite(STDOUT, 'Ranking: ' . count($hub->ranking()->ranking) . " player(s) loaded from {$store->file()}"
    . (is_writable($dataDir) ? '' : ' (WARNING: directory not writable, results will not be saved)') . "\n");
fwrite(STDOUT, "Gloop WS listening on :$port\n");            // dernier message de démarrage : le serveur est prêt

$server->run();
