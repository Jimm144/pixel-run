export type SkinTier = 'common' | 'rare' | 'epic' | 'legendary' | 'godly' | 'exotic';

export const TIERS: (SkinTier | 'all')[] = ['all', 'common', 'rare', 'epic', 'legendary', 'godly', 'exotic'];

export const TIER_COLORS: Record<SkinTier | 'all', { text: string; bg: string; border: string }> = {
  all: { text: '#3ef2c8', bg: '#092922', border: '#1da88a' },
  common: { text: '#a0a0b8', bg: '#1c162e', border: '#453c60' },
  rare: { text: '#3ef2c8', bg: '#092922', border: '#1da88a' },
  epic: { text: '#c98cff', bg: '#2a1145', border: '#8b4cd6' },
  legendary: { text: '#ffd166', bg: '#3d2b05', border: '#d49b1a' },
  godly: { text: '#ff4d6d', bg: '#3b0613', border: '#d9254c' },
  exotic: { text: '#ff70a6', bg: '#33081e', border: '#ff2a85' },
};

export type SkinId =
  | 'bob'
  | 'bobette'
  | 'safe_bob'
  | 'rob'
  | 'cob'
  | 'mob'
  | 'panda'
  | 'pig'
  | 'goat'
  | 'fmhy'
  | 'skeleton'
  | 'moon_man'
  | 'sun_man'
  | 'gold_bob'
  | 'angel'
  | 'outline'
  | 'question'
  | 'zeus'
  | 'leskos'
  | 'mr_soup'
  | 'demon'
  | 'santa'
  | 'easter_bunny'
  | 'beach_bob'
  | 'pumpkin_bob'
  | 'witch';

export interface SkinUnlockInfo {
  type: 'free' | 'gems' | 'coins' | 'distance' | 'score' | 'quests' | 'moon' | 'konami' | 'save' | 'holiday';
  cost?: number;
  threshold?: number;
  desc: string;
  /** ISO date windows for 'holiday' skins: [[mmdd_start, mmdd_end], ...] (wraps Dec->Jan) */
  holidayWindows?: [string, string][];
}

/** Returns true if a holiday skin is currently in-season */
export function isHolidayActive(unlock: SkinUnlockInfo): boolean {
  if (unlock.type !== 'holiday' || !unlock.holidayWindows) return false;
  const now = new Date();
  const mmdd = String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
  return unlock.holidayWindows.some(([start, end]) => {
    if (start <= end) return mmdd >= start && mmdd <= end;
    // Wraps year boundary (e.g. Dec -> Jan)
    return mmdd >= start || mmdd <= end;
  });
}

/** Compute Easter Sunday for a given year (Butcher's algorithm) */
export function easterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/** Returns true if today is within `daysBefore`..`daysAfter` days of Easter */
export function isEasterSeason(daysBefore = 7, daysAfter = 7): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const easter = easterDate(today.getFullYear());
  easter.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - easter.getTime()) / 86400000);
  return diff >= -daysBefore && diff <= daysAfter;
}

/** Check if a skin is currently available in-season */
export function isSkinAvailable(skin: SkinDef): boolean {
  if (skin.unlock.type !== 'holiday') return true;
  if (skin.id === 'easter_bunny') return isEasterSeason();
  return isHolidayActive(skin.unlock);
}

export interface SkinDef {
  id: SkinId;
  name: string;
  tier: SkinTier;
  suit: string;
  suitDark: string;
  skin: string;
  boot: string;
  scarf: string;
  ghostTrail: string;
  unlock: SkinUnlockInfo;
}

export const SKINS: Record<SkinId, SkinDef> = {
  bob: {
    id: 'bob',
    name: 'BOB',
    tier: 'common',
    suit: '#ff4d6d',
    suitDark: '#b32a4d',
    skin: '#ffcf9e',
    boot: '#59427e',
    scarf: '#3ef2c8',
    ghostTrail: '#7ef7ff',
    unlock: { type: 'free', desc: 'DEFAULT' },
  },
  bobette: {
    id: 'bobette',
    name: 'BOBETTE',
    tier: 'common',
    suit: '#ff4d6d',
    suitDark: '#b32a4d',
    skin: '#ffcf9e',
    boot: '#59427e',
    scarf: '#3ef2c8',
    ghostTrail: '#7ef7ff',
    unlock: { type: 'free', desc: 'DEFAULT' },
  },
  safe_bob: {
    id: 'safe_bob',
    name: 'SAFE BOB',
    tier: 'common',
    suit: '#475569',
    suitDark: '#334155',
    skin: '#ffcf9e',
    boot: '#1e293b',
    scarf: '#ffd166',
    ghostTrail: '#94a3b8',
    unlock: { type: 'save', desc: 'SAVE THE GAME' },
  },
  rob: {
    id: 'rob',
    name: 'ROB',
    tier: 'rare',
    suit: '#e6e6e6',
    suitDark: '#202020',
    skin: '#ffcf9e',
    boot: '#181818',
    scarf: '#303030',
    ghostTrail: '#909090',
    unlock: { type: 'gems', cost: 50, desc: '50 GEMS' },
  },
  cob: {
    id: 'cob',
    name: 'COB',
    tier: 'rare',
    suit: '#ffd166',
    suitDark: '#d49b1a',
    skin: '#ffe9a0',
    boot: '#2d6a4f',
    scarf: '#52b788',
    ghostTrail: '#ffd166',
    unlock: { type: 'gems', cost: 50, desc: '50 GEMS' },
  },
  mob: {
    id: 'mob',
    name: 'ZOMBIE',
    tier: 'rare',
    suit: '#4a3f6b',
    suitDark: '#2a2245',
    skin: '#629e46',
    boot: '#1c172e',
    scarf: '#8f4f58',
    ghostTrail: '#629e46',
    unlock: { type: 'gems', cost: 50, desc: '50 GEMS' },
  },
  panda: {
    id: 'panda',
    name: 'PANDA',
    tier: 'epic',
    suit: '#1a1a1a',
    suitDark: '#0d0d0d',
    skin: '#ffffff',
    boot: '#1a1a1a',
    scarf: '#52b788',
    ghostTrail: '#ffffff',
    unlock: { type: 'gems', cost: 150, desc: '150 GEMS' },
  },
  pig: {
    id: 'pig',
    name: 'PIG',
    tier: 'epic',
    suit: '#ff9ebb',
    suitDark: '#d9688b',
    skin: '#ffb8ce',
    boot: '#9e3b5e',
    scarf: '#ff5c8a',
    ghostTrail: '#ff9ebb',
    unlock: { type: 'gems', cost: 150, desc: '150 GEMS' },
  },
  goat: {
    id: 'goat',
    name: 'GOAT',
    tier: 'epic',
    suit: '#e2e8f0',
    suitDark: '#94a3b8',
    skin: '#f8fafc',
    boot: '#334155',
    scarf: '#ffd166',
    ghostTrail: '#cbd5e1',
    unlock: { type: 'gems', cost: 150, desc: '150 GEMS' },
  },
  fmhy: {
    id: 'fmhy',
    name: 'MEDIA MAN',
    tier: 'epic',
    suit: '#0b0b16',
    suitDark: '#05050c',
    skin: '#ffffff',
    boot: '#05050c',
    scarf: '#d946ef',
    ghostTrail: '#06b6d4',
    unlock: { type: 'gems', cost: 150, desc: '150 GEMS' },
  },
  skeleton: {
    id: 'skeleton',
    name: 'SKELETON',
    tier: 'epic',
    suit: '#e8e8f0',
    suitDark: '#a0a0b8',
    skin: '#e8e8f0',
    boot: '#505060',
    scarf: '#202028',
    ghostTrail: '#c0c8e0',
    unlock: { type: 'gems', cost: 150, desc: '150 GEMS' },
  },
  moon_man: {
    id: 'moon_man',
    name: 'MOON MAN',
    tier: 'epic',
    suit: '#1b2845',
    suitDark: '#0e182a',
    skin: '#dff6ff',
    boot: '#0b1322',
    scarf: '#7ef7ff',
    ghostTrail: '#7ef7ff',
    unlock: { type: 'gems', cost: 150, desc: '150 GEMS' },
  },
  witch: {
    id: 'witch',
    name: 'WITCH',
    tier: 'epic',
    suit: '#241038',
    suitDark: '#120720',
    skin: '#9ae6b4',
    boot: '#10061c',
    scarf: '#c084fc',
    ghostTrail: '#c084fc',
    unlock: { type: 'gems', cost: 150, desc: '150 GEMS' },
  },
  sun_man: {
    id: 'sun_man',
    name: 'SUN MAN',
    tier: 'epic',
    suit: '#ff7a45',
    suitDark: '#ba3813',
    skin: '#ffd166',
    boot: '#5c1605',
    scarf: '#ffe9a0',
    ghostTrail: '#ff7a45',
    unlock: { type: 'gems', cost: 150, desc: '150 GEMS' },
  },
  gold_bob: {
    id: 'gold_bob',
    name: 'GOLD BOB',
    tier: 'legendary',
    suit: '#ffd700',
    suitDark: '#b8860b',
    skin: '#ffd700',
    boot: '#9e6d0a',
    scarf: '#fff275',
    ghostTrail: '#ffd700',
    unlock: { type: 'coins', threshold: 10000, desc: '10,000 COINS' },
  },
  angel: {
    id: 'angel',
    name: 'ANGEL',
    tier: 'legendary',
    suit: '#ffffff',
    suitDark: '#cbd5e1',
    skin: '#ffcf9e',
    boot: '#ffd166',
    scarf: '#ffd166',
    ghostTrail: '#ffe9a0',
    unlock: { type: 'score', threshold: 50000, desc: '50,000 SCORE IN 1 RUN' },
  },
  outline: {
    id: 'outline',
    name: '___',
    tier: 'legendary',
    suit: '#ffffff',
    suitDark: '#ffffff',
    skin: '#ffffff',
    boot: '#ffffff',
    scarf: '#ffffff',
    ghostTrail: '#ffffff',
    unlock: { type: 'distance', threshold: 100000, desc: '100,000 TOTAL METERS' },
  },
  question: {
    id: 'question',
    name: '?',
    tier: 'legendary',
    suit: '#150a24',
    suitDark: '#0a0412',
    skin: '#2b1b45',
    boot: '#0a0412',
    scarf: '#c98cff',
    ghostTrail: '#c98cff',
    unlock: { type: 'konami', desc: '??????????' },
  },
  zeus: {
    id: 'zeus',
    name: 'ZEUS',
    tier: 'godly',
    suit: '#ffffff',
    suitDark: '#cbd5e1',
    skin: '#ffcf9e',
    boot: '#d97706',
    scarf: '#ffd166',
    ghostTrail: '#38bdf8',
    unlock: { type: 'gems', cost: 500, desc: '500 GEMS' },
  },
  leskos: {
    id: 'leskos',
    name: 'LESKOS',
    tier: 'godly',
    suit: '#302254',
    suitDark: '#1a1033',
    skin: '#ffcf9e',
    boot: '#100820',
    scarf: '#c98cff',
    ghostTrail: '#c98cff',
    unlock: { type: 'score', threshold: 100000, desc: '100,000 SCORE IN 1 RUN' },
  },
  mr_soup: {
    id: 'mr_soup',
    name: 'MR. SOUP',
    tier: 'godly',
    suit: '#f8f9fa',
    suitDark: '#ced4da',
    skin: '#ffcf9e',
    boot: '#e03131',
    scarf: '#ff922b',
    ghostTrail: '#ffa94d',
    unlock: { type: 'quests', threshold: 15, desc: '15 DAILY SETS IN A ROW' },
  },
  demon: {
    id: 'demon',
    name: 'DEMON',
    tier: 'godly',
    suit: '#8b0000',
    suitDark: '#4a0000',
    skin: '#ff3333',
    boot: '#1a0505',
    scarf: '#ff7a45',
    ghostTrail: '#ff2e63',
    unlock: { type: 'moon', desc: 'REACH THE BLOOD MOON' },
  },
  santa: {
    id: 'santa',
    name: 'SANTA',
    tier: 'exotic',
    suit: '#c0392b',
    suitDark: '#7b241c',
    skin: '#ffcf9e',
    boot: '#1a0a0a',
    scarf: '#ffffff',
    ghostTrail: '#ffffff',
    unlock: {
      type: 'holiday',
      threshold: 2500,
      desc: 'RUN 2,500M IN 1 RUN (DEC 1 - JAN 6)',
      holidayWindows: [['1201', '0106']],
    },
  },
  easter_bunny: {
    id: 'easter_bunny',
    name: 'E. BUNNY',
    tier: 'exotic',
    suit: '#d4f1c7',
    suitDark: '#91c882',
    skin: '#f8d7da',
    boot: '#8bc34a',
    scarf: '#ff80ab',
    ghostTrail: '#c8e6c9',
    unlock: {
      type: 'holiday',
      threshold: 2000,
      desc: 'RUN 2,000M IN 1 RUN (EASTER WEEK)',
      holidayWindows: [], // computed dynamically via isEasterSeason()
    },
  },
  beach_bob: {
    id: 'beach_bob',
    name: 'BEACH BOB',
    tier: 'exotic',
    suit: '#00b4d8',
    suitDark: '#0077b6',
    skin: '#ffcf9e',
    boot: '#ffd166',
    scarf: '#ff70a6',
    ghostTrail: '#00b4d8',
    unlock: {
      type: 'holiday',
      threshold: 2500,
      desc: 'RUN 2,500M IN 1 RUN (JUN 1 - AUG 31)',
      holidayWindows: [['0601', '0831']],
    },
  },
  pumpkin_bob: {
    id: 'pumpkin_bob',
    name: 'PUMPKIN BOB',
    tier: 'exotic',
    suit: '#ff7518',
    suitDark: '#c85a17',
    skin: '#ffb703',
    boot: '#2e104d',
    scarf: '#7ae04a',
    ghostTrail: '#ff7518',
    unlock: {
      type: 'holiday',
      threshold: 10,
      desc: '10 KILLS IN 1 RUN (OCT 1 - NOV 5)',
      holidayWindows: [['1001', '1105']],
    },
  },
};

export const SKIN_LIST: SkinDef[] = Object.values(SKINS);

export interface LifetimeStats {
  score: number; // Highest single-run score towards 100K (stops logging once done)
  coins: number;
  dailySets: number;
  dailyStreak: number;
  gems: number;
  totalDistance: number;
  maxDistance: number;
  scoreDone?: boolean;
  coinsDone?: boolean;
  dailySetsDone?: boolean;
  totalDistDone?: boolean;
  bloodMoonDone?: boolean;
}

const STATS_KEY = 'pixeldash.lifetime_stats';
const UNLOCKED_KEY = 'pixeldash.unlocked_skins';
const EQUIPPED_KEY = 'pixeldash.equipped_skin';

export function loadLifetimeStats(): LifetimeStats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return { score: 0, coins: 0, dailySets: 0, dailyStreak: 0, gems: 0, totalDistance: 0, maxDistance: 0 };
    const parsed = JSON.parse(raw);
    return {
      score: parsed.score || 0,
      coins: parsed.coins || 0,
      dailySets: parsed.dailySets || 0,
      dailyStreak: parsed.dailyStreak || parsed.dailySets || 0,
      gems: parsed.gems || 0,
      totalDistance: parsed.totalDistance || parsed.maxDistance || 0,
      maxDistance: parsed.maxDistance || 0,
      scoreDone: parsed.scoreDone,
      coinsDone: parsed.coinsDone,
      dailySetsDone: parsed.dailySetsDone,
      totalDistDone: parsed.totalDistDone,
      bloodMoonDone: parsed.bloodMoonDone,
    };
  } catch {
    return { score: 0, coins: 0, dailySets: 0, dailyStreak: 0, gems: 0, totalDistance: 0, maxDistance: 0 };
  }
}

export function saveLifetimeStats(stats: LifetimeStats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {}
}

function getStoredBestScore(): number {
  try {
    const rawV2 = localStorage.getItem('pixeldash.best.v2');
    if (rawV2) {
      const parsed = JSON.parse(rawV2);
      if (typeof parsed?.score === 'number' && Number.isFinite(parsed.score)) return parsed.score;
    }
    const rawScores = localStorage.getItem('pixeldash.scores.v1');
    if (rawScores) {
      const parsed = JSON.parse(rawScores);
      if (Array.isArray(parsed)) {
        let max = 0;
        for (const item of parsed) {
          if (typeof item?.score === 'number' && item.score > max) max = item.score;
        }
        if (max > 0) return max;
      }
    }
    const oldBest = Number(localStorage.getItem('pixeldash.best')) || 0;
    if (oldBest > 0) return oldBest;
  } catch {}
  return 0;
}

export function loadUnlockedSkins(): SkinId[] {
  try {
    const raw = localStorage.getItem(UNLOCKED_KEY);
    const arr: SkinId[] = raw ? JSON.parse(raw).map((id: string) => (id === 'lekos' ? 'leskos' : id)) : ['bob', 'bobette'];
    if (!arr.includes('bob')) arr.push('bob');
    if (!arr.includes('bobette')) arr.push('bobette');

    // Retroactive check against lifetime stats and high score
    const bestVal = getStoredBestScore();
    const stats = loadLifetimeStats();
    const maxScore = Math.max(stats.score || 0, bestVal);

    if (maxScore >= 50000 && !arr.includes('angel')) {
      arr.push('angel');
    }
    if (maxScore >= 100000 && !arr.includes('leskos')) {
      arr.push('leskos');
    }
    if (stats.coins >= 10000 && !arr.includes('gold_bob')) {
      arr.push('gold_bob');
    }
    if (stats.totalDistance >= 100000 && !arr.includes('outline')) {
      arr.push('outline');
    }
    if ((stats.dailyStreak >= 15 || stats.dailySets >= 15) && !arr.includes('mr_soup')) {
      arr.push('mr_soup');
    }
    if (stats.bloodMoonDone && !arr.includes('demon')) {
      arr.push('demon');
    }

    try {
      localStorage.setItem(UNLOCKED_KEY, JSON.stringify(arr));
    } catch {}

    return arr;
  } catch {
    return ['bob', 'bobette'];
  }
}

export function saveUnlockedSkins(unlocked: SkinId[]) {
  try {
    localStorage.setItem(UNLOCKED_KEY, JSON.stringify(unlocked));
  } catch {}
}

export function loadEquippedSkin(): SkinId {
  try {
    let raw = localStorage.getItem(EQUIPPED_KEY);
    if (raw === 'lekos') raw = 'leskos';
    if (raw && raw in SKINS) return raw as SkinId;
    return 'bob';
  } catch {
    return 'bob';
  }
}

export function saveEquippedSkin(id: SkinId) {
  try {
    localStorage.setItem(EQUIPPED_KEY, id);
  } catch {}
}

export const MILESTONES = {
  SCORE_TARGET: 100000,
  COINS_TARGET: 10000,
  DISTANCE_TARGET: 100000,
  QUESTS_TARGET: 15,
} as const;

/** Check and unlock any milestone skins after a run or quest completion */
export function evaluateSkinUnlocks(
  stats: LifetimeStats,
  currentRun?: { score: number; meters: number; coins: number; gems: number; kills?: number; combo?: number; moonPhase?: number },
): { newUnlocks: SkinId[]; updatedStats: LifetimeStats } {
  const unlocked = new Set(loadUnlockedSkins());
  const newUnlocks: SkinId[] = [];
  const currentLifetime = loadLifetimeStats();
  const nextStats: LifetimeStats = { ...currentLifetime, ...stats, gems: currentLifetime.gems };

  // Update lifetime stats only if not completed/capped
  if (currentRun) {
    // Score in 1 single run milestone
    if (!nextStats.scoreDone) {
      if (currentRun.score > (nextStats.score || 0)) {
        nextStats.score = Math.min(MILESTONES.SCORE_TARGET, currentRun.score);
      }
      if (currentRun.score >= MILESTONES.SCORE_TARGET) {
        nextStats.score = MILESTONES.SCORE_TARGET;
        nextStats.scoreDone = true;
      }
    }
    if (!nextStats.coinsDone) {
      nextStats.coins = (nextStats.coins || 0) + currentRun.coins;
      if (nextStats.coins >= MILESTONES.COINS_TARGET) {
        nextStats.coins = MILESTONES.COINS_TARGET;
        nextStats.coinsDone = true;
      }
    }
    if (!nextStats.totalDistDone) {
      nextStats.totalDistance = (nextStats.totalDistance || 0) + currentRun.meters;
      if (nextStats.totalDistance >= MILESTONES.DISTANCE_TARGET) {
        nextStats.totalDistance = MILESTONES.DISTANCE_TARGET;
        nextStats.totalDistDone = true;
      }
    }
    if (currentRun.meters > nextStats.maxDistance) {
      nextStats.maxDistance = currentRun.meters;
    }
    if (currentRun.moonPhase && currentRun.moonPhase >= 4) {
      nextStats.bloodMoonDone = true;
    }
  }

  const bestVal = getStoredBestScore();

  // Check Gold Bob (coins milestone)
  if ((nextStats.coins >= (SKINS.gold_bob.unlock.threshold ?? MILESTONES.COINS_TARGET) || nextStats.coinsDone) && !unlocked.has('gold_bob')) {
    unlocked.add('gold_bob');
    newUnlocks.push('gold_bob');
  }

  // Check Outline (total distance milestone)
  if ((nextStats.totalDistance >= (SKINS.outline.unlock.threshold ?? MILESTONES.DISTANCE_TARGET) || nextStats.totalDistDone) && !unlocked.has('outline')) {
    unlocked.add('outline');
    newUnlocks.push('outline');
  }

  // Check Angel (50,000 score in 1 run milestone)
  const angelReq = SKINS.angel.unlock.threshold ?? 50000;
  const maxScore = Math.max(nextStats.score || 0, currentRun?.score || 0, bestVal);
  if (maxScore >= angelReq && !unlocked.has('angel')) {
    unlocked.add('angel');
    newUnlocks.push('angel');
  }

  // Check Leskos (score in 1 run milestone)
  const scoreReq = SKINS.leskos.unlock.threshold ?? MILESTONES.SCORE_TARGET;
  if ((maxScore >= scoreReq || nextStats.scoreDone || (currentRun && currentRun.score >= scoreReq)) && !unlocked.has('leskos')) {
    unlocked.add('leskos');
    newUnlocks.push('leskos');
    nextStats.score = scoreReq;
    nextStats.scoreDone = true;
  }

  // Check Mr. Soup (daily sets in a row milestone)
  const questReq = SKINS.mr_soup.unlock.threshold ?? MILESTONES.QUESTS_TARGET;
  if ((nextStats.dailyStreak >= questReq || nextStats.dailySets >= questReq) && !unlocked.has('mr_soup')) {
    unlocked.add('mr_soup');
    newUnlocks.push('mr_soup');
  }

  // Check Demon (Blood Moon / Eclipse phase in Tundra)
  if (nextStats.bloodMoonDone && !unlocked.has('demon')) {
    unlocked.add('demon');
    newUnlocks.push('demon');
  }

  // Check Seasonal/Holiday In-Game Challenges during Active Window
  if (currentRun) {
    // Santa: Run 2500m in 1 run during Christmas season
    if (isHolidayActive(SKINS.santa.unlock) && currentRun.meters >= 2500 && !unlocked.has('santa')) {
      unlocked.add('santa');
      newUnlocks.push('santa');
    }
    // Easter Bunny: Run 2000m in 1 run during Easter week
    if (isEasterSeason() && currentRun.meters >= 2000 && !unlocked.has('easter_bunny')) {
      unlocked.add('easter_bunny');
      newUnlocks.push('easter_bunny');
    }
    // Beach Bob: Run 2500m in 1 run during Summer season
    if (isHolidayActive(SKINS.beach_bob.unlock) && currentRun.meters >= 2500 && !unlocked.has('beach_bob')) {
      unlocked.add('beach_bob');
      newUnlocks.push('beach_bob');
    }
    // Pumpkin Bob: 10 Kills in 1 run during Halloween season
    if (isHolidayActive(SKINS.pumpkin_bob.unlock) && (currentRun.kills ?? 0) >= 10 && !unlocked.has('pumpkin_bob')) {
      unlocked.add('pumpkin_bob');
      newUnlocks.push('pumpkin_bob');
    }
  }

  if (newUnlocks.length > 0) {
    saveUnlockedSkins(Array.from(unlocked));
  }
  saveLifetimeStats(nextStats);

  return { newUnlocks, updatedStats: nextStats };
}
