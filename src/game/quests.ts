import type { BgKind } from './palette';

export type QuestDifficulty = 'easy' | 'medium' | 'hard' | 'special' | 'impossible';
export type QuestScope = 'day' | 'run';
export type QuestMetric = 'coins' | 'meters' | 'score' | 'enemies' | 'powerups';
export type QuestKind = 'metric' | 'cleanMeters' | 'cleanScore' | 'jumps' | 'biomeEffects' | 'twoPowerups' | 'combo';

export interface QuestDefinition {
  id: string;
  difficulty: QuestDifficulty;
  scope: QuestScope;
  kind: QuestKind;
  metric?: QuestMetric;
  target: number;
}

export interface QuestTotals {
  coins: number;
  meters: number;
  score: number;
  enemies: number;
  powerups: number;
  jumps: number;
}

export interface QuestRunStats extends QuestTotals {
  maxCombo: number;
  cleanMeters: number;
  cleanScore: number;
  cleanRun: boolean;
  biomeEffects: BgKind[];
  twoPowerups: boolean;
}

export interface QuestRecord {
  date: string;
  completed: string[];
  totals: QuestTotals;
  completedByDifficulty: Record<QuestDifficulty, number>;
  announcementSeen: boolean;
}

export const QUEST_DIFFICULTY_COLORS: Record<QuestDifficulty, string> = {
  easy: '#7ae04a',
  medium: '#ffb03e',
  hard: '#ff4d6d',
  special: '#c98cff',
  impossible: '#08040f',
};

const QUEST_KEY = 'pixeldash.quests.v2';
const METRICS: QuestMetric[] = ['coins', 'meters', 'score', 'enemies', 'powerups'];

const TARGETS: Record<Exclude<QuestDifficulty, 'special'>, Record<QuestScope, Record<QuestMetric, number>>> = {
  easy: {
    day: { coins: 80, meters: 1000, score: 3500, enemies: 15, powerups: 3 },
    run: { coins: 25, meters: 350, score: 1200, enemies: 5, powerups: 1 },
  },
  medium: {
    day: { coins: 180, meters: 2500, score: 9000, enemies: 35, powerups: 8 },
    run: { coins: 60, meters: 1000, score: 4000, enemies: 12, powerups: 3 },
  },
  hard: {
    day: { coins: 350, meters: 5000, score: 18000, enemies: 75, powerups: 16 },
    run: { coins: 120, meters: 2500, score: 9000, enemies: 25, powerups: 6 },
  },
  impossible: {
    day: { coins: 800, meters: 15000, score: 60000, enemies: 200, powerups: 40 },
    run: { coins: 300, meters: 6000, score: 25000, enemies: 60, powerups: 18 },
  },
};

function zeroTotals(): QuestTotals {
  return { coins: 0, meters: 0, score: 0, enemies: 0, powerups: 0, jumps: 0 };
}

function zeroDifficultyCounts(): Record<QuestDifficulty, number> {
  return { easy: 0, medium: 0, hard: 0, special: 0, impossible: 0 };
}

function nonNegativeInt(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function seedFor(date: string) {
  let seed = 2166136261;
  for (let i = 0; i < date.length; i++) {
    seed ^= date.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

function random(seed: { value: number }) {
  seed.value = (Math.imul(seed.value, 1664525) + 1013904223) >>> 0;
  return seed.value / 0x100000000;
}

function pickDifficulty(value: number): QuestDifficulty {
  if (value < 0.4) return 'easy';
  if (value < 0.74) return 'medium';
  if (value < 0.94) return 'hard';
  if (value < 0.99) return 'special';
  return 'impossible';
}

export function getDailyQuests(date = dateKey()): QuestDefinition[] {
  const seed = { value: seedFor(date) };
  const quests: QuestDefinition[] = [];

  for (let slot = 0; slot < 4; slot++) {
    const difficulty = pickDifficulty(random(seed));
    if (difficulty === 'special') {
      const special = Math.floor(random(seed) * 6);
      if (special === 0) quests.push({ id: `${date}-q${slot}`, difficulty, scope: 'run', kind: 'cleanMeters', target: 2000 });
      else if (special === 1) quests.push({ id: `${date}-q${slot}`, difficulty, scope: 'run', kind: 'cleanScore', target: 12000 });
      else if (special === 2) {
        const scope = random(seed) < 0.5 ? 'day' : 'run';
        quests.push({ id: `${date}-q${slot}`, difficulty, scope, kind: 'jumps', target: scope === 'day' ? 150 : 50 });
      }
      else if (special === 3) quests.push({ id: `${date}-q${slot}`, difficulty, scope: 'run', kind: 'biomeEffects', target: 4 });
      else if (special === 4) quests.push({ id: `${date}-q${slot}`, difficulty, scope: 'run', kind: 'twoPowerups', target: 1 });
      else quests.push({ id: `${date}-q${slot}`, difficulty, scope: 'run', kind: 'combo', target: 10 });
      continue;
    }

    const scope = random(seed) < 0.55 ? 'day' : 'run';
    const metric = METRICS[Math.floor(random(seed) * METRICS.length)];
    quests.push({
      id: `${date}-q${slot}`,
      difficulty,
      scope,
      kind: 'metric',
      metric,
      target: TARGETS[difficulty][scope][metric],
    });
  }

  return quests;
}

export function emptyQuestRunStats(): QuestRunStats {
  return { ...zeroTotals(), maxCombo: 0, cleanMeters: 0, cleanScore: 0, cleanRun: true, biomeEffects: [], twoPowerups: false };
}

export function createQuestRecord(date = dateKey(), counts = zeroDifficultyCounts()): QuestRecord {
  return {
    date,
    completed: [],
    totals: zeroTotals(),
    completedByDifficulty: { ...counts },
    announcementSeen: false,
  };
}

function normalizeRecord(value: unknown, date: string, counts: Record<QuestDifficulty, number>): QuestRecord {
  const fallback = createQuestRecord(date, counts);
  if (!value || typeof value !== 'object') return fallback;
  const source = value as Partial<QuestRecord>;
  const storedCounts = source.completedByDifficulty;
  const storedTotals = source.totals;
  return {
    date,
    completed: Array.isArray(source.completed) ? source.completed.filter((id): id is string => typeof id === 'string') : [],
    totals: {
      coins: nonNegativeInt(storedTotals?.coins),
      meters: nonNegativeInt(storedTotals?.meters),
      score: nonNegativeInt(storedTotals?.score),
      enemies: nonNegativeInt(storedTotals?.enemies),
      powerups: nonNegativeInt(storedTotals?.powerups),
      jumps: nonNegativeInt(storedTotals?.jumps),
    },
    completedByDifficulty: {
      easy: nonNegativeInt(storedCounts?.easy, counts.easy),
      medium: nonNegativeInt(storedCounts?.medium, counts.medium),
      hard: nonNegativeInt(storedCounts?.hard, counts.hard),
      special: nonNegativeInt(storedCounts?.special, counts.special),
      impossible: nonNegativeInt(storedCounts?.impossible, counts.impossible),
    },
    announcementSeen: source.announcementSeen === true,
  };
}

export function loadQuestRecord(date = dateKey()): QuestRecord {
  const fallbackCounts = zeroDifficultyCounts();
  try {
    const raw = localStorage.getItem(QUEST_KEY);
    if (!raw) return createQuestRecord(date, fallbackCounts);
    const parsed = JSON.parse(raw) as Partial<QuestRecord>;
    const counts = parsed.completedByDifficulty ?? fallbackCounts;
    if (parsed.date !== date) return createQuestRecord(date, {
      easy: nonNegativeInt(counts.easy),
      medium: nonNegativeInt(counts.medium),
      hard: nonNegativeInt(counts.hard),
      special: nonNegativeInt(counts.special),
      impossible: nonNegativeInt(counts.impossible),
    });
    return normalizeRecord(parsed, date, fallbackCounts);
  } catch {
    return createQuestRecord(date, fallbackCounts);
  }
}

export function saveQuestRecord(record: QuestRecord) {
  try {
    localStorage.setItem(QUEST_KEY, JSON.stringify(record));
  } catch {}
  return record;
}

export function markQuestAnnouncementSeen(record: QuestRecord): QuestRecord {
  return { ...record, announcementSeen: true };
}

export function markQuestCompletions(record: QuestRecord, quests: QuestDefinition[], ids: string[]): QuestRecord {
  const next: QuestRecord = {
    ...record,
    completed: [...record.completed],
    completedByDifficulty: { ...record.completedByDifficulty },
  };
  for (const id of ids) {
    if (next.completed.includes(id)) continue;
    const quest = quests.find((candidate) => candidate.id === id);
    if (!quest) continue;
    next.completed.push(id);
    next.completedByDifficulty[quest.difficulty]++;
  }
  return next;
}

export function getQuestLabel(quest: QuestDefinition) {
  const scope = quest.scope === 'day' ? 'today' : 'in one run';
  if (quest.kind === 'cleanMeters') return `Run ${quest.target} meters without collecting or killing`;
  if (quest.kind === 'cleanScore') return `Score ${quest.target} points without collecting or killing`;
  if (quest.kind === 'jumps') return `Jump ${quest.target} times ${scope}`;
  if (quest.kind === 'biomeEffects') return 'Trigger every biome effect in one run';
  if (quest.kind === 'twoPowerups') return 'Activate two power-ups at once';
  if (quest.kind === 'combo') return 'Reach a x10 combo in one run';
  const labels: Record<QuestMetric, string> = {
    coins: 'coins',
    meters: 'meters',
    score: 'score',
    enemies: 'enemies',
    powerups: 'power-ups',
  };
  const verbs: Record<QuestMetric, string> = {
    coins: 'Collect',
    meters: 'Run',
    score: 'Score',
    enemies: 'Defeat',
    powerups: 'Collect',
  };
  const unit = quest.metric === 'score' ? 'points' : labels[quest.metric!];
  return `${verbs[quest.metric!]} ${quest.target} ${unit} ${scope}`;
}

function valueFor(quest: QuestDefinition, record: QuestRecord, run: QuestRunStats) {
  if (quest.kind === 'cleanMeters') return run.cleanRun ? run.cleanMeters : 0;
  if (quest.kind === 'cleanScore') return run.cleanRun ? run.cleanScore : 0;
  if (quest.kind === 'biomeEffects') return new Set(run.biomeEffects).size;
  if (quest.kind === 'twoPowerups') return run.twoPowerups ? 1 : 0;
  if (quest.kind === 'combo') return run.maxCombo;
  if (quest.kind === 'jumps') return (quest.scope === 'day' ? record.totals.jumps : 0) + run.jumps;
  const metric = quest.metric!;
  return (quest.scope === 'day' ? record.totals[metric] : 0) + run[metric];
}

export function getQuestProgress(quest: QuestDefinition, record: QuestRecord, run = emptyQuestRunStats()) {
  const value = record.completed.includes(quest.id) ? quest.target : valueFor(quest, record, run);
  return { value: Math.min(quest.target, Math.max(0, Math.floor(value))), target: quest.target, done: value >= quest.target || record.completed.includes(quest.id) };
}

export function applyQuestRun(record: QuestRecord, quests: QuestDefinition[], run: QuestRunStats): QuestRecord {
  const next: QuestRecord = {
    ...record,
    completed: [...record.completed],
    totals: {
      coins: record.totals.coins + run.coins,
      meters: record.totals.meters + run.meters,
      score: record.totals.score + run.score,
      enemies: record.totals.enemies + run.enemies,
      powerups: record.totals.powerups + run.powerups,
      jumps: record.totals.jumps + run.jumps,
    },
    completedByDifficulty: { ...record.completedByDifficulty },
  };

  for (const quest of quests) {
    if (next.completed.includes(quest.id)) continue;
    if (getQuestProgress(quest, record, run).done) {
      next.completed.push(quest.id);
      next.completedByDifficulty[quest.difficulty]++;
    }
  }
  return next;
}
