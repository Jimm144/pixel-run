import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { BASE_VW, Game, setViewportSize, VH, VW, type Stats } from '../game/engine';
import { useGameInput, type UI } from './useGameInput';

interface Props {
  gameRef: RefObject<Game | null>;
  onDeath: (s: Stats) => void;
  onPause: () => void;
  onResume: () => void;
  onStart: () => void;
  onToggleMute: () => void;
  ui: UI;
  showTouch: boolean;
}

export function GameCanvas({ gameRef, onDeath, onPause, onResume, onStart, onToggleMute, ui, showTouch }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<{ portrait: boolean; w: number; h: number } | null>(null);

  const { wrapHandlers, diveHandlers, pauseHandlers } = useGameInput({
    gameRef,
    ui,
    onStart,
    onPause,
    onResume,
    onToggleMute,
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
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [gameRef]);

  /* -------------------------------------------------------------- fit size */
  useEffect(() => {
    const fit = () => {
      const wrap = wrapRef.current;
      const cv = canvasRef.current;
      if (!wrap || !cv) return;
      const r = wrap.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return;

      const applySize = (w: number, h: number) => {
        if (w === VW && h === VH) return;
        setViewportSize(w, h);
        cv.width = VW;
        cv.height = VH;
        const ctx = cv.getContext('2d');
        if (ctx) ctx.imageSmoothingEnabled = false;
        gameRef.current?.invalidateViewport();
        gameRef.current?.render();
      };

      // Use the browser's orientation bucket instead of a ratio threshold;
      // mobile address-bar resizing must not randomly change the game zoom.
      const portrait = window.matchMedia('(orientation: portrait)').matches;

      // Lock the internal buffer for the current orientation. Mobile browser
      // chrome resizes the wrapper while it expands/collapses; recomputing
      // from that changing height would cause random zoom and vertical world
      // shifts, so only rebuild after an orientation switch.
      let viewport = viewportRef.current;
      if (!viewport || viewport.portrait !== portrait) {
        const w = portrait ? 260 : BASE_VW;
        const ratio = portrait
          ? Math.min(2.2, Math.max(1.45, r.height / r.width))
          : Math.min(1.15, Math.max(0.55, r.height / r.width));
        const h = Math.round(w * ratio);
        viewport = { portrait, w, h };
        viewportRef.current = viewport;
      }
      applySize(viewport.w, viewport.h);

      const s = Math.min(r.width / VW, r.height / VH);
      cv.style.width = Math.round(VW * s) + 'px';
      cv.style.height = Math.round(VH * s) + 'px';
    };
    fit();
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', fit);
    return () => {
      window.removeEventListener('resize', fit);
      window.removeEventListener('orientationchange', fit);
    };
  }, [gameRef]);

  return (
    <div
      ref={wrapRef}
      className="relative flex h-full w-full touch-none select-none items-center justify-center overflow-hidden"
      {...wrapHandlers}
    >
      <canvas
        ref={canvasRef}
        width={VW}
        height={VH}
        className="block"
        style={{ imageRendering: 'pixelated' }}
      />
      <div className="pointer-events-none absolute inset-0 scanlines" />
      <div className="pointer-events-none absolute inset-0 vignette" />

      {showTouch && (
        <>
          <button
            type="button"
            aria-label="Pause"
            className="absolute top-4 right-4 z-20 flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#9d8fd6]/70 bg-[#2a0f2e]/70 text-[#c4b5e8] shadow-[0_0_18px_rgba(157,143,214,0.35)] active:scale-95 active:bg-[#9d8fd6]/40"
            {...pauseHandlers}
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-5 w-5" fill="currentColor">
              <rect x="3" y="2" width="3" height="12" />
              <rect x="10" y="2" width="3" height="12" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Dive"
            className="absolute bottom-4 left-4 z-20 flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#ff4d6d]/70 bg-[#2a0f2e]/70 text-[#ff9db1] shadow-[0_0_18px_rgba(255,77,109,0.35)] active:scale-95 active:bg-[#ff4d6d]/40"
            {...diveHandlers}
          >
            <svg aria-hidden="true" viewBox="0 0 32 32" className="h-9 w-9" fill="currentColor">
              <path d="M12 4h8v14h7L16 29 5 18h7V4z" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}
