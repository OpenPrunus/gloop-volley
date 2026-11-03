<?php

declare(strict_types=1);

namespace Gloop\Tests\Game;

use Gloop\Game\Client;
use Gloop\Game\ClientStatus;
use Gloop\Game\GameHub;
use Gloop\Game\HubConfig;
use Gloop\Ranking\RankingStore;
use Arcade\Support\StdoutLogger;
use Gloop\Tests\Game\Support\FakeTransport;
use Gloop\Tests\Game\Support\MutableClock;
use PHPUnit\Framework\TestCase;
use Random\Engine\Mt19937;
use Random\Randomizer;

/** Le serveur de jeu sans réseau : salon, défis, partie rapide, matchs classés, forfaits et revanches. */
final class GameHubTest extends TestCase
{
    private GameHub $hub;
    private MutableClock $clock;
    private string $dir;
    private int $ipCounter = 0;

    protected function setUp(): void
    {
        $this->dir = sys_get_temp_dir() . '/gloop-hub-' . bin2hex(random_bytes(4));
        mkdir($this->dir);
        $this->clock = new MutableClock();
        $this->hub = $this->makeHub();
    }

    protected function tearDown(): void
    {
        array_map('unlink', glob($this->dir . '/*') ?: []);
        rmdir($this->dir);
    }

    private function makeHub(int $target = 1): GameHub
    {
        $silent = new StdoutLogger(fopen('php://memory', 'w'));

        return GameHub::create(new HubConfig(target: $target), new RankingStore($this->dir . '/ratings.json'), $this->clock, $silent, new Randomizer(new Mt19937(7)));
    }

    /** @return array{Client, FakeTransport} */
    private function connect(?string $name = null, ?string $token = null, ?string $ip = null): array
    {
        $transport = new FakeTransport();
        $client = $this->hub->accept($transport);
        $client->setAddress($ip ?? '203.0.113.' . (++$this->ipCounter));        // une adresse différente par navigateur, sauf demande contraire
        if ($name !== null) {
            $this->say($client, ['t' => 'hello', 'name' => $name, 'token' => $token]);
        }

        return [$client, $transport];
    }

    /** @param array<string, mixed> $msg */
    private function say(Client $client, array $msg): void
    {
        $this->hub->receive($client, json_encode($msg, JSON_THROW_ON_ERROR));
    }

    private function ticks(int $n): void
    {
        for ($i = 0; $i < $n; $i++) {
            $this->hub->tick();
        }
    }

    private static function token(string $seed): string
    {
        return substr(str_repeat($seed, 30), 0, 32);
    }

    /** @return array{Client, FakeTransport, Client, FakeTransport} deux joueurs en match (jetons différents => classé) */
    private function startRankedMatch(string $a = 'Alice', string $b = 'Bob'): array
    {
        [$ca, $ta] = $this->connect($a, self::token($a));
        [$cb, $tb] = $this->connect($b, self::token($b));
        $this->say($ca, ['t' => 'queue']);
        $this->say($cb, ['t' => 'queue']);

        return [$ca, $ta, $cb, $tb];
    }

    /** Fait tomber le ballon sans le toucher : chacun s'écarte vers son mur, le serveur perd donc le point. */
    private function dropBall(Client $a, Client $b, int $ticks = 400): void
    {
        foreach ([$a, $b] as $client) {
            $side = $client->room?->sideOf($client)?->value;
            $this->say($client, ['t' => 'input', 'l' => $side === 0, 'r' => $side === 1, 'u' => false]);
        }
        $this->ticks($ticks);
    }

    public function testHelloRegistersThePlayerAndAnnouncesTheLobby(): void
    {
        [$a, $ta] = $this->connect('Alice');
        [$b, $tb] = $this->connect('  Bob  ');
        $this->assertSame('Alice', $ta->last('welcome')['name']);
        $this->assertSame('Bob', $tb->last('welcome')['name'], 'espaces retirés');
        $this->assertFalse($ta->last('welcome')['ranked'], 'sans jeton : invité');
        $this->assertSame(ClientStatus::Lobby, $a->status);
        $this->ticks(GameHub::HOUSEKEEPING_EVERY);
        $this->assertSame(['Bob'], array_column($ta->last('lobby')['players'], 'name'), 'chacun voit les autres, pas lui-même');
        $this->assertSame(['Alice'], array_column($tb->last('lobby')['players'], 'name'));
    }

    public function testInvalidAndDuplicateNicknamesAreRefused(): void
    {
        foreach (['', '   ', '<>!?', null] as $bad) {
            [, $t] = $this->connect($bad ?? '');
            $this->assertSame('bad_name', $t->last('error')['code'] ?? null, var_export($bad, true));
        }
        $this->connect('Alice');
        [, $t] = $this->connect('ALICE');
        $this->assertSame('name_taken', $t->last('error')['code'], 'pseudo déjà connecté, sans tenir compte de la casse');
        [, $long] = $this->connect(str_repeat('x', 40));
        $this->assertSame(15, mb_strlen($long->last('welcome')['name']));
    }

    public function testEverythingButPingAndHelloNeedsANickname(): void
    {
        [$c, $t] = $this->connect();
        $this->say($c, ['t' => 'queue']);
        $this->say($c, ['t' => 'challenge', 'id' => 1]);
        $this->assertSame(['error', 'error'], $t->types());
        $this->assertSame('not_ready', $t->last('error')['code']);
        $this->say($c, ['t' => 'ping', 'c' => 5]);
        $this->assertSame(5, $t->last('pong')['c']);
    }

    public function testQuickMatchPairsTwoPlayersOnOppositeSides(): void
    {
        [$a, $ta] = $this->connect('Alice');
        [$b, $tb] = $this->connect('Bob');
        $this->say($a, ['t' => 'queue']);
        $this->assertNotNull($ta->last('queued'));
        $this->assertSame(ClientStatus::Queued, $a->status);
        $this->say($b, ['t' => 'queue']);
        $ma = $ta->last('match');
        $mb = $tb->last('match');
        $this->assertNotNull($ma);
        $this->assertNotNull($mb);
        $this->assertSame(1, $ma['side'] + $mb['side'], 'un à gauche, un à droite');
        $this->assertSame('Bob', $ma['opp']['name']);
        $this->assertSame('Alice', $mb['opp']['name']);
        $this->assertFalse($ma['ranked'], 'invités : amical');
        $this->assertSame(1, $ma['target']);
        $this->assertSame([ClientStatus::Playing, ClientStatus::Playing], [$a->status, $b->status]);
        $this->assertSame(1, $this->hub->matchCount());
    }

    public function testLeavingTheQueueAndQueueingTwiceDoNotMatchAPlayerWithHimself(): void
    {
        [$a, $ta] = $this->connect('Alice');
        $this->say($a, ['t' => 'queue']);
        $this->say($a, ['t' => 'queue']);
        $this->assertSame('busy', $ta->last('error')['code']);
        $this->say($a, ['t' => 'unqueue']);
        $this->assertNotNull($ta->last('unqueued'));
        [$b, $tb] = $this->connect('Bob');
        $this->say($b, ['t' => 'queue']);
        $this->assertNull($tb->last('match'), 'Alice a quitté la file');
        $this->assertSame(0, $this->hub->matchCount());
    }

    public function testChallengeAcceptStartsAMatch(): void
    {
        [$a, $ta] = $this->connect('Alice');
        [$b, $tb] = $this->connect('Bob');
        $this->say($a, ['t' => 'challenge', 'id' => $b->id]);
        $this->assertSame('Bob', $ta->last('waiting')['name']);
        $this->assertSame(['id' => $a->id, 'name' => 'Alice'], array_intersect_key($tb->last('invite'), ['id' => 1, 'name' => 1]));
        $this->say($b, ['t' => 'accept', 'id' => $a->id]);
        $this->assertNotNull($ta->last('match'));
        $this->assertNotNull($tb->last('match'));
        $this->assertNull($a->invite);
    }

    public function testDeclineCancelAndInvalidAnswers(): void
    {
        [$a, $ta] = $this->connect('Alice');
        [$b, $tb] = $this->connect('Bob');
        [$c, $tc] = $this->connect('Carl');
        $this->say($a, ['t' => 'challenge', 'id' => $b->id]);
        $this->say($c, ['t' => 'accept', 'id' => $a->id]);
        $this->assertSame('busy', $tc->last('error')['code'], 'seul le défié peut accepter');
        $this->say($b, ['t' => 'accept', 'id' => 999]);
        $this->assertSame('busy', $tb->last('error')['code'], 'mauvais défieur');
        $this->say($b, ['t' => 'decline', 'id' => $a->id]);
        $this->assertSame('Bob', $ta->last('declined')['name']);
        $this->say($a, ['t' => 'challenge', 'id' => $b->id]);
        $this->say($a, ['t' => 'cancel']);
        $this->assertNotNull($tb->last('invite_cancel'));
        $this->say($b, ['t' => 'accept', 'id' => $a->id]);
        $this->assertNull($tb->last('match'), 'défi retiré : plus rien à accepter');
    }

    public function testChallengeRefusedWhenTheTargetIsBusyOrInvalid(): void
    {
        [$a, $ta] = $this->connect('Alice');
        [$b] = $this->connect('Bob');
        [$c, $tc] = $this->connect('Carl');
        $this->say($a, ['t' => 'challenge', 'id' => $a->id]);
        $this->say($a, ['t' => 'challenge', 'id' => 4242]);
        $this->say($a, ['t' => 'challenge', 'id' => 'x']);
        $this->assertSame(['busy', 'busy', 'busy'], array_column($ta->of('error'), 'code'));
        $this->say($a, ['t' => 'challenge', 'id' => $b->id]);
        $this->say($c, ['t' => 'challenge', 'id' => $b->id]);
        $this->assertSame('busy', $tc->last('error')['code'], 'Bob a déjà un défi en attente');
    }

    public function testExpiredInvitationsAreCancelledForBothSides(): void
    {
        [$a, $ta] = $this->connect('Alice');
        [$b, $tb] = $this->connect('Bob');
        $this->say($a, ['t' => 'challenge', 'id' => $b->id]);
        $this->clock->advance(21);
        $this->ticks(GameHub::HOUSEKEEPING_EVERY);
        $this->assertNotNull($ta->last('invite_cancel'));
        $this->assertNotNull($tb->last('invite_cancel'));
        $this->assertNull($a->invite);
    }

    public function testMatchPublishesTheStateEveryTickAndInputsMoveTheSlime(): void
    {
        [$a, $ta, $b, $tb] = $this->startRankedMatch();
        $side = $ta->last('match')['side'];
        $this->ticks(1);
        $first = $ta->last('s');
        $this->assertSame(['n', 'p', 'b', 'sc', 'ph', 'lt', 'sv'], array_keys(array_intersect_key($first, array_flip(['n', 'p', 'b', 'sc', 'ph', 'lt', 'sv']))));
        $this->assertSame('s', $first['ph']);
        $this->assertSame($first, $tb->last('s'), 'les deux joueurs reçoivent le même état');
        $x0 = $first['p'][$side * 2];
        $this->say($a, ['t' => 'input', 'l' => false, 'r' => true, 'u' => false]);
        $this->ticks(10);
        $x1 = $ta->last('s')['p'][$side * 2];
        $this->assertEqualsWithDelta($side === 0 ? $x0 + 50.0 : min($x0 + 50.0, 752.0), $x1, 1e-9);
        $this->say($a, ['t' => 'input', 'l' => false, 'r' => false, 'u' => true]);
        $this->ticks(5);
        $this->assertGreaterThan(0, $ta->last('s')['p'][$side * 2 + 1], 'le gloop saute');
    }

    public function testInputsOutsideAMatchAndGarbageAreIgnored(): void
    {
        [$a, $ta] = $this->connect('Alice');
        $before = count($ta->sent);
        $this->say($a, ['t' => 'input', 'l' => true]);
        foreach (['', 'pas du json', '[]', '{"t":42}', '{"t":["queue"]}', '{"t":"inconnu"}', str_repeat('x', 3000)] as $raw) {
            $this->hub->receive($a, $raw);
        }
        $this->assertCount($before, $ta->sent);
    }

    public function testMessageRateIsLimitedPerSecond(): void
    {
        [$a, $ta] = $this->connect('Alice');
        for ($i = 0; $i < 400; $i++) {
            $this->say($a, ['t' => 'ping', 'c' => $i]);
        }
        $this->assertCount(150 - 1, $ta->of('pong'), 'hello compte aussi dans la seconde');
        $this->clock->advance(1);
        $this->say($a, ['t' => 'ping', 'c' => 1]);
        $this->assertCount(150, $ta->of('pong'), 'la seconde suivante repart de zéro');
    }

    public function testRankedMatchReportsTheResultAndUpdatesTheRating(): void
    {
        [$a, $ta, $b, $tb] = $this->startRankedMatch();
        $this->assertTrue($ta->last('match')['ranked']);
        $this->ticks(1);
        $this->dropBall($a, $b);
        $ra = $ta->last('result');
        $rb = $tb->last('result');
        $this->assertNotNull($ra);
        $this->assertFalse($ra['forfeit']);
        $this->assertSame($ra['winner'], $rb['winner']);
        $this->assertSame(1000 + $ra['delta'], $ra['rating']);
        $this->assertSame(0, $ra['delta'] + $rb['delta'], 'Elo à somme nulle entre deux débutants');
        $this->assertSame(1, array_sum($ra['score']));
        $ranking = $this->hub->ranking()->ranking;
        $this->assertCount(2, $ranking);
        $this->assertFileExists($this->dir . '/ratings.json');
        $this->assertSame($ra['rating'], $ranking->ratingOf('Alice'));
        $this->assertSame($rb['rating'], $ranking->ratingOf('Bob'));
        $this->assertSame($ra['winner'] === $ta->last('match')['side'], $ra['delta'] > 0, 'le vainqueur gagne des points');
    }

    public function testFriendlyMatchesDoNotTouchTheRanking(): void
    {
        [$a, $ta] = $this->connect('Alice', self::token('a'));
        [$b, $tb] = $this->connect('Bob');                          // invité : pas de jeton
        $this->say($a, ['t' => 'queue']);
        $this->say($b, ['t' => 'queue']);
        $this->assertFalse($ta->last('match')['ranked']);
        $this->dropBall($a, $b);
        $this->assertNotNull($ta->last('result'));
        $this->assertArrayNotHasKey('delta', $ta->last('result'));
        $this->assertSame(0, $this->hub->ranking()->ranking->count());
    }

    public function testTwoTabsOfTheSameBrowserNeverRankAgainstEachOther(): void
    {
        $same = self::token('z');
        [$a, $ta] = $this->connect('Tab1', $same);
        [$b] = $this->connect('Tab2', $same);
        $this->say($a, ['t' => 'queue']);
        $this->say($b, ['t' => 'queue']);
        $this->assertFalse($ta->last('match')['ranked']);
    }

    public function testReservedNicknamesBelongToTheirToken(): void
    {
        [$a, , $b] = $this->startRankedMatch();
        $this->dropBall($a, $b);
        $this->say($a, ['t' => 'leave']);
        $this->say($b, ['t' => 'leave']);
        $this->hub->disconnect($a);
        $this->hub->disconnect($b);
        [, $t] = $this->connect('Alice', self::token('x'));
        $this->assertSame('name_taken', $t->last('error')['code'], 'un autre jeton ne peut pas prendre Alice');
        [, $g] = $this->connect('Alice');
        $this->assertSame('name_taken', $g->last('error')['code'], 'ni un invité sans jeton');
        [, $ok] = $this->connect('Alice', self::token('Alice'));
        $this->assertNotNull($ok->last('welcome'), 'le propriétaire revient avec son jeton');
        $this->assertNotNull($ok->last('welcome')['rating']);
    }

    public function testLeavingMidMatchIsAForfeitForTheLeaver(): void
    {
        [$a, $ta, $b, $tb] = $this->startRankedMatch();
        $this->ticks(5);
        $this->say($a, ['t' => 'leave']);
        $rb = $tb->last('result');
        $this->assertTrue($rb['forfeit']);
        $this->assertNotNull($tb->last('oppleft'));
        $this->assertSame($b->room, null);
        $this->assertSame(ClientStatus::Lobby, $b->status);
        $this->assertSame(ClientStatus::Lobby, $a->status);
        $this->assertArrayNotHasKey('delta', $rb, 'forfait sans aucun point joué : pas de classement');
        $this->assertSame(0, $this->hub->matchCount());
    }

    public function testDisconnectDuringAMatchNotifiesTheOpponent(): void
    {
        [$a, , , $tb] = $this->startRankedMatch();
        $this->hub->disconnect($a);
        $this->assertNotNull($tb->last('oppleft'));
        $this->assertSame(0, $this->hub->matchCount());
        $this->assertCount(1, $this->hub->lobby);
    }

    public function testRematchStartsANewMatchWhenBothAsk(): void
    {
        [$a, $ta, $b, $tb] = $this->startRankedMatch();
        $this->dropBall($a, $b);
        $this->assertNotNull($ta->last('result'));
        $this->say($a, ['t' => 'rematch']);
        $this->assertNotNull($tb->last('rematch_ask'));
        $matches = count($ta->of('match'));
        $this->say($b, ['t' => 'rematch']);
        $this->assertCount($matches + 1, $ta->of('match'));
        $this->assertCount(1, $this->hubMatches());
        $this->ticks(1);
        $this->assertSame([0, 0], $ta->last('s')['sc'], 'score remis à zéro');
    }

    public function testRematchWindowClosesAndSendsPlayersBackToTheLobby(): void
    {
        [$a, $ta, $b, $tb] = $this->startRankedMatch();
        $this->dropBall($a, $b);
        $this->clock->advance(31);
        $this->ticks(1);
        $this->assertNotNull($ta->last('left'));
        $this->assertNotNull($tb->last('left'));
        $this->assertSame(ClientStatus::Lobby, $a->status);
        $this->assertSame(0, $this->hub->matchCount());
        $this->say($a, ['t' => 'rematch']);
        $this->assertCount(1, $ta->of('match'), 'plus de revanche possible');
    }

    public function testLongerMatchesKeepScoreAndServer(): void
    {
        $this->hub = $this->makeHub(target: 3);
        [$a, $ta, $b] = $this->startRankedMatch();
        $this->dropBall($a, $b, 150);
        $this->ticks(100);
        $this->assertSame('s', $ta->last('s')['ph'], 'après un point : nouveau service');
        $this->assertSame(1, array_sum($ta->last('s')['sc']));
        $this->assertNull($ta->last('result'), 'la partie continue jusqu\'à 3');
        $events = array_merge(...array_column(array_filter($ta->of('s'), static fn (array $m): bool => isset($m['ev'])), 'ev'));
        $this->assertContains('point', array_column($events, 0));
    }

    /** @return list<mixed> */
    private function hubMatches(): array
    {
        return array_fill(0, $this->hub->matchCount(), true);
    }

    public function testPlayersOnTheSameAddressPlayAFriendlyMatchWithAReason(): void
    {
        [$a, $ta] = $this->connect('Alice', self::token('a'), '198.51.100.5');
        [$b, $tb] = $this->connect('Bob', self::token('b'), '198.51.100.5');
        $this->say($a, ['t' => 'queue']);
        $this->say($b, ['t' => 'queue']);
        $this->assertFalse($ta->last('match')['ranked']);
        $this->assertSame('same_ip', $ta->last('match')['why']);
        $this->assertSame('same_ip', $tb->last('match')['why']);
    }

    public function testPlayersOnDifferentAddressesAreRankedWithoutAnyReason(): void
    {
        [$a, $ta] = $this->connect('Alice', self::token('a'), '198.51.100.5');
        [$b] = $this->connect('Bob', self::token('b'), '198.51.100.6');
        $this->say($a, ['t' => 'queue']);
        $this->say($b, ['t' => 'queue']);
        $this->assertTrue($ta->last('match')['ranked']);
        $this->assertArrayNotHasKey('why', $ta->last('match'));
    }

    public function testAMatchWithoutAnyKnownAddressIsNeverRefused(): void
    {
        $ta = new FakeTransport();
        $tb = new FakeTransport();
        $a = $this->hub->accept($ta);
        $b = $this->hub->accept($tb);
        $this->say($a, ['t' => 'hello', 'name' => 'Alice', 'token' => self::token('a')]);
        $this->say($b, ['t' => 'hello', 'name' => 'Bob', 'token' => self::token('b')]);
        $this->say($a, ['t' => 'queue']);
        $this->say($b, ['t' => 'queue']);
        $this->assertTrue($ta->last('match')['ranked']);
    }

    public function testAFourthAccountFromOneAddressIsNotRanked(): void
    {
        $results = [];
        for ($i = 1; $i <= 4; $i++) {
            [$a, $ta] = $this->connect("Farm$i", self::token("farm$i"), '198.51.100.50');
            [$b] = $this->connect("Real$i", self::token("real$i"), "198.51.100.1$i");
            $this->say($a, ['t' => 'queue']);
            $this->say($b, ['t' => 'queue']);
            $results[] = [$ta->last('match')['ranked'], $ta->last('match')['why'] ?? null];
            $this->hub->disconnect($a);
            $this->hub->disconnect($b);
        }
        $this->assertSame([[true, null], [true, null], [true, null], [false, 'too_many_accounts']], $results);
    }

    public function testTwoAddressesCannotSwapVictoriesMoreThanAFewTimesEvenAfterReconnecting(): void
    {
        $results = [];
        for ($i = 1; $i <= 5; $i++) {
            [$a, $ta] = $this->connect('Alice', self::token('a'), '198.51.100.7');
            [$b] = $this->connect('Bob', self::token('b'), '198.51.100.8');
            $this->say($a, ['t' => 'queue']);
            $this->say($b, ['t' => 'queue']);
            $results[] = $ta->last('match')['why'] ?? 'ranked';
            $this->hub->disconnect($a);
            $this->hub->disconnect($b);
        }
        $this->assertSame(['ranked', 'ranked', 'ranked', 'ranked', 'pair_limit'], $results);
    }

    public function testAClientKnowsItsAddressOnceTheServerHasResolvedIt(): void
    {
        [$a] = $this->connect('Alice', null, '203.0.113.99');
        $this->assertSame('203.0.113.99', $a->ip);
    }
}
