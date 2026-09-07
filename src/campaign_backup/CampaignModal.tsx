import { useState, useEffect, useCallback, useRef } from 'react';
import { PixelCloseIcon, PixelArrow } from '../components/ui';
import { sfx } from '../game/audio';
import { inputManager, type GamepadAction } from '../game/input';
import { CAMPAIGN_LEVELS, levelBestPercent, type CampaignProgress, type CampaignLevel } from './campaign';

interface BiomeItem {
  id: string;
  number: number;
  name: string;
  themeColor: string;
  unlocked: boolean;
  done: boolean;
  bestPct: number;
  diffLabel: string;
  brief: string;
  targetMeters: number;
}

function buildBiomes(progress: CampaignProgress): BiomeItem[] {
  return CAMPAIGN_LEVELS.map((lvl: CampaignLevel, i: number) => ({
    id: lvl.id,
    number: i + 1,
    name: lvl.name,
    themeColor: lvl.color,
    unlocked: i < progress.unlocked,
    done: !!progress.done[i],
    bestPct: levelBestPercent(progress, i),
    diffLabel: lvl.diffLabel,
    brief: lvl.brief,
    targetMeters: lvl.targetMeters,
  }));
}

/* ------------------------------------------------------------- Clean & Bold Pixel Art Engine (100x75 4:3 Grid) */

const W = 100;
const H = 75;

function drawBiomePixelArt(ctx: CanvasRenderingContext2D, id: string) {
  ctx.clearRect(0, 0, W, H);

  // Helper pixel block primitives
  const p = (x: number, y: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1);
  };
  const r = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
  };

  /* ----------------------------------------------------------------- 1. CONSTRUCTION */
  if (id === 'construction') {
    // Clean Twilight Horizon Sky
    r(0, 0, W, 18, '#130c24');
    r(0, 18, W, 18, '#24143a');
    r(0, 36, W, 18, '#461e48');
    r(0, 54, W, 21, '#6f284e');

    // Clean Sunset Sun Disk
    r(68, 16, 16, 16, '#ffd166');
    r(71, 13, 10, 22, '#ffd166');
    r(71, 17, 10, 14, '#fff3a8');

    // City Silhouettes
    r(6, 32, 10, 28, '#1d122f');
    r(18, 26, 12, 34, '#1d122f');
    r(68, 36, 12, 24, '#1d122f');
    r(82, 30, 12, 30, '#1d122f');
    // Lit Windows
    p(22, 30, '#ffd166');
    p(25, 30, '#ffd166');
    p(22, 36, '#48cae4');
    p(85, 34, '#ffd166');
    p(88, 34, '#ffd166');

    // Steel Framework Building (Right side)
    r(64, 18, 3, 40, '#d62828');
    r(80, 18, 3, 40, '#d62828');
    r(94, 18, 3, 40, '#d62828');
    // Floor Girders
    r(62, 22, 35, 3, '#ba181b');
    r(62, 21, 35, 1, '#fcbf49');
    r(62, 36, 35, 3, '#ba181b');
    r(62, 35, 35, 1, '#fcbf49');
    r(62, 50, 35, 3, '#ba181b');
    r(62, 49, 35, 1, '#fcbf49');

    // Floating Foundation Platform
    r(4, 58, 92, 17, '#1b1c28');
    r(6, 57, 88, 3, '#2d3142');
    r(2, 55, 96, 2, '#4f5d75');
    r(2, 54, 96, 1, '#8d99ae');

    // Hazard Caution Stripes
    for (let x = 6; x < 90; x += 8) {
      r(x, 55, 4, 2, '#ffd166');
    }

    // Hero Tower Crane (Yellow)
    // Mast
    r(30, 8, 5, 47, '#ffd166');
    r(29, 8, 1, 47, '#cc9a00');
    r(35, 8, 1, 47, '#fff3a8');
    for (let y = 12; y < 52; y += 6) {
      r(30, y, 5, 2, '#130c24');
    }

    // Mast Top Beacon
    r(30, 4, 5, 4, '#ffd166');
    r(31, 2, 3, 2, '#ff0054');
    p(32, 2, '#ffffff');

    // Cabin
    r(22, 10, 8, 8, '#ffd166');
    r(23, 12, 4, 4, '#3ef2c8');
    p(24, 12, '#ffffff');

    // Jib Boom Arm
    r(10, 6, 80, 4, '#ffd166');
    r(10, 5, 80, 1, '#fff3a8');
    r(10, 10, 80, 1, '#cc9a00');

    // Counterweight
    r(10, 4, 10, 10, '#4f5d75');
    r(12, 6, 6, 6, '#6c757d');

    // Cable & Suspended I-Beam
    r(50, 10, 1, 22, '#ffffff');
    r(54, 10, 1, 22, '#ffffff');
    r(49, 32, 7, 3, '#ffd166');
    // Suspended Orange I-Beam
    r(38, 35, 34, 4, '#f77f00');
    r(38, 34, 34, 1, '#ffd166');
    r(38, 39, 34, 1, '#d62828');

    // Cones on Platform
    r(16, 52, 4, 3, '#f77f00');
    p(17, 51, '#ffffff');
    p(18, 51, '#ffffff');
    p(17, 50, '#f77f00');

    r(48, 52, 4, 3, '#f77f00');
    p(49, 51, '#ffffff');
    p(50, 51, '#ffffff');
    p(49, 50, '#f77f00');
  }

  /* ----------------------------------------------------------------- 2. PIRATES */
  if (id === 'pirates') {
    // Clean Midnight Navy Sky
    r(0, 0, W, 18, '#060c18');
    r(0, 18, W, 18, '#0d1b2f');
    r(0, 36, W, 18, '#142c4b');
    r(0, 54, W, 21, '#1b3e66');

    // Clean Harvest Full Moon
    r(72, 8, 16, 16, '#ffd166');
    r(75, 5, 10, 22, '#ffd166');
    r(75, 9, 10, 14, '#fff3a8');
    p(76, 12, '#ffd166');
    p(81, 16, '#ffd166');

    // Stars
    p(12, 8, '#ffffff');
    p(28, 14, '#caf0f8');
    p(48, 6, '#ffffff');
    p(92, 16, '#caf0f8');

    // Ocean Water Block
    r(0, 54, W, 21, '#0077b6');
    r(0, 52, W, 3, '#0096c7');
    r(0, 50, W, 2, '#48cae4');
    // Wave Foam
    for (let x = 4; x < W; x += 12) {
      r(x, 50, 6, 1, '#caf0f8');
    }

    // Pirate Galleon Wooden Hull
    r(16, 36, 68, 16, '#381d08');
    r(18, 38, 64, 12, '#522b0c');
    r(20, 40, 60, 8, '#6f3b11');
    r(16, 35, 68, 1, '#ffd166');

    // Stern Castle & Captain's Windows
    r(16, 25, 14, 11, '#522b0c');
    r(15, 24, 16, 1, '#ffd166');
    r(18, 27, 3, 4, '#ffd166');
    r(23, 27, 3, 4, '#ffd166');
    // Red Stern Lantern
    p(14, 27, '#ff0054');
    p(14, 28, '#ffd166');

    // Bowsprit Timber
    r(84, 35, 10, 2, '#522b0c');
    p(93, 33, '#ffd166');
    p(94, 34, '#ffd166');

    // Cannon Gunports
    r(32, 42, 4, 4, '#120c24');
    r(48, 42, 4, 4, '#120c24');
    r(64, 42, 4, 4, '#120c24');
    p(31, 43, '#2b2d42');
    p(47, 43, '#2b2d42');
    p(63, 43, '#2b2d42');

    // Mainmast & Yardarms
    r(46, 4, 4, 34, '#381d08');
    r(26, 9, 44, 2, '#522b0c');
    r(28, 25, 40, 2, '#522b0c');

    // Billowing Clean White Sails
    r(28, 10, 40, 15, '#ffffff');
    r(32, 12, 32, 11, '#e0e1dd');
    r(26, 17, 44, 1, '#ced4da');

    // Crow's Nest
    r(45, 6, 6, 4, '#522b0c');
    r(45, 5, 6, 1, '#ffd166');

    // Large Waving Black Skull Flag
    r(49, 1, 14, 8, '#111111');
    r(54, 3, 4, 4, '#ffffff');
    p(55, 7, '#ffffff');
    p(54, 4, '#111111');
    p(56, 4, '#111111');

    // Floating Rum Barrel in Ocean
    r(20, 53, 5, 6, '#6f3b11');
    r(20, 54, 5, 1, '#ffd166');
    r(20, 57, 5, 1, '#ffd166');

    // Treasure Chest
    r(78, 52, 8, 6, '#522b0c');
    r(78, 51, 8, 1, '#ffd166');
    p(81, 53, '#ffd166');
    p(79, 50, '#ffd166');
    p(82, 50, '#ff0054');
  }

  /* ----------------------------------------------------------------- 3. OCEAN */
  if (id === 'ocean') {
    // Clean Deep Sapphire Ocean Gradient
    r(0, 0, W, 15, '#03045e');
    r(0, 15, W, 18, '#023e8a');
    r(0, 33, W, 20, '#0077b6');
    r(0, 53, W, 22, '#0096c7');

    // Surface Waves & Sunlight Beams
    r(0, 4, W, 2, '#48cae4');
    for (let x = 4; x < W; x += 10) {
      r(x, 3, 6, 1, '#ffffff');
    }
    // Clean Sunbeam Columns
    for (let i = 0; i < 35; i++) {
      p(16 + i * 0.6, 5 + i * 1.8, '#caf0f8');
      p(46 + i * 0.6, 5 + i * 1.8, '#caf0f8');
      p(76 + i * 0.6, 5 + i * 1.8, '#caf0f8');
    }

    // Hero Giant Blue Whale (Center Stage x=10..90, y=18..54)
    // Dark Slate Dorsal Body
    r(26, 24, 48, 14, '#1d3557');
    r(30, 22, 40, 18, '#2b4c6f');
    r(34, 20, 32, 22, '#457b9d');

    // Head & Snout
    r(68, 25, 14, 13, '#1d3557');
    r(72, 27, 12, 10, '#2b4c6f');
    r(80, 29, 6, 7, '#1d3557');
    p(86, 31, '#1d3557');
    p(86, 32, '#1d3557');
    // Smile line
    for (let x = 70; x <= 85; x++) p(x, 34, '#0a192f');

    // Eye with white shine
    r(74, 28, 3, 3, '#03045e');
    p(75, 28, '#ffffff');

    // Blowhole Water Spout
    r(68, 16, 2, 8, '#caf0f8');
    r(65, 12, 8, 4, '#ffffff');
    p(63, 10, '#caf0f8');
    p(74, 10, '#caf0f8');

    // Clean White / Ice-Blue Pleated Belly
    r(36, 36, 38, 8, '#a8dadc');
    r(40, 40, 30, 4, '#ffffff');
    for (let x = 38; x < 68; x += 4) {
      r(x, 36, 1, 8, '#457b9d');
    }

    // Pectoral Flipper
    r(50, 38, 8, 6, '#1d3557');
    r(48, 44, 7, 6, '#2b4c6f');
    r(46, 50, 6, 4, '#457b9d');

    // Dorsal Fin
    r(34, 18, 4, 3, '#1d3557');
    p(33, 19, '#1d3557');

    // Caudal Tail Peduncle & Fluke Tail
    r(18, 28, 12, 7, '#1d3557');
    // Upper Fluke
    r(10, 24, 4, 3, '#2b4c6f');
    r(6, 20, 4, 4, '#457b9d');
    // Lower Fluke
    r(10, 36, 4, 3, '#2b4c6f');
    r(6, 39, 4, 4, '#457b9d');

    // Air Bubbles
    p(44, 48, '#caf0f8');
    r(42, 50, 2, 2, '#ffffff');
    p(32, 42, '#ffffff');
    p(22, 36, '#caf0f8');
    r(18, 30, 2, 2, '#ffffff');

    // Sandy Seabed with Coral (Bottom)
    r(0, 70, W, 5, '#d4a373');
    r(10, 64, 6, 6, '#ff70a6');
    r(12, 62, 3, 2, '#ff9ebb');
    r(80, 62, 5, 8, '#3ef2c8');
  }

  /* ----------------------------------------------------------------- 4. VOLCANO */
  if (id === 'volcano') {
    // Dark Volcanic Ash Sky
    r(0, 0, W, 18, '#140808');
    r(0, 18, W, 18, '#200d0d');
    r(0, 36, W, 18, '#321212');
    r(0, 54, W, 21, '#421616');

    // Hero Volcano Mountain Peak
    for (let i = 0; i < 35; i++) {
      r(38 - i * 0.9, 23 + i, 24 + i * 1.8, 1, '#2d1313');
      r(42 - i * 0.7, 26 + i, 16 + i * 1.4, 1, '#4a1515');
      r(46 - i * 0.5, 30 + i, 8 + i * 1.0, 1, '#671a1a');
    }

    // Molten Magma Crater Lake
    r(40, 20, 20, 5, '#ff5400');
    r(43, 21, 14, 3, '#ffd166');
    r(47, 21, 6, 2, '#ffffff');

    // 2 Clean Cascading Molten Lava Falls
    for (let i = 0; i < 32; i++) {
      r(44 + Math.floor(Math.sin(i * 0.25) * 3), 24 + i, 2, 1, '#ff5400');
      p(45 + Math.floor(Math.sin(i * 0.25) * 3), 24 + i, '#ffd166');

      r(54 + Math.floor(Math.cos(i * 0.25) * 3), 24 + i, 2, 1, '#ff0054');
      p(55 + Math.floor(Math.cos(i * 0.25) * 3), 24 + i, '#ffd166');
    }

    // Magma Pool Base
    r(16, 58, 68, 12, '#ff5400');
    r(22, 60, 56, 8, '#ffd166');

    // Smoke Plumes
    r(44, 10, 14, 10, '#3a2525');
    r(38, 5, 12, 8, '#2d1d1d');
    r(50, 6, 12, 8, '#2d1d1d');
    r(45, 1, 10, 6, '#201515');

    // Sparks & Embers
    p(45, 14, '#ffd166');
    p(52, 11, '#ff5400');
    p(40, 4, '#ffd166');
    p(58, 3, '#ff5400');
    p(49, 0, '#ffffff');
  }

  /* ----------------------------------------------------------------- 5. HELL */
  if (id === 'hell') {
    // Crimson Nether Sky
    r(0, 0, W, 18, '#120004');
    r(0, 18, W, 18, '#240008');
    r(0, 36, W, 18, '#3a000e');
    r(0, 54, W, 21, '#500014');

    // Obsidian Spires
    for (let i = 0; i < 38; i++) {
      r(10 + i * 0.2, 20 + i, 10 - i * 0.1, 1, '#150a24');
      r(80 - i * 0.2, 20 + i, 10 - i * 0.1, 1, '#150a24');
    }

    // Hero Demon Portal Gateway
    r(30, 20, 40, 38, '#2b0008');
    r(33, 23, 34, 35, '#590d22');

    // Demon Horns
    for (let i = 0; i < 10; i++) {
      r(30 - i, 20 - i, 3 + i * 0.2, 2, '#150a24');
      r(67 + i, 20 - i, 3 + i * 0.2, 2, '#150a24');
    }

    // Swirling Portal Gate
    r(36, 26, 28, 28, '#ff0054');
    r(40, 30, 20, 20, '#ff5400');
    r(44, 34, 12, 12, '#ffd166');
    r(47, 37, 6, 6, '#ffffff');

    // Fire Braziers
    r(22, 48, 6, 10, '#150a24');
    r(21, 46, 8, 2, '#ff5400');
    r(23, 44, 4, 3, '#ffd166');

    r(72, 48, 6, 10, '#150a24');
    r(71, 46, 8, 2, '#ff5400');
    r(73, 44, 4, 3, '#ffd166');
  }

  /* ----------------------------------------------------------------- 6. HEAVEN */
  if (id === 'heaven') {
    // Celestial Twilight Sky
    r(0, 0, W, 18, '#151833');
    r(0, 18, W, 18, '#20264d');
    r(0, 36, W, 18, '#323d70');
    r(0, 54, W, 21, '#4d5c99');

    // Radiant Sunbeams
    for (let i = 0; i < 50; i++) {
      p(50 - i * 0.5, i, '#ffd700');
      p(50 + i * 0.5, i, '#ffd700');
      p(50 - i, i * 1.4, '#fff3a8');
      p(50 + i, i * 1.4, '#fff3a8');
    }

    // Billowing Pure White Clouds
    r(8, 52, 84, 22, '#e8ecff');
    r(12, 47, 76, 20, '#ffffff');
    r(18, 42, 30, 10, '#ffffff');
    r(52, 42, 30, 10, '#ffffff');

    // Hero Golden Marble Temple
    // Fluted Gold Columns
    r(33, 22, 5, 25, '#ffd700');
    r(32, 21, 7, 2, '#fff3a8');
    r(32, 46, 7, 2, '#cc9a00');

    r(62, 22, 5, 25, '#ffd700');
    r(61, 21, 7, 2, '#fff3a8');
    r(61, 46, 7, 2, '#cc9a00');

    // Pediment Roof
    r(28, 19, 44, 4, '#ffd700');
    r(28, 18, 44, 1, '#ffffff');
    for (let i = 0; i < 22; i++) {
      r(50 - i, 18 - Math.floor(i * 0.4), i * 2, 1, '#ffd700');
    }

    // Divine Glowing Halo Ring
    r(46, 30, 8, 8, '#ffd700');
    r(47, 31, 6, 6, '#ffffff');
    r(48, 22, 4, 25, '#fff3a8');
  }
}

function BiomeCanvas({ id }: { id: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    drawBiomePixelArt(ctx, id);
  }, [id]);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      className="w-full h-full aspect-[4/3] [image-rendering:pixelated]"
      style={{ imageRendering: 'pixelated' }}
      aria-hidden="true"
    />
  );
}

/* ------------------------------------------------------------- Clean Geometry Dash Campaign Screen */

export function CampaignModal({
  onClose,
  onSelectLevel,
  progress,
}: {
  onClose: () => void;
  onSelectLevel?: (levelIndex: number) => void;
  progress: CampaignProgress;
  touch?: boolean;
}) {
  const BIOMES = buildBiomes(progress);
  const [selectedIndex, setSelectedIndex] = useState(() => {
    // Land on the first incomplete unlocked level — the "current" one.
    const cur = BIOMES.findIndex((b) => b.unlocked && !b.done);
    return cur === -1 ? 0 : cur;
  });

  const selectedBiome = BIOMES[selectedIndex] || BIOMES[0];

  const handlePrev = () => {
    sfx.play('ui');
    setSelectedIndex((prev) => (prev - 1 + BIOMES.length) % BIOMES.length);
  };

  const handleNext = () => {
    sfx.play('ui');
    setSelectedIndex((prev) => (prev + 1) % BIOMES.length);
  };

  const handlePlay = useCallback(() => {
    if (!selectedBiome.unlocked) return;
    sfx.play('jump');
    onSelectLevel?.(selectedIndex);
  }, [selectedBiome.unlocked, onSelectLevel, selectedIndex]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        e.preventDefault();
        handleNext();
      } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        e.preventDefault();
        handlePrev();
      } else if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        handlePlay();
      }
    },
    [onClose, handlePlay],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Gamepad integration
  useEffect(() => {
    const cleanup = inputManager.onAction((action: GamepadAction) => {
      if (action === 'back') {
        onClose();
      } else if (action === 'right') {
        handleNext();
      } else if (action === 'left') {
        handlePrev();
      } else if (action === 'confirm' || action === 'jump') {
        handlePlay();
      }
    });

    return () => {
      cleanup();
    };
  }, [onClose, handlePlay]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-[#08040f]/95 p-4 sm:p-8 font-pixel select-none overflow-hidden"
      onClick={onClose}
    >
      {/* Top Header: Title on Left, Standard Red [X] on Right */}
      <div
        className="flex w-full max-w-[800px] items-center justify-between z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="h-3.5 w-3.5 bg-[var(--ui-gold)] border border-[var(--ui-border)] shadow-[2px_2px_0_var(--ui-bg)]" />
          <h1 className="font-pixel text-[14px] uppercase tracking-wider text-[var(--ui-gold)] sm:text-[18px]">
            CAMPAIGN
          </h1>
          <span className="border-2 border-[var(--ui-accent)]/60 bg-[var(--ui-accent-dim)] px-2 py-1 font-pixel text-[8px] text-[var(--ui-accent)] sm:text-[9px]">
            {BIOMES.filter((b) => b.done).length}/{BIOMES.length} CLEARED
          </span>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center border-2 border-[var(--ui-danger)] bg-[var(--ui-danger)]/20 font-pixel text-[10px] text-[var(--ui-danger)] shadow-[2px_2px_0_var(--ui-bg)] hover:bg-[var(--ui-danger)]/40 active:translate-x-[1px] active:translate-y-[1px]"
        >
          <PixelCloseIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Main Geometry Dash Level Card Showcase */}
      <div
        className="relative flex w-full max-w-[800px] flex-1 items-center justify-center my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left Arrow Button */}
        <button
          type="button"
          onClick={handlePrev}
          aria-label="Previous Level"
          className="absolute -left-1 sm:left-4 z-30 flex h-12 w-10 sm:h-16 sm:w-14 items-center justify-center border-4 border-[var(--ui-gold)] bg-[var(--ui-panel)] text-[var(--ui-gold)] shadow-[4px_4px_0_var(--ui-bg)] transition-all hover:bg-[var(--ui-gold)]/20 active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0_var(--ui-bg)]"
        >
          <PixelArrow dir="left" className="h-5 w-5 sm:h-7 sm:w-7 fill-current" />
        </button>

        {/* Central Card with Massive Art */}
        <div className="flex flex-col items-center z-20 mx-4 sm:mx-16 w-full max-w-[340px]">
          {/* Level Title Header */}
          <span
            className="font-pixel text-[16px] sm:text-[22px] uppercase tracking-wider mb-3 text-center"
            style={{ color: selectedBiome.themeColor }}
          >
            {selectedBiome.number}. {selectedBiome.name}
          </span>

          {/* Outer Card Frame */}
          <div
            className="relative flex flex-col items-center justify-center w-full border-4 bg-[var(--ui-panel)] p-2 shadow-[6px_6px_0_var(--ui-bg)]"
            style={{ borderColor: selectedBiome.themeColor }}
          >
            {/* 4:3 Aspect Ratio Pixel Art Viewport (No Squishing!) */}
            <div className="relative flex items-center justify-center w-full aspect-[4/3] bg-[var(--ui-panel2)] border-2 border-[var(--ui-border)] overflow-hidden">
              <div style={selectedBiome.unlocked ? undefined : { filter: 'grayscale(0.85) brightness(0.5)' }} className="flex h-full w-full items-center justify-center">
                <BiomeCanvas id={selectedBiome.id} />
              </div>

              {/* Level number badge */}
              <span
                className="absolute top-2 left-2 flex h-7 w-7 items-center justify-center border-2 font-pixel text-[12px] shadow-[2px_2px_0_var(--ui-bg)]"
                style={{
                  borderColor: selectedBiome.themeColor,
                  color: selectedBiome.themeColor,
                  backgroundColor: 'var(--ui-panel)',
                }}
              >
                {selectedBiome.number}
              </span>

              {!selectedBiome.unlocked && (
                <>
                  <div className="absolute top-2.5 right-2.5 border-2 border-[var(--ui-border)] bg-[var(--ui-panel2)] px-2.5 py-1 font-pixel text-[9px] text-[var(--ui-muted)] shadow-[2px_2px_0_var(--ui-bg)]">
                    LOCKED
                  </div>
                  <div className="absolute inset-x-3 bottom-3 border-2 border-[var(--ui-border)] bg-[var(--ui-panel)]/90 px-2 py-1.5 text-center font-pixel text-[7px] text-[var(--ui-muted)]">
                    CLEAR LEVEL {selectedBiome.number - 1} TO UNLOCK
                  </div>
                </>
              )}
              {selectedBiome.done && selectedBiome.unlocked && (
                <div className="absolute top-2.5 right-2.5 border-2 border-[var(--ui-accent)] bg-[var(--ui-accent-dim)] px-2 py-1 font-pixel text-[9px] text-[var(--ui-accent)] shadow-[2px_2px_0_var(--ui-bg)]">
                  CLEARED
                </div>
              )}
            </div>

            {/* Level meta: difficulty, goal, best % */}
            <div className="mt-2 w-full border-2 border-[var(--ui-border)] bg-[var(--ui-panel3)] px-2.5 py-2">
              <div className="flex items-center justify-between font-pixel text-[8px]">
                <span className="text-[var(--ui-muted)]">
                  GOAL {selectedBiome.targetMeters}M
                </span>
                <span
                  className="border border-current px-1.5 py-0.5"
                  style={{ color: selectedBiome.themeColor }}
                >
                  {selectedBiome.diffLabel}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="font-pixel text-[8px] text-[var(--ui-muted)]">BEST</span>
                <div className="relative h-2 flex-1 border border-[var(--ui-border)] bg-[var(--ui-bg)]">
                  <div
                    className="absolute inset-y-0 left-0"
                    style={{ width: `${selectedBiome.bestPct}%`, backgroundColor: selectedBiome.themeColor }}
                  />
                </div>
                <span className="w-9 text-right font-pixel text-[8px] text-white">
                  {selectedBiome.bestPct}%
                </span>
              </div>
              <p className="mt-1.5 font-pixel text-[7px] tracking-wide text-[var(--ui-muted)]">
                {selectedBiome.brief}
              </p>
            </div>
          </div>

          {/* Navigation Dots — state-colored: cleared / unlocked / locked */}
          <div className="mt-4 flex items-center gap-2">
            {BIOMES.map((b, i) => (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  sfx.play('ui');
                  setSelectedIndex(i);
                }}
                aria-label={b.name}
                className={`h-2.5 w-2.5 border transition-all ${
                  i === selectedIndex ? 'scale-125' : ''
                }`}
                style={{
                  borderColor: b.done ? b.themeColor : b.unlocked ? 'var(--ui-gold)' : 'var(--ui-border)',
                  backgroundColor:
                    i === selectedIndex
                      ? b.done
                        ? b.themeColor
                        : b.unlocked
                          ? 'var(--ui-gold)'
                          : 'var(--ui-panel2)'
                      : b.done
                        ? 'transparent'
                        : 'var(--ui-panel2)',
                }}
              />
            ))}
          </div>
          <p className="mt-3 font-pixel text-[7px] tracking-wider text-[var(--ui-muted)]">
            ←→ SELECT · SPACE PLAY · ESC MENU
          </p>
        </div>

        {/* Right Arrow Button */}
        <button
          type="button"
          onClick={handleNext}
          aria-label="Next Level"
          className="absolute -right-1 sm:right-4 z-30 flex h-12 w-10 sm:h-16 sm:w-14 items-center justify-center border-4 border-[var(--ui-gold)] bg-[var(--ui-panel)] text-[var(--ui-gold)] shadow-[4px_4px_0_var(--ui-bg)] transition-all hover:bg-[var(--ui-gold)]/20 active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0_var(--ui-bg)]"
        >
          <PixelArrow dir="right" className="h-5 w-5 sm:h-7 sm:w-7 fill-current" />
        </button>
      </div>

      {/* Bottom Bar: Geometry Dash Giant Central Play Button */}
      <div
        className="flex flex-col items-center z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handlePlay}
          disabled={!selectedBiome.unlocked}
          className={`flex items-center justify-center gap-3 px-10 sm:px-14 py-3.5 sm:py-4 font-pixel text-[12px] sm:text-[14px] uppercase border-4 transition-all ${
            !selectedBiome.unlocked
              ? 'border-[var(--ui-border)] bg-[var(--ui-panel2)] text-[var(--ui-muted)] opacity-60 cursor-not-allowed'
              : 'border-[var(--ui-bg)] bg-[var(--ui-accent)] text-[#08040f] hover:bg-[var(--ui-accent-hi)] shadow-[5px_5px_0_var(--ui-bg)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0_var(--ui-bg)]'
          }`}
        >
          {/* Big Play Triangle */}
          <svg viewBox="0 0 16 16" className="h-5 w-5 sm:h-6 sm:w-6 fill-current" shapeRendering="crispEdges" aria-hidden="true">
            <polygon points="3,1 15,8 3,15" />
          </svg>
          <span>{!selectedBiome.unlocked ? 'LOCKED' : selectedBiome.done ? 'REPLAY' : 'PLAY'}</span>
        </button>
      </div>
    </div>
  );
}

/** Shown when the campaign flag is reached. Offers next / replay / menu. */
export function CampaignVictoryModal({
  level,
  meters,
  nextUnlocked,
  onNext,
  onReplay,
  onCampaign,
  onMenu,
}: {
  level: number;
  meters: number;
  nextUnlocked: boolean;
  onNext: () => void;
  onReplay: () => void;
  onCampaign: () => void;
  onMenu: () => void;
}) {
  const lvl = CAMPAIGN_LEVELS[level];
  const isFinal = level >= CAMPAIGN_LEVELS.length - 1;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--ui-bg)]/90 p-4 font-pixel">
      <div
        className="flex w-full max-w-[380px] flex-col items-center border-4 bg-[var(--ui-panel)] p-5 text-center shadow-[6px_6px_0_var(--ui-bg)]"
        style={{ borderColor: lvl?.color || 'var(--ui-gold)' }}
      >
        <div
          className="border-2 px-3 py-1 font-pixel text-[9px]"
          style={{ borderColor: lvl?.color, color: lvl?.color }}
        >
          L{level + 1} {lvl?.name}
        </div>
        <h2 className="mt-3 font-pixel text-[18px] uppercase text-[var(--ui-gold)] sm:text-[22px]">
          LEVEL COMPLETE!
        </h2>
        <p className="mt-2 font-pixel text-[8px] text-[var(--ui-muted)]">
          {isFinal ? 'CAMPAIGN CONQUERED — YOU REACHED HEAVEN' : 'FLAG REACHED'}
        </p>
        <p className="mt-3 font-pixel text-[22px] text-white sm:text-[26px]">{meters}M</p>
        <div className="mt-5 flex w-full flex-col gap-2">
          {!isFinal && nextUnlocked && (
            <button
              type="button"
              onClick={onNext}
              className="w-full border-2 border-[var(--ui-bg)] bg-[var(--ui-accent)] py-3 font-pixel text-[10px] uppercase text-[#08040f] shadow-[3px_3px_0_var(--ui-bg)] transition-all hover:bg-[var(--ui-accent-hi)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_var(--ui-bg)]"
            >
              NEXT LEVEL
            </button>
          )}
          <button
            type="button"
            onClick={onReplay}
            className="w-full border-2 border-[var(--ui-accent)]/60 bg-[var(--ui-accent-dim)] py-2.5 font-pixel text-[9px] uppercase text-[var(--ui-accent)] shadow-[2px_2px_0_var(--ui-bg)] transition-colors hover:bg-[var(--ui-accent)]/25 active:translate-x-[1px] active:translate-y-[1px]"
          >
            REPLAY LEVEL
          </button>
          <button
            type="button"
            onClick={onCampaign}
            className="w-full border-2 border-[var(--ui-gold)]/50 bg-[var(--ui-panel2)] py-2.5 font-pixel text-[9px] uppercase text-[var(--ui-gold)] shadow-[2px_2px_0_var(--ui-bg)] transition-colors hover:bg-[var(--ui-gold)]/15 active:translate-x-[1px] active:translate-y-[1px]"
          >
            LEVEL SELECT
          </button>
          <button
            type="button"
            onClick={onMenu}
            className="w-full py-1 font-pixel text-[8px] uppercase text-[var(--ui-muted)] transition-colors hover:text-white"
          >
            BACK TO MENU
          </button>
        </div>
      </div>
    </div>
  );
}
