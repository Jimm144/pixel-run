import { useCallback, useEffect, useRef, useState } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { GameOverScreen, PauseScreen, StartScreen } from './components/Overlays';
import { DailyQuestAnnouncement, QuestCompletionToast } from './components/QuestPanels';
import { type UI } from './components/useGameInput';
import { Game, type Stats } from './game/engine';
import { sfx } from './game/audio';
import { bestScore, loadHighScore, loadLastRun, saveHighScore, saveLastRun } from './game/storage';
import {
  applyQuestRun,
  emptyQuestRunStats,
  getDailyQuests,
  getQuestProgress,
  loadQuestRecord,
  markQuestAnnouncementSeen,
  markQuestCompletions,
  saveQuestRecord,
  type QuestRunStats,
} from './game/quests';

const MUSIC_KEY = 'pixeldash.music';
const SFX_KEY = 'pixeldash.sfx';

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
  const [live, setLive] = useState({ score: 0, meters: 0 });
  const [questRecord, setQuestRecord] = useState(() => loadQuestRecord());
  const [questRun, setQuestRun] = useState<QuestRunStats>(() => emptyQuestRunStats());
  const [questAnnouncement, setQuestAnnouncement] = useState(false);
  const [questToast, setQuestToast] = useState<string[]>([]);
  const questCommittedRef = useRef(true);
  const questToastSeenRef = useRef(new Set<string>());
  const quests = getDailyQuests(questRecord.date);

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

  // Main-menu SFX (button clicks, toggles) sound muffled — like the music.
  useEffect(() => {
    sfx.setMuffled(ui === 'start');
  }, [ui]);

  useEffect(() => {
    if (!questAnnouncement) return;
    const timer = window.setTimeout(() => setQuestAnnouncement(false), 5000);
    return () => window.clearTimeout(timer);
  }, [questAnnouncement]);

  useEffect(() => {
    if (questToast.length === 0) return;
    const timer = window.setTimeout(() => setQuestToast([]), 5000);
    return () => window.clearTimeout(timer);
  }, [questToast]);

  /* --------------------------------------------------------------- actions */
  const commitQuestRun = useCallback(() => {
    if (questCommittedRef.current) return;
    const g = gameRef.current;
    if (!g) return;
    const current = loadQuestRecord();
    const next = applyQuestRun(current, getDailyQuests(current.date), g.getQuestRunStats());
    const newlyCompleted = next.completed.filter((id) => !current.completed.includes(id) && !questToastSeenRef.current.has(id));
    if (newlyCompleted.length > 0) {
      newlyCompleted.forEach((id) => questToastSeenRef.current.add(id));
      setQuestToast(newlyCompleted);
    }
    saveQuestRecord(next);
    setQuestRecord(next);
    setQuestRun(emptyQuestRunStats());
    questCommittedRef.current = true;
  }, []);

  const handleQuestProgress = useCallback((run: QuestRunStats) => {
    const record = loadQuestRecord();
    const definitions = getDailyQuests(record.date);
    const newlyCompleted = definitions
      .filter((quest) => !record.completed.includes(quest.id) && !questToastSeenRef.current.has(quest.id))
      .filter((quest) => getQuestProgress(quest, record, run).done)
      .map((quest) => quest.id);
    if (newlyCompleted.length === 0) return;
    newlyCompleted.forEach((id) => questToastSeenRef.current.add(id));
    const next = markQuestCompletions(record, definitions, newlyCompleted);
    saveQuestRecord(next);
    setQuestRecord(next);
    setQuestToast(newlyCompleted);
  }, []);

  const start = useCallback(() => {
    commitQuestRun();
    sfx.init();
    sfx.setMusicMuted(!musicOn);
    sfx.setSfxMuted(!sfxOn);
    const g = gameRef.current;
    if (!g) return;
    let current = loadQuestRecord();
    if (!current.announcementSeen) {
      current = markQuestAnnouncementSeen(current);
      saveQuestRecord(current);
      setQuestAnnouncement(true);
    }
    setQuestRecord(current);
    g.best = bestScore();
    g.startRun();
    questCommittedRef.current = false;
    questToastSeenRef.current.clear();
    setQuestToast([]);
    setQuestRun(emptyQuestRunStats());
    setNewBest(false);
    setUi('playing');
  }, [commitQuestRun, musicOn, sfxOn]);

  const pause = useCallback((feedback = true) => {
    const g = gameRef.current;
    if (!g || g.phase !== 'playing') return;
    g.pause();
    setLive({ score: g.score, meters: g.stats.meters });
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
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-[#08040f] font-pixel">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(62,242,200,0.10),transparent_60%)]" />
      <div className="relative h-full w-full max-w-[1600px]">
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
          onQuestProgress={handleQuestProgress}
        />

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
          />
        )}
        {ui === 'paused' && (
          <PauseScreen
            onResume={resume}
            onRestart={start}
            onQuit={toMenu}
            score={live.score}
            meters={live.meters}
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
        {ui === 'playing' && questAnnouncement && (
          <DailyQuestAnnouncement quests={quests} record={questRecord} run={questRun} />
        )}
        {questToast.length > 0 && <QuestCompletionToast quests={quests} completed={questToast} touch={touch} />}
      </div>
    </div>
  );
}
