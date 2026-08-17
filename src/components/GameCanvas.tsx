import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { BASE_VW, Game, setViewportSize, VH, VW, type Stats } from '../game/engine';
import { PauseIcon } from './ui';
import type { QuestRunStats } from '../game/quests';
import { useGameInput, type UI } from './useGameInput';

interface Props {
  gameRef: RefObject<Game | null>;
  onDeath: (s: Stats) => void;
  onPause: () => void;
  onResume: () => void;
  onStart: () => void;
  onToggleMute: () => void;
  onRestartHint: () => void;
  onQuestProgress: (stats: QuestRunStats) => void;
  ui: UI;
  showTouch: boolean;
  modalOpen?: boolean;
}

export function GameCanvas({ gameRef, onDeath, onPause, onResume, onStart, onToggleMute, onRestartHint, onQuestProgress, ui, showTouch, modalOpen }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** Zone accent for the touch pause button — follows the biome. */
  const [biomeAccent, setBiomeAccent] = useState('#3ef2c8');
  const lastZoneName = useRef('');
  /** True while the 3-2-1 countdown dims the scene — buttons dim too. */
  const [counting, setCounting] = useState(false);
  const countingRef = useRef(false);
  const questProgressRef = useRef(onQuestProgress);

  useEffect(() => {
    questProgressRef.current = onQuestProgress;
  }, [onQuestProgress]);

  const { wrapHandlers, diveHandlers, pauseHandlers } = useGameInput({
    gameRef,
    ui,
    modalOpen,
    onStart,
    onPause,
    onResume,
    onToggleMute,
    onRestartHint,
  });

  /* ---------------------------------------------------- engine + main loop */
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d', { alpha: false })!;
    ctx.imageSmoothingEnabled = false;
    const game = new Game(ctx);
    // onDeath is a stable useCallback in App — closing over it here is safe.
    game.onDeath = onDeath;
    gameRef.current = game;

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let wasPaused = false;
    const STEP = 1000 / 60;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      let dt = t - last;
      last = t;
      const paused = game.phase === 'paused';
      if (paused) {
        acc = 0;
      } else {
        if (dt > 250) dt = 250;
        acc += dt;
        let n = 0;
        while (acc >= STEP && n < 5) {
          game.step();
          acc -= STEP;
          n++;
        }
        if (acc > STEP) acc = 0;
      }
      // A paused run is visually static, so avoid repainting the whole scene
      // at 60 Hz. Render the transition frame once for the pause overlay.
      if (!paused || !wasPaused) game.render();
      wasPaused = paused;
      // The React state mirrors (zone accent, countdown dim) only change at
      // zone/countdown transitions; check them on a slow cadence instead of
      // every frame so the game loop never drives 60 Hz re-renders. While
      // paused the world is frozen, so skipping the check is safe.
      if (game.frame % 10 === 0) {
        // Biome accent for the touch pause button — flips when the zone flips.
        if (game.zone.name !== lastZoneName.current) {
          lastZoneName.current = game.zone.name;
          setBiomeAccent(game.zone.accent);
        }
        // Dim the touch buttons while the countdown dims the scene.
        const countingNow = game.countdown > 0 || game.goTimer > 0;
        if (countingNow !== countingRef.current) {
          countingRef.current = countingNow;
          setCounting(countingNow);
        }
        if (game.phase === 'playing') questProgressRef.current(game.getQuestRunStats());
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      // Drop the ref so the unmounted Game can be collected and stale
      // listeners (pointerup etc.) never find an orphaned instance.
      gameRef.current = null;
    };
  }, [gameRef]);

  /* -------------------------------------------------------------- fit size */
  useEffect(() => {
    let fitFrame = 0;

    const fit = () => {
      const wrap = wrapRef.current;
      const cv = canvasRef.current;
      if (!wrap || !cv) return;
      const r = wrap.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return;

      // Derive the buffer from the wrapper's actual aspect ratio. This keeps
      // desktop resizes and mobile browser-chrome changes in sync instead of
      // relying on a stale orientation bucket.
      const portrait = typeof window.matchMedia === 'function'
        ? window.matchMedia('(orientation: portrait)').matches
        : r.height > r.width;
      const w = portrait ? 240 : BASE_VW;
      const ratio = portrait
        ? Math.min(2.38, Math.max(1.15, r.height / r.width))
        : Math.min(1.35, Math.max(0.42, r.height / r.width));
      const h = Math.round(w * ratio);
      const sizeChanged = w !== VW || h !== VH;
      if (sizeChanged) {
        setViewportSize(w, h);
        cv.width = VW;
        cv.height = VH;
        const ctx = cv.getContext('2d');
        if (ctx) ctx.imageSmoothingEnabled = false;
        gameRef.current?.invalidateViewport();
        gameRef.current?.render();
      }

      const s = Math.min(r.width / VW, r.height / VH);
      // Use one scale for both dimensions. Pixelated rendering keeps the
      // enlarged bitmap hard-edged without shrinking the playfield to an
      // integer-only desktop scale.
      const displayWidth = Math.round(VW * s);
      const displayHeight = Math.round(VH * s);
      cv.style.width = `${displayWidth}px`;
      cv.style.height = `${displayHeight}px`;
      cv.style.left = `${Math.round((r.width - displayWidth) / 2)}px`;
      cv.style.top = `${Math.round((r.height - displayHeight) / 2)}px`;
      cv.style.transform = 'none';
      cv.style.translate = 'none';
      // Keep the HUD at a crisp 1:1 pixel scale on all devices
      gameRef.current?.setHudScale(1);
      // Mobile layout: compact score, world lifted higher
      // and parallax planes spread out — all desktop views stay untouched.
      const coarse = window.matchMedia('(pointer: coarse)').matches;
      gameRef.current?.setMobileView(coarse);
    };

    let settleTimer = 0;
    const scheduleFit = () => {
      window.cancelAnimationFrame(fitFrame);
      window.clearTimeout(settleTimer);
      fitFrame = window.requestAnimationFrame(() => {
        fitFrame = 0;
        settleTimer = window.setTimeout(() => {
          settleTimer = 0;
          fit();
        }, 120);
      });
    };
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleFit) : null;
    if (observer && wrapRef.current) observer.observe(wrapRef.current);
    window.addEventListener('resize', scheduleFit);
    window.addEventListener('orientationchange', scheduleFit);
    window.visualViewport?.addEventListener('resize', scheduleFit);
    scheduleFit();
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', scheduleFit);
      window.removeEventListener('orientationchange', scheduleFit);
      window.visualViewport?.removeEventListener('resize', scheduleFit);
      window.cancelAnimationFrame(fitFrame);
      window.clearTimeout(settleTimer);
    };
  }, [gameRef]);

  return (
    <div
      ref={wrapRef}
      className="relative flex h-full min-h-0 min-w-0 w-full touch-none select-none items-center justify-center overflow-hidden"
      {...wrapHandlers}
    >
      <canvas
        ref={canvasRef}
        width={VW}
        height={VH}
        className="absolute block h-full max-h-none max-w-none w-full"
        style={{ imageRendering: 'pixelated' }}
      />
      <div className="pointer-events-none absolute inset-0 scanlines" />
      <div className="pointer-events-none absolute inset-0 vignette" />

      {showTouch && (
        <>
          <div className="absolute top-4 right-4 z-20 tablet:top-8 tablet:right-8">
            <button
              type="button"
              aria-label="Pause"
              style={{ borderColor: biomeAccent, color: biomeAccent, opacity: counting ? 0.35 : 0.75 }}
              className="relative flex h-12 w-12 items-center justify-center border-2 bg-[#140a26]/80 shadow-[4px_4px_0_#08040f] transition-[transform,box-shadow] duration-75 active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#08040f] tablet:h-16 tablet:w-16"
              {...pauseHandlers}
            >
              <span className="pointer-events-none absolute -top-[4px] -left-[4px] h-2 w-2" style={{ backgroundColor: biomeAccent }} />
              <span className="pointer-events-none absolute -top-[4px] -right-[4px] h-2 w-2" style={{ backgroundColor: biomeAccent }} />
              <span className="pointer-events-none absolute -bottom-[4px] -left-[4px] h-2 w-2" style={{ backgroundColor: biomeAccent }} />
              <span className="pointer-events-none absolute -bottom-[4px] -right-[4px] h-2 w-2" style={{ backgroundColor: biomeAccent }} />
              <PauseIcon className="h-5 w-5 tablet:h-6 tablet:w-6" />
            </button>
          </div>
          <div className="absolute bottom-4 left-4 z-20 tablet:bottom-8 tablet:left-8">
            <button
              type="button"
              aria-label="Dive"
              style={{ borderColor: '#ffd166', color: '#ffd166', opacity: counting ? 0.35 : 0.75 }}
              className="relative flex h-16 w-16 items-center justify-center border-2 bg-[#140a26]/80 shadow-[4px_4px_0_#08040f] transition-[transform,box-shadow] duration-75 active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#08040f] tablet:h-20 tablet:w-20"
              {...diveHandlers}
            >
              <span className="pointer-events-none absolute -top-[4px] -left-[4px] h-2 w-2 bg-[#ffd166]" />
              <span className="pointer-events-none absolute -top-[4px] -right-[4px] h-2 w-2 bg-[#ffd166]" />
              <span className="pointer-events-none absolute -bottom-[4px] -left-[4px] h-2 w-2 bg-[#ffd166]" />
              <span className="pointer-events-none absolute -bottom-[4px] -right-[4px] h-2 w-2 bg-[#ffd166]" />
              <svg aria-hidden="true" viewBox="0 0 32 32" className="h-9 w-9 tablet:h-12 tablet:w-12" fill="currentColor" shapeRendering="crispEdges">
                <path d="M12 4h8v14h7L16 29 5 18h7V4z" />
              </svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
