import { SKINS, type SkinDef, type SkinId } from './skins';
import { PLAYER_W, PLAYER_H, PLAYER_BOOT_SHOES, PLAYER_RUN_LEGS } from './types';

export interface DrawPlayerOptions {
  skinId: SkinId;
  frame: number;
  run?: number; // 0..3 for running, -1 for air
  onGround?: boolean;
  diving?: boolean;
  flashing?: boolean;
  flashAmount?: number;
  jumpShoes?: boolean;
  vx?: number;
  scale?: number;
}

const RGB_CACHE = new Map<string, [number, number, number]>();

function hexToRgb(hex: string): [number, number, number] {
  let cached = RGB_CACHE.get(hex);
  if (cached) return cached;
  let h = hex.charCodeAt(0) === 35 ? hex.slice(1) : hex;
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const num = parseInt(h, 16);
  cached = [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  RGB_CACHE.set(hex, cached);
  return cached;
}

function mixColor(c1: string, c2: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(c1);
  const [r2, g2, b2] = hexToRgb(c2);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${b})`;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Single source of truth for rendering player sprites across the game and locker menu.
 * @param ctx Target canvas 2D rendering context
 * @param cx Center X coordinate
 * @param cy Center Y coordinate
 * @param opts Options including skinId, animation frame, running state, etc.
 */
export function drawPlayerSprite(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  opts: DrawPlayerOptions,
) {
  const {
    skinId,
    frame,
    onGround = true,
    diving = false,
    flashing = false,
    flashAmount = 0,
    jumpShoes = false,
    vx = 2.1,
    scale = 1,
  } = opts;

  const skinDef: SkinDef = SKINS[skinId] || SKINS.bob;
  const run = opts.run !== undefined ? opts.run : onGround ? Math.floor(frame / 6) % 4 : -1;
  const air = !onGround || run === -1;

  ctx.save();
  ctx.translate(Math.round(cx), Math.round(cy));
  if (scale !== 1) {
    ctx.scale(scale, scale);
  }

  const f = (x: number, y: number, w: number, h: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(x - PLAYER_W / 2), Math.round(y - PLAYER_H / 2), w, h);
  };

  const tint = (base: string, extra?: string) => {
    const col = extra ?? base;
    if (!flashing || flashAmount <= 0) return col;
    return mixColor(col, '#ffffff', flashAmount);
  };

  if (skinId === 'outline') {
    // -------------------------------------------------------------
    // 1. OUTLINE SKIN (___): Pure 1px Silhouette Contour with Closed Bottom
    // -------------------------------------------------------------
    const WHT = tint('#ffffff');
    // Head 1px perimeter
    f(2, 0, 7, 1, WHT); // top
    f(2, 0, 1, 5, WHT); // left
    f(8, 0, 1, 5, WHT); // right
    f(2, 4, 1, 1, WHT); // bottom-left notch
    f(8, 4, 1, 1, WHT); // bottom-right notch
    // Body 1px perimeter
    f(2, 5, 1, 5, WHT); // left
    f(8, 5, 1, 5, WHT); // right

    // Legs 1px outline with 100% closed bottom horizontal edges
    if (diving) {
      // Diving legs
      f(1, 10, 4, 1, WHT); // top
      f(1, 13, 4, 1, WHT); // bottom
      f(1, 10, 1, 4, WHT); // left
      f(4, 10, 1, 4, WHT); // right

      f(5, 9, 5, 1, WHT); // top
      f(5, 12, 5, 1, WHT); // bottom
      f(5, 9, 1, 4, WHT); // left
      f(9, 9, 1, 4, WHT); // right
    } else if (air) {
      // Airborne legs
      f(2, 10, 3, 1, WHT); // top
      f(2, 13, 3, 1, WHT); // bottom
      f(2, 10, 1, 4, WHT); // left
      f(4, 10, 1, 4, WHT); // right

      f(6, 9, 3, 1, WHT); // top
      f(6, 12, 3, 1, WHT); // bottom
      f(6, 9, 1, 4, WHT); // left
      f(8, 9, 1, 4, WHT); // right
    } else {
      // Running legs (0..3)
      const legs = PLAYER_RUN_LEGS[run >= 0 ? run : 0];
      // Leg 1
      f(legs[0], legs[1], legs[2], 1, WHT); // top
      f(legs[0], legs[1] + legs[3] - 1, legs[2], 1, WHT); // bottom (closed)
      f(legs[0], legs[1], 1, legs[3], WHT); // left
      f(legs[0] + legs[2] - 1, legs[1], 1, legs[3], WHT); // right
      // Leg 2
      f(legs[4], legs[5], legs[6], 1, WHT); // top
      f(legs[4], legs[5] + legs[7] - 1, legs[6], 1, WHT); // bottom (closed)
      f(legs[4], legs[5], 1, legs[7], WHT); // left
      f(legs[4] + legs[6] - 1, legs[5], 1, legs[7], WHT); // right
    }
  } else if (skinId === 'leskos' || (skinId as string) === 'lekos') {
    // -------------------------------------------------------------
    // 2. LESKOS: Uncanny Floating 40yo Head with True Feathered Wings (NO BODY / NO LEGS)
    // -------------------------------------------------------------
    // Smooth natural wing flapping animation (4 graceful wing states)
    const wingCycle = (frame * 0.18) % (Math.PI * 2);
    const flap = Math.sin(wingCycle);
    const flapLag = Math.cos(wingCycle);

    // Wing bone & feather colors
    const W_BONE = tint('#2e1065');
    const W_MID = tint('#6b21a8');
    const W_FEATHER = tint('#a855f7');
    const W_TIP = tint('#d8b4fe');
    const W_GLOW = tint('#f3e8ff');

    const wy = Math.round(flap * 3.5);
    const tipLag = Math.round(flapLag * 2);

    // --- LEFT WING ---
    // Upper wing bone arch
    f(-5, 1 - wy, 5, 2, W_BONE);
    f(-9, 0 - wy, 5, 2, W_BONE);
    f(-12, 1 - wy + tipLag, 4, 2, W_MID);

    // Primary & Secondary feathered flight blades
    f(-6, 3 - wy, 4, 4, W_MID);
    f(-10, 2 - wy, 5, 5, W_FEATHER);
    f(-14, 3 - wy + tipLag, 4, 6, W_FEATHER);
    f(-17, 5 - wy + tipLag * 2, 4, 5, W_TIP);
    f(-16, 10 - wy + tipLag * 2, 2, 2, W_GLOW);

    // --- RIGHT WING ---
    f(9, 1 - wy, 5, 2, W_BONE);
    f(13, 0 - wy, 5, 2, W_BONE);
    f(17, 1 - wy + tipLag, 4, 2, W_MID);

    f(11, 3 - wy, 4, 4, W_MID);
    f(14, 2 - wy, 5, 5, W_FEATHER);
    f(19, 3 - wy + tipLag, 4, 6, W_FEATHER);
    f(22, 5 - wy + tipLag * 2, 4, 5, W_TIP);
    f(23, 10 - wy + tipLag * 2, 2, 2, W_GLOW);

    // --- STRICTLY FLOATING DETAILED FACE (NO BODY / NO LEGS / NO SCARF) ---
    // Realistic head contour & face skin
    f(1, 0, 8, 13, tint('#eec09e'));
    f(2, -1, 6, 15, tint('#eec09e'));
    f(1, 0, 8, 1, tint('#ba784d')); // forehead edge
    f(1, 12, 8, 1, tint('#ba784d')); // jaw edge

    // Dark brown hair & receding temples
    f(0, -2, 10, 3, tint('#241812'));
    f(1, -3, 8, 2, tint('#1a100a'));
    f(0, 0, 2, 6, tint('#241812')); // left sideburn
    f(8, 0, 2, 6, tint('#241812')); // right sideburn
    f(0, 3, 1, 3, tint('#ba784d')); // left earlobe
    f(9, 3, 1, 3, tint('#ba784d')); // right earlobe

    // Forehead furrow lines
    f(3, 1, 4, 1, tint('#8c4e28'));
    f(2, 2, 6, 1, tint('#caa080'));

    // UNCANNY INTENSE EYES STARING DIRECTLY AT PLAYER
    // Left eye
    f(2, 4, 3, 2, '#ffffff'); // sclera
    f(3, 4, 2, 2, '#381c0d'); // iris
    f(3, 5, 1, 1, '#050201'); // pupil
    f(3, 4, 1, 1, '#ffffff'); // catchlight
    f(2, 3, 3, 1, '#4a200a'); // upper lid fold
    f(2, 6, 3, 1, tint('#ba784d')); // eye bag
    // Right eye
    f(6, 4, 3, 2, '#ffffff'); // sclera
    f(6, 4, 2, 2, '#381c0d'); // iris
    f(6, 5, 1, 1, '#050201'); // pupil
    f(6, 4, 1, 1, '#ffffff'); // catchlight
    f(6, 3, 3, 1, '#4a200a'); // upper lid fold
    f(6, 6, 3, 1, tint('#ba784d')); // eye bag

    // Shaded nose bridge & nostrils
    f(4, 4, 2, 4, tint('#fff2e6')); // nose highlight
    f(4, 8, 2, 2, tint('#c26e3c')); // nose tip
    f(3, 9, 1, 1, '#57220b'); // left nostril
    f(6, 9, 1, 1, '#57220b'); // right nostril
    // Nasolabial smile lines
    f(2, 8, 1, 3, tint('#ba784d'));
    f(7, 8, 1, 3, tint('#ba784d'));

    // 5 o'clock stubble texture
    f(1, 8, 2, 4, tint('#694d3c'));
    f(7, 8, 2, 4, tint('#694d3c'));
    f(3, 10, 4, 3, tint('#7a5e4d'));

    // Lips & chin cleft
    f(3, 11, 4, 1, tint('#a85353')); // upper lip
    f(3, 12, 4, 1, '#3b1212'); // mouth line
    f(3, 13, 4, 1, tint('#b85c5c')); // lower lip
    f(4, 14, 2, 1, tint('#eec09e')); // chin cleft
  } else if (skinId === 'gold_bob') {
    // -------------------------------------------------------------
    // 3. GOLD BOB: Solid 100% Shimmering Metallic Gold (NOT yellow clothes)
    // -------------------------------------------------------------
    const G_LIGHT = tint('#fff3a3');
    const G_MID = tint('#ffd700');
    const G_DARK = tint('#c99000');
    const G_DEEP = tint('#8c6200');

    // Legs (Solid Gold)
    if (diving) {
      f(1, 10, 4, 4, G_DARK);
      f(5, 9, 5, 3, G_DARK);
      f(2, 11, 2, 2, G_MID);
      f(6, 10, 3, 1, G_MID);
    } else if (air) {
      f(2, 10, 3, 4, G_DARK);
      f(6, 9, 3, 4, G_DARK);
      f(3, 11, 1, 2, G_MID);
      f(7, 10, 1, 2, G_MID);
    } else {
      const legs = PLAYER_RUN_LEGS[run >= 0 ? run : 0];
      f(legs[0], legs[1], legs[2], legs[3], G_DARK);
      f(legs[4], legs[5], legs[6], legs[7], G_DARK);
      f(legs[0] + 1, legs[1] + 1, Math.max(1, legs[2] - 2), Math.max(1, legs[3] - 2), G_MID);
      f(legs[4] + 1, legs[5] + 1, Math.max(1, legs[6] - 2), Math.max(1, legs[7] - 2), G_MID);
    }

    // Body (Solid Gold with Metallic Luster Gleam)
    f(2, 5, 7, 6, G_MID);
    f(3, 5, 2, 6, G_LIGHT); // vertical gleam
    f(2, 9, 7, 2, G_DARK);

    // Arm (Solid Gold)
    if (air) {
      f(6, 3, 2, 3, G_DARK);
      f(8, 3, 2, 2, G_LIGHT);
    } else {
      const armX = [5, 6, 7, 6][run >= 0 ? run : 0];
      f(armX, 6, 2, 3, G_DARK);
      f(armX + 2, 6, 2, 2, G_LIGHT);
    }

    // Head (Solid Gold)
    f(2, 0, 7, 6, G_MID);
    f(3, 0, 3, 2, G_LIGHT); // forehead shine
    f(2, 0, 8, 2, G_DARK);
    f(5, 2, 4, 4, G_MID);
    f(7, 3, 1, 2, G_DEEP); // golden eye
    f(7, 3, 1, 1, G_LIGHT);

    // Scarf knot (Solid Gold)
    f(1, 5, 3, 2, G_LIGHT);
  } else {
    // -------------------------------------------------------------
    // Standard & Custom Themed Skins
    // -------------------------------------------------------------
    const SUIT = tint(skinDef.suit);
    const SUIT_D = tint(skinDef.suitDark);
    const SKIN = tint(skinDef.skin);
    const BOOT = tint(skinDef.boot, jumpShoes ? PLAYER_BOOT_SHOES : skinDef.boot);
    const SCARF = tint(skinDef.scarf);

    // --- WINGS / BACK ACCESSORIES (Drawn behind player) ---
    if (skinId === 'demon') {
      const flap = air ? 0.4 : Math.sin(frame * 0.28) * 0.22;
      const wy = Math.round(flap * 3);
      f(-5, 3 - wy, 5, 3, tint('#4a0000'));
      f(-7, 1 - wy, 4, 3, tint('#8b0000'));
      f(-8, 0 - wy, 3, 2, tint('#ff3333'));
    } else if (skinId === 'pig') {
      f(-2, 7, 3, 2, tint('#d9688b'));
      f(-1, 6, 2, 2, tint('#d9688b'));
    } else if (skinId === 'bobette') {
      // Bobette long natural brown hair tucked behind back/shoulders
      f(-1, 0, 3, 5, tint('#5a2e10'));
      f(-2, 2, 3, 6, tint('#422008'));
      f(-1, 8, 3, 4, tint('#2c1505'));
      f(0, 1, 1, 9, tint('#7a4218')); // hair strand highlight
    } else if (skinId === 'zeus') {
      // Flowing Olympian silver-white hair behind shoulders
      f(-1, 0, 3, 6, tint('#e2e8f0'));
      f(-2, 2, 3, 6, tint('#cbd5e1'));
      f(-1, 8, 2, 3, tint('#94a3b8'));
    }

    // --- LEGS ---
    if (diving) {
      f(1, 10, 4, 4, BOOT);
      f(5, 9, 5, 3, BOOT);
    } else if (air) {
      f(2, 10, 3, 4, BOOT);
      f(6, 9, 3, 4, BOOT);
    } else {
      const legs = PLAYER_RUN_LEGS[run >= 0 ? run : 0];
      f(legs[0], legs[1], legs[2], legs[3], BOOT);
      f(legs[4], legs[5], legs[6], legs[7], BOOT);
    }

    // --- BODY ---
    if (skinId === 'zeus') {
      // Royal White Toga with Golden Sash
      f(2, 5, 7, 6, tint('#ffffff'));
      f(4, 5, 2, 6, tint('#ffd166')); // golden sash across chest
      f(2, 10, 7, 1, tint('#cbd5e1')); // toga drape hem
    } else if (skinId === 'fmhy') {
      // FMHY: Sleek Dark Void Suit with subtle Chromatic Accent Trims
      f(2, 5, 7, 6, tint('#080811')); // void black base
      f(2, 5, 1, 6, tint('#06b6d4')); // cyan left edge
      f(8, 5, 1, 6, tint('#d946ef')); // magenta right edge
      f(2, 9, 7, 2, tint('#04040a')); // deep void belt
    } else if (skinId === 'bobette') {
      // Bobette: signature clothes with keyhole cutout in upper chest below hair
      f(2, 5, 7, 6, SUIT);
      f(2, 9, 7, 2, SUIT_D);
      f(5, 5, 2, 2, SKIN); // cutout hole showing skin
    } else if (skinId === 'rob') {
      f(2, 5, 7, 2, SUIT);
      f(2, 7, 7, 2, SUIT_D);
      f(2, 9, 7, 2, SUIT);
    } else if (skinId === 'cob') {
      f(2, 5, 7, 6, SUIT);
      f(3, 6, 2, 2, SUIT_D);
      f(6, 6, 2, 2, SUIT_D);
      f(3, 8, 2, 2, SUIT_D);
      f(6, 8, 2, 2, SUIT_D);
    } else if (skinId === 'mob') {
      f(2, 5, 7, 6, SUIT);
      f(4, 6, 3, 2, '#70b25e');
      f(3, 8, 2, 2, '#70b25e');
      f(4, 10, 1, 2, '#70b25e');
      f(7, 10, 1, 2, '#70b25e');
    } else if (skinId === 'mr_soup') {
      f(2, 5, 7, 6, tint('#f8f9fa'));
      f(3, 6, 1, 1, '#1864ab');
      f(3, 8, 1, 1, '#1864ab');
      f(6, 6, 1, 1, '#1864ab');
      f(6, 8, 1, 1, '#1864ab');
      f(2, 9, 7, 2, tint('#ff922b'));
    } else if (skinId === 'skeleton') {
      f(2, 5, 7, 6, '#15151c');
      f(2, 5, 7, 1, SUIT);
      f(2, 7, 7, 1, SUIT);
      f(2, 9, 7, 1, SUIT);
      f(4, 5, 2, 6, SUIT);
    } else if (skinId === 'panda') {
      f(2, 5, 7, 6, SUIT);
      f(4, 6, 4, 4, '#ffffff');
    } else {
      f(2, 5, 7, 6, SUIT);
      f(2, 9, 7, 2, SUIT_D);
    }

    // --- ARM ---
    if (air) {
      f(6, 3, 2, 3, skinId === 'zeus' ? SKIN : skinId === 'mr_soup' ? tint('#dee2e6') : skinId === 'fmhy' ? tint('#080811') : SUIT_D);
      f(8, 3, 2, 2, skinId === 'zeus' ? tint('#ffd166') : skinId === 'fmhy' ? '#ffffff' : SKIN);
    } else {
      const armX = [5, 6, 7, 6][run >= 0 ? run : 0];
      f(armX, 6, 2, 3, skinId === 'zeus' ? SKIN : skinId === 'mr_soup' ? tint('#dee2e6') : skinId === 'fmhy' ? tint('#080811') : SUIT_D);
      f(armX + 2, 6, 2, 2, skinId === 'zeus' ? tint('#ffd166') : skinId === 'fmhy' ? '#ffffff' : SKIN);
    }

    // --- HEAD & FACE ---
    if (skinId === 'zeus') {
      // Majestic White Hair & God Beard
      f(1, -3, 8, 3, tint('#f8fafc'));
      f(2, -4, 6, 2, tint('#ffffff'));
      // Golden Laurel Crown Wreath
      f(2, -2, 7, 1, '#ffd166');
      f(7, -3, 2, 2, '#f59e0b');
      f(1, -3, 2, 2, '#f59e0b');
      // Face
      f(2, 0, 7, 6, tint('#ffffff'));
      f(4, 0, 5, 4, SKIN);
      // Glowing Divine Electric Cyan Eyes
      f(7, 1, 2, 2, '#38bdf8');
      f(8, 1, 1, 1, '#ffffff');
      // Flowing White God Beard
      f(3, 3, 6, 4, tint('#ffffff'));
      f(4, 5, 5, 3, tint('#f1f5f9'));
      f(5, 7, 3, 2, tint('#cbd5e1'));
      // Crackling Animated Lightning Sparks
      const sparkT = frame * 0.35;
      if (frame % 3 !== 0) {
        const sx = Math.round(Math.sin(sparkT) * 3);
        const sy = Math.round(Math.cos(sparkT) * 3);
        f(8 + sx, 6 + sy, 2, 2, '#7ef7ff');
        f(8 + sx, 6 + sy, 1, 1, '#ffffff');
        f(-2 - sx, 4 - sy, 2, 2, '#38bdf8');
      }
    } else if (skinId === 'fmhy') {
      // FMHY: Floating Chromatic Aberration Play-Triangle Head (Stable & Crisp)
      const hy = 0;

      // Dark void circular halo behind the glowing play symbol
      f(0, hy - 3, 10, 10, '#04040a');
      f(1, hy - 4, 8, 12, '#04040a');

      // 1. Magenta / Fuchsia Chromatic Aberration Fringe (Top & Top-Right Slope)
      f(2, hy - 3, 2, 7, '#701a75');
      f(4, hy - 2, 2, 6, '#c026d3');
      f(6, hy - 1, 2, 4, '#d946ef');
      f(8, hy, 2, 3, '#e879f9');
      f(10, hy + 1, 1, 1, '#f472b6');

      // 2. Cyan / Electric Blue Chromatic Aberration Fringe (Bottom & Bottom-Left Slope)
      f(0, hy - 1, 2, 7, '#083344');
      f(1, hy, 2, 6, '#0891b2');
      f(3, hy + 1, 2, 5, '#06b6d4');
      f(5, hy + 2, 2, 3, '#22d3ee');
      f(7, hy + 3, 2, 2, '#38bdf8');
      f(9, hy + 3, 1, 1, '#67e8f9');

      // 3. Brilliant Pure White Play-Triangle Core (Forward Play Button ▶)
      f(1, hy - 2, 2, 7, '#ffffff');
      f(3, hy - 1, 2, 5, '#ffffff');
      f(5, hy, 2, 4, '#ffffff');
      f(7, hy + 1, 2, 2, '#ffffff');
      f(9, hy + 1, 1, 1, '#ffffff');
    } else if (skinId === 'mr_soup') {
      // MR. SOUP: LARGE STEAMING SOUP BOWL HEAD (NO CAPE!)
      f(0, -3, 11, 7, tint('#f8f9fa'));
      f(1, 3, 9, 2, tint('#ced4da'));
      f(0, -3, 11, 1, tint('#1864ab'));

      const slosh = clamp(Math.round((vx - 2.1) * 0.4 + (air ? -1 : 0)), -2, 2);
      f(1 + Math.max(0, -slosh), -2, 9, 4, tint('#ff922b'));
      f(2 + slosh, -2, 7, 2, tint('#f76707'));

      f(3 + slosh, -2, 3, 1, tint('#fff3bf'));
      f(6 + slosh, -1, 1, 1, '#51cf66');
      f(2 + slosh, -1, 1, 1, '#51cf66');
      f(4 + slosh, -1, 2, 2, '#ff8787');
      f(5 + slosh, 0, 1, 1, '#ffffff');

      const steamT = frame * 0.2;
      f(2 + Math.round(Math.sin(steamT) * 1.5), -6, 2, 2, 'rgba(255,255,255,0.75)');
      f(6 + Math.round(Math.cos(steamT) * 1.5), -7, 2, 2, 'rgba(255,255,255,0.65)');
      f(4 + Math.round(Math.sin(steamT + 1) * 1.5), -9, 2, 2, 'rgba(255,255,255,0.5)');
    } else if (skinId === 'question') {
      f(2, 0, 7, 6, SUIT_D);
      const qPulse = 0.65 + 0.35 * Math.sin(frame * 0.2);
      const qCol = mixColor('#c98cff', '#ffffff', qPulse);
      f(1, -2, 7, 2, qCol);
      f(6, 0, 3, 3, qCol);
      f(3, 3, 4, 2, qCol);
      f(4, 5, 2, 1, qCol);
      f(4, 7, 2, 2, qCol);
    } else if (skinId === 'panda') {
      f(1, -2, 3, 3, '#1a1a1a');
      f(7, -2, 3, 3, '#1a1a1a');
      f(2, 0, 7, 6, '#ffffff');
      f(6, 2, 3, 2, '#1a1a1a');
      f(7, 2, 1, 1, '#ffffff');
      f(8, 4, 1, 1, '#000000');
    } else if (skinId === 'pig') {
      f(1, -2, 3, 2, tint('#d9688b'));
      f(7, -2, 3, 2, tint('#d9688b'));
      f(2, 0, 7, 6, SUIT);
      f(3, 1, 2, 2, '#1a0505');
      f(7, 1, 2, 2, '#1a0505');
      f(3, 1, 1, 1, '#ffffff');
      f(7, 1, 1, 1, '#ffffff');
      f(6, 3, 4, 3, tint('#d9688b'));
      f(7, 4, 1, 1, '#7a2842');
      f(9, 4, 1, 1, '#7a2842');
    } else if (skinId === 'demon') {
      f(1, -4, 2, 4, tint('#1a0505'));
      f(0, -5, 2, 2, tint('#ff3333'));
      f(8, -4, 2, 4, tint('#1a0505'));
      f(9, -5, 2, 2, tint('#ff3333'));
      f(2, 0, 7, 6, SUIT);
      f(5, 2, 4, 4, SKIN);
      f(7, 2, 2, 2, '#ffd166');
    } else if (skinId === 'sun_man') {
      f(0, -3, 2, 3, tint('#ffd166'));
      f(4, -4, 3, 4, tint('#ff7a45'));
      f(8, -3, 2, 3, tint('#ffd166'));
      f(2, 0, 7, 6, SUIT);
      f(5, 2, 4, 4, SKIN);
    } else if (skinId === 'moon_man') {
      f(2, 0, 7, 6, SUIT);
      f(4, 1, 5, 5, tint('#dff6ff'));
      f(5, 2, 3, 3, tint('#0e182a'));
    } else if (skinId === 'rob') {
      f(1, -2, 8, 3, tint('#1a1a1a'));
      f(2, 0, 7, 6, SUIT);
      f(5, 2, 4, 4, SKIN);
      f(4, 2, 5, 2, tint('#0d0d0d'));
      f(7, 2, 1, 1, '#ffffff');
    } else {
      // Classic Bob / Bobette / Cob / Mob
      f(2, 0, 7, 6, SUIT);
      f(5, 2, 4, 4, SKIN);
      f(2, 0, 8, 2, SUIT_D);
      f(7, 3, 1, 2, '#20122e');
    }

    // --- SCARF / COLLAR (Rendered on front collar, does NOT overlap hair behind) ---
    if (skinId !== 'panda' && skinId !== 'pig' && skinId !== 'mr_soup') {
      f(1, 5, 3, 2, SCARF);
    }
  }

  ctx.restore();
}
