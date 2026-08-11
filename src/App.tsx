import { useCallback, useEffect, useRef, useState } from 'react';
import GameCanvas from './components/GameCanvas';
import { GameOverScreen, PauseScreen, StartScreen } from './components/Overlays';
import { Game, type Stats } from './game/engine';
import { sfx } from './game/audio';
import { bestScore, loadHighScore, saveHighScore } from './game/storage';

type UI = 'start' | 'playing' | 'paused' | 'over';

const MUTE_KEY = 'pixeldash.muted';

export default function App() {
  const gameRef = useRef<Game | null>(null);
  const [ui, setUi] = useState<UI>('start');
  const [stats, setStats] = useState<Stats>({ score: 0, meters: 0, coins: 0, kills: 0, combo: 0 });
  const [best, setBest] = useState(() => bestScore());
  const [newBest, setNewBest] = useState(false);
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [touch, setTouch] = useState(false);
  const [live, setLive] = useState({ score: 0, meters: 0 });

  useEffect(() => {
    setTouch(window.matchMedia('(pointer: coarse)').matches);
  }, []);

  useEffect(() => {
    sfx.setMuted(muted);
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {}
  }, [muted]);

  /* --------------------------------------------------------------- actions */
  const start = useCallback(() => {
    sfx.init();
    sfx.setMuted(muted);
    const g = gameRef.current;
    if (!g) return;
    g.best = bestScore();
    g.startRun();
    setNewBest(false);
    setUi('playing');
  }, [muted]);

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

  /* -------------------------------------------------------------- keyboard */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const code = e.code;
      if (code === 'KeyM') {
        setMuted((m) => !m);
        return;
      }
      if (ui === 'start') {
        if (code === 'Space' || code === 'Enter' || code === 'KeyW' || code === 'ArrowUp') start();
        return;
      }
      if (ui === 'playing') {
        if (code === 'Escape' || code === 'KeyP') pause();
        else if (code === 'KeyR') start();
        return;
      }
      if (ui === 'paused') {
        if (code === 'Escape' || code === 'KeyP' || code === 'Space' || code === 'Enter') resume();
        else if (code === 'KeyR') start();
        return;
      }
      if (ui === 'over') {
        if (code === 'Space' || code === 'Enter' || code === 'KeyR' || code === 'ArrowUp') start();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ui, start, pause, resume]);

  /* ------------------------------------------------------------ auto-pause */
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
        <GameCanvas gameRef={gameRef} onDeath={handleDeath} onPause={pause} showTouch={touch && ui === 'playing'} />

        {ui === 'start' && (
          <StartScreen best={best} onStart={start} touch={touch} />
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
