export interface HighScore {
  score: number;
  meters: number;
  coins: number;
  ts: number;
}

const KEY = 'pixeldash.best.v2';
const LEGACY_KEY = 'pixeldash.scores.v1';
const LAST_KEY = 'pixeldash.lastrun.v1';
const VOL_KEY = 'pixeldash.volumes.v1';

function nonNegativeInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function normalizeHighScore(value: unknown): HighScore | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Partial<HighScore>;
  if (typeof entry.score !== 'number' || !Number.isFinite(entry.score) || entry.score < 0) return null;
  return {
    score: Math.floor(entry.score),
    meters: nonNegativeInt(entry.meters, 0),
    coins: nonNegativeInt(entry.coins, 0),
    ts: nonNegativeInt(entry.ts, Date.now()),
  };
}

export function loadHighScore(): HighScore | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = normalizeHighScore(JSON.parse(raw));
      if (parsed) return parsed;
    }

    // Carry the best result forward from the old leaderboard format.
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
    if (Array.isArray(legacy)) {
      let best: HighScore | null = null;
      for (const entry of legacy) {
        const candidate = normalizeHighScore(entry);
        if (candidate && (!best || candidate.score > best.score)) best = candidate;
      }
      if (best) {
        try {
          localStorage.setItem(KEY, JSON.stringify(best));
        } catch {}
        return best;
      }
    }
  } catch {}
  return null;
}

export function bestScore(): number {
  return loadHighScore()?.score ?? 0;
}

export function saveHighScore(entry: HighScore, current: HighScore | null = null): HighScore | null {
  const candidate = normalizeHighScore(entry);
  if (!candidate) return null;
  // `current` lets callers that already loaded the stored best avoid a
  // redundant second read; when omitted it is loaded here.
  const prev = current ?? loadHighScore();
  const best = !prev || candidate.score > prev.score ? candidate : prev;
  try {
    localStorage.setItem(KEY, JSON.stringify(best));
  } catch {}
  return best;
}

export function loadLastRun(): HighScore | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    if (raw) return normalizeHighScore(JSON.parse(raw));
  } catch {}
  return null;
}

export function saveLastRun(entry: HighScore): HighScore | null {
  const candidate = normalizeHighScore(entry);
  if (!candidate) return null;
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(candidate));
  } catch {}
  return candidate;
}

export interface Volumes {
  music: number;
  sfx: number;
}

function normalizeVolume(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

export function loadVolumes(): Volumes {
  try {
    const raw = localStorage.getItem(VOL_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Volumes>;
      return { music: normalizeVolume(parsed.music, 1), sfx: normalizeVolume(parsed.sfx, 1) };
    }
  } catch {}
  return { music: 1, sfx: 1 };
}

export function saveVolumes(volumes: Volumes): Volumes {
  try {
    localStorage.setItem(VOL_KEY, JSON.stringify(volumes));
  } catch {}
  return volumes;
}
