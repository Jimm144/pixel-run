import type { Stats } from '../game/engine';
import { PixelButton, Panel, Stat } from './ui';

const pad = (n: number, l: number) => Math.max(0, Math.floor(n)).toString().padStart(l, '0');

type ControlIconKind = 'jump' | 'dive' | 'boost' | 'pause' | 'hold' | 'double' | 'tap';

function ControlIcon({ kind }: { kind: ControlIconKind }) {
  return (
    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center border border-current/35 bg-[#0d0619]">
      <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" shapeRendering="crispEdges">
        {kind === 'jump' && <path d="M2 7 8 1l6 6h-4v8H6V7H2z" />}
        {kind === 'dive' && <path d="M2 9h4V1h4v8h4l-6 6-6-6z" />}
        {kind === 'boost' && <path d="m15 8-6-6v4H1v4h8v4l6-6z" />}
        {kind === 'pause' && <><rect x="3" y="2" width="3" height="12" /><rect x="10" y="2" width="3" height="12" /></>}
        {kind === 'hold' && <><path d="M2 8l6-5 6 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" /><path d="M2 14l6-5 6 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" /></>}
        {kind === 'double' && <><path d="M1 6 4 3l3 3H5v6H3V6H1z" /><path d="M9 6l3-3 3 3h-2v6h-2V6H9z" /></>}
        {kind === 'tap' && <><rect x="7" y="2" width="3" height="7" /><rect x="4" y="7" width="3" height="3" /><rect x="3" y="10" width="10" height="3" /></>}
      </svg>
    </span>
  );
}

function ControlHint({ kind, keys, danger = false }: { kind: ControlIconKind; keys: string; danger?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className={danger ? 'text-[#ff4d6d]' : 'text-[#3ef2c8]'}>
        <ControlIcon kind={kind} />
      </span>
      <p className={`truncate font-pixel text-[7px] leading-[1.7] ${danger ? 'text-[#ff4d6d]' : 'text-[#3ef2c8]'}`}>
        {keys}
      </p>
    </div>
  );
}

function PlayIcon({ className = 'h-[16px] w-[16px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function RetryIcon({ className = 'h-[16px] w-[16px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M17.65 6.35A7.958 7.958 0 0 0 12 4a8 8 0 1 0 8 8h-2.5a5.5 5.5 0 1 1-1.58-3.87L13.5 10.5H20V4l-2.35 2.35z" />
    </svg>
  );
}

/* -------------------------------------------------------------------- start */
export function StartScreen({
  best,
  lastRun,
  onStart,
  touch,
  musicOn,
  sfxOn,
  onToggleMusic,
  onToggleSfx,
}: {
  best: number;
  lastRun: number;
  onStart: () => void;
  touch: boolean;
  musicOn: boolean;
  sfxOn: boolean;
  onToggleMusic: () => void;
  onToggleSfx: () => void;
}) {
  return (
    <div
      className="absolute inset-0 z-10 flex cursor-pointer items-center justify-center overflow-y-auto bg-[#08040f]/88 p-4"
      onClick={onStart}
    >
      <div className="flex w-full max-w-[420px] flex-col items-center gap-4">
        <div className="text-center">
          <h1 className="font-pixel text-[26px] leading-none text-[#3ef2c8] drop-shadow-[0_4px_0_#08040f] sm:text-[34px]">
            <span className="animate-title inline-block">PIXEL</span>
          </h1>
          <h1 className="font-pixel text-[26px] leading-none text-[#ff4d6d] drop-shadow-[0_4px_0_#08040f] sm:text-[34px]">
            <span className="animate-title-2 inline-block">RUN</span>
          </h1>
          <p className="mt-3 font-pixel text-[8px] tracking-[0.25em] text-[#9d8fd6]">
            RUN &middot; STOMP &middot; SURVIVE
          </p>
        </div>

        <Panel className="w-full">
          <div className="flex flex-col items-center gap-3">
            <div className="grid w-full grid-cols-2 gap-x-3 gap-y-2">
              {touch ? (
                <>
                  <ControlHint kind="tap" keys="TAP" />
                  <ControlHint kind="hold" keys="HOLD" />
                  <ControlHint kind="double" keys="2X TAP" />
                  <ControlHint kind="dive" keys="DIVE" danger />
                </>
              ) : (
                <>
                  <ControlHint kind="jump" keys="SPACE/W" />
                  <ControlHint kind="hold" keys="HOLD" />
                  <ControlHint kind="double" keys="SPACE X2" />
                  <ControlHint kind="dive" keys="S / DOWN SLAM" />
                  <ControlHint kind="boost" keys="D" />
                  <ControlHint kind="pause" keys="P / ESC" />
                </>
              )}
            </div>
            <div className="mt-1 flex w-full items-center justify-center gap-4 border-t-2 border-[#221741] pt-3 font-pixel text-[8px] text-[#6f5fa8]">
              <span>LAST RUN <span className="text-[#9d8fd6]">{pad(lastRun, 6)}</span></span>
              <span>BEST <span className="text-[#ffd166]">{pad(best, 6)}</span></span>
            </div>
          </div>
        </Panel>
        <div className="flex w-full max-w-[420px] gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleMusic(); }}
            className={`flex flex-1 items-center justify-center gap-2 border-2 px-3 py-2 font-pixel text-[8px] shadow-[2px_2px_0_#08040f] transition-[transform,box-shadow,filter] duration-75 hover:-translate-y-[1px] hover:brightness-125 hover:shadow-[4px_4px_0_#08040f] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#08040f] ${
              musicOn
                ? 'border-[#3ef2c8]/40 bg-[#3ef2c8]/10 text-[#3ef2c8]'
                : 'border-[#6f5fa8]/30 bg-[#0d0619] text-[#6f5fa8]'
            }`}
          >
            <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor">
              {musicOn ? (
                <>
                  <path d="M2 5h2l3-3v12l-3-3H2V5z" />
                  <path d="M10 3.5a5 5 0 0 1 0 9" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M12 1.5a8 8 0 0 1 0 13" fill="none" stroke="currentColor" strokeWidth="1.5" />
                </>
              ) : (
                <>
                  <path d="M2 5h2l3-3v12l-3-3H2V5z" />
                  <line x1="11" y1="5" x2="15" y2="11" stroke="currentColor" strokeWidth="1.5" />
                  <line x1="15" y1="5" x2="11" y2="11" stroke="currentColor" strokeWidth="1.5" />
                </>
              )}
            </svg>
            {musicOn ? 'MUSIC ON' : 'MUSIC OFF'}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onToggleSfx(); }}
            className={`flex flex-1 items-center justify-center gap-2 border-2 px-3 py-2 font-pixel text-[8px] shadow-[2px_2px_0_#08040f] transition-[transform,box-shadow,filter] duration-75 hover:-translate-y-[1px] hover:brightness-125 hover:shadow-[4px_4px_0_#08040f] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#08040f] ${
              sfxOn
                ? 'border-[#ffd166]/40 bg-[#ffd166]/10 text-[#ffd166]'
                : 'border-[#6f5fa8]/30 bg-[#0d0619] text-[#6f5fa8]'
            }`}
          >
            <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor">
              {sfxOn ? (
                <>
                  <path d="M2 5h2l3-3v12l-3-3H2V5z" />
                  <path d="M10 5.5a2.5 2.5 0 0 1 0 5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                </>
              ) : (
                <>
                  <path d="M2 5h2l3-3v12l-3-3H2V5z" />
                  <line x1="10" y1="5.5" x2="14" y2="10.5" stroke="currentColor" strokeWidth="1.5" />
                  <line x1="14" y1="5.5" x2="10" y2="10.5" stroke="currentColor" strokeWidth="1.5" />
                </>
              )}
            </svg>
            {sfxOn ? 'SFX ON' : 'SFX OFF'}
          </button>
        </div>
        <span onClick={(e) => e.stopPropagation()}>
          <PixelButton onClick={onStart} className="flex min-w-[280px] items-center justify-center gap-3">
            <PlayIcon />
            <span>START RUN</span>
          </PixelButton>
        </span>
        <a
          href="https://github.com/Jimm144/pixel-run"
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="font-pixel text-[7px] text-[#5c4f8e] transition-colors hover:text-[#9d8fd6]"
        >
          GITHUB
        </a>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- pause */
export function PauseScreen({
  onResume,
  onRestart,
  onQuit,
  score,
  meters,
}: {
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
  score: number;
  meters: number;
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center overflow-y-auto bg-[#08040f]/80 p-4">
      <Panel className="w-full max-w-[320px]">
        <h2 className="mb-4 text-center font-pixel text-[18px] text-[#3ef2c8]">PAUSED</h2>
        <div className="mb-4 grid grid-cols-2 gap-2">
          <Stat label="SCORE" value={pad(score, 6)} color="#ffffff" />
          <Stat label="DIST" value={meters + 'M'} color="#3ef2c8" />
        </div>
        <div className="flex flex-col gap-2">
          <PixelButton onClick={onResume}>RESUME</PixelButton>
          <div className="grid grid-cols-2 gap-2">
            <PixelButton variant="danger" onClick={onRestart} small className="py-3">
              RESTART
            </PixelButton>
            <PixelButton variant="ghost" onClick={onQuit} small className="py-3">
              MENU
            </PixelButton>
          </div>
        </div>
      </Panel>
    </div>
  );
}

/* ---------------------------------------------------------------- game over */
export function GameOverScreen({
  stats,
  best,
  newBest,
  onRestart,
  onMenu,
  touch,
}: {
  stats: Stats;
  best: number;
  newBest: boolean;
  onRestart: () => void;
  onMenu: () => void;
  touch: boolean;
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center overflow-y-auto bg-[#08040f]/80 p-3">
      <div className="flex w-full max-w-[380px] flex-col items-center gap-3">
        <h2 className="animate-shake-in font-pixel text-[22px] text-[#ff4d6d] drop-shadow-[0_4px_0_#08040f]">
          WASTED
        </h2>
        <Panel className="w-full">
          <div className="mb-3 text-center">
            <p className="font-pixel text-[7px] text-[#6f5fa8]">
              {newBest ? 'NEW PERSONAL BEST' : 'FINAL SCORE'}
            </p>
            <p className="font-pixel text-[24px] text-[#ffd166] drop-shadow-[0_3px_0_#08040f]">
              {pad(stats.score, 6)}
            </p>
            {!newBest && (
              <p className="mt-2 font-pixel text-[7px] text-[#6f5fa8]">
                BEST <span className="text-[#3ef2c8]">{pad(best, 6)}</span>
              </p>
            )}
          </div>
          <div className="mb-3 grid grid-cols-4 gap-1.5">
            <Stat label="DIST" value={stats.meters + 'M'} color="#3ef2c8" />
            <Stat label="COINS" value={String(stats.coins)} color="#ffd166" />
            <Stat label="KILLS" value={String(stats.kills)} color="#ff4d6d" />
            <Stat label="COMBO" value={'X' + stats.combo} color="#c98cff" />
          </div>
        </Panel>
        <div className="flex w-full flex-col items-center gap-2">
          <PixelButton onClick={onRestart} className="w-full">
            <RetryIcon className="mr-2 inline-block h-[16px] w-[16px] align-[-3px]" />
            {touch ? 'TAP TO RETRY' : 'RETRY'}
          </PixelButton>
          <PixelButton variant="ghost" onClick={onMenu} small>
            MAIN MENU
          </PixelButton>
        </div>
      </div>
    </div>
  );
}
