import { useRef } from 'react';
import type { Stats } from '../game/engine';
import { DailyQuestPanel } from './QuestPanels';
import { PauseIcon, PixelButton, Panel, Stat } from './ui';
import type { QuestDefinition, QuestRecord, QuestRunStats } from '../game/quests';
import { sfx } from '../game/audio';

const pad = (n: number, l: number) => Math.max(0, Math.floor(n)).toString().padStart(l, '0');

type ControlIconKind = 'jump' | 'dive' | 'boost' | 'pause' | 'hold' | 'double' | 'tap';

function ControlIcon({ kind }: { kind: ControlIconKind }) {
  return (
    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center border border-current/35 bg-[#0d0619]">
      <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" shapeRendering="crispEdges">
        {kind === 'jump' && <path d="M2 7 8 1l6 6h-4v8H6V7H2z" />}
        {kind === 'dive' && <path d="M2 9h4V1h4v8h4l-6 6-6-6z" />}
        {kind === 'boost' && <path d="m15 8-6-6v4H1v4h8v4l6-6z" />}
        {kind === 'pause' && <PauseIcon className="h-3.5 w-3.5" />}
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
      <p className={`truncate font-pixel text-[7px] leading-[1.7] tablet:text-[9px] ${danger ? 'text-[#ff4d6d]' : 'text-[#3ef2c8]'}`}>
        {keys}
      </p>
    </div>
  );
}

function PixelArrow({ dir, className = '' }: { dir: 'up' | 'down' | 'left' | 'right'; className?: string }) {
  if (dir === 'up') {
    return (
      <svg
        viewBox="0 0 7 7"
        className={`inline-block h-[7px] w-[7px] shrink-0 align-middle fill-current ${className}`}
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        <path d="M3 0h1v1H3V0z M2 1h3v1H2V1z M1 2h5v1H1V2z M0 3h7v1H0V3z M2 4h3v3H2V4z" />
      </svg>
    );
  }
  if (dir === 'down') {
    return (
      <svg
        viewBox="0 0 7 7"
        className={`inline-block h-[7px] w-[7px] shrink-0 align-middle fill-current ${className}`}
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        <path d="M2 0h3v3H2V0z M0 3h7v1H0V3z M1 4h5v1H1V4z M2 5h3v1H2V5z M3 6h1v1H3V6z" />
      </svg>
    );
  }
  if (dir === 'left') {
    return (
      <svg
        viewBox="0 0 7 7"
        className={`inline-block h-[7px] w-[7px] shrink-0 align-middle fill-current ${className}`}
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        <path d="M0 3h1v1H0V3z M1 2h1v3H1V2z M2 1h1v5H2V1z M3 0h1v7H3V0z M4 2h3v3H4V2z" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 7 7"
      className={`inline-block h-[7px] w-[7px] shrink-0 align-middle fill-current ${className}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <path d="M6 3h1v1H6V3z M5 2h1v3H5V2z M4 1h1v5H4V1z M3 0h1v7H3V0z M0 2h3v3H0V2z" />
    </svg>
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

function PixelReloadIcon({ className = 'h-[7px] w-[7px]' }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 7 7" className={className} fill="currentColor" shapeRendering="crispEdges">
      <rect x="2" y="0" width="3" height="1" />
      <rect x="5" y="1" width="1" height="2" />
      <rect x="5" y="3" width="1" height="1" />
      <rect x="4" y="4" width="2" height="1" />
      <rect x="2" y="5" width="3" height="1" />
      <rect x="1" y="3" width="1" height="2" />
      <rect x="0" y="0" width="2" height="2" />
      <rect x="0" y="2" width="1" height="1" />
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
  quests,
  questRecord,
  questRun,
  questOnDayRollover,
  questOnShare,
  onOpenBattles,
  onOpenSkins,
  onExportSave,
  onImportSave,
  onCheckUpdate,
}: {
  best: number;
  lastRun: number;
  onStart: () => void;
  touch: boolean;
  musicOn: boolean;
  sfxOn: boolean;
  onToggleMusic: () => void;
  onToggleSfx: () => void;
  quests: QuestDefinition[];
  questRecord: QuestRecord;
  questRun: QuestRunStats;
  questOnDayRollover?: () => void;
  questOnShare?: () => void;
  onOpenBattles?: () => void;
  onOpenSkins?: () => void;
  onExportSave?: () => void;
  onImportSave?: () => void;
  onCheckUpdate?: () => void;
}) {
  return (
    <div
      className="absolute inset-0 z-10 flex cursor-default items-start justify-center overflow-y-auto bg-[#08040f]/88 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]"
    >
      <div className="my-auto flex w-full max-w-[420px] flex-col items-center gap-3 tablet:max-w-[500px]">
        <div className="text-center">
          <h1 className="font-pixel text-[26px] leading-none drop-shadow-[0_4px_0_#08040f] sm:text-[34px] tablet:text-[44px]">
            <span className="animate-title block text-[#3ef2c8]">PIXEL</span>
            <span className="animate-title-2 block text-[#ff4d6d]">RUN</span>
          </h1>
          <p className="mt-2 font-pixel text-[8px] tracking-[0.25em] text-[#9d8fd6] tablet:text-[10px]">
            RUN &middot; STOMP &middot; SURVIVE
          </p>
        </div>

        <Panel className="w-full">
          <div className="flex flex-col items-center gap-3">
            <div className="grid w-full grid-cols-2 gap-x-3 gap-y-2 tablet:grid-cols-3">
              {touch ? (
                <>
                  <ControlHint kind="tap" keys="TAP" />
                  <ControlHint kind="hold" keys="HOLD" />
                  <ControlHint kind="double" keys="2X TAP" />
                  <ControlHint kind="dive" keys="DIVE" />
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
            <div className="mt-1 flex w-full items-center justify-center gap-4 border-t-2 border-[#221741] pt-3 font-pixel text-[8px] text-[#6f5fa8] tablet:text-[10px]">
              <span>LAST RUN <span className="text-[#9d8fd6]">{pad(lastRun, 6)}</span></span>
              <span>BEST <span className="text-[#ffd166]">{pad(best, 6)}</span></span>
            </div>
          </div>
        </Panel>
        <DailyQuestPanel quests={quests} record={questRecord} run={questRun} compact decorated={false} onDayRollover={questOnDayRollover} onShare={questOnShare} />
        <div className="flex w-full max-w-[420px] gap-2 tablet:max-w-[500px]">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleMusic(); }}
            aria-pressed={musicOn}
            className={`flex flex-1 items-center justify-center gap-2 border-2 px-3 py-2 font-pixel text-[8px] shadow-[2px_2px_0_#08040f] transition-[transform,box-shadow,filter] duration-75 hover:-translate-y-[1px] hover:brightness-125 hover:shadow-[4px_4px_0_#08040f] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#08040f] tablet:px-5 tablet:py-3 tablet:text-[10px] ${
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
            aria-pressed={sfxOn}
            className={`flex flex-1 items-center justify-center gap-2 border-2 px-3 py-2 font-pixel text-[8px] shadow-[2px_2px_0_#08040f] transition-[transform,box-shadow,filter] duration-75 hover:-translate-y-[1px] hover:brightness-125 hover:shadow-[4px_4px_0_#08040f] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#08040f] tablet:px-5 tablet:py-3 tablet:text-[10px] ${
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
        <div className="flex w-full max-w-[420px] items-stretch gap-2 tablet:max-w-[500px]">
          {onOpenBattles && (
            <button
              type="button"
              onClick={onOpenBattles}
              aria-label="1v1 Multiplayer Battles"
              title="1v1 Multiplayer Battles"
              className="flex h-[46px] w-[46px] sm:h-[50px] sm:w-[50px] shrink-0 items-center justify-center border-2 border-[#ff4d6d] bg-[#1a0614] text-[#ff4d6d] shadow-[2px_2px_0_#08040f] transition-[transform,box-shadow,filter] duration-75 hover:-translate-y-[1px] hover:brightness-125 hover:shadow-[4px_4px_0_#08040f] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#08040f]"
            >
              <span className="text-[18px] sm:text-[20px] leading-none">⚔️</span>
            </button>
          )}
          <PixelButton
            onClick={onStart}
            className="flex flex-1 items-center justify-center gap-3 py-3.5 text-[11px] tablet:py-4 tablet:text-[14px]"
          >
            <PlayIcon />
            <span>START RUN</span>
          </PixelButton>
          {onOpenSkins && (
            <button
              type="button"
              onClick={onOpenSkins}
              aria-label="Character Locker"
              title="Character Locker"
              className="flex h-[46px] w-[46px] sm:h-[50px] sm:w-[50px] shrink-0 items-center justify-center border-2 border-[#3ef2c8] bg-[#071a17] text-[#3ef2c8] shadow-[2px_2px_0_#08040f] transition-[transform,box-shadow,filter] duration-75 hover:-translate-y-[1px] hover:brightness-125 hover:shadow-[4px_4px_0_#08040f] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#08040f]"
            >
              <svg viewBox="0 0 16 16" className="h-5 w-5 sm:h-6 sm:w-6" fill="currentColor">
                <rect x="5" y="2" width="6" height="4" fill="#ffcf9e" />
                <rect x="9" y="3" width="1" height="2" fill="#20122e" />
                <rect x="4" y="6" width="8" height="2" fill="#3ef2c8" />
                <rect x="3" y="8" width="10" height="5" fill="#ff4d6d" />
                <rect x="4" y="13" width="3" height="2" fill="#20122e" />
                <rect x="9" y="13" width="3" height="2" fill="#20122e" />
              </svg>
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <a
            href="https://github.com/Jimm144/pixel-run"
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => e.stopPropagation()}
            className="font-pixel text-[7px] text-[#5c4f8e] transition-colors hover:text-[#9d8fd6] tablet:text-[9px]"
          >
            GITHUB
          </a>
          {onExportSave && (
            <>
              <span className="text-[7px] text-[#332454]">|</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onExportSave();
                }}
                className="inline-flex items-center gap-1 cursor-pointer font-pixel text-[7px] text-[#ffd166]/70 transition-colors hover:text-[#ffd166] tablet:text-[9px]"
              >
                <span>SAVE</span>
                <PixelArrow dir="down" />
              </button>
            </>
          )}
          {onImportSave && (
            <>
              <span className="text-[7px] text-[#332454]">|</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onImportSave();
                }}
                className="inline-flex items-center gap-1 cursor-pointer font-pixel text-[7px] text-[#c98cff]/70 transition-colors hover:text-[#c98cff] tablet:text-[9px]"
              >
                <span>LOAD</span>
                <PixelArrow dir="up" />
              </button>
            </>
          )}
          {onCheckUpdate && (
            <>
              <span className="text-[7px] text-[#332454]">|</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCheckUpdate();
                }}
                className="inline-flex items-center gap-1 cursor-pointer font-pixel text-[7px] text-[#3ef2c8]/70 transition-colors hover:text-[#3ef2c8] tablet:text-[9px]"
              >
                <span>UPDATE</span>
                <PixelReloadIcon />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- pause */
function VolumeStepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const pct = Math.round(value * 100);
  const isMuted = pct === 0;
  const prevVolRef = useRef(value > 0 ? value : 1.0);

  if (value > 0) {
    prevVolRef.current = value;
  }

  const toggleMute = () => {
    if (value > 0) {
      prevVolRef.current = value;
      onChange(0);
    } else {
      onChange(prevVolRef.current > 0 ? prevVolRef.current : 1.0);
    }
  };

  const step = (dir: number) => onChange(Math.min(1, Math.max(0, pct + dir) / 100));
  return (
    <div className="flex items-center justify-between gap-2 border-2 border-[#2c1f4d] bg-[#0d0619] px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label={isMuted ? `Unmute ${label}` : `Mute ${label}`}
          onClick={toggleMute}
          className={`flex items-center justify-center border-2 px-1.5 py-1 font-pixel text-[7px] transition-colors ${
            isMuted
              ? 'border-[#2c1f4d] bg-[#08040f] text-[#6f5fa8]/50 opacity-60 hover:border-[#6f5fa8]/60 hover:text-[#9d8fd6]'
              : 'border-[#3ef2c8]/60 bg-[#3ef2c8]/10 text-[#3ef2c8] hover:bg-[#3ef2c8]/20 active:bg-[#3ef2c8]/30'
          }`}
          title={isMuted ? `Unmute ${label} (${Math.round(prevVolRef.current * 100)}%)` : `Mute ${label}`}
        >
          <svg viewBox="0 0 16 16" className="h-2.5 w-2.5" fill="currentColor">
            <path d="M2 5h2l3-3v12l-3-3H2V5z" />
            {isMuted ? (
              <>
                <line x1="10" y1="5.5" x2="14" y2="10.5" stroke="currentColor" strokeWidth="1.5" />
                <line x1="14" y1="5.5" x2="10" y2="10.5" stroke="currentColor" strokeWidth="1.5" />
              </>
            ) : (
              <path d="M10 5.5a2.5 2.5 0 0 1 0 5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            )}
          </svg>
        </button>
        <span className="font-pixel text-[7px] text-[#9d8fd6]">{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label={`${label} down`}
          disabled={isMuted}
          onClick={() => step(-10)}
          className={`border-2 px-2 py-1 font-pixel text-[8px] transition-colors ${
            isMuted
              ? 'border-[#2c1f4d] bg-[#08040f] text-[#6f5fa8]/40 opacity-40 cursor-not-allowed'
              : 'border-[#3ef2c8]/50 bg-[#0d0619] text-[#3ef2c8] hover:bg-[#3ef2c8]/10 active:bg-[#3ef2c8]/20'
          }`}
        >
          -
        </button>
        <span className={`w-11 text-center font-pixel text-[8px] ${isMuted ? 'text-[#6f5fa8]' : 'text-[#e9e2ff]'}`}>
          {pct}%
        </span>
        <button
          type="button"
          aria-label={`${label} up`}
          onClick={() => step(10)}
          className="border-2 border-[#3ef2c8]/50 bg-[#0d0619] px-2 py-1 font-pixel text-[8px] text-[#3ef2c8] transition-colors hover:bg-[#3ef2c8]/10 active:bg-[#3ef2c8]/20"
        >
          +
        </button>
      </div>
    </div>
  );
}

export function PauseScreen({
  onResume,
  onRestart,
  onQuit,
  onMenu,
  stats,
  musicVol,
  sfxVol,
  onMusicVol,
  onSfxVol,
}: {
  onResume: () => void;
  onRestart: () => void;
  onQuit?: () => void;
  onMenu?: () => void;
  stats: Stats;
  musicVol: number;
  sfxVol: number;
  onMusicVol: (v: number) => void;
  onSfxVol: (v: number) => void;
}) {
  const handleMenu = onMenu ?? onQuit ?? (() => {});

  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center overflow-y-auto bg-[#08040f]/80 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] [@media(max-height:640px)]:items-end [@media(max-height:640px)]:pb-8"
      onPointerDown={() => sfx.unlock()}
    >
      <Panel className="w-full max-w-[300px] p-4 tablet:max-w-[420px] tablet:p-6">
        <h2 className="mb-3 text-center font-pixel text-[16px] text-[#3ef2c8] tablet:mb-4 tablet:text-[18px]">PAUSED</h2>
        <div className="mb-3 grid grid-cols-2 gap-2 tablet:mb-4 tablet:gap-3">
          <Stat label="SCORE" value={pad(stats.score, 6)} color="#ffffff" />
          <Stat label="DIST" value={stats.meters + 'M'} color="#3ef2c8" />
        </div>
        <div className="mb-3 grid grid-cols-3 gap-2 tablet:mb-4 tablet:gap-3">
          <Stat label="COINS" value={String(stats.coins)} color="#ffd166" />
          <Stat label="KILLS" value={String(stats.kills)} color="#ff4d6d" />
          <Stat label="COMBO" value={'X' + stats.combo} color="#c98cff" />
        </div>
        <div className="mb-3 flex flex-col gap-2 tablet:mb-4">
          <VolumeStepper label="MUSIC" value={musicVol} onChange={onMusicVol} />
          <VolumeStepper label="SFX" value={sfxVol} onChange={onSfxVol} />
        </div>
        <div className="flex flex-col gap-2">
          <PixelButton onClick={onResume} small className="py-2.5 tablet:py-3 tablet:text-[10px]">
            RESUME
          </PixelButton>
          <div className="grid grid-cols-2 gap-2">
            <PixelButton variant="danger" onClick={onRestart} small className="py-2.5 tablet:py-3 tablet:text-[10px]">
              RESTART
            </PixelButton>
            <PixelButton variant="ghost" onClick={handleMenu} small className="py-2.5 tablet:py-3 tablet:text-[10px]">
              MENU
            </PixelButton>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function ShareIcon({ className = 'h-[16px] w-[16px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
      <path d="M4 12v8h16v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

/* ---------------------------------------------------------------- game over */
export function GameOverScreen({
  stats,
  best,
  newBest,
  onRestart,
  onMenu,
  onShare,
  touch: _touch,
}: {
  stats: Stats;
  best: number;
  newBest: boolean;
  onRestart: () => void;
  onMenu: () => void;
  onShare?: () => void;
  touch: boolean;
}) {
  return (
    <div
      className="absolute inset-0 z-10 flex items-start justify-center overflow-y-auto bg-[#08040f]/80 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]"
      onPointerDown={() => sfx.unlock()}
    >
      <div className="my-auto flex w-full max-w-[380px] flex-col items-center gap-3 tablet:max-w-[460px]">
        <h2 className="animate-shake-in font-pixel text-[22px] text-[#ff4d6d] drop-shadow-[0_4px_0_#08040f] tablet:text-[28px]">
          WASTED
        </h2>
        <Panel className="w-full">
          <div className="mb-3 text-center">
            <p className="font-pixel text-[7px] text-[#6f5fa8] tablet:text-[9px]">
              {newBest ? 'NEW PERSONAL BEST' : 'FINAL SCORE'}
            </p>
            <p className="font-pixel text-[24px] text-[#ffd166] drop-shadow-[0_3px_0_#08040f] tablet:text-[32px]">
              {pad(stats.score, 6)}
            </p>
            {!newBest && (
              <p className="mt-2 font-pixel text-[7px] text-[#6f5fa8] tablet:text-[9px]">
                BEST <span className="text-[#3ef2c8]">{pad(best, 6)}</span>
              </p>
            )}
          </div>
          <div className="mb-3 grid grid-cols-5 gap-1 tablet:gap-2">
            <Stat label="DIST" value={stats.meters + 'M'} color="#3ef2c8" />
            <Stat label="COINS" value={String(stats.coins ?? 0)} color="#ffd166" />
            <Stat label="GEMS" value={String(stats.gems ?? 0)} color="#3ef2c8" />
            <Stat label="KILLS" value={String(stats.kills)} color="#ff4d6d" />
            <Stat label="COMBO" value={'X' + stats.combo} color="#c98cff" />
          </div>
        </Panel>
        <div className="flex w-full max-w-[380px] flex-col items-center gap-2 tablet:max-w-[460px]">
          <div className="flex w-full gap-2">
            <PixelButton onClick={onRestart} className="flex flex-[2] items-center justify-center py-3 text-[11px] tablet:py-3.5 tablet:text-[13px]">
              <RetryIcon className="mr-2 inline-block h-[16px] w-[16px] align-[-3px] tablet:h-[20px] tablet:w-[20px]" />
              RETRY
            </PixelButton>
            <PixelButton variant="ghost" onClick={onMenu} className="flex flex-1 items-center justify-center py-3 text-[11px] tablet:py-3.5 tablet:text-[13px]">
              MENU
            </PixelButton>
          </div>
          {newBest && onShare && (
            <PixelButton
              variant="ghost"
              onClick={onShare}
              small
              className="w-full flex items-center justify-center py-2.5 border-[#ffd166]/70 bg-[#ffd166]/10 text-[#ffd166] hover:bg-[#ffd166]/20 hover:text-[#fff4b8] hover:border-[#ffd166] tablet:py-3 tablet:text-[10px]"
            >
              <ShareIcon className="mr-1.5 inline-block h-[12px] w-[12px] align-[-2px] tablet:h-[15px] tablet:w-[15px]" />
              SHARE SCORE
            </PixelButton>
          )}
        </div>
      </div>
    </div>
  );
}
