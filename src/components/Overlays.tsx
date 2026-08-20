import { useEffect, useRef } from 'react';
import type { Stats } from '../game/engine';
import { drawPlayerSprite } from '../game/playerSprite';
import { DailyQuestPanel } from './QuestPanels';
import { PauseIcon, PixelButton, Panel, Stat, PixelCloseIcon } from './ui';
import type { QuestDefinition, QuestRecord, QuestRunStats } from '../game/quests';
import { sfx } from '../game/audio';

const pad = (n: number, l: number) => Math.max(0, Math.floor(n)).toString().padStart(l, '0');

type ControlIconKind = 'jump' | 'dive' | 'boost' | 'pause' | 'hold' | 'double' | 'tap' | 'konami';

function ControlIcon({ kind }: { kind: ControlIconKind }) {
  return (
    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center border border-current/35 bg-[#0d0619]">
      <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" shapeRendering="crispEdges">
        {kind === 'jump' && (
          <>
            <rect x="6" y="1" width="4" height="1" />
            <rect x="5" y="2" width="6" height="1" />
            <rect x="4" y="3" width="8" height="1" />
            <rect x="3" y="4" width="10" height="1" />
            <rect x="6" y="5" width="4" height="9" />
          </>
        )}
        {kind === 'dive' && (
          <>
            <rect x="6" y="2" width="4" height="9" />
            <rect x="3" y="11" width="10" height="1" />
            <rect x="4" y="12" width="8" height="1" />
            <rect x="5" y="13" width="6" height="1" />
            <rect x="6" y="14" width="4" height="1" />
          </>
        )}
        {kind === 'boost' && (
          <>
            <rect x="2" y="6" width="9" height="4" />
            <rect x="11" y="3" width="1" height="10" />
            <rect x="12" y="4" width="1" height="8" />
            <rect x="13" y="5" width="1" height="6" />
            <rect x="14" y="6" width="1" height="4" />
          </>
        )}
        {kind === 'pause' && <PauseIcon className="h-3.5 w-3.5" />}
        {kind === 'hold' && (
          <>
            <rect x="7" y="3" width="2" height="1" />
            <rect x="6" y="4" width="4" height="1" />
            <rect x="5" y="5" width="6" height="1" />
            <rect x="4" y="6" width="8" height="1" />
            <rect x="3" y="7" width="10" height="1" />
            <rect x="2" y="8" width="12" height="1" />
            <rect x="7" y="9" width="2" height="1" />
            <rect x="6" y="10" width="4" height="1" />
            <rect x="5" y="11" width="6" height="1" />
            <rect x="4" y="12" width="8" height="1" />
            <rect x="3" y="13" width="10" height="1" />
            <rect x="2" y="14" width="12" height="1" />
          </>
        )}
        {kind === 'double' && (
          <>
            <rect x="3" y="3" width="2" height="1" />
            <rect x="2" y="4" width="4" height="1" />
            <rect x="1" y="5" width="6" height="1" />
            <rect x="3" y="6" width="2" height="6" />
            <rect x="11" y="3" width="2" height="1" />
            <rect x="10" y="4" width="4" height="1" />
            <rect x="9" y="5" width="6" height="1" />
            <rect x="11" y="6" width="2" height="6" />
          </>
        )}
        {kind === 'tap' && (
          <>
            <rect x="7" y="2" width="3" height="7" />
            <rect x="4" y="7" width="3" height="3" />
            <rect x="3" y="10" width="10" height="3" />
          </>
        )}
        {kind === 'konami' && (
          <>
            {/* D-pad horizontal */}
            <rect x="1" y="6" width="9" height="4" />
            {/* D-pad vertical */}
            <rect x="4" y="3" width="3" height="10" />
            {/* A/B action buttons */}
            <rect x="12" y="4" width="2" height="2" />
            <rect x="14" y="8" width="2" height="2" />
          </>
        )}
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
      <p className={`truncate font-pixel text-[8px] leading-[1.7] ${danger ? 'text-[#ff4d6d]' : 'text-[#3ef2c8]'}`}>
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

function PixelSpeakerIcon({ active = true, className = 'h-3.5 w-3.5 tablet:h-4 tablet:w-4' }: { active?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`inline-block shrink-0 align-middle ${className}`}
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {/* Speaker box */}
      <rect x="1" y="6" width="3" height="4" />
      {/* Speaker cone flare */}
      <rect x="4" y="5" width="1" height="6" />
      <rect x="5" y="4" width="1" height="8" />
      <rect x="6" y="3" width="1" height="10" />

      {active ? (
        <>
          {/* Inner rounded circular wave (shifted right) */}
          <rect x="9" y="5" width="1" height="1" />
          <rect x="10" y="6" width="1" height="4" />
          <rect x="9" y="10" width="1" height="1" />

          {/* Outer rounded circular wave */}
          <rect x="11" y="3" width="1" height="1" />
          <rect x="12" y="4" width="1" height="2" />
          <rect x="13" y="6" width="1" height="4" />
          <rect x="12" y="10" width="1" height="2" />
          <rect x="11" y="12" width="1" height="1" />
        </>
      ) : (
        <>
          {/* Symmetrical Mute X */}
          <rect x="9" y="6" width="1" height="1" />
          <rect x="13" y="6" width="1" height="1" />
          <rect x="10" y="7" width="1" height="1" />
          <rect x="12" y="7" width="1" height="1" />
          <rect x="11" y="8" width="1" height="1" />
          <rect x="10" y="9" width="1" height="1" />
          <rect x="12" y="9" width="1" height="1" />
          <rect x="9" y="10" width="1" height="1" />
          <rect x="13" y="10" width="1" height="1" />
        </>
      )}
    </svg>
  );
}

function PixelPlayIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="3" y="2" width="2" height="12" />
      <rect x="5" y="3" width="2" height="10" />
      <rect x="7" y="4" width="2" height="8" />
      <rect x="9" y="5" width="2" height="6" />
      <rect x="11" y="6" width="2" height="4" />
      <rect x="13" y="7" width="1" height="2" />
    </svg>
  );
}

function PixelShirtIcon({ className = 'h-5 w-5 sm:h-6 sm:w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" shapeRendering="crispEdges" aria-hidden="true">
      {/* Collar cutout */}
      <rect x="6" y="2" width="4" height="1" />
      {/* Shoulders */}
      <rect x="4" y="3" width="2" height="2" />
      <rect x="10" y="3" width="2" height="2" />
      {/* Sleeves */}
      <rect x="2" y="4" width="2" height="4" />
      <rect x="12" y="4" width="2" height="4" />
      {/* Torso / Body */}
      <rect x="4" y="4" width="8" height="9" />
      {/* Bottom Hem */}
      <rect x="3" y="12" width="10" height="2" />
    </svg>
  );
}

function PixelSwordsIcon({ className = 'h-5 w-5 sm:h-6 sm:w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" shapeRendering="crispEdges" aria-hidden="true">
      {/* --- SWORD 1: Top-Left to Bottom-Right --- */}
      {/* Pointy Tip */}
      <rect x="0" y="0" width="2" height="1" />
      <rect x="0" y="1" width="1" height="1" />
      {/* Broad Double-Edged Blade */}
      <rect x="1" y="1" width="2" height="2" />
      <rect x="2" y="2" width="2" height="2" />
      <rect x="3" y="3" width="2" height="2" />
      <rect x="4" y="4" width="2" height="2" />
      <rect x="5" y="5" width="2" height="2" />
      <rect x="6" y="6" width="2" height="2" />
      <rect x="7" y="7" width="2" height="2" />
      {/* Broad Angled Crossguard / Quillons */}
      <rect x="7" y="9" width="3" height="1" />
      <rect x="6" y="10" width="2" height="1" />
      <rect x="5" y="11" width="1" height="2" />
      <rect x="9" y="7" width="1" height="3" />
      <rect x="10" y="6" width="1" height="2" />
      <rect x="11" y="5" width="2" height="1" />
      {/* Grip / Hilt */}
      <rect x="9" y="9" width="2" height="2" />
      <rect x="11" y="11" width="2" height="2" />
      {/* Large Pommel */}
      <rect x="13" y="13" width="3" height="3" />
      <rect x="14" y="12" width="1" height="1" />
      <rect x="12" y="14" width="1" height="1" />

      {/* --- SWORD 2: Top-Right to Bottom-Left --- */}
      {/* Pointy Tip */}
      <rect x="14" y="0" width="2" height="1" />
      <rect x="15" y="1" width="1" height="1" />
      {/* Broad Double-Edged Blade */}
      <rect x="13" y="1" width="2" height="2" />
      <rect x="12" y="2" width="2" height="2" />
      <rect x="11" y="3" width="2" height="2" />
      <rect x="10" y="4" width="2" height="2" />
      <rect x="9" y="5" width="2" height="2" />
      <rect x="8" y="6" width="2" height="2" />
      {/* Broad Angled Crossguard / Quillons */}
      <rect x="6" y="7" width="1" height="3" />
      <rect x="5" y="6" width="1" height="2" />
      <rect x="3" y="5" width="2" height="1" />
      <rect x="6" y="9" width="3" height="1" />
      <rect x="8" y="10" width="2" height="1" />
      <rect x="10" y="11" width="1" height="2" />
      {/* Grip / Hilt */}
      <rect x="5" y="9" width="2" height="2" />
      <rect x="3" y="11" width="2" height="2" />
      {/* Large Pommel */}
      <rect x="0" y="13" width="3" height="3" />
      <rect x="1" y="12" width="1" height="1" />
      <rect x="3" y="14" width="1" height="1" />
    </svg>
  );
}

function GladiatorPreview() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    drawPlayerSprite(ctx, 48, 58, { skinId: 'gladiator', frame: 0, run: 0, onGround: true, scale: 4 });
  }, []);

  return <canvas ref={canvasRef} width={96} height={112} className="h-20 w-[68px] shrink-0 [image-rendering:pixelated]" aria-hidden="true" />;
}

function DiscordPromo({ onClaim, onDismiss }: { onClaim: () => void; onDismiss: () => void }) {
  return (
    <div className="relative flex w-full items-center gap-2 border-2 border-[#5865f2] bg-[#151942] p-2 shadow-[3px_3px_0_#08040f] tablet:gap-3 tablet:p-2.5">
      <button
        type="button"
        aria-label="Dismiss Discord reward"
        onClick={onDismiss}
        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center text-[#9da9ff] hover:text-white"
      >
        <PixelCloseIcon className="h-3 w-3" />
      </button>
      <div className="flex h-[76px] w-[68px] shrink-0 items-center justify-center border border-[#5865f2]/50 bg-[#0d102b]">
        <GladiatorPreview />
      </div>
      <div className="min-w-0 flex-1 pr-3">
        <p className="font-pixel text-[8px] leading-[1.6] text-[#ffd166]">
          JOIN THE DISCORD TO GET THE LEGENDARY GLADIATOR SKIN
        </p>
        <button
          type="button"
          onClick={onClaim}
          className="mt-2 border-2 border-[#08040f] bg-[#5865f2] px-3 py-1.5 font-pixel text-[8px] text-white shadow-[2px_2px_0_#08040f] hover:bg-[#7289da] active:translate-x-[1px] active:translate-y-[1px]"
        >
          JOIN DISCORD
        </button>
      </div>
    </div>
  );
}



function PixelReloadIcon({ className = 'h-2.5 w-2.5 tablet:h-3 tablet:w-3' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 10 10"
      className={`inline-block shrink-0 align-middle ${className}`}
      fill="currentColor"
      shapeRendering="crispEdges"
    >
      {/* Top arrow (clockwise to right) */}
      <rect x="1" y="3" width="1" height="3" />
      <rect x="2" y="2" width="1" height="1" />
      <rect x="3" y="1" width="4" height="1" />
      {/* Top arrowhead pointing right */}
      <rect x="6" y="0" width="1" height="3" />
      <rect x="7" y="1" width="1" height="1" />

      {/* Bottom arrow (clockwise to left) */}
      <rect x="8" y="4" width="1" height="3" />
      <rect x="7" y="7" width="1" height="1" />
      <rect x="3" y="8" width="4" height="1" />
      {/* Bottom arrowhead pointing left */}
      <rect x="3" y="7" width="1" height="3" />
      <rect x="2" y="8" width="1" height="1" />
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
  onOpenSkins,
  onOpenBattle,
  showDiscordPromo,
  onDiscordPromoClaim,
  onDiscordPromoDismiss,
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
  onOpenSkins?: () => void;
  onOpenBattle?: () => void;
  showDiscordPromo?: boolean;
  onDiscordPromoClaim?: () => void;
  onDiscordPromoDismiss?: () => void;
  onExportSave?: () => void;
  onImportSave?: () => void;
  onCheckUpdate?: () => void;
}) {
  return (
    <div
      className="absolute inset-0 z-10 flex cursor-default items-start justify-center overflow-y-auto bg-[#08040f]/80 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]"
    >
      <div className="my-auto flex w-full max-w-[420px] flex-col items-center gap-3 tablet:max-w-[500px]">
        <div className="text-center">
          <h1 className="font-pixel text-[20px] leading-none drop-shadow-[0_4px_0_#08040f] sm:text-[28px] tablet:text-[36px]">
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
                  <ControlHint kind="tap" keys="TAP TO JUMP" />
                  <ControlHint kind="hold" keys="HOLD TO FLOAT" />
                  <ControlHint kind="double" keys="2X TAP AIR JUMP" />
                  <ControlHint kind="dive" keys="SWIPE DOWN DIVE" />
                </>
              ) : (
                <>
                  <ControlHint kind="jump" keys="SPACE / W: JUMP" />
                  <ControlHint kind="hold" keys="HOLD: FLOAT" />
                  <ControlHint kind="double" keys="2X JUMP: AIR" />
                  <ControlHint kind="dive" keys="S / DOWN: DIVE" />
                  <ControlHint kind="boost" keys="D: BOOST" />
                  <ControlHint kind="pause" keys="P / ESC: PAUSE" />
                </>
              )}
            </div>
            <div className="mt-1 flex w-full items-center justify-center gap-4 border-t-2 border-[#251842] pt-3 font-pixel text-[8px] text-[#9d8fd6] tablet:text-[10px]">
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
            className={`flex flex-1 items-center justify-center gap-2 border-2 px-3 py-2 font-pixel text-[8px] shadow-[2px_2px_0_#08040f] transition-[transform,box-shadow,background-color,border-color,color] duration-75 active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#08040f] tablet:px-5 tablet:py-3 tablet:text-[10px] ${
              musicOn
                ? 'border-[#3ef2c8]/40 bg-[#3ef2c8]/10 text-[#3ef2c8] hover:bg-[#3ef2c8]/20'
                : 'border-[#9d8fd6]/30 bg-[#0d0619] text-[#9d8fd6] hover:border-[#9d8fd6]/60'
            }`}
          >
            <PixelSpeakerIcon active={musicOn} />
            <span>{musicOn ? 'MUSIC ON' : 'MUSIC OFF'}</span>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onToggleSfx(); }}
            aria-pressed={sfxOn}
            className={`flex flex-1 items-center justify-center gap-2 border-2 px-3 py-2 font-pixel text-[8px] shadow-[2px_2px_0_#08040f] transition-[transform,box-shadow,background-color,border-color,color] duration-75 active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#08040f] tablet:px-5 tablet:py-3 tablet:text-[10px] ${
              sfxOn
                ? 'border-[#ffd166]/40 bg-[#ffd166]/10 text-[#ffd166] hover:bg-[#ffd166]/20'
                : 'border-[#9d8fd6]/30 bg-[#0d0619] text-[#9d8fd6] hover:border-[#9d8fd6]/60'
            }`}
          >
            <PixelSpeakerIcon active={sfxOn} />
            <span>{sfxOn ? 'SFX ON' : 'SFX OFF'}</span>
          </button>
        </div>

        <div className="flex w-full max-w-[420px] items-stretch gap-2 tablet:max-w-[500px]">
          {onOpenBattle && (
            <button
              type="button"
              onClick={onOpenBattle}
              aria-label="Multiplayer Battle"
              title="Multiplayer Battle"
              className="flex h-[46px] w-[46px] sm:h-[50px] sm:w-[50px] shrink-0 items-center justify-center border-2 border-[#ff4d6d]/70 bg-[#1c0812] text-[#ff4d6d] shadow-[2px_2px_0_#08040f] transition-[transform,box-shadow,background-color] duration-75 hover:bg-[#ff4d6d]/20 active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#08040f]"
            >
              <PixelSwordsIcon className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>
          )}
          <PixelButton
            onClick={onStart}
            className="flex flex-1 items-center justify-center gap-3 py-3.5 text-[10px] tablet:py-4 tablet:text-[12px]"
          >
            <PixelPlayIcon />
            <span>START RUN</span>
          </PixelButton>
          {onOpenSkins && (
            <button
              type="button"
              onClick={onOpenSkins}
              aria-label="Character Locker"
              title="Character Locker"
              className="flex h-[46px] w-[46px] sm:h-[50px] sm:w-[50px] shrink-0 items-center justify-center border-2 border-[#3ef2c8]/60 bg-[#061815] text-[#3ef2c8] shadow-[2px_2px_0_#08040f] transition-[transform,box-shadow,background-color] duration-75 hover:bg-[#3ef2c8]/20 active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_#08040f]"
            >
              <PixelShirtIcon className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>
          )}
        </div>

        {showDiscordPromo && onDiscordPromoClaim && onDiscordPromoDismiss && (
          <DiscordPromo onClaim={onDiscordPromoClaim} onDismiss={onDiscordPromoDismiss} />
        )}
        <div className="flex items-center gap-3">
          <a
            href="https://github.com/Jimm144/pixel-run"
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => e.stopPropagation()}
            className="font-pixel text-[8px] text-[#9d8fd6] transition-colors hover:text-[#ffffff] tablet:text-[10px]"
          >
            GITHUB
          </a>
          {onExportSave && (
            <>
              <span className="text-[8px] text-[#332454]">|</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onExportSave();
                }}
                className="inline-flex items-center gap-1 cursor-pointer font-pixel text-[8px] text-[#ffd166]/70 transition-colors hover:text-[#ffd166] tablet:text-[10px]"
              >
                <span>SAVE</span>
                <PixelArrow dir="down" />
              </button>
            </>
          )}
          {onImportSave && (
            <>
              <span className="text-[8px] text-[#332454]">|</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onImportSave();
                }}
                className="inline-flex items-center gap-1 cursor-pointer font-pixel text-[8px] text-[#c98cff]/70 transition-colors hover:text-[#c98cff] tablet:text-[10px]"
              >
                <span>LOAD</span>
                <PixelArrow dir="up" />
              </button>
            </>
          )}
          {onCheckUpdate && (
            <>
              <span className="text-[8px] text-[#332454]">|</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCheckUpdate();
                }}
                className="inline-flex items-center gap-1 cursor-pointer font-pixel text-[8px] text-[#3ef2c8]/70 transition-colors hover:text-[#3ef2c8] tablet:text-[10px]"
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
          className={`flex items-center justify-center border-2 px-1.5 py-1 font-pixel text-[8px] transition-colors ${
            isMuted
              ? 'border-[#2c1f4d] bg-[#08040f] text-[#9d8fd6]/50 opacity-60 hover:border-[#9d8fd6]/60 hover:text-[#9d8fd6]'
              : 'border-[#3ef2c8]/60 bg-[#3ef2c8]/10 text-[#3ef2c8] hover:bg-[#3ef2c8]/20 active:bg-[#3ef2c8]/30'
          }`}
          title={isMuted ? `Unmute ${label} (${Math.round(prevVolRef.current * 100)}%)` : `Mute ${label}`}
        >
          <PixelSpeakerIcon active={!isMuted} />
        </button>
        <span className="font-pixel text-[8px] text-[#9d8fd6]">{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label={`${label} down`}
          disabled={isMuted}
          onClick={() => step(-10)}
          className={`border-2 px-2 py-1 font-pixel text-[10px] transition-colors ${
            isMuted
              ? 'border-[#2c1f4d] bg-[#08040f] text-[#9d8fd6]/40 opacity-40 cursor-not-allowed'
              : 'border-[#3ef2c8]/50 bg-[#0d0619] text-[#3ef2c8] hover:bg-[#3ef2c8]/10 active:bg-[#3ef2c8]/20'
          }`}
        >
          -
        </button>
        <span className={`w-11 text-center font-pixel text-[10px] ${isMuted ? 'text-[#9d8fd6]' : 'text-[#e9e2ff]'}`}>
          {pct}%
        </span>
        <button
          type="button"
          aria-label={`${label} up`}
          onClick={() => step(10)}
          className="border-2 border-[#3ef2c8]/50 bg-[#0d0619] px-2 py-1 font-pixel text-[10px] text-[#3ef2c8] transition-colors hover:bg-[#3ef2c8]/10 active:bg-[#3ef2c8]/20"
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
  touch = false,
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
  touch?: boolean;
}) {
  const handleMenu = onMenu ?? onQuit ?? (() => {});

  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center overflow-y-auto bg-[#08040f]/80 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] [@media(max-height:640px)]:items-end [@media(max-height:640px)]:pb-8"
      onPointerDown={() => sfx.unlock()}
    >
      <Panel className="w-full max-w-[300px] p-4 tablet:max-w-[420px] tablet:p-6">
        <h2 className="mb-3 text-center font-pixel text-[16px] text-[#3ef2c8] tablet:mb-4 tablet:text-[20px]">PAUSED</h2>
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
            <PixelButton variant="danger" onClick={onRestart} small className="px-2 py-2.5 tablet:py-3 tablet:text-[10px] whitespace-nowrap">
              {touch ? 'RETRY' : 'RETRY [R]'}
            </PixelButton>
            <PixelButton variant="ghost" onClick={handleMenu} small className="px-2 py-2.5 tablet:py-3 tablet:text-[10px] whitespace-nowrap">
              {touch ? 'MENU' : 'MENU [ESC]'}
            </PixelButton>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function PixelShareIcon({ className = 'h-[14px] w-[14px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" shapeRendering="crispEdges" aria-hidden="true">
      {/* Up arrow tip */}
      <rect x="7" y="1" width="2" height="1" />
      <rect x="6" y="2" width="4" height="1" />
      <rect x="5" y="3" width="6" height="1" />
      {/* Up arrow shaft */}
      <rect x="7" y="4" width="2" height="5" />
      {/* Box bottom */}
      <rect x="2" y="13" width="12" height="2" />
      {/* Box sides */}
      <rect x="2" y="8" width="2" height="5" />
      <rect x="12" y="8" width="2" height="5" />
    </svg>
  );
}

const DEATH_CAUSE_LABELS: Record<string, string> = {
  pit: 'FELL INTO THE ABYSS',
  wall: 'CRUSHED BY A WALL',
  spike: 'IMPALED ON SPIKES',
  spiker: 'SPIKED (DIVE TO SMASH)',
  hit: 'DEFEATED BY ENEMY',
};

/* ---------------------------------------------------------------- game over */
export function GameOverScreen({
  stats,
  best,
  newBest,
  onRestart,
  onMenu,
  onShare,
  touch,
}: {
  stats: Stats;
  best: number;
  newBest: boolean;
  onRestart: () => void;
  onMenu: () => void;
  onShare?: () => void;
  touch: boolean;
}) {
  const causeLabel = (stats.cause && DEATH_CAUSE_LABELS[stats.cause]) || 'RUN TERMINATED';

  return (
    <div
      className="absolute inset-0 z-10 flex items-start justify-center overflow-y-auto bg-[#08040f]/80 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]"
      onPointerDown={() => sfx.unlock()}
    >
      <div className="my-auto flex w-full max-w-[380px] flex-col items-center gap-3 tablet:max-w-[460px]">
        <div className="text-center">
          <h2 className="animate-shake-in font-pixel text-[20px] text-[#ff4d6d] drop-shadow-[0_4px_0_#08040f] tablet:text-[28px]">
            WASTED
          </h2>
          <p className="mt-1 font-pixel text-[8px] tracking-wider text-[#ff4d6d]/80">
            {causeLabel}
          </p>
        </div>
        <Panel className="w-full">
          <div className="mb-3 text-center">
            <p className="font-pixel text-[8px] text-[#9d8fd6]">
              {newBest ? 'NEW PERSONAL BEST' : 'FINAL SCORE'}
            </p>
            <p className="font-pixel text-[20px] text-[#ffd166] drop-shadow-[0_3px_0_#08040f] tablet:text-[28px]">
              {pad(stats.score, 6)}
            </p>
            {!newBest && (
              <p className="mt-2 font-pixel text-[8px] text-[#9d8fd6]">
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
            <PixelButton onClick={onRestart} className="flex flex-[1.4] items-center justify-center py-3 text-[10px] tablet:py-3.5 tablet:text-[12px] whitespace-nowrap">
              <span>{touch ? 'RETRY' : 'RETRY [R]'}</span>
            </PixelButton>
            <PixelButton variant="ghost" onClick={onMenu} className="flex flex-1 items-center justify-center py-3 text-[10px] tablet:py-3.5 tablet:text-[12px] whitespace-nowrap">
              <span>{touch ? 'MENU' : 'MENU [ESC]'}</span>
            </PixelButton>
          </div>
          {newBest && onShare && (
            <PixelButton
              variant="ghost"
              onClick={onShare}
              small
              className="w-full flex items-center justify-center py-2.5 border-[#ffd166]/70 bg-[#ffd166]/10 text-[#ffd166] hover:bg-[#ffd166]/20 hover:text-[#fff4b8] hover:border-[#ffd166] tablet:py-3"
            >
              <PixelShareIcon className="mr-1.5 inline-block h-[12px] w-[12px] align-[-2px] tablet:h-[15px] tablet:w-[15px]" />
              SHARE SCORE
            </PixelButton>
          )}
        </div>
      </div>
    </div>
  );
}
