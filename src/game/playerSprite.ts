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

  // The in-game renderer pre-translates and calls with (0, 0, scale 1) —
  // skip the identity save/translate/restore entirely on that common path.
  const needsTransform = cx !== 0 || cy !== 0 || scale !== 1;
  if (needsTransform) {
    ctx.save();
    ctx.translate(Math.round(cx), Math.round(cy));
    if (scale !== 1) {
      ctx.scale(scale, scale);
    }
  }

  let lastFill = '';
  const f = (x: number, y: number, w: number, h: number, col: string) => {
    if (col !== lastFill) {
      ctx.fillStyle = col;
      lastFill = col;
    }
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
      f(2, 10, 3, 1, WHT); // top
      f(2, 13, 3, 1, WHT); // bottom
      f(2, 10, 1, 4, WHT); // left
      f(4, 10, 1, 4, WHT); // right

      f(5, 9, 3, 1, WHT); // top
      f(5, 11, 3, 1, WHT); // bottom
      f(5, 9, 1, 3, WHT); // left
      f(7, 9, 1, 3, WHT); // right
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
      f(2, 10, 3, 4, G_DARK);
      f(5, 9, 3, 3, G_DARK);
      f(3, 11, 1, 2, G_MID);
      f(6, 10, 1, 1, G_MID);
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
    if (skinId === 'gladiator') {
      // Layered bronze shield carried behind the gladiator.
      f(-4, 6, 3, 6, tint('#7f1d1d'));
      f(-5, 7, 1, 4, tint('#b45309'));
      f(-3, 5, 1, 1, '#d4af37');
      f(-3, 8, 1, 2, '#fde68a');
      f(-3, 12, 1, 1, '#d4af37');
    } else if (skinId === 'demon') {
      const flap = air ? 0.4 : Math.sin(frame * 0.28) * 0.22;
      const wy = Math.round(flap * 3);
      f(-5, 3 - wy, 5, 3, tint('#4a0000'));
      f(-7, 1 - wy, 4, 3, tint('#8b0000'));
      f(-8, 0 - wy, 3, 2, tint('#ff3333'));
    } else if (skinId === 'angel') {
      // Celestial Archangel Wings (Multi-layered Feathered Spread)
      const flap = air ? 0.35 : Math.sin(frame * 0.24) * 0.25;
      const wy = Math.round(flap * 4);
      // Top feather layer (pure white with silver sheen)
      f(-7, 0 - wy, 6, 3, tint('#ffffff'));
      f(-10, -2 - wy, 4, 3, tint('#ffffff'));
      f(-11, -3 - wy, 3, 2, tint('#fffbeb'));
      // Mid feather layer (soft celestial cream)
      f(-8, 3 - wy, 8, 3, tint('#f1f5f9'));
      f(-11, 0 - wy, 4, 3, tint('#f8fafc'));
      // Lower feather tips with divine golden trim
      f(-6, 6 - wy, 6, 2, tint('#ffd166'));
      f(-9, 3 - wy, 4, 2, tint('#ffd166'));
      f(-11, 2 - wy, 2, 2, tint('#f59e0b'));

      // Flowing Celestial Golden Hair behind shoulders
      f(-1, 0, 3, 6, tint('#ffd166'));
      f(-2, 2, 3, 6, tint('#f59e0b'));
      f(-1, 8, 2, 3, tint('#d97706'));
      f(0, 1, 1, 9, '#fffbeb'); // golden shimmer strand
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
    if (skinId === 'gladiator') {
      const legs = PLAYER_RUN_LEGS[run >= 0 ? run : 0];
      if (diving) {
        f(2, 10, 3, 4, BOOT);
        f(5, 9, 3, 3, BOOT);
      } else if (air) {
        f(2, 10, 3, 4, BOOT);
        f(6, 9, 3, 4, BOOT);
      } else {
        f(legs[0], legs[1], legs[2], legs[3], BOOT);
        f(legs[4], legs[5], legs[6], legs[7], BOOT);
        f(legs[0], legs[1], legs[2], 1, '#d4af37');
        f(legs[4], legs[5], legs[6], 1, '#d4af37');
      }
    } else if (skinId === 'angel') {
      // Golden Divine Greaves & Winged Sandals
      if (diving) {
        f(2, 10, 3, 4, tint('#ffd166'));
        f(5, 9, 3, 3, tint('#ffd166'));
      } else if (air) {
        f(2, 10, 3, 4, tint('#ffd166'));
        f(6, 9, 3, 4, tint('#ffd166'));
        f(1, 10, 1, 2, '#fffbeb');
        f(5, 9, 1, 2, '#fffbeb');
      } else {
        const legs = PLAYER_RUN_LEGS[run >= 0 ? run : 0];
        f(legs[0], legs[1], legs[2], legs[3], tint('#ffd166'));
        f(legs[4], legs[5], legs[6], legs[7], tint('#ffd166'));
        f(legs[0] + 1, legs[1], 1, 2, tint('#d97706'));
        f(legs[4] + 1, legs[5], 1, 2, tint('#d97706'));
      }
    } else if (diving) {
      f(2, 10, 3, 4, BOOT);
      f(5, 9, 3, 3, BOOT);
    } else if (air) {
      f(2, 10, 3, 4, BOOT);
      f(6, 9, 3, 4, BOOT);
    } else {
      const legs = PLAYER_RUN_LEGS[run >= 0 ? run : 0];
      f(legs[0], legs[1], legs[2], legs[3], BOOT);
      f(legs[4], legs[5], legs[6], legs[7], BOOT);
    }

    // --- BODY ---
    if (skinId === 'angel') {
      // Pristine Heavenly White Robes with Golden Sash & Divine Belt
      f(2, 5, 7, 6, tint('#ffffff')); // pure white angelic tunic
      f(4, 5, 2, 6, tint('#ffd166')); // diagonal golden sash across chest
      f(3, 7, 4, 1, tint('#f59e0b')); // golden sash shine
      f(2, 10, 7, 1, tint('#f1f5f9')); // robe hem
      f(2, 9, 7, 1, tint('#ffd166')); // golden divine belt
      f(5, 5, 2, 2, tint('#fff5ea')); // celestial neckline
    } else if (skinId === 'zeus') {
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
    } else if (skinId === 'poop_man') {
      f(2, 5, 7, 6, SUIT);
      f(2, 9, 7, 2, SUIT_D);
      f(3, 6, 2, 1, '#a86a32');
      f(6, 8, 2, 1, '#5b2e15');
    } else if (skinId === 'gladiator') {
      f(2, 5, 7, 6, SUIT);
      f(2, 5, 7, 1, '#d4af37');
      f(3, 6, 5, 1, '#d49b1a');
      f(3, 7, 4, 2, '#b45309');
      f(8, 6, 1, 3, '#fbbf24');
      f(2, 9, 7, 2, SUIT_D);
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
    } else if (skinId === 'safe_bob') {
      // Safe Bob: Heavy armored vault steel chestplate with golden combination dial
      f(2, 5, 7, 6, SUIT);
      f(2, 9, 7, 2, SUIT_D);
      // Golden vault combination lock dial in center
      f(4, 6, 3, 3, tint('#ffd166'));
      f(5, 7, 1, 1, '#1e293b'); // center dial notch
      f(3, 5, 1, 1, '#94a3b8'); // steel rivet top-left
      f(7, 5, 1, 1, '#94a3b8'); // steel rivet top-right
      f(3, 9, 1, 1, '#94a3b8'); // steel rivet bottom-left
      f(7, 9, 1, 1, '#94a3b8'); // steel rivet bottom-right
    } else if (skinId === 'panda') {
      f(2, 5, 7, 6, SUIT);
      f(4, 6, 4, 4, '#ffffff');
    } else {
      f(2, 5, 7, 6, SUIT);
      f(2, 9, 7, 2, SUIT_D);
    }

    // --- ARM ---
    if (skinId === 'gladiator') {
      // Armored sword arm and a simple forward-pointing blade.
      f(6, 6, 2, 3, tint('#d4af37'));
      f(8, 6, 2, 2, SKIN);
      f(8, 7, 3, 1, tint('#b45309'));
      f(10, 2, 1, 6, '#e2e8f0');
      f(11, 1, 1, 1, '#ffffff');
    } else if (air) {
      f(6, 3, 2, 3, skinId === 'zeus' || skinId === 'angel' ? SKIN : skinId === 'mr_soup' ? tint('#dee2e6') : skinId === 'fmhy' ? tint('#080811') : SUIT_D);
      f(8, 3, 2, 2, skinId === 'zeus' || skinId === 'angel' ? tint('#ffd166') : skinId === 'fmhy' ? '#ffffff' : SKIN);
    } else {
      const armX = [5, 6, 7, 6][run >= 0 ? run : 0];
      f(armX, 6, 2, 3, skinId === 'zeus' || skinId === 'angel' ? SKIN : skinId === 'mr_soup' ? tint('#dee2e6') : skinId === 'fmhy' ? tint('#080811') : SUIT_D);
      f(armX + 2, 6, 2, 2, skinId === 'zeus' || skinId === 'angel' ? tint('#ffd166') : skinId === 'fmhy' ? '#ffffff' : SKIN);
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
    } else if (skinId === 'goat') {
      // Curved Mountain Horns
      f(0, -4, 2, 4, '#d97706');
      f(1, -5, 2, 2, '#fbbf24');
      f(0, -2, 1, 2, '#92400e');
      f(8, -4, 2, 4, '#d97706');
      f(7, -5, 2, 2, '#fbbf24');
      f(9, -2, 1, 2, '#92400e');

      // Floppy Goat Ears
      f(-1, 0, 2, 3, tint('#e2e8f0'));
      f(9, 0, 2, 3, tint('#e2e8f0'));

      // Goat Wool Head & Face
      f(2, 0, 7, 6, tint('#f8fafc'));
      f(5, 2, 4, 4, tint('#e2e8f0'));

      // Horizontal slit goat eyes
      f(6, 2, 3, 2, '#d97706');
      f(7, 2, 2, 1, '#1e293b');
      f(8, 2, 1, 1, '#ffffff');

      // Snout & Goatee Beard
      f(7, 4, 2, 2, '#475569');
      f(6, 6, 2, 3, tint('#f8fafc'));
      f(6, 8, 1, 2, tint('#cbd5e1'));

      // Champion Golden Bell on Collar
      f(2, 5, 3, 2, '#ffd166');
      f(3, 6, 2, 2, '#d97706');
    } else if (skinId === 'demon') {
      f(1, -4, 2, 4, tint('#1a0505'));
      f(0, -5, 2, 2, tint('#ff3333'));
      f(8, -4, 2, 4, tint('#1a0505'));
      f(9, -5, 2, 2, tint('#ff3333'));
      f(2, 0, 7, 6, SUIT);
      f(5, 2, 4, 4, SKIN);
      f(7, 2, 2, 2, '#ffd166');
    } else if (skinId === 'angel') {
      // Floating Radiant Golden Halo with Divine Shimmer
      const haloBob = Math.round(Math.sin(frame * 0.2) * 1.5);
      f(1, -5 + haloBob, 9, 2, '#ffd166'); // halo ring body
      f(2, -6 + haloBob, 7, 1, '#fef08a'); // top radiant crest
      f(4, -6 + haloBob, 3, 1, '#ffffff'); // bright gleam spark
      f(3, -4 + haloBob, 5, 1, '#d97706'); // inner depth

      // Celestial Platinum-Golden Flowing Hair (Crown & Bangs)
      f(1, -2, 8, 3, tint('#ffd166'));
      f(2, -3, 6, 2, tint('#fef08a'));
      f(1, 0, 2, 5, tint('#f59e0b')); // left hair cascade
      f(8, 0, 2, 4, tint('#f59e0b')); // right hair lock

      // Ethereal Face
      f(3, 0, 6, 5, tint('#fff5ea'));
      // Glowing Heavenly Golden Eyes with Divine Spark
      f(7, 2, 2, 2, '#f59e0b');
      f(7, 2, 1, 1, '#ffd166');
      f(8, 2, 1, 1, '#ffffff');

      // Floating Divine Light Particles (Twinkling Holy Aura)
      const pT = frame * 0.25;
      const px1 = Math.round(Math.sin(pT) * 4);
      const py1 = Math.round(Math.cos(pT) * 3);
      f(9 + px1, 4 + py1, 1, 1, '#fef08a');
      f(-3 - px1, 2 - py1, 1, 1, '#ffffff');
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
    } else if (skinId === 'safe_bob') {
      // Steel Vault Helmet with golden lock badge & Bob face
      f(1, -2, 8, 3, tint('#64748b')); // helmet crown
      f(2, -3, 6, 2, tint('#94a3b8')); // helmet highlight crest
      f(4, -3, 2, 2, '#ffd166');       // golden lock badge on helmet
      f(2, 0, 7, 6, SUIT);
      f(5, 2, 4, 4, SKIN);
      f(2, 0, 8, 2, SUIT_D);
      f(7, 3, 1, 2, '#20122e');        // classic eye
    } else if (skinId === 'santa') {
      // Classic Santa Cap with Fluffy White Brim & Pompom
      f(0, -2, 11, 2, '#ffffff');       // fluffy white fur brim
      f(1, -5, 9, 3, tint('#c0392b'));  // red cap body
      f(3, -7, 6, 2, tint('#a93226'));  // curved cap top
      f(8, -7, 3, 3, '#ffffff');        // fluffy white pompom
      f(9, -6, 1, 1, '#cbd5e1');        // pompom shadow
      // Jolly Peach Face with Rosy Cheeks
      f(2, 0, 7, 5, tint('#ffcf9e'));
      f(2, 1, 2, 2, '#ff8fa3');         // rosy left cheek
      f(7, 1, 2, 2, '#ff8fa3');         // rosy right cheek
      f(3, 1, 1, 2, '#180a24');         // twinkling eye
      f(7, 1, 1, 2, '#180a24');         // twinkling eye
      f(5, 2, 2, 1, '#f4a261');         // button nose
      // Fluffy White Beard & Moustache
      f(1, 3, 9, 3, '#ffffff');         // main beard
      f(2, 5, 7, 2, '#f1f5f9');         // lower beard
      f(4, 7, 3, 1, '#e2e8f0');         // beard tip
    } else if (skinId === 'beach_bob') {
      // Classic Bob with stylish dark pixel sunglasses & ocean beachwear
      f(2, 0, 7, 6, SUIT);
      f(5, 2, 4, 4, SKIN);
      f(2, 0, 8, 2, SUIT_D);
      // Dark sunglasses with bright teal lens glint
      f(6, 3, 3, 2, '#120820');
      f(8, 3, 1, 1, '#7ef7ff');
    } else if (skinId === 'mob') {
      // Rotting Undead Zombie
      f(2, 0, 7, 6, tint('#5ea846'));   // decaying sickly green skin
      f(2, 0, 8, 2, tint('#407830'));
      f(1, -2, 4, 3, tint('#2a1b40'));  // patch of dark rotting hair
      // Skull stitches / scar
      f(4, -1, 3, 1, '#1a3014');
      f(5, -2, 1, 3, '#1a3014');
      // Sunken undead eye sockets (one glowing yellow pupil, one blank milky eye)
      f(3, 1, 3, 3, '#152410');         // left socket
      f(4, 2, 1, 1, '#ffd166');         // glowing yellow pupil
      f(7, 1, 2, 2, '#152410');         // right hollow socket
      f(8, 1, 1, 1, '#ffffff');         // milky blind eye
      // Open mouth with rotting teeth
      f(4, 4, 4, 1, '#152410');
      f(4, 4, 1, 1, '#fef08a');
      f(6, 4, 1, 1, '#fef08a');
    } else if (skinId === 'witch') {
      // Pointed Crooked Witch Hat with Wide Brim & Gold Ribbon
      f(-1, -2, 13, 2, tint('#1a0826')); // wide hat brim
      f(1, -5, 9, 3, tint('#2a0f3d'));  // lower hat cone
      f(2, -8, 7, 3, tint('#200a30'));  // mid cone
      f(4, -11, 4, 3, tint('#180724')); // pointy tip
      f(6, -13, 2, 2, tint('#14051e')); // crooked top tip
      f(1, -3, 9, 1, '#ffd166');        // golden ribbon on brim
      f(5, -4, 2, 2, '#c084fc');        // amethyst gem on ribbon
      // Pale Enchanted Green Witch Skin & Glowing Purple Eyes
      f(2, 0, 7, 6, tint('#9ae6b4'));
      f(2, 0, 8, 2, tint('#68d391'));
      f(3, 1, 2, 2, '#c084fc');         // glowing purple eye
      f(7, 1, 2, 2, '#c084fc');         // glowing purple eye
      f(4, 1, 1, 1, '#ffffff');         // eye glint
      f(8, 1, 1, 1, '#ffffff');         // eye glint
      f(5, 4, 1, 1, '#48bb78');         // wart/nose
      // Floating Magic Sparkles
      const wT = frame * 0.2;
      f(9 + Math.round(Math.sin(wT) * 2), -4 + Math.round(Math.cos(wT) * 2), 1, 1, '#e879f9');
      f(-2 + Math.round(Math.cos(wT) * 2), -1 + Math.round(Math.sin(wT) * 2), 1, 1, '#ffd166');
    } else if (skinId === 'easter_bunny') {
      // Big floppy ears
      f(1, -8, 3, 8, tint('#d4f1c7'));
      f(2, -7, 1, 6, tint('#ffb3c1'));
      f(7, -8, 3, 8, tint('#d4f1c7'));
      f(8, -7, 1, 6, tint('#ffb3c1'));
      // Fluffy bunny head
      f(2, 0, 7, 6, tint('#f8d7da'));
      f(2, 0, 8, 2, tint('#e8b8c0'));
      // Pink eyes with gleam
      f(3, 1, 2, 2, '#ff80ab');
      f(4, 1, 1, 1, '#ffffff');
      f(7, 1, 2, 2, '#ff80ab');
      f(8, 1, 1, 1, '#ffffff');
      // Nose
      f(5, 4, 2, 1, '#ff80ab');
      // Swinging easter egg basket
      const eggSwing = air ? 1 : Math.round(Math.sin(frame * 0.15) * 1.5);
      f(-2, 3 + eggSwing, 3, 5, '#ffd166');
      f(-2, 4 + eggSwing, 3, 1, '#ff80ab');
      f(-2, 6 + eggSwing, 3, 1, '#3ef2c8');
    } else if (skinId === 'pumpkin_bob') {
      // Green vine stem on top
      f(5, -6, 2, 4, tint('#7ae04a'));
      f(6, -7, 2, 2, tint('#58b430'));
      // Round Jack-o'-lantern Pumpkin Head
      f(1, -2, 9, 8, tint('#ff7518'));
      f(2, -3, 7, 10, tint('#ff7518'));
      f(2, -2, 7, 2, tint('#c85a17')); // top shadow
      f(2, 4, 7, 2, tint('#c85a17'));  // bottom shadow
      // Carved glowing triangular eyes (yellow inner glow)
      f(3, 0, 2, 2, '#ffe066');
      f(7, 0, 2, 2, '#ffe066');
      f(4, 0, 1, 1, '#ffffff');
      f(8, 0, 1, 1, '#ffffff');
      // Carved spooky jagged Jack-o'-lantern smile
      f(3, 3, 1, 1, '#ffe066');
      f(4, 4, 1, 1, '#ffe066');
      f(5, 3, 1, 1, '#ffe066');
      f(6, 4, 1, 1, '#ffe066');
      f(7, 3, 1, 1, '#ffe066');
    } else if (skinId === 'poop_man') {
      // A compact pixel poop swirl with a tiny face.
      f(2, 0, 7, 6, tint('#7a4524'));
      f(3, -2, 5, 3, tint('#8f5429'));
      f(4, -4, 3, 2, tint('#a86a32'));
      f(5, -5, 1, 1, '#c0844b');
      f(7, 2, 1, 2, '#241008');
      f(8, 2, 1, 1, '#fff3bf');
      f(7, 4, 2, 1, '#3b1e0b');
    } else if (skinId === 'gladiator') {
      // Full helmet, narrow visor, cheek guards, and a red crest.
      f(1, 0, 9, 6, tint('#374151'));
      f(2, -2, 7, 2, tint('#6b7280'));
      f(3, -4, 5, 2, tint('#d4af37'));
      f(4, -6, 3, 2, '#dc2626');
      f(2, 2, 7, 2, '#111827');
      f(7, 2, 1, 1, '#ffd166');
      f(2, 4, 2, 2, tint('#9ca3af'));
      f(8, 4, 2, 2, tint('#9ca3af'));
      f(4, 5, 4, 1, '#1f2937');
    } else {
      // Classic Bob / Bobette / Cob
      f(2, 0, 7, 6, SUIT);
      f(5, 2, 4, 4, SKIN);
      f(2, 0, 8, 2, SUIT_D);
      f(7, 3, 1, 2, '#20122e');
    }

    // --- SCARF / COLLAR ---
    if (skinId !== 'panda' && skinId !== 'pig' && skinId !== 'mr_soup' && skinId !== 'angel' && skinId !== 'santa' && skinId !== 'easter_bunny' && skinId !== 'pumpkin_bob' && skinId !== 'mob' && skinId !== 'witch') {
      f(1, 5, 3, 2, SCARF);
    }
  }

  if (needsTransform) ctx.restore();
}
