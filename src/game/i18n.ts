/**
 * Internationalization (i18n) module for Pixel Run.
 * Supports 6 languages: English (en), Greek (el), Spanish (es),
 * French (fr), German (de), and Portuguese (pt).
 *
 * Greek all-caps conventions:
 * In Greek orthography, all-uppercase words omit diacritics (tonoi),
 * ensuring perfect rendering in retro pixel fonts.
 */

export type SupportedLanguage = 'en' | 'el' | 'es' | 'fr' | 'de' | 'pt';

export interface LanguageOption {
  code: SupportedLanguage;
  badge: string;
  name: string;
  nativeName: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'en', badge: 'EN', name: 'English', nativeName: 'English' },
  { code: 'el', badge: 'ΕΛ', name: 'Greek', nativeName: 'Ελληνικά' },
  { code: 'es', badge: 'ES', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr', badge: 'FR', name: 'French', nativeName: 'Français' },
  { code: 'de', badge: 'DE', name: 'German', nativeName: 'Deutsch' },
  { code: 'pt', badge: 'PT', name: 'Portuguese', nativeName: 'Português' },
];

export interface TranslationStrings {
  // Common & Navigation
  github: string;
  save: string;
  load: string;
  update: string;
  theme: string;
  language: string;
  selectTheme: string;
  selectLanguage: string;
  active: string;
  close: string;
  cancel: string;
  battle: string;
  multiplayerBattle: string;

  // Start Screen
  tagline: string;
  startRun: string;
  lastRun: string;
  best: string;
  musicOn: string;
  musicOff: string;
  sfxOn: string;
  sfxOff: string;

  // Touch Controls
  tapToJump: string;
  holdToFloat: string;
  doubleTapAirJump: string;
  swipeDownDive: string;

  // Keyboard Controls
  spaceWJump: string;
  holdFloat: string;
  doubleJumpAir: string;
  sDownDive: string;
  dBoost: string;
  pEscPause: string;

  // Pause Screen
  paused: string;
  score: string;
  dist: string;
  coins: string;
  gems: string;
  kills: string;
  combo: string;
  music: string;
  sfx: string;
  resume: string;
  retry: string;
  retryKey: string;
  menu: string;
  menuKey: string;

  // Game Over Screen
  wasted: string;
  newPersonalBest: string;
  finalScore: string;
  shareScore: string;
  deathPit: string;
  deathWall: string;
  deathSpike: string;
  deathSpiker: string;
  deathHit: string;
  deathDefault: string;

  // Quests UI
  quests: string;
  dailyQuests: string;
  complete: string;
  done: string;
  today: string;
  run: string;
  streak: string;
  next: string;
  easy: string;
  medium: string;
  hard: string;
  special: string;
  impossible: string;
  allDone: string;
  triesSingle: string;
  triesPlural: string;
  share: string;
  questComplete: string;
  inOneRun: string;
  todayScope: string;

  // Quest Objective Templates
  questCleanMeters: string;
  questCleanScore: string;
  questJumps: string;
  questBiomeEffects: string;
  questTwoPowerups: string;
  questCombo: string;
  questMoonPhase: string;
  questCoins: string;
  questMeters: string;
  questScore: string;
  questEnemies: string;
  questPowerups: string;

  // Character Locker & Unlocks
  characterLocker: string;
  newSkinUnlocked: string;
  equip: string;
  equipped: string;
  unlocked: string;
  later: string;
  locked: string;
  buyGems: string;
  rewardClaimed: string;
  joinDiscord: string;
  enterSecretCode: string;
  tierAll: string;
  tierCommon: string;
  tierRare: string;
  tierEpic: string;
  tierLegendary: string;
  tierGodly: string;
  tierExotic: string;
  tapCardSelect: string;

  // Backup & Restore
  exportSaveData: string;
  restoreSaveData: string;
  downloadSaveFile: string;
  copySaveCode: string;
  copiedToClipboard: string;
  selectSaveFile: string;
  pasteFromClipboard: string;
  restoreProgress: string;
  confirmOverwrite: string;

  // Update & Multiplayer
  gameUpdates: string;
  checkForUpdates: string;
  reloadApplyUpdate: string;
  updateReady: string;
  reload: string;
  leaveMatch: string;
}

export const TRANSLATIONS: Record<SupportedLanguage, TranslationStrings> = {
  en: {
    github: 'GITHUB',
    save: 'SAVE',
    load: 'LOAD',
    update: 'UPDATE',
    theme: 'THEME',
    language: 'LANG',
    selectTheme: 'SELECT THEME',
    selectLanguage: 'SELECT LANGUAGE',
    active: 'ACTIVE',
    close: 'CLOSE',
    cancel: 'CANCEL',
    battle: 'BATTLE',
    multiplayerBattle: 'MULTIPLAYER BATTLE',

    tagline: 'RUN · STOMP · SURVIVE',
    startRun: 'START RUN',
    lastRun: 'LAST RUN',
    best: 'BEST',
    musicOn: 'MUSIC ON',
    musicOff: 'MUSIC OFF',
    sfxOn: 'SFX ON',
    sfxOff: 'SFX OFF',

    tapToJump: 'TAP TO JUMP',
    holdToFloat: 'HOLD TO FLOAT',
    doubleTapAirJump: '2X TAP AIR JUMP',
    swipeDownDive: 'SWIPE DOWN DIVE',

    spaceWJump: 'SPACE / W: JUMP',
    holdFloat: 'HOLD: FLOAT',
    doubleJumpAir: '2X JUMP: AIR',
    sDownDive: 'S / DOWN: DIVE',
    dBoost: 'D: BOOST',
    pEscPause: 'P / ESC: PAUSE',

    paused: 'PAUSED',
    score: 'SCORE',
    dist: 'DIST',
    coins: 'COINS',
    gems: 'GEMS',
    kills: 'KILLS',
    combo: 'COMBO',
    music: 'MUSIC',
    sfx: 'SFX',
    resume: 'RESUME',
    retry: 'RETRY',
    retryKey: 'RETRY [R]',
    menu: 'MENU',
    menuKey: 'MENU [ESC]',

    wasted: 'WASTED',
    newPersonalBest: 'NEW PERSONAL BEST',
    finalScore: 'FINAL SCORE',
    shareScore: 'SHARE SCORE',
    deathPit: 'FELL INTO THE ABYSS',
    deathWall: 'CRUSHED BY A WALL',
    deathSpike: 'IMPALED ON SPIKES',
    deathSpiker: 'SPIKED (DIVE TO SMASH)',
    deathHit: 'DEFEATED BY ENEMY',
    deathDefault: 'RUN TERMINATED',

    quests: 'QUESTS',
    dailyQuests: 'DAILY QUESTS',
    complete: 'COMPLETE',
    done: 'DONE',
    today: 'TODAY',
    run: 'RUN',
    streak: 'STREAK',
    next: 'NEXT',
    easy: 'EASY',
    medium: 'MEDIUM',
    hard: 'HARD',
    special: 'SPECIAL',
    impossible: 'IMPOSSIBLE',
    allDone: 'ALL DONE',
    triesSingle: 'TRY',
    triesPlural: 'TRIES',
    share: 'SHARE',
    questComplete: 'QUEST COMPLETE',
    inOneRun: 'in one run',
    todayScope: 'today',

    questCleanMeters: 'Run {target} meters without collecting or killing',
    questCleanScore: 'Score {target} points without collecting or killing',
    questJumps: 'Jump {target} times {scope}',
    questBiomeEffects: 'Trigger {target} different biome effects in one run',
    questTwoPowerups: 'Activate two power-ups at once',
    questCombo: 'Reach a x{target} combo in one run',
    questMoonPhase: 'Reach a later moon phase in one run',
    questCoins: 'Collect {target} coins {scope}',
    questMeters: 'Run {target} meters {scope}',
    questScore: 'Score {target} points {scope}',
    questEnemies: 'Defeat {target} enemies {scope}',
    questPowerups: 'Collect {target} power-ups {scope}',

    characterLocker: 'CHARACTER LOCKER',
    newSkinUnlocked: 'NEW SKIN UNLOCKED',
    equip: 'EQUIP',
    equipped: 'EQUIPPED',
    unlocked: 'UNLOCKED',
    later: 'LATER',
    locked: 'LOCKED',
    buyGems: 'BUY',
    rewardClaimed: 'REWARD CLAIMED',
    joinDiscord: 'JOIN THE DISCORD',
    enterSecretCode: 'ENTER SECRET CODE',
    tierAll: 'ALL',
    tierCommon: 'COMMON',
    tierRare: 'RARE',
    tierEpic: 'EPIC',
    tierLegendary: 'LEGENDARY',
    tierGodly: 'GODLY',
    tierExotic: 'EXOTIC',
    tapCardSelect: 'TAP CARD: SELECT / PREVIEW · CLICK AGAIN: EQUIP',

    exportSaveData: 'EXPORT SAVE DATA',
    restoreSaveData: 'RESTORE SAVE DATA',
    downloadSaveFile: 'DOWNLOAD SAVE FILE',
    copySaveCode: 'COPY SAVE CODE',
    copiedToClipboard: 'COPIED TO CLIPBOARD!',
    selectSaveFile: 'SELECT .SAVE FILE',
    pasteFromClipboard: 'PASTE FROM CLIPBOARD',
    restoreProgress: 'RESTORE PROGRESS',
    confirmOverwrite: 'CONFIRM OVERWRITE',

    gameUpdates: 'GAME UPDATES',
    checkForUpdates: 'CHECK FOR UPDATES',
    reloadApplyUpdate: 'RELOAD & APPLY UPDATE',
    updateReady: 'UPDATE READY',
    reload: 'RELOAD',
    leaveMatch: 'LEAVE MATCH',
  },

  el: {
    github: 'GITHUB',
    save: 'ΑΠΟΘΗΚΕΥΣΗ',
    load: 'ΦΟΡΤΩΣΗ',
    update: 'ΕΝΗΜΕΡΩΣΗ',
    theme: 'ΘΕΜΑ',
    language: 'ΓΛΩΣΣΑ',
    selectTheme: 'ΕΠΙΛΟΓΗ ΘΕΜΑΤΟΣ',
    selectLanguage: 'ΕΠΙΛΟΓΗ ΓΛΩΣΣΑΣ',
    active: 'ΕΝΕΡΓΟ',
    close: 'ΚΛΕΙΣΙΜΟ',
    cancel: 'ΑΚΥΡΩΣΗ',
    battle: 'ΜΑΧΗ',
    multiplayerBattle: 'ΜΑΧΗ ΠΟΛΛΩΝ ΠΑΙΚΤΩΝ',

    tagline: 'ΤΡΕΞΕ · ΠΑΤΑ · ΕΠΙΒΙΩΣΕ',
    startRun: 'ΕΝΑΡΞΗ',
    lastRun: 'ΤΕΛΕΥΤΑΙΑ',
    best: 'ΡΕΚΟΡ',
    musicOn: 'ΜΟΥΣΙΚΗ ΝΑΙ',
    musicOff: 'ΜΟΥΣΙΚΗ ΟΧΙ',
    sfxOn: 'ΗΧΟΙ ΝΑΙ',
    sfxOff: 'ΗΧΟΙ ΟΧΙ',

    tapToJump: 'ΠΑΤΗΜΑ: ΑΛΜΑ',
    holdToFloat: 'ΚΡΑΤΗΜΑ: ΑΙΩΡΗΣΗ',
    doubleTapAirJump: '2X ΠΑΤΗΜΑ: ΔΙΠΛΟ ΑΛΜΑ',
    swipeDownDive: 'ΣΥΡΣΙΜΟ ΚΑΤΩ: ΒΟΥΤΙΑ',

    spaceWJump: 'SPACE / W: ΑΛΜΑ',
    holdFloat: 'ΚΡΑΤΗΜΑ: ΑΙΩΡΗΣΗ',
    doubleJumpAir: '2X ΑΛΜΑ: ΔΙΠΛΟ',
    sDownDive: 'S / ΚΑΤΩ: ΒΟΥΤΙΑ',
    dBoost: 'D: ΕΠΙΤΑΧΥΝΣΗ',
    pEscPause: 'P / ESC: ΠΑΥΣΗ',

    paused: 'ΠΑΥΣΗ',
    score: 'ΣΚΟΡ',
    dist: 'ΑΠΟΣΤ',
    coins: 'ΝΟΜΙΣΜΑΤΑ',
    gems: 'ΔΙΑΜΑΝΤΙΑ',
    kills: 'ΕΞΟΝΤΩΣΕΙΣ',
    combo: 'ΣΕΡΙ',
    music: 'ΜΟΥΣΙΚΗ',
    sfx: 'ΗΧΟΙ',
    resume: 'ΣΥΝΕΧΕΙΑ',
    retry: 'ΔΟΚΙΜΗ',
    retryKey: 'ΔΟΚΙΜΗ [R]',
    menu: 'ΜΕΝΟΥ',
    menuKey: 'ΜΕΝΟΥ [ESC]',

    wasted: 'ΗΤΤΑ',
    newPersonalBest: 'ΝΕΟ ΑΤΟΜΙΚΟ ΡΕΚΟΡ',
    finalScore: 'ΤΕΛΙΚΟ ΣΚΟΡ',
    shareScore: 'ΚΟΙΝΟΠΟΙΗΣΗ ΣΚΟΡ',
    deathPit: 'ΠΤΩΣΗ ΣΤΟ ΚΕΝΟ',
    deathWall: 'ΣΥΝΤΡΙΒΗ ΣΕ ΤΟΙΧΟ',
    deathSpike: 'ΚΑΡΦΩΜΑ ΣΕ ΑΓΚΑΘΙΑ',
    deathSpiker: 'ΑΓΚΑΘΙ (ΒΟΥΤΙΑ ΓΙΑ ΣΥΝΤΡΙΒΗ)',
    deathHit: 'ΗΤΤΑ ΑΠΟ ΕΧΘΡΟ',
    deathDefault: 'ΤΕΡΜΑΤΙΣΜΟΣ ΠΟΡΕΙΑΣ',

    quests: 'ΑΠΟΣΤΟΛΕΣ',
    dailyQuests: 'ΗΜΕΡΗΣΙΕΣ ΑΠΟΣΤΟΛΕΣ',
    complete: 'ΟΛΟΚΛΗΡΩΘΗΚΕ',
    done: 'ΤΕΛΟΣ',
    today: 'ΣΗΜΕΡΑ',
    run: 'ΠΟΡΕΙΑ',
    streak: 'ΣΕΡΙ',
    next: 'ΕΠΟΜΕΝΟ',
    easy: 'ΕΥΚΟΛΟ',
    medium: 'ΜΕΣΑΙΟ',
    hard: 'ΔΥΣΚΟΛΟ',
    special: 'ΕΙΔΙΚΟ',
    impossible: 'ΑΔΥΝΑΤΟ',
    allDone: 'ΟΛΑ ΕΤΟΙΜΑ',
    triesSingle: 'ΠΡΟΣΠΑΘΕΙΑ',
    triesPlural: 'ΠΡΟΣΠΑΘΕΙΕΣ',
    share: 'ΚΟΙΝΟΠΟΙΗΣΗ',
    questComplete: 'ΑΠΟΣΤΟΛΗ ΟΛΟΚΛΗΡΩΘΗΚΕ',
    inOneRun: 'σε μία πορεία',
    todayScope: 'σήμερα',

    questCleanMeters: 'Τρέξε {target} μέτρα χωρίς συλλογή ή εξοντώσεις',
    questCleanScore: 'Σκόραρε {target} πόντους χωρίς συλλογή ή εξοντώσεις',
    questJumps: 'Κάνε {target} άλματα {scope}',
    questBiomeEffects: 'Ενεργοποίησε {target} διαφορετικά εφέ περιβάλλοντος σε μία πορεία',
    questTwoPowerups: 'Ενεργοποίησε δύο ενισχύσεις ταυτόχρονα',
    questCombo: 'Φτάσε σερί x{target} σε μία πορεία',
    questMoonPhase: 'Φτάσε σε νέα φάση σελήνης σε μία πορεία',
    questCoins: 'Μάζεψε {target} νομίσματα {scope}',
    questMeters: 'Τρέξε {target} μέτρα {scope}',
    questScore: 'Σκόραρε {target} πόντους {scope}',
    questEnemies: 'Εξόντωσε {target} εχθρούς {scope}',
    questPowerups: 'Μάζεψε {target} ενισχύσεις {scope}',

    characterLocker: 'ΝΤΟΥΛΑΠΑ ΧΑΡΑΚΤΗΡΩΝ',
    newSkinUnlocked: 'ΝΕΟΣ ΧΑΡΑΚΤΗΡΑΣ ΞΕΚΛΕΙΔΩΘΗΚΕ',
    equip: 'ΕΠΙΛΟΓΗ',
    equipped: 'ΕΠΙΛΕΓΜΕΝΟΣ',
    unlocked: 'ΞΕΚΛΕΙΔΩΜΕΝΟ',
    later: 'ΑΡΓΟΤΕΡΑ',
    locked: 'ΚΛΕΙΔΩΜΕΝΟ',
    buyGems: 'ΑΓΟΡΑ',
    rewardClaimed: 'ΑΜΟΙΒΗ ΕΞΑΡΓΥΡΩΘΗΚΕ',
    joinDiscord: 'ΜΠΕΣ ΣΤΟ DISCORD',
    enterSecretCode: 'ΜΥΣΤΙΚΟΣ ΚΩΔΙΚΟΣ',
    tierAll: 'ΟΛΑ',
    tierCommon: 'ΚΟΙΝΑ',
    tierRare: 'ΣΠΑΝΙΑ',
    tierEpic: 'ΕΠΙΚΑ',
    tierLegendary: 'ΘΡΥΛΙΚΑ',
    tierGodly: 'ΘΕΪΚΑ',
    tierExotic: 'ΕΞΩΤΙΚΑ',
    tapCardSelect: 'ΠΑΤΗΜΑ: ΕΠΙΛΟΓΗ · ΞΑΝΑ ΠΑΤΗΜΑ: ΕΠΙΛΟΓΗ',

    exportSaveData: 'ΕΞΑΓΩΓΗ ΔΕΔΟΜΕΝΩΝ',
    restoreSaveData: 'ΕΠΑΝΑΦΟΡΑ ΔΕΔΟΜΕΝΩΝ',
    downloadSaveFile: 'ΛΗΨΗ ΑΡΧΕΙΟΥ SAVE',
    copySaveCode: 'ΑΝΤΙΓΡΑΦΗ ΚΩΔΙΚΟΥ',
    copiedToClipboard: 'ΑΝΤΙΓΡΑΦΗΚΕ ΣΤΟ ΠΡΟΧΕΙΡΟ!',
    selectSaveFile: 'ΕΠΙΛΟΓΗ ΑΡΧΕΙΟΥ .SAVE',
    pasteFromClipboard: 'ΕΠΙΚΟΛΛΗΣΗ ΑΠΟ ΠΡΟΧΕΙΡΟ',
    restoreProgress: 'ΕΠΑΝΑΦΟΡΑ ΠΡΟΟΔΟΥ',
    confirmOverwrite: 'ΕΠΙΒΕΒΑΙΩΣΗ ΑΝΤΙΚΑΤΑΣΤΑΣΗΣ',

    gameUpdates: 'ΕΝΗΜΕΡΩΣΕΙΣ ΠΑΙΧΝΙΔΙΟΥ',
    checkForUpdates: 'ΕΛΕΓΧΟΣ ΓΙΑ ΕΝΗΜΕΡΩΣΕΙΣ',
    reloadApplyUpdate: 'ΕΠΑΝΑΦΟΡΤΩΣΗ & ΕΓΚΑΤΑΣΤΑΣΗ',
    updateReady: 'ΕΝΗΜΕΡΩΣΗ ΕΤΟΙΜΗ',
    reload: 'ΕΠΑΝΑΦΟΡΤΩΣΗ',
    leaveMatch: 'ΕΞΟΔΟΣ ΑΠΟ ΜΑΧΗ',
  },

  es: {
    github: 'GITHUB',
    save: 'GUARDAR',
    load: 'CARGAR',
    update: 'ACTUALIZAR',
    theme: 'TEMA',
    language: 'IDIOMA',
    selectTheme: 'ELEGIR TEMA',
    selectLanguage: 'ELEGIR IDIOMA',
    active: 'ACTIVO',
    close: 'CERRAR',
    cancel: 'CANCELAR',
    battle: 'BATALLA',
    multiplayerBattle: 'BATALLA MULTIJUGADOR',

    tagline: 'CORRE · PISA · SOBREVIVE',
    startRun: 'INICIAR',
    lastRun: 'ÚLTIMA',
    best: 'RÉCORD',
    musicOn: 'MÚSICA SÍ',
    musicOff: 'MÚSICA NO',
    sfxOn: 'SFX SÍ',
    sfxOff: 'SFX NO',

    tapToJump: 'TOCA: SALTAR',
    holdToFloat: 'MANTÉN: FLOTAR',
    doubleTapAirJump: '2X TOQUE: DOBLE SALTO',
    swipeDownDive: 'DESLIZA ABAJO: PICADO',

    spaceWJump: 'ESPACIO / W: SALTAR',
    holdFloat: 'MANTÉN: FLOTAR',
    doubleJumpAir: '2X SALTO: AIRE',
    sDownDive: 'S / ABAJO: PICADO',
    dBoost: 'D: IMPULSO',
    pEscPause: 'P / ESC: PAUSA',

    paused: 'PAUSA',
    score: 'PUNTOS',
    dist: 'DIST',
    coins: 'MONEDAS',
    gems: 'GEMAS',
    kills: 'BAJAS',
    combo: 'COMBO',
    music: 'MÚSICA',
    sfx: 'SFX',
    resume: 'CONTINUAR',
    retry: 'REINTENTAR',
    retryKey: 'REINTENTAR [R]',
    menu: 'MENÚ',
    menuKey: 'MENÚ [ESC]',

    wasted: 'DERROTA',
    newPersonalBest: '¡NUEVO RÉCORD PERSONAL!',
    finalScore: 'PUNTUACIÓN FINAL',
    shareScore: 'COMPARTIR PUNTOS',
    deathPit: 'CAÍDA AL ABISMO',
    deathWall: 'APLASTADO POR UN MURO',
    deathSpike: 'CLAVADO EN PINCHOS',
    deathSpiker: 'PINCHADO (PICA PARA ROMPER)',
    deathHit: 'DERROTADO POR ENEMIGO',
    deathDefault: 'CARRERA TERMINADA',

    quests: 'MISIONES',
    dailyQuests: 'MISIONES DIARIAS',
    complete: 'COMPLETADO',
    done: 'HECHO',
    today: 'HOY',
    run: 'CARRERA',
    streak: 'RACHA',
    next: 'SIGUIENTE',
    easy: 'FÁCIL',
    medium: 'MEDIO',
    hard: 'DIFÍCIL',
    special: 'ESPECIAL',
    impossible: 'IMPOSIBLE',
    allDone: 'TODO LISTO',
    triesSingle: 'INTENTO',
    triesPlural: 'INTENTOS',
    share: 'COMPARTIR',
    questComplete: 'MISIÓN COMPLETADA',
    inOneRun: 'en una carrera',
    todayScope: 'hoy',

    questCleanMeters: 'Corre {target} metros sin recoger ni eliminar',
    questCleanScore: 'Consigue {target} puntos sin recoger ni eliminar',
    questJumps: 'Salta {target} veces {scope}',
    questBiomeEffects: 'Activa {target} efectos de bioma en una carrera',
    questTwoPowerups: 'Activa dos mejoras a la vez',
    questCombo: 'Alcanza un combo x{target} en una carrera',
    questMoonPhase: 'Llega a una fase lunar posterior en una carrera',
    questCoins: 'Recoge {target} monedas {scope}',
    questMeters: 'Corre {target} metros {scope}',
    questScore: 'Consigue {target} puntos {scope}',
    questEnemies: 'Derrota a {target} enemigos {scope}',
    questPowerups: 'Recoge {target} mejoras {scope}',

    characterLocker: 'ARMARIO DE PERSONAJES',
    newSkinUnlocked: '¡NUEVO ASPECTO DESBLOQUEADO!',
    equip: 'EQUIPAR',
    equipped: 'EQUIPADO',
    unlocked: 'DESBLOQUEADO',
    later: 'LUEGO',
    locked: 'BLOQUEADO',
    buyGems: 'COMPRAR',
    rewardClaimed: 'RECOMPENSA RECLAMADA',
    joinDiscord: 'ÚNETE A DISCORD',
    enterSecretCode: 'CÓDIGO SECRETO',
    tierAll: 'TODOS',
    tierCommon: 'COMÚN',
    tierRare: 'RARO',
    tierEpic: 'ÉPICO',
    tierLegendary: 'LEGENDARIO',
    tierGodly: 'DIVINO',
    tierExotic: 'EXÓTICO',
    tapCardSelect: 'TOCA: ELEGIR / VER · TOCA OTRA VEZ: EQUIPAR',

    exportSaveData: 'EXPORTAR DATOS',
    restoreSaveData: 'RESTAURAR DATOS',
    downloadSaveFile: 'DESCARGAR ARCHIVO SAVE',
    copySaveCode: 'COPIAR CÓDIGO',
    copiedToClipboard: '¡COPIADO AL PORTAPAPELES!',
    selectSaveFile: 'ELEGIR ARCHIVO .SAVE',
    pasteFromClipboard: 'PEGAR DEL PORTAPAPELES',
    restoreProgress: 'RESTAURAR PROGRESO',
    confirmOverwrite: 'CONFIRMAR SOBRESCRITURA',

    gameUpdates: 'ACTUALIZACIONES',
    checkForUpdates: 'BUSCAR ACTUALIZACIONES',
    reloadApplyUpdate: 'RECARGAR Y ACTUALIZAR',
    updateReady: 'ACTUALIZACIÓN LISTA',
    reload: 'RECARGAR',
    leaveMatch: 'SALIR DE LA PARTIDA',
  },

  fr: {
    github: 'GITHUB',
    save: 'SAUVER',
    load: 'CHARGER',
    update: 'MAJ',
    theme: 'THÈME',
    language: 'LANGUE',
    selectTheme: 'CHOISIR THÈME',
    selectLanguage: 'CHOISIR LANGUE',
    active: 'ACTIF',
    close: 'FERMER',
    cancel: 'ANNULER',
    battle: 'COMBAT',
    multiplayerBattle: 'COMBAT MULTIJOUEUR',

    tagline: 'COURS · ÉCRASE · SURVIS',
    startRun: 'JOUER',
    lastRun: 'DERNIÈRE',
    best: 'MEILLEUR',
    musicOn: 'MUSIQUE OUI',
    musicOff: 'MUSIQUE NON',
    sfxOn: 'SFX OUI',
    sfxOff: 'SFX NON',

    tapToJump: 'TOUCHER: SAUTER',
    holdToFloat: 'MAINTENIR: PLANER',
    doubleTapAirJump: '2X TOUCHER: DOUBLE SAUT',
    swipeDownDive: 'GLISSER BAS: PLONGEON',

    spaceWJump: 'ESPACE / W: SAUTER',
    holdFloat: 'MAINTENIR: PLANER',
    doubleJumpAir: '2X SAUT: EN L\'AIR',
    sDownDive: 'S / BAS: PLONGEON',
    dBoost: 'D: BOOST',
    pEscPause: 'P / ESC: PAUSE',

    paused: 'PAUSE',
    score: 'SCORE',
    dist: 'DIST',
    coins: 'PIÈCES',
    gems: 'GEMMES',
    kills: 'KILLS',
    combo: 'COMBO',
    music: 'MUSIQUE',
    sfx: 'SFX',
    resume: 'REPRENDRE',
    retry: 'REJOUER',
    retryKey: 'REJOUER [R]',
    menu: 'MENU',
    menuKey: 'MENU [ESC]',

    wasted: 'ÉCHEC',
    newPersonalBest: 'NOUVEAU RECORD PERSONNEL',
    finalScore: 'SCORE FINAL',
    shareScore: 'PARTAGER LE SCORE',
    deathPit: 'CHUTE DANS L\'ABÎME',
    deathWall: 'ÉCRASÉ PAR UN MUR',
    deathSpike: 'EMPALE SUR DES POINTES',
    deathSpiker: 'TOUCHÉ (PLONGEZ POUR ÉCRASER)',
    deathHit: 'VAINCU PAR UN ENNEMI',
    deathDefault: 'COURSE TERMINÉE',

    quests: 'QUÊTES',
    dailyQuests: 'QUÊTES DU JOUR',
    complete: 'TERMINÉ',
    done: 'FAIT',
    today: 'AUJ.',
    run: 'COURSE',
    streak: 'SÉRIE',
    next: 'SUIVANT',
    easy: 'FACILE',
    medium: 'MOYEN',
    hard: 'DIFFICILE',
    special: 'SPÉCIAL',
    impossible: 'IMPOSSIBLE',
    allDone: 'TOUT FAIT',
    triesSingle: 'ESSAI',
    triesPlural: 'ESSAIS',
    share: 'PARTAGER',
    questComplete: 'QUÊTE TERMINÉE',
    inOneRun: 'en une course',
    todayScope: 'aujourd\'hui',

    questCleanMeters: 'Cours {target} mètres sans ramasser ni éliminer',
    questCleanScore: 'Marque {target} points sans ramasser ni éliminer',
    questJumps: 'Saute {target} fois {scope}',
    questBiomeEffects: 'Déclenche {target} effets de biome en une course',
    questTwoPowerups: 'Active deux bonus en même temps',
    questCombo: 'Atteins un combo x{target} en une course',
    questMoonPhase: 'Atteins une phase lunaire avancée en une course',
    questCoins: 'Récupère {target} pièces {scope}',
    questMeters: 'Cours {target} mètres {scope}',
    questScore: 'Marque {target} points {scope}',
    questEnemies: 'Élimine {target} ennemis {scope}',
    questPowerups: 'Récupère {target} bonus {scope}',

    characterLocker: 'VESTIAIRE DES HÉROS',
    newSkinUnlocked: 'NOUVEAU SKIN DÉBLOQUÉ',
    equip: 'ÉQUIPER',
    equipped: 'ÉQUIPÉ',
    unlocked: 'DÉBLOQUÉ',
    later: 'PLUS TARD',
    locked: 'VERROUILLÉ',
    buyGems: 'ACHETER',
    rewardClaimed: 'RÉCOMPENSE RÉCLAMÉE',
    joinDiscord: 'REJOINDRE DISCORD',
    enterSecretCode: 'CODE SECRET',
    tierAll: 'TOUS',
    tierCommon: 'COMMUN',
    tierRare: 'RARE',
    tierEpic: 'ÉPIQUE',
    tierLegendary: 'LÉGENDAIRE',
    tierGodly: 'DIVIN',
    tierExotic: 'EXOTIQUE',
    tapCardSelect: 'TOUCHER: APERÇU · RE-TOUCHER: ÉQUIPER',

    exportSaveData: 'EXPORTER LA SAUVEGARDE',
    restoreSaveData: 'RESTAURER LA SAUVEGARDE',
    downloadSaveFile: 'TÉLÉCHARGER LE FICHIER',
    copySaveCode: 'COPIER LE CODE',
    copiedToClipboard: 'COPIÉ DANS LE PRESSE-PAPIER !',
    selectSaveFile: 'CHOISIR FICHIER .SAVE',
    pasteFromClipboard: 'COLLER DU PRESSE-PAPIER',
    restoreProgress: 'RESTAURER LE PROGRÈS',
    confirmOverwrite: 'CONFIRMER L\'ÉCRASEMENT',

    gameUpdates: 'MISES À JOUR',
    checkForUpdates: 'VÉRIFIER LES MAJ',
    reloadApplyUpdate: 'RECHARGER ET APPLIQUER',
    updateReady: 'MISE À JOUR PRÊTE',
    reload: 'RECHARGER',
    leaveMatch: 'QUITTER LE MATCH',
  },

  de: {
    github: 'GITHUB',
    save: 'SPEICHERN',
    load: 'LADEN',
    update: 'UPDATE',
    theme: 'DESIGN',
    language: 'SPRACHE',
    selectTheme: 'DESIGN WÄHLEN',
    selectLanguage: 'SPRACHE WÄHLEN',
    active: 'AKTIV',
    close: 'SCHLIESSEN',
    cancel: 'ABBRECHEN',
    battle: 'KAMPF',
    multiplayerBattle: 'MEHRSPIELER-KAMPF',

    tagline: 'LAUFEN · STAMPFEN · ÜBERLEBEN',
    startRun: 'START',
    lastRun: 'LETZTER',
    best: 'BESTE',
    musicOn: 'MUSIK AN',
    musicOff: 'MUSIK AUS',
    sfxOn: 'SFX AN',
    sfxOff: 'SFX AUS',

    tapToJump: 'TIPPEN: SPRINGEN',
    holdToFloat: 'HALTEN: SCHWEBEN',
    doubleTapAirJump: '2X TIPPEN: DOPPELSPRUNG',
    swipeDownDive: 'RUNTER WISCHEN: STURZ',

    spaceWJump: 'LEER / W: SPRINGEN',
    holdFloat: 'HALTEN: SCHWEBEN',
    doubleJumpAir: '2X SPRUNG: LUFT',
    sDownDive: 'S / RUNTER: STURZ',
    dBoost: 'D: BOOST',
    pEscPause: 'P / ESC: PAUSE',

    paused: 'PAUSE',
    score: 'PUNKTE',
    dist: 'DIST',
    coins: 'MÜNZEN',
    gems: 'EDELSTEINE',
    kills: 'KILLS',
    combo: 'COMBO',
    music: 'MUSIK',
    sfx: 'SFX',
    resume: 'WEITER',
    retry: 'NOCHMAL',
    retryKey: 'NOCHMAL [R]',
    menu: 'MENÜ',
    menuKey: 'MENÜ [ESC]',

    wasted: 'VERLOREN',
    newPersonalBest: 'NEUE PERSÖNLICHE BESTLEISTUNG',
    finalScore: 'ENDPUNKTESTAND',
    shareScore: 'PUNKTE TEILEN',
    deathPit: 'IN DEN ABGRUND GESTÜRZT',
    deathWall: 'VON DER WAND ZERQUETSCHT',
    deathSpike: 'AUF STACHELN GESTOCHEN',
    deathSpiker: 'AUFGESPIESST (STURZFLUG ZUM ZERSCHLAGEN)',
    deathHit: 'VOM GEGNER BESIEGT',
    deathDefault: 'LAUF BEENDET',

    quests: 'QUESTS',
    dailyQuests: 'TÄGLICHE QUESTS',
    complete: 'FERTIG',
    done: 'FERTIG',
    today: 'HEUTE',
    run: 'LAUF',
    streak: 'STREAK',
    next: 'NÄCHSTES',
    easy: 'EINFACH',
    medium: 'MITTEL',
    hard: 'SCHWER',
    special: 'SPEZIAL',
    impossible: 'UNMÖGLICH',
    allDone: 'ALLES ERLEDIGT',
    triesSingle: 'VERSUCH',
    triesPlural: 'VERSUCHE',
    share: 'TEILEN',
    questComplete: 'QUEST ABGESCHLOSSEN',
    inOneRun: 'in einem Lauf',
    todayScope: 'heute',

    questCleanMeters: 'Laufe {target} Meter ohne Sammeln oder Kills',
    questCleanScore: 'Erziele {target} Punkte ohne Sammeln oder Kills',
    questJumps: 'Springe {target} Mal {scope}',
    questBiomeEffects: 'Löse {target} Biomeffekte in einem Lauf aus',
    questTwoPowerups: 'Aktiviere zwei Power-Ups gleichzeitig',
    questCombo: 'Erreiche eine x{target}-Combo in einem Lauf',
    questMoonPhase: 'Erreiche eine spätere Mondphase in einem Lauf',
    questCoins: 'Sammle {target} Münzen {scope}',
    questMeters: 'Laufe {target} Meter {scope}',
    questScore: 'Erziele {target} Punkte {scope}',
    questEnemies: 'Besiege {target} Gegner {scope}',
    questPowerups: 'Sammle {target} Power-Ups {scope}',

    characterLocker: 'CHARAKTER-LOCKER',
    newSkinUnlocked: 'NEUER SKIN FREIGESCHALTET',
    equip: 'AUSRÜSTEN',
    equipped: 'AUSGERÜSTET',
    unlocked: 'FREIGESCHALTET',
    later: 'SPÄTER',
    locked: 'GESPERRT',
    buyGems: 'KAUFEN',
    rewardClaimed: 'BELOHNUNG EINGELÖST',
    joinDiscord: 'DISCORD BEITRETEN',
    enterSecretCode: 'GEHEIMCODE EINGEBEN',
    tierAll: 'ALLE',
    tierCommon: 'GEWÖHNLICH',
    tierRare: 'SELTEN',
    tierEpic: 'EPISCH',
    tierLegendary: 'LEGENDÄR',
    tierGodly: 'GÖTTLICH',
    tierExotic: 'EXOTISCH',
    tapCardSelect: 'TIPPEN: VORSCHAU · ERNEUT TIPPEN: AUSRÜSTEN',

    exportSaveData: 'SPEICHERSTAND EXPORTIEREN',
    restoreSaveData: 'SPEICHERSTAND WIEDERHERSTELLEN',
    downloadSaveFile: 'SAVE-DATEI HERUNTERLADEN',
    copySaveCode: 'CODE KOPIEREN',
    copiedToClipboard: 'IN DIE ZWISCHENABLAGE KOPIERT!',
    selectSaveFile: '.SAVE-DATEI WÄHLEN',
    pasteFromClipboard: 'AUS ZWISCHENABLAGE EINFÜGEN',
    restoreProgress: 'FORTSCHRITT WIEDERHERSTELLEN',
    confirmOverwrite: 'ÜBERSCHREIBEN BESTÄTIGEN',

    gameUpdates: 'SPIEL-UPDATES',
    checkForUpdates: 'NACH UPDATES SUCHEN',
    reloadApplyUpdate: 'NEU LADEN & AKTUALISIEREN',
    updateReady: 'UPDATE BEREIT',
    reload: 'NEU LADEN',
    leaveMatch: 'SPIEL VERLASSEN',
  },

  pt: {
    github: 'GITHUB',
    save: 'SALVAR',
    load: 'CARREGAR',
    update: 'ATUALIZAR',
    theme: 'TEMA',
    language: 'IDIOMA',
    selectTheme: 'ESCOLHER TEMA',
    selectLanguage: 'ESCOLHER IDIOMA',
    active: 'ATIVO',
    close: 'FECHAR',
    cancel: 'CANCELAR',
    battle: 'BATALHA',
    multiplayerBattle: 'BATALHA MULTIJOGADOR',

    tagline: 'CORRA · ESMAGUE · SOBREVIVA',
    startRun: 'INICIAR',
    lastRun: 'ÚLTIMA',
    best: 'RECORDE',
    musicOn: 'MÚSICA SIM',
    musicOff: 'MÚSICA NÃO',
    sfxOn: 'SFX SIM',
    sfxOff: 'SFX NÃO',

    tapToJump: 'TOQUE: PULAR',
    holdToFloat: 'SEGURE: FLUTUAR',
    doubleTapAirJump: '2X TOQUE: PULO DUPLO',
    swipeDownDive: 'DESLIZE BAIXO: MERGULHO',

    spaceWJump: 'ESPAÇO / W: PULAR',
    holdFloat: 'SEGURE: FLUTUAR',
    doubleJumpAir: '2X PULO: NO AR',
    sDownDive: 'S / BAIXO: MERGULHO',
    dBoost: 'D: IMPULSO',
    pEscPause: 'P / ESC: PAUSA',

    paused: 'PAUSA',
    score: 'PONTOS',
    dist: 'DIST',
    coins: 'MOEDAS',
    gems: 'GEMAS',
    kills: 'ABATES',
    combo: 'COMBO',
    music: 'MÚSICA',
    sfx: 'SFX',
    resume: 'CONTINUAR',
    retry: 'REPETIR',
    retryKey: 'REPETIR [R]',
    menu: 'MENU',
    menuKey: 'MENU [ESC]',

    wasted: 'DERROTA',
    newPersonalBest: 'NOVO RECORDE PESSOAL',
    finalScore: 'PONTUAÇÃO FINAL',
    shareScore: 'COMPARTILHAR',
    deathPit: 'CAIU NO ABISMO',
    deathWall: 'ESMAGADO POR UMA PAREDE',
    deathSpike: 'EMPALADO EM ESPINHOS',
    deathSpiker: 'ESPINHADO (MERGULHE P/ DESTRUIR)',
    deathHit: 'DERROTADO POR INIMIGO',
    deathDefault: 'CORRIDA FINALIZADA',

    quests: 'MISSÕES',
    dailyQuests: 'MISSÕES DIÁRIAS',
    complete: 'COMPLETO',
    done: 'FEITO',
    today: 'HOJE',
    run: 'CORRIDA',
    streak: 'SÉRIE',
    next: 'PRÓXIMO',
    easy: 'FÁCIL',
    medium: 'MÉDIO',
    hard: 'DIFÍCIL',
    special: 'ESPECIAL',
    impossible: 'IMPOSSÍVEL',
    allDone: 'TUDO PRONTO',
    triesSingle: 'TENTATIVA',
    triesPlural: 'TENTATIVAS',
    share: 'COMPARTILHAR',
    questComplete: 'MISSÃO CONCLUÍDA',
    inOneRun: 'em uma corrida',
    todayScope: 'hoje',

    questCleanMeters: 'Corra {target} metros sem coletar ou abater',
    questCleanScore: 'Faça {target} pontos sem coletar ou abater',
    questJumps: 'Pule {target} vezes {scope}',
    questBiomeEffects: 'Ative {target} efeitos de bioma em uma corrida',
    questTwoPowerups: 'Ative dois poderes ao mesmo tempo',
    questCombo: 'Alcance um combo x{target} em uma corrida',
    questMoonPhase: 'Alcance uma fase lunar avançada em uma corrida',
    questCoins: 'Colete {target} moedas {scope}',
    questMeters: 'Corra {target} metros {scope}',
    questScore: 'Faça {target} pontos {scope}',
    questEnemies: 'Derrote {target} inimigos {scope}',
    questPowerups: 'Colete {target} poderes {scope}',

    characterLocker: 'ARMÁRIO DE PERSONAGENS',
    newSkinUnlocked: 'NOVO VISUAL DESBLOQUEADO',
    equip: 'EQUIPAR',
    equipped: 'EQUIPADO',
    unlocked: 'DESBLOQUEADO',
    later: 'DEPOIS',
    locked: 'BLOQUEADO',
    buyGems: 'COMPRAR',
    rewardClaimed: 'RECOMPENSA RESGATADA',
    joinDiscord: 'ENTRE NO DISCORD',
    enterSecretCode: 'CÓDIGO SECRETO',
    tierAll: 'TODOS',
    tierCommon: 'COMUM',
    tierRare: 'RARO',
    tierEpic: 'ÉPICO',
    tierLegendary: 'LENDÁRIO',
    tierGodly: 'DIVINO',
    tierExotic: 'EXÓTICO',
    tapCardSelect: 'TOQUE: SELECIONAR · TOQUE NOVAMENTE: EQUIPAR',

    exportSaveData: 'EXPORTAR DADOS',
    restoreSaveData: 'RESTAURAR DADOS',
    downloadSaveFile: 'BAIXAR ARQUIVO SAVE',
    copySaveCode: 'COPIAR CÓDIGO',
    copiedToClipboard: 'COPIADO PARA A ÁREA DE TRANSFERÊNCIA!',
    selectSaveFile: 'SELECIONAR ARQUIVO .SAVE',
    pasteFromClipboard: 'COLAR DA ÁREA DE TRANSFERÊNCIA',
    restoreProgress: 'RESTAURAR PROGRESSO',
    confirmOverwrite: 'CONFIRMAR SUBSTITUIÇÃO',

    gameUpdates: 'ATUALIZAÇÕES',
    checkForUpdates: 'VERIFICAR ATUALIZAÇÕES',
    reloadApplyUpdate: 'RECARGAR E ATUALIZAR',
    updateReady: 'ATUALIZAÇÃO PRONTA',
    reload: 'RECARREGAR',
    leaveMatch: 'SAIR DA PARTIDA',
  },
};

export function getTierName(tier: string, lang: SupportedLanguage): string {
  const t = getTranslations(lang);
  switch (tier) {
    case 'all':
      return t.tierAll;
    case 'common':
      return t.tierCommon;
    case 'rare':
      return t.tierRare;
    case 'epic':
      return t.tierEpic;
    case 'legendary':
      return t.tierLegendary;
    case 'godly':
      return t.tierGodly;
    case 'exotic':
      return t.tierExotic;
    default:
      return tier.toUpperCase();
  }
}

const LANG_KEY = 'pixeldash.language';

export function loadLanguage(): SupportedLanguage {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved && saved in TRANSLATIONS) {
      return saved as SupportedLanguage;
    }
  } catch {}

  // Auto-detect browser language if possible
  try {
    if (typeof navigator !== 'undefined' && navigator.language) {
      const nav = navigator.language.slice(0, 2).toLowerCase();
      if (nav in TRANSLATIONS) {
        return nav as SupportedLanguage;
      }
    }
  } catch {}

  return 'en';
}

export function saveLanguage(lang: SupportedLanguage): void {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {}
}

export function getTranslations(lang: SupportedLanguage): TranslationStrings {
  return TRANSLATIONS[lang] ?? TRANSLATIONS.en;
}
