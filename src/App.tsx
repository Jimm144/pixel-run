import { useCallback, useEffect, useRef, useState } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { GameOverScreen, PauseScreen, StartScreen } from './components/Overlays';
import { type UI } from './components/useGameInput';
import { Game, type Stats } from './game/engine';
import { sfx } from './game/audio';
import { bestScore, loadHighScore, loadLastRun, saveHighScore, saveLastRun } from './game/storage';

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

  useEffect(() => {
    setTouch(window.matchMedia('(pointer: coarse)').matches);
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

  /* --------------------------------------------------------------- actions */
  const start = useCallback(() => {
    sfx.init();
    sfx.setMusicMuted(!musicOn);
    sfx.setSfxMuted(!sfxOn);
    const g = gameRef.current;
    if (!g) return;
    g.best = bestScore();
    g.startRun();
    setNewBest(false);
    setUi('playing');
  }, [musicOn, sfxOn]);

  const pause = useCallback((feedback = true) => {
    const g = gameRef.current;
    if (!g || g.phase !== 'playing') return;
    g.pause();
    setLive({ score: g.score, meters: g.stats.meters });
    setUi('paused');
    if (feedback) sfx.play('ui');
  }, []);

  const resume = useCallback(() => {
    gameRef.current?.resume();
    setUi('playing');
    sfx.play('ui');
  }, []);

  const toMenu = useCallback(() => {
    gameRef.current?.toReady();
    setUi('start');
    setBest(bestScore());
    sfx.play('ui');
  }, []);

  const handleDeath = useCallback((s: Stats) => {
    setStats(s);
    setLastRun(saveLastRun({ score: s.score, meters: s.meters, coins: s.coins, ts: Date.now() }));
    const previous = loadHighScore();
    const beatBest = !previous || s.score > previous.score;
    if (beatBest && s.score > 0) {
      const saved = saveHighScore({
        score: s.score,
        meters: s.meters,
        coins: s.coins,
        ts: Date.now(),
      });
      setBest(saved?.score ?? s.score);
    }
    setNewBest(beatBest && s.score > 0);
    setUi('over');
  }, []);

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
      </div>
    </div>
  );
}
