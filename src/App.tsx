import { useCallback, useEffect, useRef, useState } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { GameOverScreen, PauseScreen, StartScreen } from './components/Overlays';
import { DailyQuestAnnouncement, QuestCompletionToast } from './components/QuestPanels';
import { type UI } from './components/useGameInput';
import { Game, type Stats } from './game/engine';
import { dispose, setMusicVolume, setSfxVolume, sfx, unlock } from './game/audio';
import { drawText, drawTextCentered, textWidth } from './game/font';
import { bestScore, loadHighScore, loadLastRun, loadVolumes, saveHighScore, saveLastRun, saveVolumes } from './game/storage';
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

const MUSIC_KEY = 'pixeldash.music';
const SFX_KEY = 'pixeldash.sfx';
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

  drawTextCentered(context, 'https://jimm144.github.io/pixel-run/', QUEST_SHARE_WIDTH / 2, 426, 2, '#6f5fa8', undefined, false);

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
  const [stats, setStats] = useState<Stats>({ score: 0, meters: 0, coins: 0, kills: 0, combo: 0 });
  const [best, setBest] = useState(() => bestScore());
  const [lastRun, setLastRun] = useState(() => loadLastRun());
  const [newBest, setNewBest] = useState(false);
  const [musicOn, setMusicOn] = useState(() => {
    try {
      return localStorage.getItem(MUSIC_KEY) !== '0';
    } catch {
      return true;
    }
  });
  const [sfxOn, setSfxOn] = useState(() => {
    try {
      return localStorage.getItem(SFX_KEY) !== '0';
    } catch {
      return true;
    }
  });
  const [touch, setTouch] = useState(false);
  const [live, setLive] = useState<Stats>({ score: 0, meters: 0, coins: 0, kills: 0, combo: 0 });
  const [volumes, setVolumes] = useState(() => loadVolumes());
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
    sfx.setMusicMuted(!musicOn);
    try {
      localStorage.setItem(MUSIC_KEY, musicOn ? '1' : '0');
    } catch {}
  }, [musicOn]);

  useEffect(() => {
    sfx.setSfxMuted(!sfxOn);
    try {
      localStorage.setItem(SFX_KEY, sfxOn ? '1' : '0');
    } catch {}
  }, [sfxOn]);

  useEffect(() => {
    setMusicVolume(volumes.music);
    setSfxVolume(volumes.sfx);
    saveVolumes(volumes);
  }, [volumes]);

  // Main-menu SFX (button clicks, toggles) sound muffled — like the music.
  useEffect(() => {
    sfx.setMuffled(ui === 'start');
  }, [ui]);

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
    const unlockOnce = () => unlock();
    window.addEventListener('pointerdown', unlockOnce);
    window.addEventListener('keydown', unlockOnce);
    return () => {
      window.removeEventListener('pointerdown', unlockOnce);
      window.removeEventListener('keydown', unlockOnce);
    };
  }, []);

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
  }, []);

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
        setQuestToast(['IMAGE COPY UNAVAILABLE']);
        return;
      }
      const blob = await createQuestShareCard(record, best);
      if (!blob) {
        setQuestToast(['IMAGE COPY FAILED']);
        return;
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setQuestToast(['IMAGE COPIED']);
    } catch {
      setQuestToast(['IMAGE COPY FAILED']);
    } finally {
      questShareBusyRef.current = false;
    }
  }, [best]);

  const start = useCallback(() => {
    commitQuestRun();
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
    questCommittedRef.current = false;
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

  const pause = useCallback((feedback = true) => {
    const g = gameRef.current;
    if (!g || g.phase !== 'playing') return;
    g.pause();
    setLive(g.stats);
    setQuestRun(g.getQuestRunStats());
    setUi('paused');
    if (feedback) sfx.play('ui');
  }, []);

  const resume = useCallback(() => {
    gameRef.current?.resume();
    setUi('playing');
    sfx.play('ui');
  }, []);

  const toMenu = useCallback(() => {
    commitQuestRun();
    gameRef.current?.toReady();
    setQuestRun(emptyQuestRunStats());
    setUi('start');
    setBest(bestScore());
    sfx.play('ui');
  }, [commitQuestRun]);

  const handleDeath = useCallback((s: Stats) => {
    commitQuestRun();
    setStats(s);
    const entry = { score: s.score, meters: s.meters, coins: s.coins, ts: Date.now() };
    setLastRun(saveLastRun(entry));
    // Load the stored best once and pass it through — saveHighScore would
    // otherwise re-read it internally.
    const previous = loadHighScore();
    const beatBest = s.score > 0 && (!previous || s.score > previous.score);
    if (beatBest) setBest(saveHighScore(entry, previous)?.score ?? s.score);
    setNewBest(beatBest);
    setUi('over');
  }, [commitQuestRun]);

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
          onPause={pause}
          onResume={resume}
          onStart={start}
          onToggleMute={() => {
            const bothOff = !musicOn && !sfxOn;
            setMusicOn(bothOff ? true : !musicOn);
            setSfxOn(bothOff ? true : !sfxOn);
          }}
          onRestartHint={showRestartHint}
          onQuestProgress={handleQuestProgress}
        />

        {restartHint && (ui === 'playing' || ui === 'paused') && (
          <div className="pointer-events-none absolute inset-x-0 top-[36%] z-30 flex justify-center">
            <div className="border-2 border-[#ff4d6d]/70 bg-[#140a26]/95 px-4 py-2 font-pixel text-[8px] text-[#ffd166] shadow-[4px_4px_0_#08040f] tablet:text-[10px]">
              PRESS R AGAIN TO RESTART
            </div>
          </div>
        )}

        {ui === 'start' && (
          <StartScreen
            best={best}
            lastRun={lastRun?.score ?? 0}
            onStart={start}
            touch={touch}
            musicOn={musicOn}
            sfxOn={sfxOn}
            onToggleMusic={() => setMusicOn((v) => !v)}
            onToggleSfx={() => setSfxOn((v) => !v)}
            quests={quests}
            questRecord={questRecord}
            questRun={questRun}
            questOnDayRollover={handleQuestRollover}
            questOnShare={handleShareQuests}
          />
        )}
        {ui === 'paused' && (
          <PauseScreen
            onResume={resume}
            onRestart={start}
            onQuit={toMenu}
            stats={live}
            musicVol={volumes.music}
            sfxVol={volumes.sfx}
            onMusicVol={(v) => setVolumes((prev) => ({ ...prev, music: v }))}
            onSfxVol={(v) => setVolumes((prev) => ({ ...prev, sfx: v }))}
          />
        )}
        {ui === 'over' && (
          <GameOverScreen
            stats={stats}
            best={best}
            newBest={newBest}
            onRestart={start}
            onMenu={toMenu}
            touch={touch}
          />
        )}
        {ui === 'playing' && questAnnouncement > 0 && (
          <DailyQuestAnnouncement quests={quests} record={questRecord} run={questRun} onDayRollover={handleQuestRollover} onShare={handleShareQuests} />
        )}
        {questToast.length > 0 && <QuestCompletionToast quests={quests} completed={questToast} touch={touch} />}
      </div>
    </div>
  );
}
