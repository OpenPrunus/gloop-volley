// Gloop Volley — textes FR / EN.
const DICT = {
  fr: {
    title: 'Gloop Volley',
    tagline: 'Le volley des gloops, à jouer partout.',
    vsAi: 'Jouer contre l\'ordinateur',
    local2p: '2 joueurs, même écran',
    online: 'Jouer en ligne',
    level: 'Niveau',
    easy: 'Facile',
    normal: 'Normal',
    hard: 'Difficile',
    points: 'Points pour gagner',
    sound: 'Son',
    on: 'activé',
    off: 'coupé',
    language: 'Langue',
    controls: 'Flèches ou ZQSD / WASD pour bouger et sauter. Échap : pause.',
    controls2p: 'Joueur 1 : Z Q D (ou W A D). Joueur 2 : flèches.',
    controlsTouch: 'Sur téléphone : glisse à gauche ou à droite pour bouger, glisse vers le haut ou touche l\'écran pour sauter.',
    controlsTouch2p: 'À deux : chaque joueur a sa moitié d\'écran.',
    gestureTip: 'Glisse ← → pour bouger · glisse ↑ ou touche pour sauter',
    gestureTip2p: 'Chacun sa moitié d\'écran · glisse ← → pour bouger · ↑ ou touche pour sauter',
    back: 'Retour',
    pause: 'Pause',
    resume: 'Reprendre',
    quit: 'Quitter',
    rematch: 'Revanche',
    playAgain: 'Rejouer',
    menu: 'Menu',
    you: 'Toi',
    cpu: 'Ordinateur',
    player1: 'Joueur 1',
    player2: 'Joueur 2',
    youWin: 'Victoire !',
    youLose: 'Défaite…',
    playerWins: '{name} gagne !',
    nickname: 'Pseudo',
    nicknamePlaceholder: 'Ton pseudo (15 max)',
    quickMatch: 'Partie rapide',
    cancelSearch: 'Annuler la recherche',
    searching: 'Recherche d\'un adversaire…',
    lobby: 'Salon',
    nobody: 'Personne d\'autre pour le moment. Lance une partie rapide !',
    challenge: 'Défier',
    inMatch: 'en match',
    waiting: 'en attente',
    searchingState: 'cherche',
    invitedYou: '{name} te défie !',
    accept: 'Accepter',
    decline: 'Refuser',
    waitingAnswer: 'En attente de la réponse de {name}…',
    declined: '{name} a refusé.',
    connecting: 'Connexion au serveur…',
    unreachable: 'Serveur injoignable. Réessaie plus tard.',
    disconnected: 'Connexion perdue.',
    oppLeft: 'Ton adversaire est parti. Victoire par forfait.',
    ranked: 'Partie classée',
    unranked: 'Partie amicale',
    rankedHint: 'Classée : les deux joueurs ont un pseudo réservé.',
    rating: 'Classement',
    ratingDelta: 'Classement : {rating} ({delta})',
    leaderboard: 'Meilleurs joueurs',
    rank: '#',
    name: 'Joueur',
    elo: 'Elo',
    wl: 'V / D',
    noScores: 'Aucun match classé pour l\'instant.',
    boardUnavailable: 'Classement indisponible.',
    errName: 'Pseudo invalide.',
    errTaken: 'Ce pseudo est réservé par un autre joueur.',
    errBusy: 'Ce joueur n\'est pas disponible.',
    errRate: 'Doucement : trop de messages.',
    errFull: 'Le serveur est plein.',
    errGeneric: 'Une erreur est survenue.',
    ping: 'Ping : {ms} ms',
    serving: 'Service…',
    rotate: 'Tourne ton téléphone en mode paysage pour mieux jouer.',
    github: 'Voir le projet sur GitHub',
    allGames: '← Tous les jeux',
    fullscreen: 'Plein écran',
    exitFullscreen: 'Quitter le plein écran',
    rotateTip: 'Astuce : passe ton téléphone en paysage pour une vue plus grande.',
  },
  en: {
    title: 'Gloop Volley',
    tagline: 'Gloop volleyball, playable anywhere.',
    vsAi: 'Play against the computer',
    local2p: '2 players, same screen',
    online: 'Play online',
    level: 'Level',
    easy: 'Easy',
    normal: 'Normal',
    hard: 'Hard',
    points: 'Points to win',
    sound: 'Sound',
    on: 'on',
    off: 'off',
    language: 'Language',
    controls: 'Arrow keys or WASD / ZQSD to move and jump. Esc: pause.',
    controls2p: 'Player 1: W A D (or Z Q D). Player 2: arrow keys.',
    controlsTouch: 'On a phone: swipe left or right to move, swipe up or tap the screen to jump.',
    controlsTouch2p: 'Two players: each one has half of the screen.',
    gestureTip: 'Swipe ← → to move · swipe ↑ or tap to jump',
    gestureTip2p: 'Each player has half the screen · swipe ← → to move · ↑ or tap to jump',
    back: 'Back',
    pause: 'Paused',
    resume: 'Resume',
    quit: 'Quit',
    rematch: 'Rematch',
    playAgain: 'Play again',
    menu: 'Menu',
    you: 'You',
    cpu: 'Computer',
    player1: 'Player 1',
    player2: 'Player 2',
    youWin: 'You win!',
    youLose: 'You lose…',
    playerWins: '{name} wins!',
    nickname: 'Nickname',
    nicknamePlaceholder: 'Your nickname (15 max)',
    quickMatch: 'Quick match',
    cancelSearch: 'Cancel search',
    searching: 'Looking for an opponent…',
    lobby: 'Lobby',
    nobody: 'Nobody else for now. Start a quick match!',
    challenge: 'Challenge',
    inMatch: 'in a match',
    waiting: 'waiting',
    searchingState: 'searching',
    invitedYou: '{name} challenges you!',
    accept: 'Accept',
    decline: 'Decline',
    waitingAnswer: 'Waiting for {name} to answer…',
    declined: '{name} declined.',
    connecting: 'Connecting to the server…',
    unreachable: 'Server unreachable. Try again later.',
    disconnected: 'Connection lost.',
    oppLeft: 'Your opponent left. You win by forfeit.',
    ranked: 'Ranked match',
    unranked: 'Friendly match',
    rankedHint: 'Ranked: both players have a reserved nickname.',
    rating: 'Rating',
    ratingDelta: 'Rating: {rating} ({delta})',
    leaderboard: 'Top players',
    rank: '#',
    name: 'Player',
    elo: 'Elo',
    wl: 'W / L',
    noScores: 'No ranked match yet.',
    boardUnavailable: 'Leaderboard unavailable.',
    errName: 'Invalid nickname.',
    errTaken: 'This nickname is reserved by another player.',
    errBusy: 'This player is not available.',
    errRate: 'Slow down: too many messages.',
    errFull: 'The server is full.',
    errGeneric: 'Something went wrong.',
    ping: 'Ping: {ms} ms',
    serving: 'Serving…',
    rotate: 'Turn your phone to landscape for a better game.',
    github: 'View the project on GitHub',
    allGames: '← All games',
    fullscreen: 'Fullscreen',
    exitFullscreen: 'Exit fullscreen',
    rotateTip: 'Tip: turn your phone to landscape for a bigger view.',
  },
};

export const LANGS = Object.keys(DICT);
let lang = 'fr';

export function detectLang() {
  try {
    const saved = localStorage.getItem('gloop.lang');
    if (saved && DICT[saved]) return saved;
  } catch { /* stockage indisponible */ }
  const nav = (typeof navigator !== 'undefined' && navigator.language) || 'fr';
  return nav.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export function setLang(l) {
  if (!DICT[l]) return;
  lang = l;
  try { localStorage.setItem('gloop.lang', l); } catch { /* ignoré */ }
  if (typeof document !== 'undefined') document.documentElement.lang = l;
}

export function getLang() {
  return lang;
}

export function t(key, vars = {}) {
  const s = DICT[lang]?.[key] ?? DICT.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

/** Traduit tous les éléments [data-i18n] (texte) et [data-i18n-placeholder] sous `root`. */
export function apply(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
  for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  document.title = t('title');
}

export const _dict = DICT;
