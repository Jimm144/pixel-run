import { useCallback, useEffect, useRef, useState } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { GameOverScreen, PauseScreen, StartScreen } from './components/Overlays';
import { DailyQuestAnnouncement, QuestCompletionToast } from './components/QuestPanels';
import { type UI } from './components/useGameInput';
import { Game, type Stats } from './game/engine';
import { dispose, setMusicVolume, setSfxVolume, sfx, unlock } from './game/audio';
import { drawText, drawTextCentered, textWidth } from './game/font';
import {
  bestScore,
  loadHighScore,
  loadLastRun,
  loadVolumes,
  saveHighScore,
  saveLastRun,
  saveVolumes,
  incrementTotalRuns,
  shouldShowFeedbackPrompt,
  saveLastFeedbackPromptRun,
} from './game/storage';
import {
  commitQuestRun as commitQuestRunRecord,
  emptyQuestRunStats,
  getDailyQuests,
  getQuestProgress,
  loadQuestRecord,
  markQuestAnnouncementSeen,
  markQuestCompletions,
  markRunStarted,
  formatDuration,
  saveQuestRecord,
  type QuestRecord,
  type QuestRunStats,
} from './game/quests';
import { SkinsModal } from './components/SkinsModal';
import { SkinUnlockModal } from './components/SkinUnlockModal';
import { FeedbackModal } from './components/FeedbackModal';
import {
  loadEquippedSkin,
  loadUnlockedSkins,
  loadLifetimeStats,
  saveEquippedSkin,
  saveUnlockedSkins,
  evaluateSkinUnlocks,
  type SkinId,
  type LifetimeStats,
  SKINS,
} from './game/skins';
import { inputManager } from './game/input';

const QUEST_SHARE_WIDTH = 1200;
const QUEST_SHARE_HEIGHT = 500;

function shareInteger(value: number, fallback = 0) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(999_999_999, Math.max(0, Math.floor(value)));
}

function createQuestShareCard(record: QuestRecord, best: number): Promise<Blob | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);

  const canvas = document.createElement('canvas');
  canvas.width = QUEST_SHARE_WIDTH;
  canvas.height = QUEST_SHARE_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context || typeof canvas.toBlob !== 'function') return Promise.resolve(null);

  context.imageSmoothingEnabled = false;

  context.fillStyle = '#08040f';
  context.fillRect(0, 0, QUEST_SHARE_WIDTH, QUEST_SHARE_HEIGHT);
  context.fillStyle = '#140a26';
  context.fillRect(24, 24, QUEST_SHARE_WIDTH - 48, QUEST_SHARE_HEIGHT - 48);
  context.strokeStyle = '#3ef2c8';
  context.lineWidth = 8;
  context.strokeRect(20, 20, QUEST_SHARE_WIDTH - 40, QUEST_SHARE_HEIGHT - 40);
  context.strokeStyle = '#2c1f4d';
  context.lineWidth = 4;
  context.strokeRect(42, 42, QUEST_SHARE_WIDTH - 84, QUEST_SHARE_HEIGHT - 84);

  const tries = Math.max(1, shareInteger(record.tries, 1));
  const firstRunAt = typeof record.firstRunAt === 'number' && Number.isFinite(record.firstRunAt) ? record.firstRunAt : null;
  const completedAt = typeof record.completedAt === 'number' && Number.isFinite(record.completedAt) ? record.completedAt : null;
  const elapsedMs = firstRunAt !== null && completedAt !== null ? Math.min(100 * 365 * 24 * 60 * 60 * 1000, Math.max(0, completedAt - firstRunAt)) : 0;
  const elapsed = firstRunAt !== null && completedAt !== null ? formatDuration(elapsedMs) : 'N/A';
  const safeBest = shareInteger(best);

  drawTextCentered(context, 'DAILY QUESTS COMPLETE', QUEST_SHARE_WIDTH / 2, 72, 7, '#3ef2c8', '#08040f');
  drawTextCentered(context, `DATE ${record.date}`, QUEST_SHARE_WIDTH / 2, 163, 3, '#9d8fd6', '#08040f');

  const drawMetric = (x: number, label: string, value: string, color: string) => {
    context.fillStyle = '#0d0619';
    context.fillRect(x, 215, 336, 112);
    context.strokeStyle = color;
    context.lineWidth = 4;
    context.strokeRect(x, 215, 336, 112);
    drawText(context, label, x + 22, 237, 3, color);
    drawText(context, value, x + 22, 275, 5, '#f3f4f6', '#08040f');
  };

  drawMetric(82, 'TRIES', String(tries), '#3ef2c8');
  drawMetric(432, 'ELAPSED TIME', elapsed, '#ffd166');
  drawMetric(782, 'BEST SCORE', safeBest > 0 ? safeBest.toLocaleString('en-US') : 'N/A', '#c98cff');

  const difficultyCounts = ([
    ['EASY', record.completedByDifficulty.easy, '#7ae04a'],
    ['MEDIUM', record.completedByDifficulty.medium, '#ffb03e'],
    ['HARD', record.completedByDifficulty.hard, '#ff4d6d'],
    ['SPECIAL', record.completedByDifficulty.special, '#c98cff'],
    ['IMPOSSIBLE', record.completedByDifficulty.impossible, '#d1d5db'],
  ] as Array<[string, number, string]>).filter((entry) => entry[1] > 0);
  if (difficultyCounts.length > 0) {
    const labels = difficultyCounts.map(([label, count]) => `${label}: ${shareInteger(count)}`);
    const scale = 3;
    const gap = 30;
    const totalWidth = labels.reduce((sum, label) => sum + textWidth(label, scale), 0) + gap * (labels.length - 1);
    let x = (QUEST_SHARE_WIDTH - totalWidth) / 2;
    difficultyCounts.forEach((entry, index) => {
      drawText(context, labels[index], x, 371, scale, entry[2]);
      x += textWidth(labels[index], scale) + gap;
    });
  }

  drawTextCentered(context, 'jimm144.github.io/pixel-run', QUEST_SHARE_WIDTH / 2, 416, 3, '#9d8fd6', '#08040f', false);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

function createScoreShareCard(stats: Stats, isNewBest: boolean): Promise<Blob | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);

  const canvas = document.createElement('canvas');
  canvas.width = QUEST_SHARE_WIDTH;
  canvas.height = QUEST_SHARE_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context || typeof canvas.toBlob !== 'function') return Promise.resolve(null);

  context.imageSmoothingEnabled = false;

  context.fillStyle = '#08040f';
  context.fillRect(0, 0, QUEST_SHARE_WIDTH, QUEST_SHARE_HEIGHT);
  context.fillStyle = '#140a26';
  context.fillRect(24, 24, QUEST_SHARE_WIDTH - 48, QUEST_SHARE_HEIGHT - 48);
  context.strokeStyle = isNewBest ? '#ffd166' : '#3ef2c8';
  context.lineWidth = 8;
  context.strokeRect(20, 20, QUEST_SHARE_WIDTH - 40, QUEST_SHARE_HEIGHT - 40);
  context.strokeStyle = '#2c1f4d';
  context.lineWidth = 4;
  context.strokeRect(42, 42, QUEST_SHARE_WIDTH - 84, QUEST_SHARE_HEIGHT - 84);

  const title = isNewBest ? 'NEW PERSONAL BEST!' : 'FINAL RUN SCORE';
  const titleColor = isNewBest ? '#ffd166' : '#3ef2c8';
  drawTextCentered(context, title, QUEST_SHARE_WIDTH / 2, 68, 7, titleColor, '#08040f');

  const scoreText = stats.score.toLocaleString('en-US');
  drawTextCentered(context, scoreText, QUEST_SHARE_WIDTH / 2, 140, 9, '#ffffff', '#08040f');

  const boxW = 232;
  const boxH = 110;
  const boxY = 254;

  const drawMetric = (x: number, label: string, value: string, color: string) => {
    context.fillStyle = '#0d0619';
    context.fillRect(x, boxY, boxW, boxH);
    context.strokeStyle = color;
    context.lineWidth = 4;
    context.strokeRect(x, boxY, boxW, boxH);
    drawText(context, label, x + 16, boxY + 22, 3, color);
    drawText(context, value, x + 16, boxY + 59, 5, '#f3f4f6', '#08040f');
  };

  drawMetric(88, 'DISTANCE', `${stats.meters}M`, '#3ef2c8');
  drawMetric(352, 'GEMS', String(stats.gems ?? 0), '#3ef2c8');
  drawMetric(616, 'KILLS', String(stats.kills), '#ff4d6d');
  drawMetric(880, 'MAX COMBO', `X${stats.combo}`, '#c98cff');

  drawTextCentered(context, 'jimm144.github.io/pixel-run', QUEST_SHARE_WIDTH / 2, 416, 3, '#9d8fd6', '#08040f', false);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function App() {
  const gameRef = useRef<Game | null>(null);
  const [ui, setUi] = useState<UI>('start');
  const [stats, setStats] = useState<Stats>({ score: 0, meters: 0, gems: 0, coins: 0, kills: 0, combo: 0 });
  const [best, setBest] = useState(() => bestScore());
  const [lastRun, setLastRun] = useState(() => loadLastRun());
  const [newBest, setNewBest] = useState(false);
  const [volumes, setVolumes] = useState(() => loadVolumes());
  const prevMusicVolRef = useRef(volumes.music > 0 ? volumes.music : 1.0);
  const prevSfxVolRef = useRef(volumes.sfx > 0 ? volumes.sfx : 1.0);

  const musicOn = volumes.music > 0;
  const sfxOn = volumes.sfx > 0;

  const toggleMusic = useCallback(() => {
    sfx.play('ui');
    setVolumes((prev) => {
      if (prev.music > 0) {
        prevMusicVolRef.current = prev.music;
        return { ...prev, music: 0 };
      }
      return { ...prev, music: prevMusicVolRef.current > 0 ? prevMusicVolRef.current : 1.0 };
    });
  }, []);

  const toggleSfx = useCallback(() => {
    sfx.play('ui');
    setVolumes((prev) => {
      if (prev.sfx > 0) {
        prevSfxVolRef.current = prev.sfx;
        return { ...prev, sfx: 0 };
      }
      return { ...prev, sfx: prevSfxVolRef.current > 0 ? prevSfxVolRef.current : 1.0 };
    });
  }, []);

  const [touch, setTouch] = useState(false);
  const [live, setLive] = useState<Stats>({ score: 0, meters: 0, gems: 0, coins: 0, kills: 0, combo: 0 });
  const [questRecord, setQuestRecord] = useState(() => loadQuestRecord());
  const [questRun, setQuestRun] = useState<QuestRunStats>(() => emptyQuestRunStats());
  const [questAnnouncement, setQuestAnnouncement] = useState(0);
  const [questToast, setQuestToast] = useState<string[]>([]);
  const [restartHint, setRestartHint] = useState(false);
  const questCommittedRef = useRef(true);
  const questToastSeenRef = useRef(new Set<string>());
  const questShareBusyRef = useRef(false);
  /** Day the current run started — the whole run commits to this day. */
  const startDayKeyRef = useRef<string | null>(null);
  const restartHintTimer = useRef(0);
  const questRecordCache = useRef<{ day: string; record: QuestRecord } | null>(null);
  const quests = getDailyQuests(questRecord.date);

  /** Parsed quest record, cached per day so the hot path (every 10 frames
   *  during play) never hits localStorage again. */
  const readQuestRecord = (day?: string) => {
    const key = day ?? todayKey();
    const cached = questRecordCache.current;
    if (cached && cached.day === key) return cached.record;
    const record = day ? loadQuestRecord(day) : loadQuestRecord();
    questRecordCache.current = { day: key, record };
    return record;
  };

  const [equippedSkin, setEquippedSkin] = useState<SkinId>(() => loadEquippedSkin());
  const [unlockedSkins, setUnlockedSkins] = useState<SkinId[]>(() => loadUnlockedSkins());
  const [lifetimeStats, setLifetimeStats] = useState<LifetimeStats>(() => loadLifetimeStats());
  const [skinsModalOpen, setSkinsModalOpen] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [skinToast, setSkinToast] = useState<string | null>(null);
  const [unlockedSkinPopup, setUnlockedSkinPopup] = useState<SkinId | null>(null);
  const skinToastTimer = useRef(0);

  const triggerSkinToast = useCallback((name: string, skinId?: SkinId) => {
    setSkinToast(name);
    if (skinId) setUnlockedSkinPopup(skinId);
    window.clearTimeout(skinToastTimer.current);
    skinToastTimer.current = window.setTimeout(() => setSkinToast(null), 3500);
  }, []);

  // Konami Code listener
  useEffect(() => {
    const cleanup = inputManager.onKonami(() => {
      const currentUnlocked = loadUnlockedSkins();
      if (!currentUnlocked.includes('question')) {
        const next = [...currentUnlocked, 'question' as SkinId];
        saveUnlockedSkins(next);
        setUnlockedSkins(next);
        setEquippedSkin('question');
        saveEquippedSkin('question');
        gameRef.current?.setSkin('question');
        sfx.play('gem');
        triggerSkinToast('??? (QUESTION MARK)', 'question');
      }
    });
    return () => {
      cleanup();
    };
  }, [triggerSkinToast]);

  // Sync active skin to gameRef
  useEffect(() => {
    if (gameRef.current) {
      gameRef.current.setSkin(equippedSkin);
    }
  }, [equippedSkin]);

  const [swUpdate, setSwUpdate] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    const registerSW = async () => {
      try {
        const reg = await navigator.serviceWorker.register('./sw.js');
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setSwUpdate(reg);
            }
          });
        });
        if (reg.waiting && navigator.serviceWorker.controller) {
          setSwUpdate(reg);
        }
      } catch {}
    };
    window.addEventListener('load', registerSW);
    return () => window.removeEventListener('load', registerSW);
  }, []);

  const handleApplyUpdate = useCallback(() => {
    if (swUpdate?.waiting) {
      swUpdate.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    window.location.reload();
  }, [swUpdate]);

  useEffect(() => {
    // Listen for pointer-capability changes (hybrid devices) instead of
    // sampling once at mount.
    const mq = window.matchMedia('(pointer: coarse)');
    const apply = () => setTouch(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    setMusicVolume(volumes.music);
    setSfxVolume(volumes.sfx);
    sfx.setMusicMuted(volumes.music === 0);
    sfx.setSfxMuted(volumes.sfx === 0);
    saveVolumes(volumes);
  }, [volumes]);

  // Main-menu, Locker, & Pause-menu sounds and music sound muffled.
  useEffect(() => {
    sfx.setMuffled(ui === 'start' || ui === 'paused' || skinsModalOpen);
  }, [ui, skinsModalOpen]);

  useEffect(() => {
    if (questAnnouncement === 0) return;
    const timer = window.setTimeout(() => setQuestAnnouncement(0), 5000);
    return () => window.clearTimeout(timer);
  }, [questAnnouncement]);

  useEffect(() => {
    if (questToast.length === 0) return;
    const timer = window.setTimeout(() => setQuestToast([]), 5000);
    return () => window.clearTimeout(timer);
  }, [questToast]);

  // Browsers only let audio start after a user gesture — resume the context
  // on the first one so music/SFX are never silently blocked.
  useEffect(() => {
    const unlockOnce = () => {
      unlock();
      setMusicVolume(volumes.music);
      setSfxVolume(volumes.sfx);
      sfx.setMusicMuted(volumes.music === 0);
      sfx.setSfxMuted(volumes.sfx === 0);
      sfx.setMuffled(ui === 'start' || ui === 'paused' || skinsModalOpen);
    };
    window.addEventListener('pointerdown', unlockOnce);
    window.addEventListener('keydown', unlockOnce);
    return () => {
      window.removeEventListener('pointerdown', unlockOnce);
      window.removeEventListener('keydown', unlockOnce);
    };
  }, [ui, skinsModalOpen, volumes]);

  useEffect(() => {
    return () => {
      dispose();
      window.clearTimeout(restartHintTimer.current);
    };
  }, []);

  /* --------------------------------------------------------------- actions */
  const commitQuestRun = useCallback(() => {
    if (questCommittedRef.current) return;
    const g = gameRef.current;
    if (!g) return;
    const startDay = startDayKeyRef.current;
    const before = readQuestRecord(startDay ?? undefined);
    const run = g.getQuestRunStats();
    if (startDay) commitQuestRunRecord(run, startDay);
    else commitQuestRunRecord(run);
    const after = startDay ? loadQuestRecord(startDay) : loadQuestRecord();
    questRecordCache.current = { day: startDay ?? todayKey(), record: after };
    const newlyCompleted = after.completed.filter((id) => !before.completed.includes(id) && !questToastSeenRef.current.has(id));
    if (newlyCompleted.length > 0) {
      newlyCompleted.forEach((id) => questToastSeenRef.current.add(id));
      setQuestToast(newlyCompleted);
    }
    setQuestRecord(after);
    setQuestRun(emptyQuestRunStats());
    questCommittedRef.current = true;
  }, []);

  const handleQuestProgress = useCallback((run: QuestRunStats) => {
    const record = readQuestRecord(startDayKeyRef.current ?? undefined);
    const definitions = getDailyQuests(record.date);
    const newlyCompleted = definitions
      .filter((quest) => !record.completed.includes(quest.id) && !questToastSeenRef.current.has(quest.id))
      .filter((quest) => getQuestProgress(quest, record, run).done)
      .map((quest) => quest.id);
    if (newlyCompleted.length === 0) return;
    newlyCompleted.forEach((id) => questToastSeenRef.current.add(id));
    const next = markQuestCompletions(record, definitions, newlyCompleted);
    saveQuestRecord(next);
    questRecordCache.current = { day: record.date, record: next };
    setQuestRecord(next);
    setQuestToast(newlyCompleted);

    if (next.completed.length >= 3 && record.completed.length < 3) {
      const nextLifetime = { ...lifetimeStats };
      if (!nextLifetime.dailySetsDone) {
        nextLifetime.dailySets = (nextLifetime.dailySets || 0) + 1;
        nextLifetime.dailyStreak = (nextLifetime.dailyStreak || 0) + 1;
        if (nextLifetime.dailyStreak >= 15) {
          nextLifetime.dailyStreak = 15;
          nextLifetime.dailySetsDone = true;
        }
      }
      const { newUnlocks, updatedStats } = evaluateSkinUnlocks(nextLifetime);
      setLifetimeStats(updatedStats);
      if (newUnlocks.length > 0) {
        setUnlockedSkins(loadUnlockedSkins());
        triggerSkinToast(SKINS[newUnlocks[0]].name, newUnlocks[0]);
        sfx.play('gem');
      }
    }
  }, [lifetimeStats, triggerSkinToast]);

  const handleQuestRollover = useCallback(() => {
    setQuestRecord(loadQuestRecord());
    questRecordCache.current = null;
    questToastSeenRef.current.clear();
    setQuestRun(emptyQuestRunStats());
  }, []);

  /** Copy the daily-quests-clear card as an image, without opening a share sheet. */
  const handleShareQuests = useCallback(async () => {
    if (questShareBusyRef.current) return;
    const record = readQuestRecord();
    if (!record.chestOpen || record.completedAt === null) return;
    questShareBusyRef.current = true;
    try {
      if (typeof navigator.clipboard?.write !== 'function' || typeof ClipboardItem === 'undefined') {
        questShareBusyRef.current = false;
        return;
      }
      const best = loadHighScore()?.score ?? 0;
       const blob = await createQuestShareCard(record, best);
      if (!blob) {
        questShareBusyRef.current = false;
        return;
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      triggerSkinToast('SHARE CARD COPIED');
    } catch {
      // ignore clipboard failures
    } finally {
      questShareBusyRef.current = false;
    }
  }, [triggerSkinToast]);

  const scoreShareBusyRef = useRef(false);
  const handleShareScore = useCallback(async () => {
    if (scoreShareBusyRef.current) return;
    scoreShareBusyRef.current = true;
    try {
      if (typeof navigator.clipboard?.write !== 'function' || typeof ClipboardItem === 'undefined') {
        setQuestToast(['IMAGE COPY UNAVAILABLE']);
        return;
      }
      const blob = await createScoreShareCard(stats, newBest);
      if (!blob) {
        setQuestToast(['IMAGE COPY FAILED']);
        return;
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setQuestToast(['SCORE IMAGE COPIED']);
    } catch {
      setQuestToast(['IMAGE COPY FAILED']);
    } finally {
      scoreShareBusyRef.current = false;
    }
  }, [stats, best, newBest]);

  const start = useCallback(() => {
    commitQuestRun();
    questCommittedRef.current = false;
    sfx.init();
    sfx.setMusicMuted(!musicOn);
    sfx.setSfxMuted(!sfxOn);
    setMusicVolume(volumes.music);
    setSfxVolume(volumes.sfx);
    const g = gameRef.current;
    if (!g) return;
    startDayKeyRef.current = todayKey();
    let current = readQuestRecord(startDayKeyRef.current);
    current = markRunStarted(current);
    if (!current.announcementSeen || questAnnouncement > 0) {
      setQuestAnnouncement((n) => n + 1);
    }
    if (!current.announcementSeen) {
      current = markQuestAnnouncementSeen(current);
    }
    saveQuestRecord(current);
    questRecordCache.current = { day: startDayKeyRef.current, record: current };
    setQuestRecord(current);
    setRestartHint(false);
    window.clearTimeout(restartHintTimer.current);
    g.best = bestScore();
    g.startRun();
    questToastSeenRef.current.clear();
    setQuestToast([]);
    setQuestRun(emptyQuestRunStats());
    setNewBest(false);
    setUi('playing');
  }, [commitQuestRun, musicOn, sfxOn, questAnnouncement, volumes.music, volumes.sfx]);

  const showRestartHint = useCallback(() => {
    setRestartHint(true);
    window.clearTimeout(restartHintTimer.current);
    restartHintTimer.current = window.setTimeout(() => setRestartHint(false), 900);
  }, []);

  const pause = useCallback((fromUser = false) => {
    const g = gameRef.current;
    if (!g || g.phase !== 'playing') return;
    if (fromUser) sfx.play('ui');
    g.pause();
    setLive(g.stats);
    setQuestRun(g.getQuestRunStats());
    setUi('paused');
  }, []);

  const resume = useCallback(() => {
    const g = gameRef.current;
    if (!g || g.phase !== 'paused') return;
    sfx.play('start');
    g.resume();
    setUi('playing');
  }, []);

  const toMenu = useCallback(() => {
    const g = gameRef.current;
    if (g) g.toReady();
    commitQuestRun();
    setQuestRecord(loadQuestRecord());
    sfx.play('ui');
    setUi('start');
    setBest(bestScore());
  }, [commitQuestRun]);

  const handleDeath = useCallback((s: Stats) => {
    commitQuestRun();
    setQuestRecord(loadQuestRecord());
    setStats(s);
    const entry = { score: s.score, meters: s.meters, coins: s.coins ?? 0, ts: Date.now() };
    saveLastRun(entry);
    setLastRun(entry);

    // Load the stored best once and pass it through — saveHighScore would
    // otherwise re-read it internally.
    const previous = loadHighScore();
    const beatBest = s.score > 0 && (!previous || s.score > previous.score);
    if (beatBest) setBest(saveHighScore(entry, previous)?.score ?? s.score);
    setNewBest(beatBest);

    // Evaluate skin unlocks with fresh stats from storage
    const latestStats = loadLifetimeStats();
    const { newUnlocks, updatedStats } = evaluateSkinUnlocks(latestStats, {
      score: s.score,
      meters: s.meters,
      coins: s.coins ?? 0,
      gems: s.gems,
      moonPhase: s.moonPhase,
    });
    setLifetimeStats(updatedStats);
    if (newUnlocks.length > 0) {
      setUnlockedSkins(loadUnlockedSkins());
      triggerSkinToast(SKINS[newUnlocks[0]].name, newUnlocks[0]);
      sfx.play('gem');
    }

    // Run feedback prompt trigger (10 runs, then every 200 runs unless never show)
    const runCount = incrementTotalRuns();
    if (shouldShowFeedbackPrompt(runCount)) {
      setShowFeedbackModal(true);
      saveLastFeedbackPromptRun(runCount);
    }

    setUi('over');
  }, [commitQuestRun, lifetimeStats, triggerSkinToast]);

  /* -------------------------------------------------------------- auto-pause */
  // Auto pause when the page or its window loses focus
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) pause(false);
    };
    const onBlur = () => pause(false);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
    };
  }, [pause]);

  return (
    <div className="fixed inset-0 flex min-h-0 min-w-0 items-center justify-center overflow-hidden bg-[#08040f] font-pixel">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(62,242,200,0.10),transparent_60%)]" />
      <div className="relative h-full min-h-0 min-w-0 w-full">
        <GameCanvas
          gameRef={gameRef}
          ui={ui}
          showTouch={touch && ui === 'playing'}
          onDeath={handleDeath}
          onPause={() => pause(true)}
          onResume={resume}
          onStart={start}
          onToggleMute={() => {
            if (musicOn || sfxOn) {
              setVolumes({ music: 0, sfx: 0 });
            } else {
              setVolumes({
                music: prevMusicVolRef.current > 0 ? prevMusicVolRef.current : 1.0,
                sfx: prevSfxVolRef.current > 0 ? prevSfxVolRef.current : 1.0,
              });
            }
          }}
          onRestartHint={showRestartHint}
          onQuestProgress={handleQuestProgress}
          modalOpen={showFeedbackModal || skinsModalOpen || !!unlockedSkinPopup}
        />
        {restartHint && (ui === 'playing' || ui === 'paused') && (
          <div className="pointer-events-none absolute inset-x-0 top-[36%] z-30 flex justify-center">
            <div className="border-2 border-[#ff4d6d]/70 bg-[#140a26]/95 px-4 py-2 font-pixel text-[8px] text-[#ffd166] shadow-[4px_4px_0_#08040f] tablet:text-[10px]">
              PRESS R AGAIN TO RESTART
            </div>
          </div>
        )}
        {ui === 'start' && !skinsModalOpen && (
          <StartScreen
            best={best}
            lastRun={lastRun?.score ?? 0}
            onStart={start}
            touch={touch}
            musicOn={musicOn}
            sfxOn={sfxOn}
            onToggleMusic={toggleMusic}
            onToggleSfx={toggleSfx}
            quests={quests}
            questRecord={questRecord}
            questRun={questRun}
            questOnDayRollover={handleQuestRollover}
            questOnShare={handleShareQuests}
            onOpenSkins={() => {
              setLifetimeStats(loadLifetimeStats());
              setSkinsModalOpen(true);
            }}
          />
        )}
        {ui === 'paused' && (
          <PauseScreen
            stats={live}
            onResume={resume}
            onRestart={start}
            onMenu={toMenu}
            musicVol={volumes.music}
            sfxVol={volumes.sfx}
            onMusicVol={(v) => {
              if (v > 0) prevMusicVolRef.current = v;
              setVolumes((prev) => ({ ...prev, music: v }));
            }}
            onSfxVol={(v) => {
              if (v > 0) prevSfxVolRef.current = v;
              setVolumes((prev) => ({ ...prev, sfx: v }));
            }}
          />
        )}
        {ui === 'over' && (
          <GameOverScreen
            stats={stats}
            best={best}
            newBest={newBest}
            onRestart={start}
            onMenu={toMenu}
            onShare={handleShareScore}
            touch={touch}
          />
        )}
        {ui === 'playing' && questAnnouncement > 0 && (
          <DailyQuestAnnouncement quests={quests} record={questRecord} run={questRun} onDayRollover={handleQuestRollover} onShare={handleShareQuests} />
        )}
        {questToast.length > 0 && <QuestCompletionToast quests={quests} completed={questToast} touch={touch} />}
        {skinToast && (
          <div className="fixed top-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 border-2 border-[#ffd166] bg-[#140a26]/95 px-4 py-2 font-pixel text-[#ffd166] shadow-[4px_4px_0_#08040f]">
            <span className="text-[8px] tablet:text-[10px]">★ NEW SKIN UNLOCKED: {skinToast} ★</span>
          </div>
        )}
        {unlockedSkinPopup && (
          <SkinUnlockModal
            skinId={unlockedSkinPopup}
            onEquip={(id) => {
              setEquippedSkin(id);
              saveEquippedSkin(id);
              gameRef.current?.setSkin(id);
            }}
            onClose={() => setUnlockedSkinPopup(null)}
          />
        )}
        {skinsModalOpen && (
          <SkinsModal
            equippedSkin={equippedSkin}
            unlockedSkins={unlockedSkins}
            lifetimeStats={lifetimeStats}
            onEquip={(id) => setEquippedSkin(id)}
            onUpdateUnlocked={(unlocked, nextStats) => {
              setUnlockedSkins(unlocked);
              setLifetimeStats(nextStats);
            }}
            onClose={() => setSkinsModalOpen(false)}
            touch={touch}
          />
        )}
        {showFeedbackModal && (
          <FeedbackModal onClose={() => setShowFeedbackModal(false)} />
        )}
        {swUpdate && ui !== 'playing' && (
          <div className="fixed bottom-3 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2.5 border-2 border-[#ffd166] bg-[#140a26]/95 px-3 py-1.5 font-pixel text-[#ffd166] shadow-[3px_3px_0_#08040f]">
            <span className="text-[7px] tablet:text-[9px]">⚡ UPDATE READY</span>
            <button
              type="button"
              onClick={handleApplyUpdate}
              className="border border-[#ffd166] bg-[#ffd166]/20 px-2 py-0.5 text-[7px] text-[#ffffff] transition-colors hover:bg-[#ffd166]/40 tablet:text-[9px]"
            >
              RELOAD
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
