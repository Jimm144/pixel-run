/**
 * Campaign mode — 6 hand-tuned levels across the themed biomes.
 * Each level is a deterministic seeded run with a distance goal:
 * reach the flag to complete it. Completing a level unlocks the next.
 * Progress persists in localStorage under pixeldash.campaign.v1.
 */

export interface CampaignLevel {
  id: string;
  name: string;
  color: string;
  /** Goal in displayed meters (engine distance = meters * 10). */
  targetMeters: number;
  /** Base difficulty 0..1 injected on top of the distance ramp. */
  diff: number;
  diffLabel: string;
  /** One-line brief shown on the level card. */
  brief: string;
}

export const CAMPAIGN_LEVELS: CampaignLevel[] = [
  {
    id: 'construction',
    name: 'CONSTRUCTION',
    color: '#ffd166',
    targetMeters: 400,
    diff: 0,
    diffLabel: 'EASY',
    brief: 'LEARN THE ROPES ON THE SITE',
  },
  {
    id: 'pirates',
    name: 'PIRATES',
    color: '#00b4d8',
    targetMeters: 600,
    diff: 0.12,
    diffLabel: 'EASY+',
    brief: 'RUN THE DECKS, DODGE THE CANNONS',
  },
  {
    id: 'ocean',
    name: 'OCEAN',
    color: '#3ef2c8',
    targetMeters: 850,
    diff: 0.25,
    diffLabel: 'MEDIUM',
    brief: 'DEEP WATER. LONGER GAPS.',
  },
  {
    id: 'volcano',
    name: 'VOLCANO',
    color: '#ff5400',
    targetMeters: 1100,
    diff: 0.4,
    diffLabel: 'HARD',
    brief: 'THE MOUNTAIN FIGHTS BACK',
  },
  {
    id: 'hell',
    name: 'HELL',
    color: '#ff0054',
    targetMeters: 1400,
    diff: 0.55,
    diffLabel: 'BRUTAL',
    brief: 'NO MERCY BELOW',
  },
  {
    id: 'heaven',
    name: 'HEAVEN',
    color: '#ffd700',
    targetMeters: 1800,
    diff: 0.7,
    diffLabel: 'IMPOSSIBLE',
    brief: 'THE FINAL ASCENT',
  },
];

const KEY = 'pixeldash.campaign.v1';

export interface CampaignProgress {
  /** Number of levels unlocked (index + 1). Level i unlocked when i < unlocked. */
  unlocked: number;
  /** Best distance in displayed meters per level index. */
  best: Record<number, number>;
  /** Levels completed (flag reached). */
  done: Record<number, boolean>;
}

export function loadCampaignProgress(): CampaignProgress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<CampaignProgress>;
      return {
        unlocked: Math.max(1, Math.min(CAMPAIGN_LEVELS.length, Math.floor(p.unlocked ?? 1))),
        best: p.best && typeof p.best === 'object' ? p.best : {},
        done: p.done && typeof p.done === 'object' ? p.done : {},
      };
    }
  } catch {}
  return { unlocked: 1, best: {}, done: {} };
}

export function saveCampaignProgress(p: CampaignProgress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {}
}

export function isLevelUnlocked(p: CampaignProgress, levelIndex: number): boolean {
  return levelIndex < p.unlocked;
}

/** Percent (0-100) of the level's goal reached by the best attempt. */
export function levelBestPercent(p: CampaignProgress, levelIndex: number): number {
  const lvl = CAMPAIGN_LEVELS[levelIndex];
  if (!lvl) return 0;
  const best = p.best[levelIndex] ?? 0;
  return Math.min(100, Math.round((best / lvl.targetMeters) * 100));
}

/** Record an attempt. Returns the progress AFTER saving (new object). */
export function recordCampaignAttempt(
  levelIndex: number,
  meters: number,
  completed: boolean,
): CampaignProgress {
  const p = loadCampaignProgress();
  const prevBest = p.best[levelIndex] ?? 0;
  if (meters > prevBest) p.best[levelIndex] = Math.floor(meters);
  if (completed && !p.done[levelIndex]) p.done[levelIndex] = true;
  if (completed && levelIndex + 1 >= p.unlocked && levelIndex + 1 < CAMPAIGN_LEVELS.length) {
    p.unlocked = levelIndex + 2;
  } else if (completed && levelIndex + 1 >= p.unlocked) {
    p.unlocked = Math.max(p.unlocked, CAMPAIGN_LEVELS.length);
  }
  saveCampaignProgress(p);
  return p;
}

/** Deterministic per-level seed so every attempt of a level is the same course. */
export function campaignSeed(levelIndex: number): number {
  return 0x9e3779b9 ^ (levelIndex * 7919);
}
