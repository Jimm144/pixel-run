import { drawText, drawTextCentered, FONT_H, pad, textWidth } from './font';
import { sfx } from './audio';
import { ZONES, lerpZone, sampleSky, shade, mix, type BgKind, type Zone } from './palette';

/** Gameplay is authored against this size; physics never changes. */
export const BASE_VW = 400;
export const BASE_VH = 225;
/** Tallest internal buffer — beyond this the ground dirt can't reach bottom. */
export const MAX_VH = 575;

/** Live canvas size. Desktop keeps the base size; portrait zooms in. */
export let VW = 400;
export let VH = 225;

/**
 * Shifts the world down on tall screens so the ground always sits at ~80% of
 * the canvas height — the exact framing desktop already uses. Without this the
 * world was pinned to the very bottom, leaving a huge empty sky.
 */
export function worldOffsetY() {
  return Math.max(0, Math.round(VH * 0.8 - 180));
}

export function setViewportSize(w: number, h: number) {
  VW = Math.max(220, Math.round(w));
  VH = Math.min(MAX_VH, Math.max(BASE_VH, Math.round(h)));
}

export type Phase = 'ready' | 'playing' | 'paused' | 'dead';

export interface Stats {
  score: number;
  meters: number;
  coins: number;
  kills: number;
  combo: number;
}

/* ------------------------------------------------------------------ tuning */
const GRAV = 0.44;
const GRAV_HOLD = 0.32;
const GRAV_FALL = 0.54;
const GRAV_DIVE = 1.1;
const JUMP_V = 6.4;
const DJUMP_V = 5.8;
const MAX_FALL = 10;
const COYOTE = 8;
const BUFFER = 8;
/** Camera anchor as a fraction of view width (112/400 on desktop). */
const ANCHOR_FRAC = 0.28;
function anchorX() {
  return Math.round(VW * ANCHOR_FRAC);
}
const GROUND_BOTTOM = BASE_VH + 70;
const COMBO_TIME = 150; // frames
const PLAYER_W = 10;
const PLAYER_H = 14;
const PLAYER_RUN_LEGS = [
  [1, 10, 3, 4, 6, 10, 3, 4],
  [2, 9, 3, 4, 5, 10, 3, 4],
  [4, 10, 3, 4, 0, 10, 3, 4],
  [2, 10, 3, 4, 5, 9, 3, 4],
];
type PowerUpKind = 'shield' | 'shoes' | 'triple' | 'propeller';
const POWERUP_TIME = 60 * 10;
const POWERUP_PTS = 75;
const POWERUP_COLORS: Record<PowerUpKind, string> = {
  shield: '#7ef7ff',
  shoes: '#ffd166',
  triple: '#c98cff',
  propeller: '#ff7a90',
};

const COIN_PTS = 15;
const GEM_PTS = 120;
const STOMP_PTS = 45;
const SLAM_PTS = 80;
/** Coin spin widths per animation frame, in order. */
const COIN_HW = [3, 2, 1, 2];
const PLAYER_SUIT = '#ff4d6d';
const PLAYER_SUIT_D = '#b32a4d';
const PLAYER_SKIN = '#ffcf9e';
const PLAYER_BOOT = '#59427e';
const PLAYER_BOOT_SHOES = '#ffd166';
const PLAYER_SCARF = '#3ef2c8';
const PAD_V = 9.6;
const MEGA_PAD_V = 12.2;const PLATFORM_CACHE_PAD = 6; // headroom above y for cap bumps/grass/snow art
const MAX_PLATFORM_Y = 180;

/* ---------------------------------------------------------------- entities */
interface Platform {
  x: number;
  y: number;
  w: number;
  float: boolean;
  seed: number;
  /** Pre-rendered artwork, built once and blitted every frame (perf). */
  cache?: HTMLCanvasElement;
  cacheEpoch?: number;
}
interface Pickup {
  x: number;
  y: number;
  t: number;
  gem: boolean;
  dead: boolean;
}
interface PowerUp {
  x: number;
  y: number;
  t: number;
  kind: PowerUpKind;
  dead: boolean;
}
interface BiomeEventTrigger {
  x: number;
  kind: BgKind;
  used: boolean;
}
type EnemyKind = 'slime' | 'hopper' | 'scarab' | 'spiker' | 'flyer';
interface Enemy {
  kind: EnemyKind;
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  jt: number;
  minX: number;
  maxX: number;
  t: number;
  baseY: number;
  dead: boolean;
  hurt: number;
}
interface Spike {
  x: number;
  y: number;
  n: number;
}
interface Spring {
  x: number;
  y: number;
  press: number;
  mega: boolean;
  launchVx: number;
}
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  col: string;
  grav: number;
  drag: number;
}
interface FloatText {
  x: number;
  y: number;
  vy: number;
  life: number;
  max: number;
  text: string;
  col: string;
  scale: number;
  /** Pre-rendered 5-layer glyphs (4 outline + fill) at normal and pop scale. */
  sprite: HTMLCanvasElement;
  spritePop: HTMLCanvasElement;
}

const P_CAP = 320;
const T_CAP = 18;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const ri = (a: number, b: number) => Math.floor(rnd(a, b + 1));
const wrap = (value: number, size: number) => ((value % size) + size) % size;

const enum PAT {
  REST = 0,
  STOMP = 1,
  SPIKES = 2,
  LAUNCH = 3,
  MEGA = 4,
  UPPER = 5,
  FLYER = 6,
}
function hash(n: number) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

export class Game {
  ctx: CanvasRenderingContext2D;
  phase: Phase = 'ready';
  onDeath: ((s: Stats) => void) | null = null;

  /* input */
  private jumpHeld = false;
  private jumpBuf = 0;
  private diveHeld = false;
  private moveDir = 0;
  private savedJumpHeld = false;
  private savedDiveHeld = false;
  private savedMoveDir = 0;

  /* world */
  private platforms: Platform[] = [];
  private pickups: Pickup[] = [];
  private powerups: PowerUp[] = [];
  private enemies: Enemy[] = [];
  private spikes: Spike[] = [];
  private springs: Spring[] = [];
  private parts: Particle[] = [];
  private pIdx = 0;
  private texts: FloatText[] = [];

  private genX = 0;
  private lastY = 170;
  private genCount = 0;
  private lastPattern = -1;
  private patternRepeat = 0;
  private nextPowerUpX = 700;
  private lastPowerUpKind: PowerUpKind | null = null;
  private eventTriggers: BiomeEventTrigger[] = [];
  private eventBiomeRolls = new Set<number>();

  private camX = 0;
  private shake = 0;
  private shakeX = 0;
  private shakeY = 0;
  private freeze = 0;
  private slowAcc = 0;
  private flash = 0;
  private flashCol = '#ffffff';
  private frame = 0;
  private deathTimer = 0;
  private deathReported = false;

  /* player */
  private px = 0;
  private py = 0;
  private vx = 0;
  private vy = 0;
  private onGround = false;
  private coyote = 0;
  private jumps = 0;
  private cut = false;
  private diving = false;
  private shielded = false;
  private shieldTimer = 0;
  private jumpShoes = 0;
  private tripleJump = 0;
  private propellerHat = 0;
  private propellerFlashing = false;
  private propellerFlashTimer = 0;
  private invuln = 0;
  private padFlight = 0;
  private sx = 1;
  private sy = 1;
  private spin = 0;
  private animT = 0;
  private ghosts: { x: number; y: number; life: number }[] = [];
  private startX = 0;

  /* score */
  private distance = 0;
  score = 0;
  private bonus = 0;
  coins = 0;
  private kills = 0;
  combo = 0;
  private comboT = 0;
  private comboPulse = 0;
  private countdown = 0;
  /** Frames the "GO" flash stays up after the countdown reaches zero. */
  private goTimer = 0;
  bestCombo = 0;
  best = 0;
  private nextMilestone = 250;
  private eventTimer = 0;
  private eventMax = 0;
  private eventSeed = 0;
  private eventKind: BgKind = 'city';
  private hudScore = -1;
  private hudScoreStr = '';
  private hudM = -1;
  private hudMText = '';
  private hudCoins = -1;
  private hudCoinsText = '';

  /* visuals */
  private zone: Zone = ZONES[0];
  private cBolt = shade(ZONES[0].groundDark, -0.3);
  private cStrata1 = mix(ZONES[0].ground, ZONES[0].groundDark, 0.45);
  private cStrata2 = shade(ZONES[0].groundDark, -0.3);
  private cRockA = shade(ZONES[0].ground, -0.16);
  private cRockB = shade(ZONES[0].groundDark, 0.12);
  private cRockLit = shade(ZONES[0].ground, 0.1);
  private cRivet = shade(ZONES[0].accent, -0.35);
  private cCloud = shade(ZONES[0].far, 0.07);
  private cBack = mix(ZONES[0].far, ZONES[0].mid, 0.5);
  /** Sun disc + glow, baked whenever the sky palette changes. */
  private sunSprite: HTMLCanvasElement | null = null;
  /** Dark backing + icon per power-up kind, baked once. */
  private powerupSprites = new Map<PowerUpKind, HTMLCanvasElement>();
  private zoneMeters = -1;
  private lastZoneZi = -1;
  private lastZoneTQ = -1;
  /** Bumped at each zone boundary; platform caches rebuild against the new
   *  pure palette exactly once (see getPlatformCache). */
  private platformEpoch = 0;
  private zoneIdx = 0;
  private zoneOrder: number[] = [];
  private stars: number[] = [];
  private motes: number[] = [];
  private skyBands: string[] = [];
  // Pre-baked silhouette strip (512px wide). Built once per shape/colour,
  // then scrolled with integer drawImage offsets — no live sampling, no
  // subpixel crawl, no antialiased diagonals.
  private bandCache = new Map<string, HTMLCanvasElement>();

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    for (let i = 0; i < 90; i++) {
      this.stars.push(rnd(0, 1400), rnd(2, 140), rnd(0, 6.28), Math.random() < 0.25 ? 2 : 1);
    }
    for (let i = 0; i < 26; i++) {
      this.motes.push(rnd(0, VW), rnd(0, VH), rnd(0.3, 1.1), rnd(0, 6.28));
    }
    this.reset();
  }

  /* ------------------------------------------------------------- lifecycle */
  reset() {
    this.platforms.length = 0;
    this.pickups.length = 0;
    this.powerups.length = 0;
    this.enemies.length = 0;
    this.spikes.length = 0;
    this.springs.length = 0;
    this.parts.length = 0;
    this.pIdx = 0;
    this.texts.length = 0;
    this.ghosts.length = 0;
    this.genX = -60;
    this.lastY = 170;
    this.genCount = 0;
    this.lastPattern = -1;
    this.patternRepeat = 0;
    this.nextPowerUpX = 700;
    this.lastPowerUpKind = null;
    this.eventTriggers.length = 0;
    this.eventBiomeRolls.clear();
    this.camX = 0;
    this.shake = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.freeze = 0;
    this.slowAcc = 0;
    this.flash = 0;
    this.deathTimer = 0;
    this.deathReported = false;
    this.distance = 0;
    this.score = 0;
    this.bonus = 0;
    this.coins = 0;
    this.kills = 0;
    this.combo = 0;
    this.comboT = 0;
    this.comboPulse = 0;
    this.countdown = 0;
    this.goTimer = 0;
    this.bestCombo = 0;
    this.nextMilestone = 250;
    this.eventTimer = 0;
    this.eventMax = 0;
    this.eventSeed = 0;
    this.zoneIdx = 0;
    this.zoneMeters = -1;
    this.lastZoneZi = -1;
    this.lastZoneTQ = -1;
    this.platformEpoch = 0;
    // biome order is shuffled fresh every run — no two runs share a sequence
    this.zoneOrder = ZONES.map((_, i) => i);
    for (let i = this.zoneOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = this.zoneOrder[i];
      this.zoneOrder[i] = this.zoneOrder[j];
      this.zoneOrder[j] = tmp;
    }
    this.zone = ZONES[this.zoneOrder[0]];
    this.eventKind = this.zone.bg;
    this.refreshZoneColors();
    this.px = anchorX();
    this.py = 170 - PLAYER_H;
    this.startX = this.px;
    this.vx = 0;
    this.vy = 0;
    this.onGround = true;
    this.coyote = 0;
    this.jumps = 0;
    this.cut = false;
    this.diving = false;
    this.shielded = false;
    this.shieldTimer = 0;
    this.invuln = 0;
    this.jumpShoes = 0;
    this.tripleJump = 0;
    this.propellerHat = 0;
    this.propellerFlashing = false;
    this.propellerFlashTimer = 0;
    this.padFlight = 0;
    this.spin = 0;
    this.sx = 1;
    this.sy = 1;
    this.jumpBuf = 0;
    this.jumpHeld = false;
    this.diveHeld = false;
    this.moveDir = 0;
    this.savedJumpHeld = false;
    this.savedDiveHeld = false;
    this.savedMoveDir = 0;
    this.generate(this.camX + VW * 2.2);
  }

  startRun() {
    this.reset();
    this.phase = 'playing';
    this.countdown = 180;
    this.flash = 0.35;
    this.flashCol = '#ffffff';
    sfx.startMusic(this.zone.bg, 0);
    sfx.play('start');
  }

  /** Called when the canvas size changes — drops size-dependent art caches. */
  invalidateViewport() {
    this.bandCache.clear();
    for (const p of this.platforms) {
      p.cache = undefined;
      p.cacheEpoch = undefined;
    }
  }

  pause() {
    if (this.phase !== 'playing') return;
    this.phase = 'paused';
    // Remember held inputs so a key/finger that stays down across the pause
    // overlay keeps working after the resume countdown ends.
    this.savedJumpHeld = this.jumpHeld;
    this.savedDiveHeld = this.diveHeld;
    this.savedMoveDir = this.moveDir;
    this.jumpHeld = false;
    this.jumpBuf = 0;
    this.diveHeld = false;
    this.moveDir = 0;
    sfx.pauseMusic();
  }
  resume() {
    if (this.phase === 'paused') {
      this.phase = 'playing';
      this.jumpHeld = this.savedJumpHeld;
      this.diveHeld = this.savedDiveHeld;
      this.moveDir = this.savedMoveDir;
      this.savedJumpHeld = false;
      this.savedDiveHeld = false;
      this.savedMoveDir = 0;
      if (this.jumpHeld) this.jumpBuf = BUFFER; // buffered for GO
      this.countdown = 180; // 3s of "3-2-1-GO" before control resumes
      sfx.resumeMusic();
    }
  }
  toReady() {
    sfx.stopMusic();
    this.reset();
    this.phase = 'ready';
  }

  get stats(): Stats {
    return {
      score: this.score,
      meters: Math.floor(this.distance / 10),
      coins: this.coins,
      kills: this.kills,
      combo: this.bestCombo,
    };
  }

  /* ----------------------------------------------------------------- input */
  pressJump() {
    if (this.phase === 'paused' || this.phase === 'dead') return;
    this.jumpHeld = true;
    this.jumpBuf = BUFFER;
  }
  releaseJump() {
    this.jumpHeld = false;
    if (this.phase === 'paused') this.savedJumpHeld = false;
  }
  pressDive() {
    if (this.phase !== 'playing') return;
    this.diveHeld = true;
    if (!this.onGround && this.vy > -3) {
      this.diving = true;
      this.padFlight = 0;
      this.vy = Math.max(this.vy, 6.5);
      this.spin = 0;
    }
  }
  releaseDive() {
    this.diveHeld = false;
    if (this.phase === 'paused') this.savedDiveHeld = false;
  }
  setMove(d: number) {
    if (this.phase !== 'playing') {
      this.moveDir = 0;
      return;
    }
    this.moveDir = d > 0 ? 1 : 0;
  }

  /* --------------------------------------------------------------- helpers */
  // Cache every derived platform colour once per zone change (never per frame).
  private refreshZoneColors() {
    const Z = this.zone;
    this.cBolt = shade(Z.groundDark, -0.3);
    this.cStrata1 = mix(Z.ground, Z.groundDark, 0.45);
    this.cStrata2 = shade(Z.groundDark, -0.3);
    this.cRockA = shade(Z.ground, -0.16);
    this.cRockB = shade(Z.groundDark, 0.12);
    this.cRockLit = shade(Z.ground, 0.1);
    this.cRivet = shade(Z.accent, -0.35);
    this.cCloud = shade(Z.far, 0.07);
    this.cBack = mix(Z.far, Z.mid, 0.5);
    // Baked band tiles are colour-keyed — drop them when the palette changes.
    this.bandCache.clear();
    this.bakeSun();
  }

  private bakeSun() {
    const gr = 32;
    const size = gr * 2 + 1;
    const cv = document.createElement('canvas');
    cv.width = size;
    cv.height = size;
    const c = cv.getContext('2d')!;
    const r = 24;
    c.globalAlpha = 0.12;
    c.fillStyle = this.zone.sunB;
    for (let y = -gr; y <= gr; y++) {
      const hw = Math.round(Math.sqrt(Math.max(0, gr * gr - y * y)));
      if (hw <= 0) continue;
      c.fillRect(gr - hw, gr + y, hw * 2, 1);
    }
    c.globalAlpha = 1;
    // Round the circle width so several centre rows share its maximum width.
    for (let y = -r; y <= r; y++) {
      const hw = Math.round(Math.sqrt(Math.max(0, r * r - y * y)));
      if (hw < 2) continue;
      c.fillStyle = mix(this.zone.sunA, this.zone.sunB, (y + r) / (2 * r));
      c.fillRect(gr - hw, gr + y, hw * 2, 1);
    }
    this.sunSprite = cv;
  }

  private powerupSprite(kind: PowerUpKind): HTMLCanvasElement {
    let s = this.powerupSprites.get(kind);
    if (s) return s;
    const cv = document.createElement('canvas');
    cv.width = 18;
    cv.height = 18;
    const c = cv.getContext('2d')!;
    const col = POWERUP_COLORS[kind];
    // sprite coords are icon coords shifted +9 (drawn at (x-9, y-9))
    c.fillStyle = '#171020';
    c.fillRect(2, 2, 14, 14);
    c.fillStyle = col;
    c.fillRect(1, 1, 16, 1);
    c.fillRect(1, 16, 16, 1);
    c.fillRect(1, 1, 1, 14);
    c.fillRect(16, 1, 1, 14);
    if (kind === 'shield') {
      c.fillRect(5, 4, 8, 1);
      c.fillRect(4, 5, 10, 1);
      c.fillRect(4, 6, 10, 1);
      c.fillRect(4, 7, 10, 1);
      c.fillRect(4, 8, 10, 1);
      c.fillRect(4, 9, 10, 1);
      c.fillRect(5, 10, 8, 1);
      c.fillRect(5, 11, 8, 1);
      c.fillRect(6, 12, 6, 1);
      c.fillRect(7, 13, 4, 1);
      c.fillRect(8, 14, 2, 1);
    } else if (kind === 'shoes') {
      c.fillRect(4, 11, 4, 2);
      c.fillRect(4, 8, 2, 3);
      c.fillRect(10, 11, 4, 2);
      c.fillRect(10, 8, 2, 3);
    } else if (kind === 'triple') {
      c.fillRect(4, 4, 3, 1);
      c.fillRect(5, 5, 1, 4);
      c.fillRect(8, 7, 3, 1);
      c.fillRect(9, 8, 1, 4);
      c.fillRect(12, 10, 3, 1);
      c.fillRect(13, 11, 1, 4);
    } else {
      // Center hub
      c.fillStyle = '#2a1a3c';
      c.fillRect(6, 6, 7, 7);
      c.fillStyle = col;
      c.fillRect(7, 7, 5, 5);
      // Three thin blades at 120-degree angles
      c.fillRect(8, 1, 2, 5);
      c.fillRect(3, 9, 5, 2);
      c.fillRect(11, 9, 5, 2);
    }
    this.powerupSprites.set(kind, cv);
    return cv;
  }

  private diff() {
    const d = clamp(this.distance / 9000, 0, 1);
    return this.phase === 'ready' ? Math.min(d, 0.1) : d;
  }
  private runSpeed() {
    return 2.1 + 1.4 * this.diff();
  }
  private mult() {
    return Math.min(8, 1 + Math.floor(this.combo / 4));
  }

  private syncDistanceScore() {
    this.distance = Math.max(this.distance, this.px - this.startX);
    this.score = Math.floor(this.distance / 8) + this.bonus;
  }

  private spawnP(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
    col: string,
    grav = 0.14,
    drag = 1,
  ) {
    let p = this.parts[this.pIdx];
    if (!p) {
      p = { x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, col, grav: 0, drag: 1 };
      this.parts.push(p);
    }
    this.pIdx = (this.pIdx + 1) % P_CAP;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.max = life;
    p.size = size;
    p.col = col;
    p.grav = grav;
    p.drag = drag;
  }

  private burst(x: number, y: number, n: number, cols: string[], power: number, grav = 0.14) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2);
      const s = rnd(power * 0.35, power);
      this.spawnP(
        x,
        y,
        Math.cos(a) * s,
        Math.sin(a) * s - power * 0.25,
        ri(16, 34),
        Math.random() < 0.3 ? 2 : 1,
        cols[ri(0, cols.length - 1)],
        grav,
        0.96,
      );
    }
  }

  // Biome identity lives in the motion trail, not in the hero's fixed sprite.
  private emitTrail(dive: boolean) {
    const x = this.px - 1;
    const y = this.py + PLAYER_H - 1;
    if (this.zone.bg === 'jungle') {
      this.spawnP(x, y, -rnd(0.3, 1.1), -rnd(0.2, 0.8), 14, 1, this.zone.deco, 0.02, 0.94);
      if (!dive && this.frame % 12 === 0)
        this.spawnP(x + 3, y - 1, -rnd(0.1, 0.6), -rnd(0.4, 1), 12, 1, this.zone.accent2, 0.03, 0.94);
    } else if (this.zone.bg === 'desert') {
      this.spawnP(x, y, -rnd(0.2, 0.8), -rnd(0.05, 0.35), 16, 1, this.zone.coinFill, 0.015, 0.97);
      if (dive) this.spawnP(x + 2, y, -rnd(0.5, 1.4), -rnd(0.1, 0.6), 12, 1, this.zone.ground, 0.02, 0.95);
    } else if (this.zone.bg === 'tundra') {
      this.spawnP(x, y, -rnd(0.3, 1), -rnd(0.5, 1.2), 16, 1, this.zone.accent, 0.01, 0.95);
      if (dive) this.spawnP(x + 2, y - 1, -rnd(0.2, 0.9), -rnd(0.7, 1.5), 14, 1, '#ffffff', 0.01, 0.95);
    } else {
      this.spawnP(x, y, -rnd(0.4, 1.3), -rnd(0.2, 0.9), 14, 1, this.zone.accent, -0.01, 0.94);
      if (dive) this.spawnP(x + 2, y - 1, -rnd(0.3, 1.1), -rnd(0.4, 1.2), 12, 1, '#7ef7ff', 0, 0.94);
    }
  }

  private popText(x: number, y: number, text: string, col: string, scale = 1) {
    if (this.texts.length >= T_CAP) this.texts.shift();
    this.texts.push({
      x,
      y,
      vy: -0.62,
      life: 52,
      max: 52,
      text,
      col,
      scale,
      sprite: this.bakeFloatText(text, col, scale),
      spritePop: this.bakeFloatText(text, col, scale + 1),
    });
  }

  private bakeFloatText(text: string, col: string, scale: number): HTMLCanvasElement {
    const tw = textWidth(text, scale);
    const h = FONT_H * scale;
    const cv = document.createElement('canvas');
    cv.width = tw + 4;
    cv.height = h + 4;
    const c = cv.getContext('2d')!;
    const out = '#1a0a2a';
    drawText(c, text, 1, 1, scale, out);
    drawText(c, text, 3, 1, scale, out);
    drawText(c, text, 2, 0, scale, out);
    drawText(c, text, 2, 2, scale, out);
    drawText(c, text, 2, 1, scale, col);
    return cv;
  }

  private addShake(v: number) {
    this.shake = Math.min(1, this.shake + v);
  }

  private addCombo(x: number, y: number, base: number, label?: string) {
    this.combo++;
    this.comboT = COMBO_TIME;
    this.comboPulse = 1; // smooth colour flash, decays in step()
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    const pts = base * this.mult();
    this.bonus += pts;
    this.popText(x, y, (label ? label + ' ' : '+') + pts, this.mult() > 1 ? '#ffd166' : '#ffffff');
    if (this.combo > 1 && this.combo % 4 === 0) {
      this.popText(x, y - 12, 'X' + this.mult(), '#ff4d6d', 1);
      sfx.play('combo', this.mult());
    }
  }

  private breakCombo() {
    this.combo = 0;
    this.comboT = 0;
  }

  /* ------------------------------------------------------------ generation */
  // Follows the true jump/fall arc so coins always sit exactly where you travel.
  private addCoinArc(x0: number, x1: number, topY: number, arcH = 26, n = 4) {
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const y = topY - Math.sin(t * Math.PI) * arcH;
      this.pickups.push({ x: x0 + (x1 - x0) * t, y, t: rnd(0, 6), gem: false, dead: false });
    }
  }

  private addCoinLine(x0: number, x1: number, y: number, max = 4) {
    const n = clamp(Math.floor((x1 - x0) / 26) + 1, 2, max);
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      this.pickups.push({ x: x0 + (x1 - x0) * t, y, t: i * 0.7, gem: false, dead: false });
    }
  }

  private blobKind(): EnemyKind {
    if (this.zone.bg === 'jungle') return this.genCount % 2 === 0 ? 'slime' : 'hopper';
    if (this.zone.bg === 'desert') return this.genCount % 2 === 0 ? 'scarab' : 'slime';
    return 'slime';
  }

  private addBlob(p: Platform, x: number) {
    const kind = this.blobKind();
    const dims =
      kind === 'scarab' ? { w: 22, h: 10, dy: 10 } : kind === 'hopper' ? { w: 14, h: 15, dy: 15 } : { w: 18, h: 14, dy: 14 };
    const speed = kind === 'scarab' ? 1.0 : 0.48;
    this.enemies.push({
      kind,
      x,
      y: p.y - dims.dy,
      w: dims.w,
      h: dims.h,
      vx: this.genCount % 2 === 0 ? -speed : speed,
      vy: 0,
      jt: 0,
      minX: p.x + 8,
      maxX: p.x + p.w - dims.w - 12,
      t: this.genCount * 0.6,
      baseY: p.y - dims.dy,
      dead: false,
      hurt: 0,
    });
  }

  private addFlyer(x: number, y: number, range = 32) {
    this.enemies.push({
      kind: 'flyer',
      x,
      y,
      w: 20,
      h: 14,
      vx: -0.32,
      vy: 0,
      jt: 0,
      minX: x - range,
      maxX: x + range,
      t: this.genCount * 0.4,
      baseY: y,
      dead: false,
      hurt: 0,
    });
  }

  private addSpiker(p: Platform, x: number) {
    this.enemies.push({
      kind: 'spiker',
      x,
      y: p.y - 20,
      w: 12,
      h: 20,
      vx: 0,
      vy: 0,
      jt: 0,
      minX: x,
      maxX: x,
      t: 0,
      baseY: p.y - 20,
      dead: false,
      hurt: 0,
    });
  }

  private pickPowerUp(): PowerUpKind {
    const kinds: PowerUpKind[] = ['shield', 'shoes', 'triple', 'propeller'];
    let kind = kinds[ri(0, kinds.length - 1)];
    if (kind === this.lastPowerUpKind) kind = kinds[(kinds.indexOf(kind) + ri(1, kinds.length - 1)) % kinds.length];
    this.lastPowerUpKind = kind;
    return kind;
  }

  private addPowerUp(p: Platform) {
    const kind = this.pickPowerUp();
    this.powerups.push({
      x: p.x + p.w * 0.52,
      y: p.y - 9,
      t: rnd(0, 6),
      kind,
      dead: false,
    });
    this.nextPowerUpX = p.x + rnd(720, 980);
  }

  private biomeIndexAtX(x: number) {
    return Math.floor(Math.max(0, x - this.startX) / 3500);
  }

  private biomeAtX(x: number): BgKind {
    const index = this.biomeIndexAtX(x);
    return ZONES[this.zoneOrder[index % ZONES.length]].bg;
  }

  private decorate(
    p: Platform,
    gapStart: number,
    gapEnd: number,
    prevY: number,
    pattern: number,
  ) {
    const d = this.diff();
    const intro = this.genCount < 4;
    const gap = gapEnd - gapStart;

    // Exactly ONE coin placement per encounter: the gap arc only appears on rest
    // beats, so it never overlaps with a pattern's own coins.
    if (!intro && pattern === PAT.REST && gap > 34 && Math.random() < 0.6) {
      this.addCoinArc(gapStart + 6, gapEnd - 6, Math.min(prevY, p.y) - 15, 24, gap > 66 ? 4 : 3);
    }

    // Power-ups only appear on wide, calm platforms and are spaced by world
    // distance, so they never create a new procedural jump requirement.
    if (!intro && pattern === PAT.REST && gap > 34 && p.w >= 100 && p.x >= this.nextPowerUpX)
      this.addPowerUp(p);

    if (!intro) {
      const biomeIndex = this.biomeIndexAtX(p.x);
      if (!this.eventBiomeRolls.has(biomeIndex)) {
        this.eventBiomeRolls.add(biomeIndex);
        const kind = this.biomeAtX(p.x);
        if (kind !== 'city' && Math.random() < 0.2)
          this.eventTriggers.push({ x: p.x + 8, kind, used: false });
      }
    }

    if (intro) {
      if (this.genCount === 1) this.addCoinLine(Math.max(p.x + 44, 158), p.x + p.w - 44, p.y - 16, 4);
      if (this.genCount === 2) this.addBlob(p, p.x + p.w * 0.62);
      if (this.genCount === 3) {
        // teach the launch pad: pad + a clean bounce arc landing on this platform
        const sx = p.x + 40;
        const launchVx = this.runSpeed();
        this.springs.push({ x: sx, y: p.y - 9, press: 0, mega: false, launchVx });
        this.addPadArc(sx, p.y, p.y, PAD_V, launchVx, 4);
      }
      return;
    }

    const center = p.x + p.w * 0.52;

    switch (pattern) {
      case PAT.REST:
        // no gap arc here (gap too small) — maybe a tiny sparse line instead
        if (gap <= 34 && Math.random() < 0.5) this.addCoinLine(center - 26, center + 26, p.y - 16, 3);
        break;

      case PAT.STOMP: {
        this.addBlob(p, center);
        this.addCoinArc(center - 22, center + 24, p.y - 25, 24, 3);
        // sometimes a second foe on a wide platform
        if (p.w > 165 && Math.random() < 0.4) this.addBlob(p, p.x + p.w * 0.28);
        break;
      }

      case PAT.SPIKES: {
        // variable spike fields: singles, short rows, or spaced clusters
        const roll = Math.random();
        const maxN = d > 0.6 ? 5 : d > 0.3 ? 4 : 3;
        if (this.zone.bg === 'desert' && Math.random() < 0.5) {
          // cactus spikers you must slam through — keep them far enough apart
          // that there's a real landing spot in between (spiker is 12 wide).
          this.addSpiker(p, center - 20);
          if (p.w > 185 && Math.random() < 0.5) this.addSpiker(p, center + 40);
        } else if (roll < 0.4 && p.w >= 165) {
          // Two clusters = two distinct hops. Anchor one near each end so the
          // space between them is always a usable landing zone.
          const leftPad = 34;
          const rightPad = 26;
          const a = ri(2, Math.min(3, maxN));
          const b = ri(1, Math.min(3, maxN));
          const ax = p.x + leftPad;
          const bx = p.x + p.w - rightPad - b * 8;
          this.spikes.push({ x: ax, y: p.y - 10, n: a });
          this.spikes.push({ x: bx, y: p.y - 10, n: b });
          const mid = (ax + a * 8 + bx) / 2;
          this.addCoinArc(mid - 14, mid + 14, p.y - 27, 22, 2);
        } else {
          const count = ri(2, maxN);
          const spikeX = center - count * 4;
          this.spikes.push({ x: spikeX, y: p.y - 10, n: count });
          this.addCoinArc(spikeX - 14, spikeX + count * 8 + 14, p.y - 26, 24, 3);
        }
        break;
      }

      case PAT.LAUNCH: {
        // The departure pad and its coins are created with this exact pit in generate().
        break;
      }

      case PAT.MEGA: {
        break;
      }

      case PAT.UPPER: {
        const fw = clamp(p.w - 40, 30, 64);
        const fx = p.x + (p.w - fw) * rnd(0.35, 0.6);
        const fy = clamp(p.y - ri(40, 52), 72, VH - 66);
        this.platforms.push({ x: fx, y: fy, w: fw, float: true, seed: Math.random() * 999 });
        this.addCoinLine(fx + 8, fx + fw - 8, fy - 14, 3);
        if (Math.random() < 0.35)
          this.pickups.push({ x: fx + fw / 2, y: fy - 30, t: 0, gem: true, dead: false });
        break;
      }

      case PAT.FLYER:
      default: {
        const droneX = gap > 50 ? (gapStart + gapEnd) / 2 : center;
        const droneY = clamp(Math.min(prevY, p.y) - ri(30, 46), 66, VH - 54);
        this.addFlyer(droneX, droneY, gap > 50 ? 22 : ri(28, 40));
        if (Math.random() < 0.4) this.addCoinLine(center - 22, center + 22, p.y - 16, 3);
        break;
      }
    }
  }

  private padReach(startY: number, landingY: number, v: number, vx: number) {
    let py = startY - 9 - PLAYER_H;
    let vy = -v;
    let dx = 0;
    for (let f = 0; f < 150; f++) {
      vy = Math.min(MAX_FALL, vy + (vy < 0 ? GRAV : GRAV_FALL));
      dx += vx;
      py += vy;
      if (vy > 0 && py + PLAYER_H >= landingY) return dx;
    }
    return dx;
  }

  // Uses the exact pad start, locked horizontal speed, and pad gravity from step().
  private addPadArc(
    sx: number,
    startY: number,
    landingY: number,
    v: number,
    vx: number,
    n: number,
  ) {
    let x = sx + 7;
    let py = startY - 9 - PLAYER_H;
    let vy = -v;
    const pts: number[] = [x, py + PLAYER_H / 2];
    for (let f = 1; f < 150; f++) {
      vy = Math.min(MAX_FALL, vy + (vy < 0 ? GRAV : GRAV_FALL));
      x += vx;
      py += vy;
      if (f % 2 === 0) pts.push(x, py + PLAYER_H / 2);
      if (vy > 0 && py + PLAYER_H >= landingY) break;
    }
    const count = Math.min(n, pts.length >> 1);
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(((i + 0.5) / count) * (pts.length >> 1));
      this.pickups.push({
        x: pts[idx * 2],
        y: pts[idx * 2 + 1],
        t: i * 0.6,
        gem: false,
        dead: false,
      });
    }
  }

  // Weighted, non-repeating pattern picker -> a fresh sequence every run.
  private pickPattern(): number {
    const d = this.diff();
    const weights = [
      1.4 - 0.6 * d, // rest thins out as it speeds up
      1.6,
      1.0 + 1.2 * d, // more spikes later
      0.9,
      0.7,
      0.9,
      0.8 + 0.8 * d,
    ];
    // avoid the same pattern 3x, and never chain two launch pads
    for (let attempt = 0; attempt < 8; attempt++) {
      let total = 0;
      for (const w of weights) total += w;
      let r = Math.random() * total;
      let pick = 0;
      for (let i = 0; i < weights.length; i++) {
        r -= weights[i];
        if (r <= 0) {
          pick = i;
          break;
        }
      }
      const tooRepeated = pick === this.lastPattern && this.patternRepeat >= 1;
      const doubleLaunch =
        (pick === PAT.LAUNCH || pick === PAT.MEGA) &&
        (this.lastPattern === PAT.LAUNCH || this.lastPattern === PAT.MEGA);
      if (!tooRepeated && !doubleLaunch) {
        this.patternRepeat = pick === this.lastPattern ? this.patternRepeat + 1 : 0;
        this.lastPattern = pick;
        return pick;
      }
    }
    this.lastPattern = PAT.REST;
    this.patternRepeat = 0;
    return PAT.REST;
  }

  private generate(untilX: number) {
    let guard = 0;
    while (this.genX < untilX && guard++ < 60) {
      const d = this.diff();
      const intro = this.genCount < 4;
      const prevEnd = this.genX;
      const prevY = this.lastY;

      const pattern = intro ? PAT.REST : this.pickPattern();

      let y = prevY;
      if (!intro) {
        if (pattern === PAT.LAUNCH) {
          // launch pad: the next platform drops away into a real pit
          y = clamp(prevY + rnd(26, 50), 112, MAX_PLATFORM_Y);
        } else if (pattern === PAT.MEGA) {
          // super pad: deeper drop and a much wider canyon
          y = clamp(prevY + rnd(34, 58), 112, MAX_PLATFORM_Y);
        } else if (pattern === PAT.UPPER) {
          // upper route: gentle change, wide but reachable gap
          y = clamp(prevY + rnd(-10, 18), 98, MAX_PLATFORM_Y);
        } else {
          const dy = rnd(-46, 58) * (0.45 + 0.55 * d);
          y = clamp(prevY + dy, 98, MAX_PLATFORM_Y);
          if (y < prevY - 40) y = prevY - 40;
        }
      }

      let gap = 0;
      let launchLandingWidth = 0;
      if (this.genCount === 0) gap = 0;
      else if (intro) gap = 30 + this.genCount * 8;
      else if (pattern === PAT.LAUNCH) {
        const vx = this.runSpeed();
        const reach = this.padReach(prevY, y, PAD_V, vx);
        gap = clamp(reach * rnd(0.72, 0.8) - 23, 44, 70);
        launchLandingWidth = reach - gap + 12;
      } else if (pattern === PAT.MEGA) {
        const vx = this.runSpeed();
        const reach = this.padReach(prevY, y, MEGA_PAD_V, vx);
        gap = clamp(reach * rnd(0.74, 0.82) - 23, 74, 108);
        launchLandingWidth = reach - gap + 14;
      } else if (pattern === PAT.UPPER) {
        gap = rnd(44, 58);
      } else {
        gap = rnd(26 + 10 * d, 42 + 24 * d);
        // climbing costs air time: shorten the gap, drops can be longer
        const rise = prevY - y;
        if (rise > 0) gap *= 1 - 0.55 * (rise / 40);
        else gap *= 1 + 0.2 * (-rise / 58);
        gap = Math.max(24, gap);
      }

      const x = prevEnd + gap;
      // platform width varies with pattern for readable, non-random terrain
      let w: number;
      if (intro) w = this.genCount === 0 ? 380 : 200;
      else if (pattern === PAT.LAUNCH || pattern === PAT.MEGA) w = rnd(90, 130);
      else if (pattern === PAT.SPIKES) w = rnd(120, 200);
      else if (pattern === PAT.REST) w = rnd(80, 130);
      else w = rnd(100, 190 - 40 * d);
      if (launchLandingWidth > 0) w = Math.max(w, clamp(launchLandingWidth, 96, 148));
      const p: Platform = { x, y, w, float: false, seed: Math.random() * 999 };
      this.platforms.push(p);

      // A launch encounter belongs to the gap just generated. Put the pad on
      // the departure edge and build its coin path to this exact landing.
      if (!intro && (pattern === PAT.LAUNCH || pattern === PAT.MEGA)) {
        const mega = pattern === PAT.MEGA;
        const sx = prevEnd - (mega ? 30 : 28);
        const v = mega ? MEGA_PAD_V : PAD_V;
        const launchVx = this.runSpeed();

        // The launch is the only pickup read in this space. Remove a previous
        // pattern's nearby coins/hazards so the departure edge stays legible.
        const clearFrom = prevEnd - 118;
        for (let i = this.pickups.length - 1; i >= 0; i--)
          if (this.pickups[i].x > clearFrom && this.pickups[i].x < x + 8)
            this.pickups.splice(i, 1);
        for (let i = this.spikes.length - 1; i >= 0; i--)
          if (this.spikes[i].x + this.spikes[i].n * 8 > prevEnd - 54)
            this.spikes.splice(i, 1);
        for (let i = this.enemies.length - 1; i >= 0; i--)
          if (this.enemies[i].x + this.enemies[i].w > prevEnd - 48)
            this.enemies.splice(i, 1);

        this.springs.push({ x: sx, y: prevY - 9, press: 0, mega, launchVx });
        this.addPadArc(sx, prevY, y, v, launchVx, mega ? 6 : 4);
      }
      this.decorate(p, prevEnd, x, prevY, pattern);
      this.lastY = y;
      this.genX = x + w;
      this.genCount++;
    }
  }

  private cullArr<T>(arr: T[], gone: (v: T) => boolean) {
    for (let i = arr.length - 1; i >= 0; i--) if (gone(arr[i])) arr.splice(i, 1);
  }

  private cull() {
    const lim = this.camX - 90;
    this.cullArr(this.platforms, (p) => p.x + p.w < lim);
    this.cullArr(this.pickups, (k) => k.dead || k.x < lim);
    this.cullArr(this.powerups, (u) => u.dead || u.x < lim);
    this.cullArr(this.eventTriggers, (t) => t.used || t.x < lim);
    this.cullArr(this.enemies, (e) => e.dead || e.x < lim);
    this.cullArr(this.spikes, (s) => s.x + s.n * 8 < lim);
    this.cullArr(this.springs, (s) => s.x + 14 < lim);
  }

  private hasGroundNear(x: number, y: number) {
    for (const p of this.platforms) {
      if (x >= p.x - 2 && x <= p.x + p.w + 2 && p.y > y - 24 && p.y < y + 90) return true;
    }
    return false;
  }

  /* ------------------------------------------------------------ simulation */
  step() {
    this.frame++;
    if (this.phase === 'paused') return;

    // decaying juice always runs
    this.shake *= 0.9;
    if (this.shake < 0.002) this.shake = 0;
    const s = this.shake * this.shake * 7;
    this.shakeX = rnd(-s, s);
    // Keep impact feedback mostly horizontal; full vertical shake makes the
    // entire world appear to drop on narrow/mobile viewports.
    this.shakeY = rnd(-s * 0.28, s * 0.28);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - 0.06);

    if (this.freeze > 0) {
      this.freeze--;
      return;
    }

    // post-unpause countdown: hold the world still, keep the player safe.
    // Held input is allowed to buffer (jumpBuf etc.) so it fires at GO —
    // it must not be reset here or held keys across pause would deaden.
    if (this.countdown > 0) {
      this.countdown--;
      if (this.countdown === 0) this.goTimer = 30;
      this.updateParticles(1);
      return;
    }
    if (this.goTimer > 0) this.goTimer--;

    // death slow-mo
    if (this.phase === 'dead') {
      this.deathTimer++;
      this.slowAcc += this.deathTimer < 40 ? 0.35 : 1;
      if (this.slowAcc < 1) {
        this.updateParticles(0.35);
        return;
      }
      this.slowAcc -= 1;
      this.updateParticles(1);
      this.updateTexts();
      if (this.deathTimer > 42 && !this.deathReported) {
        this.deathReported = true;
        this.onDeath?.(this.stats);
      }
      return;
    }

    const alive = this.phase === 'playing' || this.phase === 'ready';
    if (!alive) return;

    if (this.phase === 'ready') this.attractAI();
    if (this.phase === 'playing') {
      this.updateBiomeEvent();
      sfx.setMusic(this.zone.bg, this.diff());
      this.updatePowerUpTimers();
    }

    /* ---- horizontal motion */
    let target = this.runSpeed();
    if (this.phase === 'ready') target *= 0.82;
    if (this.phase === 'playing' && this.eventTimer > 0) {
      if (this.eventKind === 'jungle') target *= 1.04;
      else if (this.eventKind === 'desert') target *= 0.96;
      else if (this.eventKind === 'tundra') target *= 0.82;
    }
    if (this.padFlight <= 0) {
      if (this.moveDir > 0) target *= 1.22;
      this.vx += (target - this.vx) * 0.14;
    } else {
      this.padFlight--;
    }

    /* ---- jumping */
    if (this.jumpBuf > 0) this.jumpBuf--;
    if (this.coyote > 0) this.coyote--;
    if (this.jumpBuf > 0) {
      if (this.onGround || this.coyote > 0) {
        this.doJump(false);
      } else if (this.jumps < (this.tripleJump > 0 ? 3 : 2)) {
        this.doJump(true);
      }
    }
    if (!this.jumpHeld && this.vy < -2.4 && !this.cut) {
      this.vy *= 0.52;
      this.cut = true;
    }

    /* ---- gravity */
    if (this.diveHeld && !this.onGround && !this.diving && this.vy > 0.5) {
      this.diving = true;
      this.spin = 0;
    }
    let g = GRAV_FALL;
    if (this.diving) g = GRAV_DIVE;
    else if ((this.propellerHat > 0 || this.propellerFlashing) && !this.onGround && this.jumpHeld) g = this.vy > 0 ? 0.08 : 0.16;
    else if (this.eventTimer > 0 && this.eventKind === 'desert') g = this.vy < 0 ? 0.3 : 0.48;
    else if (this.vy < 0) g = this.padFlight > 0 ? GRAV : this.jumpHeld ? GRAV_HOLD : GRAV;
    this.vy = Math.min(MAX_FALL + (this.diving ? 5 : 0), this.vy + g);
    if ((this.propellerHat > 0 || this.propellerFlashing) && !this.onGround && !this.diving && this.jumpHeld && this.vy > 1.8)
      this.vy = 1.8;

    /* ---- integrate + collide */
    const prevBottom = this.py + PLAYER_H;
    this.px += this.vx;
    if (!this.resolveX()) {
      this.syncDistanceScore();
      return;
    }
    this.py += this.vy;
    this.resolveY(prevBottom);

    /* ---- squash & spin */
    this.sx += (1 - this.sx) * 0.18;
    this.sy += (1 - this.sy) * 0.18;
    if (this.spin > 0) this.spin = Math.max(0, this.spin - 0.075);
    this.animT += this.vx * 0.09;

    /* ---- ghosts */
    if (this.frame % 3 === 0 && (this.diving || this.vx > 3.6 || this.spin > 0)) {
      this.ghosts.push({ x: this.px, y: this.py, life: 14 });
      if (this.ghosts.length > 8) this.ghosts.shift();
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      if (--this.ghosts[i].life <= 0) this.ghosts.splice(i, 1);
    }

    /* ---- biome trail */
    if (this.onGround && this.frame % 6 === 0 && this.vx > 1) this.emitTrail(false);
    if (this.diving && this.frame % 2 === 0) {
      this.emitTrail(true);
    }

    /* ---- world */
    const survivedEntities = this.updateEntities();
    // Collision handlers can end the run before the normal score section.
    // Keep the distance and pickups from the death frame in the final score.
    if (!survivedEntities) this.syncDistanceScore();
    this.updateParticles(1);
    this.updateTexts();

    /* ---- camera */
    const camTarget = this.px - anchorX();
    this.camX += (camTarget - this.camX) * 0.22;
    if (this.camX < 0) this.camX = 0;

    this.generate(this.camX + VW * 2.2);
    if (this.frame % 20 === 0) this.cull();

    /* ---- score */
    if (this.phase === 'playing') {
      this.syncDistanceScore();
      const m = Math.floor(this.distance / 10);
      if (m >= this.nextMilestone) {
        this.bonus += 100;
        this.popText(this.px, this.py - 24, this.nextMilestone + 'M!', '#3ef2c8', 1);
        this.nextMilestone += 250;
        this.addShake(0.16);
        sfx.play('combo', 6);
      }
      if (this.comboT > 0) {
        this.comboT--;
        if (this.comboT === 0) this.combo = 0;
      }
      if (this.comboPulse > 0) this.comboPulse = Math.max(0, this.comboPulse - 0.12);
      const zi = Math.floor(m / 350);
      if (zi !== this.zoneIdx) {
        this.zoneIdx = zi;
        this.popText(
          this.px + 40,
          46,
          ZONES[this.zoneOrder[zi % ZONES.length]].name,
          '#ffffff',
          1,
        );
      }
    }

    /* ---- death by pit */
    if (this.py > BASE_VH + 60) this.die('pit');
  }

  private doJump(dbl: boolean) {
    this.jumpBuf = 0;
    this.cut = false;
    this.diving = false;
    const jumpScale = this.jumpShoes > 0 ? 1.18 : 1;
    this.vy = -(dbl ? DJUMP_V : JUMP_V) * jumpScale;
    if (dbl) this.padFlight = 0;
    this.jumps = dbl ? Math.min(3, this.jumps + 1) : 1;
    this.onGround = false;
    this.coyote = 0;
    this.sx = 0.74;
    this.sy = 1.32;
    const bx = this.px + PLAYER_W / 2;
    const by = this.py + PLAYER_H;
    if (dbl) {
      this.spin = 1;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        this.spawnP(bx, by - 6, Math.cos(a) * 1.7, Math.sin(a) * 1.2, 18, 1, this.zone.accent, 0.02, 0.9);
      }
      sfx.play('djump');
    } else {
      for (let i = 0; i < 6; i++) {
        this.spawnP(bx, by, rnd(-1.4, 0.4), -rnd(0.2, 0.9), 16, 1, '#ffffff', 0.05, 0.93);
      }
      sfx.play('jump');
    }
  }

  private resolveX(): boolean {
    const pw = PLAYER_W;
    const ph = PLAYER_H;
    for (const p of this.platforms) {
      if (p.float) continue;
      const bh = GROUND_BOTTOM - p.y;
      if (
        this.px + pw > p.x &&
        this.px < p.x + p.w &&
        this.py + ph > p.y + 3 &&
        this.py < p.y + bh
      ) {
        if (this.vx > 0 && this.px + pw - this.vx <= p.x + 1) {
          if (this.absorbShieldHit()) {
            this.px = p.x - pw - 1;
            this.vx = 0;
            continue;
          }
          if (this.invuln > 0) {
            this.px = p.x - pw - 1;
            this.vx = 0;
            continue;
          }
          this.die('wall');
          return false;
        } else if (this.vx < 0) {
          this.px = p.x + p.w;
          this.vx = 0;
        }
      }
    }
    return true;
  }

  private resolveY(prevBottom: number) {
    const pw = PLAYER_W;
    const ph = PLAYER_H;
    this.onGround = false;
    let landing: Platform | null = null;
    let bonked = false;
    for (const p of this.platforms) {
      if (this.px + pw <= p.x + 1 || this.px >= p.x + p.w - 1) continue;
      const bh = p.float ? 8 : GROUND_BOTTOM - p.y;
      if (this.py + ph > p.y && this.py < p.y + bh) {
        if (this.vy >= 0 && prevBottom <= p.y + Math.max(4, this.vy)) {
          // If surfaces overlap, land on the first surface crossed, not on
          // whichever platform happened to be iterated last.
          if (!landing || p.y < landing.y) landing = p;
        } else if (!p.float && this.vy < 0 && !bonked) {
          this.vy = 0;
          bonked = true;
        }
      }
    }
    if (landing !== null) {
      this.py = landing.y - ph;
      this.onGround = true;
      const impact = this.vy;
      const wasDiving = this.diving;
      this.vy = 0;
      this.padFlight = 0;
      this.jumps = 0;
      this.coyote = COYOTE;
      this.diving = false;
      this.spin = 0;
      if (this.propellerFlashing && this.propellerFlashTimer <= 0) {
        this.propellerHat = 0;
        this.propellerFlashing = false;
      }
      if (impact > 2) {
        this.sx = 1 + Math.min(0.45, impact * 0.045);
        this.sy = 1 - Math.min(0.4, impact * 0.04);
        const n = wasDiving ? 16 : Math.min(10, Math.floor(impact));
        for (let i = 0; i < n; i++) {
          this.spawnP(
            this.px + PLAYER_W / 2,
            this.py + PLAYER_H,
            rnd(-2.4, 2.4) * (wasDiving ? 1.6 : 1),
            -rnd(0.2, 1.5),
            18,
            1,
            i % 3 === 0 ? '#ffffff' : shade(this.zone.accent, -0.1),
            0.12,
            0.92,
          );
        }
      }
      if (wasDiving) {
        this.addShake(0.5);
        this.freeze = 3;
        sfx.play('slam');
        // shockwave kills nearby ground enemies
        for (const e of this.enemies) {
          if (e.dead || e.kind === 'flyer') continue;
          if (
            Math.abs(e.x + e.w / 2 - (this.px + PLAYER_W / 2)) < 46 &&
            Math.abs(e.y - this.py) < 28
          ) {
            this.killEnemy(e, SLAM_PTS, e.kind === 'spiker' ? 'SMASH' : 'SLAM');
          }
        }
        for (let i = 0; i < 18; i++) {
          const dir = i % 2 === 0 ? 1 : -1;
          this.spawnP(
            this.px + PLAYER_W / 2,
            this.py + PLAYER_H,
            dir * rnd(1.5, 4.5),
            -rnd(0, 1.2),
            20,
            i % 4 === 0 ? 2 : 1,
            '#ffd166',
            0.14,
            0.9,
          );
        }
      } else if (impact > 8) {
        this.addShake(0.18);
      }
    } else if (this.vy > 0 && this.coyote === 0 && this.jumps === 0) {
      this.jumps = 1; // walked off a ledge: keep only the air jump
    }
  }

  private killEnemy(e: Enemy, pts: number, label?: string) {
    e.dead = true;
    this.kills++;
    this.addCombo(e.x + e.w / 2, e.y - 8, pts, label);
    this.burst(e.x + e.w / 2, e.y + e.h / 2, 14, [this.zone.slimeBody, this.zone.accent, '#ffffff'], 2.6, 0.16);
    sfx.play(e.kind === 'spiker' ? 'slam' : 'stomp');
  }

  private updateEntities(): boolean {
    const pxc = this.px;
    const pyc = this.py;
    const pw = PLAYER_W;
    const ph = PLAYER_H;

    /* pickups */
    for (const c of this.pickups) {
      if (c.dead) continue;
      c.t += 0.14;
      if (c.x < this.camX - 30 || c.x > this.camX + VW + 40) continue;
      const r = c.gem ? 9 : 8;
      if (
        Math.abs(c.x - (pxc + pw / 2)) < r + pw / 2 - 2 &&
        Math.abs(c.y - (pyc + ph / 2)) < r + ph / 2 - 3
      ) {
        c.dead = true;
        if (c.gem) {
          this.coins += 5;
          this.addCombo(c.x, c.y - 6, GEM_PTS, 'GEM');
          this.burst(c.x, c.y, 16, ['#7ef7ff', '#ffffff', '#3ef2c8'], 2.4, 0.05);
          this.addShake(0.22);
          this.flash = 0.3;
          this.flashCol = '#7ef7ff';
          this.freeze = 2;
          sfx.play('gem');
        } else {
          this.coins++;
          this.addCombo(c.x, c.y - 4, COIN_PTS);
          this.burst(c.x, c.y, 6, ['#ffd166', '#ffffff'], 1.7, 0.04);
          sfx.play('coin');
        }
      }
    }

    /* power-ups */
    for (const power of this.powerups) {
      if (power.dead) continue;
      power.t += 0.12;
      if (power.x < this.camX - 30 || power.x > this.camX + VW + 40) continue;
      if (
        Math.abs(power.x - (pxc + pw / 2)) < 10 + pw / 2 - 2 &&
        Math.abs(power.y - (pyc + ph / 2)) < 10 + ph / 2 - 3
      ) {
        power.dead = true;
        this.activatePowerUp(power.kind, power.x, power.y);
      }
    }

    /* enemies: movement */
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.x < this.camX - 40 || e.x > this.camX + VW + 90) continue;
      e.t += 0.1;
      if (e.hurt > 0) e.hurt--;
      if (e.kind === 'flyer') {
        e.x += e.vx;
        e.y = e.baseY + Math.sin(e.t) * 9;
        if (e.x < e.minX || e.x > e.maxX) e.vx *= -1;
      } else if (e.kind === 'hopper') {
        e.x += e.vx;
        if (e.x < e.minX) {
          e.x = e.minX;
          e.vx *= -1;
        }
        if (e.x > e.maxX) {
          e.x = e.maxX;
          e.vx *= -1;
        }
        if (e.vy !== 0 || e.y > e.baseY) {
          e.vy += 0.45;
          e.y += e.vy;
          if (e.y >= e.baseY) {
            e.y = e.baseY;
            e.vy = 0;
          }
        }
        if (e.vy === 0 && e.y >= e.baseY && ++e.jt > 24) {
          e.jt = 0;
          e.vy = -4.6;
        }
      } else if (e.kind !== 'spiker') {
        e.x += e.vx;
        if (e.x < e.minX) {
          e.x = e.minX;
          e.vx *= -1;
        }
        if (e.x > e.maxX) {
          e.x = e.maxX;
          e.vx *= -1;
        }
      }

      // Turn around at jump pads the same way as platform edges / other enemies.
      if (e.kind !== 'flyer' && e.kind !== 'spiker') {
        for (const sp of this.springs) {
          if (e.y + e.h < sp.y - 2 || e.y > sp.y + 12) continue;
          const left = sp.x - 2;
          const right = sp.x + (sp.mega ? 18 : 14) + 2;
          if (e.vx > 0 && e.x + e.w > left && e.x + e.w - e.vx <= left + 1) {
            e.x = left - e.w;
            e.vx = -Math.abs(e.vx || 0.45);
            break;
          }
          if (e.vx < 0 && e.x < right && e.x - e.vx >= right - 1) {
            e.x = right;
            e.vx = Math.abs(e.vx || 0.45);
            break;
          }
        }
      }
    }

    /* enemies: pairwise separation */
    for (let i = 0; i < this.enemies.length; i++) {
      const a = this.enemies[i];
      if (a.dead || a.kind === 'flyer' || a.kind === 'spiker') continue;
      for (let j = i + 1; j < this.enemies.length; j++) {
        const b = this.enemies[j];
        if (b.dead || b.kind === 'flyer' || b.kind === 'spiker') continue;
        if (Math.abs(a.x - b.x) > 40 || Math.abs(a.y - b.y) > 18) continue;
        const dx = b.x + b.w / 2 - (a.x + a.w / 2);
        const pxOverlap = a.w / 2 + b.w / 2 - Math.abs(dx);
        if (pxOverlap <= 0) continue;
        const dy = b.y + b.h / 2 - (a.y + a.h / 2);
        if (Math.abs(dy) >= a.h / 2 + b.h / 2) continue;
        const dir = dx >= 0 ? 1 : -1;
        const push = pxOverlap / 2 + 0.3;
        a.x = clamp(a.x - dir * push, a.minX, a.maxX);
        b.x = clamp(b.x + dir * push, b.minX, b.maxX);
        const av = Math.max(0.45, Math.abs(a.vx || 0.45));
        const bv = Math.max(0.45, Math.abs(b.vx || 0.45));
        a.vx = -dir * av;
        b.vx = dir * bv;
      }
    }

    /* enemies: player collision */
    const fallVy = this.vy;
    const prevFeet = pyc + ph - fallVy;
    let stompedThisFrame = false;
    let shieldTriggered = false;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.x < this.camX - 40 || e.x > this.camX + VW + 90) continue;
      if (this.invuln > 0) continue;
      if (
        pxc + pw > e.x + 1 &&
        pxc < e.x + e.w - 1 &&
        pyc + ph > e.y + 1 &&
        pyc < e.y + e.h
      ) {
        if (e.kind === 'spiker') {
          if (this.diving) {
            this.killEnemy(e, SLAM_PTS, 'SMASH');
            stompedThisFrame = true;
          } else {
            if (this.absorbShieldHit()) {
              const pushDir = pxc + pw / 2 < e.x + e.w / 2 ? -1 : 1;
              this.px += pushDir * 6;
              this.vx = pushDir * 1.2;
              shieldTriggered = true;
              break;
            }
            this.die('spike');
            return false;
          }
        } else {
          const stomping = fallVy > 0 && prevFeet <= e.y + 7;
          if (stomping || this.diving) {
            this.killEnemy(e, this.diving ? SLAM_PTS : STOMP_PTS, this.diving ? 'SLAM' : undefined);
            stompedThisFrame = true;
          } else if (!stompedThisFrame) {
            if (this.absorbShieldHit()) {
              const pushDir = pxc + pw / 2 < e.x + e.w / 2 ? -1 : 1;
              this.px += pushDir * 6;
              this.vx = pushDir * 1.2;
              shieldTriggered = true;
              break;
            }
            this.die('hit');
            return false;
          }
        }
      }
    }
    if (stompedThisFrame) {
      this.vy = -(this.jumpHeld ? 8.2 : 6.4);
      this.diving = false;
      this.jumps = Math.min(this.jumps, 1);
      this.cut = false;
      this.sx = 1.35;
      this.sy = 0.7;
      this.freeze = 4;
      this.addShake(0.34);
    }

    /* spikes */
    if (!shieldTriggered && this.invuln === 0) {
      for (const s of this.spikes) {
        if (s.x > this.camX + VW + 20 || s.x + s.n * 8 < this.camX - 20) continue;
        if (
          pxc + pw - 2 > s.x + 1 &&
          pxc + 2 < s.x + s.n * 8 - 1 &&
          pyc + ph > s.y + 3 &&
          pyc < s.y + 10
        ) {
          if (this.absorbShieldHit()) break;
          this.die('spike');
          return false;
        }
      }
    }

    /* springs */
    for (const sp of this.springs) {
      if (sp.press > 0) sp.press--;
      const padY = sp.y + (sp.press > 0 ? 4 : 0);
      if (sp.x > this.camX + VW + 20 || sp.x + 14 < this.camX - 20) continue;
      if (
        this.vy >= 0 &&
        pxc + pw > sp.x &&
        pxc < sp.x + (sp.mega ? 18 : 14) &&
        pyc + ph > padY &&
        pyc + ph < padY + 12
      ) {
        this.py = padY - ph;
        this.vy = sp.mega ? -MEGA_PAD_V : -PAD_V;
        this.vx = sp.launchVx;
        this.padFlight = 90;
        this.jumps = 0;
        this.cut = true; // a pad launch is never chopped by releasing jump
        this.diving = false;
        this.propellerHat = 0;
        this.propellerFlashing = false;
        sp.press = sp.mega ? 16 : 14;
        this.sx = 0.6;
        this.sy = 1.6;
        this.addShake(sp.mega ? 0.55 : 0.38);
        sfx.play(sp.mega ? 'slam' : 'spring');
        const n = sp.mega ? 20 : 12;
        const col = sp.mega ? '#ffd166' : '#ff4d6d';
        for (let i = 0; i < n; i++) {
          this.spawnP(
            sp.x + (sp.mega ? 9 : 7),
            sp.y,
            rnd(-2.2, 2.2),
            -rnd(2, 6),
            26,
            i % 3 === 0 ? 2 : 1,
            col,
            0.08,
            0.94,
          );
        }
      }
    }
    return true;
  }

  private updateParticles(sc: number) {
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      if (p.life <= 0) continue;
      p.life -= sc;
      p.x += p.vx * sc;
      p.y += p.vy * sc;
      p.vy += p.grav * sc;
      p.vx *= p.drag;
      p.vy *= p.drag;
    }
  }

  private updateTexts() {
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life--;
      t.y += t.vy;
      t.vy *= 0.96;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
  }

  private updateBiomeEvent() {
    if (this.eventTimer > 0) {
      if (this.eventKind !== this.zone.bg) {
        this.eventTimer = 0;
        this.eventMax = 0;
      } else {
        this.eventTimer--;
      }
      return;
    }
    for (const trigger of this.eventTriggers) {
      if (trigger.used || this.px + PLAYER_W < trigger.x - 12) continue;
      trigger.used = true;
      this.eventKind = trigger.kind;
      this.eventMax = ri(900, 1500);
      this.eventTimer = this.eventMax;
      this.eventSeed = ri(1, 99999);
      sfx.play('event', this.eventKind === 'tundra' ? 1 : this.eventKind === 'desert' ? 2 : 0);
      break;
    }
  }

  private updatePowerUpTimers() {
    if (this.invuln > 0) this.invuln--;
    if (this.shieldTimer > 0) {
      this.shieldTimer--;
      if (this.shieldTimer === 0) this.shielded = false;
    }
    if (this.jumpShoes > 0) this.jumpShoes--;
    if (this.tripleJump > 0) this.tripleJump--;
    if (this.propellerHat > 0) {
      this.propellerHat--;
      if (this.propellerHat === 0) {
        this.propellerFlashing = true;
        this.propellerFlashTimer = 120;
      }
    }
    if (this.propellerFlashing && this.propellerFlashTimer > 0) {
      this.propellerFlashTimer--;
      if (this.propellerFlashTimer === 0) this.propellerFlashing = false;
    }
  }

  private activatePowerUp(kind: PowerUpKind, x: number, y: number) {
    const labels: Record<PowerUpKind, string> = {
      shield: 'SHIELD',
      shoes: 'JUMP SHOES',
      triple: 'TRIPLE JUMP',
      propeller: 'PROPELLER',
    };
    if (kind === 'shield') {
      this.shielded = true;
      this.shieldTimer = POWERUP_TIME;
    }
    else if (kind === 'shoes') this.jumpShoes = POWERUP_TIME;
    else if (kind === 'triple') this.tripleJump = POWERUP_TIME;
    else {
      // A fresh hat ends any expiry flash from the previous hat — otherwise
      // the next landing would wipe the new hat while it still has ~10s left.
      this.propellerHat = POWERUP_TIME;
      this.propellerFlashing = false;
      this.propellerFlashTimer = 0;
    }
    this.addCombo(x, y - 8, POWERUP_PTS, labels[kind]);
    this.popText(x, y - 20, labels[kind], POWERUP_COLORS[kind], 1);
    this.burst(x, y, 14, [POWERUP_COLORS[kind], '#ffffff'], 2.2, 0.04);
    this.flash = 0.24;
    this.flashCol = POWERUP_COLORS[kind];
    sfx.play('powerup', kind === 'shield' ? 0 : kind === 'shoes' ? 1 : kind === 'triple' ? 2 : 3);
  }

  private absorbShieldHit() {
    if (!this.shielded) return false;
    this.shielded = false;
    this.shieldTimer = 0;
    this.invuln = 60;
    this.jumps = Math.min(this.jumps, 1);
    this.onGround = false;
    this.diving = false;
    this.vy = -5.4;
    this.cut = false;
    this.freeze = 4;
    this.addShake(0.5);
    this.flash = 0.5;
    this.flashCol = '#7ef7ff';
    this.burst(this.px + PLAYER_W / 2, this.py + PLAYER_H / 2, 18, ['#7ef7ff', '#ffffff'], 2.8, 0.04);
    sfx.play('shield');
    return true;
  }

  private die(cause: string) {
    if (this.phase !== 'playing' && this.phase !== 'ready') return;
    if (this.phase === 'playing' && cause !== 'pit') {
      if (this.shielded && this.absorbShieldHit()) return;
      if (this.invuln > 0) return;
    }
    if (this.phase === 'ready') {
      // attract mode: just restart the demo
      this.reset();
      return;
    }
    this.phase = 'dead';
    this.deathTimer = 0;
    this.deathReported = false;
    this.addShake(1);
    this.freeze = 8;
    this.flash = 0.95;
    this.flashCol = '#ffffff';
    this.breakCombo();
    sfx.stopMusic();
    sfx.play('death');
    for (let i = 0; i < 40; i++) {
      const a = rnd(0, Math.PI * 2);
      const sp = rnd(0.6, 4.2);
      this.spawnP(
        this.px + PLAYER_W / 2,
        this.py + PLAYER_H / 2,
        Math.cos(a) * sp,
        Math.sin(a) * sp - 1.4,
        ri(26, 54),
        i % 4 === 0 ? 2 : 1,
        ['#ff4d6d', '#ffcf9e', '#3ef2c8', '#ffffff'][i % 4],
        0.18,
        0.97,
      );
    }
  }

  private attractAI() {
    const feet = this.py + PLAYER_H;
    const ahead = this.px + PLAYER_W + 8;
    let needJump = false;
    if (this.onGround && !this.hasGroundNear(ahead, feet)) needJump = true;
    if (this.onGround) {
      for (const e of this.enemies) {
        if (e.kind === 'flyer' || e.dead) continue;
        if (e.x > this.px + 6 && e.x < this.px + 40 && Math.abs(e.y - this.py) < 20)
          needJump = true;
      }
      for (const s of this.spikes) {
        if (s.x > this.px + 4 && s.x < this.px + 44 && Math.abs(s.y - this.py) < 20)
          needJump = true;
      }
    }
    if (needJump && this.jumpBuf === 0 && this.onGround) this.pressJump();
    if (this.vy > 1.5) this.releaseJump();
    if (!this.onGround && this.vy > 0 && !this.hasGroundNear(this.px + 14, feet) && this.jumps < 2)
      this.pressJump();
  }

  /* ------------------------------------------------------------- rendering */
  render() {
    const c = this.ctx;
    const m = Math.floor(this.distance / 10);
    // Recompute zone colours only when the visible result would actually
    // change (new zone, or a coarse step through the crossfade window).
    // `m` ticks every 10 distance units — recomputing on every tick was
    // rebuilding ~25 hex-parsed colours + 15 sky bands for no visual change.
    if (m !== this.zoneMeters) {
      this.zoneMeters = m;
      const zi = Math.floor(m / 350);
      const frac = m / 350 - zi;
      const t = frac > 0.92 ? (frac - 0.92) / 0.08 : 0;
      const tq = Math.round(t * 40); // quantised to 40 steps across the fade
      if (zi !== this.lastZoneZi || tq !== this.lastZoneTQ) {
        const ziChanged = zi !== this.lastZoneZi;
        this.lastZoneZi = zi;
        this.lastZoneTQ = tq;
        const i = this.zoneOrder[zi % ZONES.length];
        const ni = this.zoneOrder[(zi + 1) % ZONES.length];
        this.zone = lerpZone(ZONES[i], ZONES[ni], tq / 40);
        // Zone name flips halfway through the crossfade while colours keep
        // lerping, so keying the platform cache on the name froze every
        // platform at the half-blended palette. Rebuild only at the boundary
        // where the zone colours are pure.
        if (ziChanged) this.platformEpoch++;
        this.refreshZoneColors();
        this.skyBands.length = 0;
        for (let b = 0; b < 15; b++) {
          this.skyBands.push(sampleSky(this.zone.sky, (b + 0.5) / 15));
        }
      }
    }

    c.imageSmoothingEnabled = false;
    c.setTransform(1, 0, 0, 1, 0, 0);
    this.drawSky();

    c.save();
    // Integer shake only — subpixel translate would blur the whole scene.
    // worldOffsetY pushes the world down on tall screens so the ground sits
    // near the bottom and the extra space becomes sky instead of black bars.
    c.translate(
      Math.round(this.shakeX),
      Math.round(this.shakeY) + worldOffsetY(),
    );
    this.drawParallax();
    this.drawWorld();
    this.drawParticles();
    if (this.phase !== 'dead') this.drawPlayer();
    this.drawTexts();
    c.restore();

    this.drawForeground();
    this.drawHud();

    if (this.flash > 0.002) {
      c.globalAlpha = Math.min(1, this.flash);
      c.fillStyle = this.flashCol;
      c.fillRect(0, 0, VW, VH);
      c.globalAlpha = 1;
    }

    if ((this.countdown > 0 || this.goTimer > 0) && this.phase !== 'dead') this.drawCountdown();
  }

  private drawCountdown() {
    const c = this.ctx;
    c.fillStyle = 'rgba(8,4,15,0.45)';
    c.fillRect(0, 0, VW, VH);
    const go = this.goTimer > 0;
    const n = Math.ceil(this.countdown / 60); // 3,2,1
    const label = go ? 'GO' : String(n);
    // Fixed size — no growth. Only a crisp alpha fade for tick feedback.
    const col = go ? this.zone.accent : '#ffffff';
    const within = go ? this.goTimer / 15 : ((this.countdown - 1) % 60) / 60; // 1 -> 0 across each second
    c.globalAlpha = 0.22 + Math.min(0.78, within * 2.2);
    const sc = go ? 3 : 2;
    drawTextCentered(c, label, VW / 2, VH / 2 - 18, sc, col, '#08040f');
    c.globalAlpha = 1;
    if (!go) drawTextCentered(c, 'GET READY', VW / 2, VH / 2 + 18, 1, '#9d8fd6', '#08040f');
  }

  private drawSky() {
    const c = this.ctx;
    const bh = Math.ceil(VH / 15);
    for (let i = 0; i < 15; i++) {
      c.fillStyle = this.skyBands[i] || '#000';
      c.fillRect(0, i * bh, VW, bh + 1);
    }
    // sun — baked 1px-per-pixel disc + glow, same pixel grid as everything else
    const period = VW + 140;
    const sunX = (((300 - this.camX * 0.04) % period) + period) % period - 70;
    if (this.sunSprite) {
      c.drawImage(this.sunSprite, Math.round(sunX) - 32, 68 - 32);
    }
    // stars
    c.fillStyle = this.zone.star;
    for (let i = 0; i < this.stars.length; i += 4) {
      const sx = this.stars[i];
      const sy = this.stars[i + 1];
      const ph = this.stars[i + 2];
      const sz = this.stars[i + 3];
      const x = ((sx - this.camX * 0.06) % 1400 + 1400) % 1400;
      if (x > VW) continue;
      const tw = Math.sin(this.frame * 0.05 + ph);
      if (tw < -0.4) continue;
      c.globalAlpha = 0.35 + 0.65 * (tw * 0.5 + 0.5);
      // Spread stars across the sky rather than bunching in the top 140px.
      const starY = (sy / 140) * (VH * 0.66);
      c.fillRect(Math.round(x), Math.round(starY), sz, sz);
    }
    c.globalAlpha = 1;
  }

  private getBandTile(
    horizon: number,
    amp: number,
    freq: number,
    sharpness: number,
    seed: number,
    col: string,
  ): HTMLCanvasElement {
    const key = `${horizon}|${amp}|${freq}|${sharpness}|${seed}|${col}`;
    let tile = this.bandCache.get(key);
    if (tile) return tile;

    const W = 512;
    const H = VH + 48;
    tile = document.createElement('canvas');
    tile.width = W;
    tile.height = H;
    const tc = tile.getContext('2d')!;
    tc.fillStyle = col;
    // Hard 1px columns baked once. Scroll will be integer-only.
    for (let x = 0; x < W; x++) {
      const wx = x * freq + seed;
      let h =
        Math.sin(wx) * 0.55 +
        Math.sin(wx * 2.13 + 1.4) * 0.28 +
        Math.sin(wx * 4.7 + 0.6) * 0.17;
      if (sharpness > 0) h = 1 - Math.pow(1 - Math.abs(h), 1 + sharpness);
      const top = Math.round(horizon - amp * (h * 0.5 + 0.5));
      tc.fillRect(x, Math.max(0, top), 1, H - top);
    }
    this.bandCache.set(key, tile);
    return tile;
  }

  private seeBand(
    spd: number,
    horizon: number,
    amp: number,
    freq: number,
    sharpness: number,
    seed: number,
    col: string,
  ) {
    const tile = this.getBandTile(horizon, amp, freq, sharpness, seed, col);
    const tw = tile.width;
    // Integer scroll only — never subpixel.
    let ox = Math.floor(this.camX * spd) % tw;
    if (ox < 0) ox += tw;
    const c = this.ctx;
    // Two blits cover the full viewport as the tile wraps.
    c.drawImage(tile, -ox, 0);
    c.drawImage(tile, -ox + tw, 0);
  }

  private drawParallax() {
    const c = this.ctx;
    const Z = this.zone;

    // soft distant clouds — always subtle, low contrast
    c.globalAlpha = 0.6;
    c.fillStyle = this.cCloud;
    for (let i = 0; i < 4; i++) {
      const cw = 46 + ((i * 37) % 30);
      const x = ((i * 340 + 20 - this.camX * 0.1) % 1500 + 1500) % 1500;
      if (x > VW + 60) continue;
      const y = 36 + ((i * 53) % 54);
      c.fillRect(Math.round(x), y, cw, 4);
      c.fillRect(Math.round(x + 10), y - 3, cw - 26, 3);
    }
    c.globalAlpha = 1;

    // Every biome: a soft far band for depth, then two scattered landmark
    // rows at different depths/scales so the scene never reads as one flat row.
    const bg = Z.bg;
    const back = this.cBack;
    if (bg === 'jungle') {
      this.seeBand(0.12, 128, 30, 0.02, 0.15, 0, Z.far);
      this.drawLandmarks(back, 0.19, 166, 47, 29, Z.decoMid, 0.65);
      this.drawLandmarks(Z.mid, 0.28, 180, 56, 73, Z.decoMid, 1);
    } else if (bg === 'desert') {
      this.seeBand(0.12, 132, 24, 0.014, 0.08, 0, Z.far);
      this.drawLandmarks(back, 0.19, 168, 72, 23, Z.decoMid, 0.65);
      this.drawLandmarks(Z.mid, 0.28, 182, 84, 67, Z.decoMid, 1);
    } else if (bg === 'tundra') {
      this.seeBand(0.11, 126, 30, 0.018, 1.6, 0.5, Z.far);
      this.drawLandmarks(back, 0.18, 168, 53, 41, Z.decoMid, 0.65);
      this.drawLandmarks(Z.mid, 0.28, 182, 58, 59, Z.decoMid, 1);
    } else {
      this.seeBand(0.13, 130, 38, 0.05, 0.2, 0.9, Z.far);
      this.drawLandmarks(back, 0.18, 166, 55, 19, Z.decoFar, 0.7);
      this.drawLandmarks(Z.mid, 0.28, 180, 62, 37, Z.decoFar, 1);
    }
  }

  // Grounded landmark silhouettes — trees / cacti / icebergs / buildings share
  // one calm treeline base so nothing floats and everything reads as a set.
  private drawLandmarks(
    col: string,
    spd: number,
    baseY: number,
    spacing: number,
    seedStep: number,
    tipCol: string,
    scale = 1,
  ) {
    const c = this.ctx;
    const bg = this.zone.bg;

    // Flat grounded strip under landmarks — integer-scrolled, no live sampling.
    // Landmarks sit on a fixed baseY so they never swim relative to the ground.
    c.fillStyle = col;
    c.fillRect(0, Math.round(baseY), VW, VH + 40 - Math.round(baseY));

    const cam = Math.floor(this.camX * spd);
    const period = VW + spacing * 2;
    for (let i = 0; i < 10; i++) {
      const seed = i * seedStep;
      // uneven spacing so they never march in a rigid line
      const jitter = Math.floor((hash(seed + 11) - 0.5) * spacing * 0.85);
      const raw = i * spacing + jitter - cam;
      const nx = Math.floor(((raw % period) + period) % period - spacing);
      // skip landmarks too close to viewport edges so they don't pop in/out
      if (nx < -20 || nx > VW + 20) continue;
      const roll = hash(seed);
      // Planted on the solid strip
      const ground = Math.round(baseY) + 2;
      if (bg === 'jungle') {
        // tree family: broad canopy / tall palm / twin trunk
        const h = Math.round((22 + Math.floor(hash(seed + 3) * 20)) * scale);
        if (roll < 0.4) {
          const cw = 26 + hash(seed + 4) * 22;
          c.fillRect(Math.round(nx - 2), ground - h + 4, 5, h - 2);
          c.fillRect(Math.round(nx - cw / 2), ground - h, cw, 9);
          c.fillRect(Math.round(nx - cw * 0.3), ground - h - 6, cw * 0.6, 6);
        } else if (roll < 0.7) {
          c.fillRect(Math.round(nx), ground - h, 4, h);
          c.fillRect(Math.round(nx - 13), ground - h - 2, 13, 3);
          c.fillRect(Math.round(nx + 3), ground - h - 3, 14, 3);
          c.fillRect(Math.round(nx - 7), ground - h - 6, 9, 3);
          c.fillRect(Math.round(nx + 2), ground - h - 7, 7, 3);
        } else {
          c.fillRect(Math.round(nx - 8), ground - h + 5, 4, h - 5);
          c.fillRect(Math.round(nx + 4), ground - h - 2, 4, h);
          c.fillRect(Math.round(nx - 14), ground - h + 1, 12, 6);
          c.fillRect(Math.round(nx + 2), ground - h - 5, 12, 6);
        }
      } else if (bg === 'desert') {
        // cactus family: saguaro / barrel / ocotillo
        if (roll < 0.45) {
          const h = Math.round((16 + Math.floor(hash(seed + 3) * 16)) * scale);
          c.fillRect(Math.round(nx), ground - h, 4, h);
          c.fillRect(Math.round(nx - 5), ground - h + 7, 5, 3);
          c.fillRect(Math.round(nx - 5), ground - h + 3, 3, 6);
          c.fillRect(Math.round(nx + 4), ground - h + 10, 5, 3);
          c.fillRect(Math.round(nx + 6), ground - h + 5, 3, 7);
        } else if (roll < 0.75) {
          const h2 = Math.round((9 + Math.floor(hash(seed + 3) * 8)) * scale);
          c.fillRect(Math.round(nx - 5), ground - h2, 11, h2);
          c.fillRect(Math.round(nx - 3), ground - h2 - 3, 7, 3);
        } else {
          const h3 = Math.round((12 + Math.floor(hash(seed + 3) * 12)) * scale);
          c.fillRect(Math.round(nx), ground - h3, 2, h3);
          c.fillRect(Math.round(nx - 6), ground - 9, 6, 3);
          c.fillRect(Math.round(nx + 2), ground - 11, 7, 3);
          c.fillRect(Math.round(nx - 4), ground - h3 + 3, 2, 8);
        }
      } else if (bg === 'tundra') {
        // pine forest (tundra firs) & snowy mountain shards (properly wide at base, narrow at top)
        if (roll < 0.55) {
          // snowy fir tree: trunk + 3 stacked triangles (widening towards the bottom)
          const h = Math.round((24 + Math.floor(hash(seed + 3) * 16)) * scale);
          const top = ground - h;
          // trunk
          c.fillRect(Math.round(nx - 1), top, 3, h);
          // top tier
          c.fillRect(Math.round(nx - 4), top + 3, 9, 3);
          c.fillRect(Math.round(nx - 2), top, 5, 3);
          // mid tier
          c.fillRect(Math.round(nx - 8), top + 9, 17, 4);
          c.fillRect(Math.round(nx - 5), top + 6, 11, 3);
          // bottom tier
          c.fillRect(Math.round(nx - 12), top + 17, 25, 5);
          c.fillRect(Math.round(nx - 9), top + 13, 19, 4);
          // snowy branch tips
          c.fillStyle = tipCol;
          c.fillRect(Math.round(nx - 1), top, 3, 1);
          c.fillRect(Math.round(nx - 3), top + 3, 2, 1);
          c.fillRect(Math.round(nx + 2), top + 3, 2, 1);
          c.fillRect(Math.round(nx - 7), top + 9, 3, 1);
          c.fillRect(Math.round(nx + 4), top + 9, 3, 1);
          c.fillRect(Math.round(nx - 11), top + 17, 4, 1);
          c.fillRect(Math.round(nx + 7), top + 17, 4, 1);
          c.fillStyle = col;
        } else {
          // snowy glacial peak mountain shard (wide base, narrow peak)
          const h = Math.round((20 + Math.floor(hash(seed + 3) * 24)) * scale);
          const w = Math.round((28 + Math.floor(hash(seed + 4) * 20)) * scale);
          // draw a pointed peak mountain using vertical rectangles
          const halfW = w / 2;
          for (let colOffset = -Math.floor(halfW); colOffset <= Math.floor(halfW); colOffset++) {
            const ratio = 1 - Math.abs(colOffset) / halfW;
            const colH = Math.round(h * ratio);
            if (colH > 0) {
              c.fillRect(Math.round(nx + colOffset), ground - colH, 1, colH + 2);
            }
          }
          // snow cap peak
          c.fillStyle = tipCol;
          c.fillRect(Math.round(nx - 2), ground - h, 5, 2);
          c.fillRect(Math.round(nx - 4), ground - h + 2, 9, 2);
          c.fillStyle = col;
        }
      } else {
        // city family: antenna slab / twin towers / stepped block
        const h = Math.round((24 + Math.floor(hash(seed + 3) * 34)) * scale);
        const bw = Math.round((16 + Math.floor(hash(seed + 4) * 20)) * scale);
        const top = ground - h;
        if (roll < 0.35) {
          c.fillRect(Math.round(nx), top, bw, h);
          c.fillRect(Math.round(nx + bw * 0.45), top - 12, 3, 12);
          c.fillStyle = tipCol;
          c.fillRect(Math.round(nx + bw * 0.45) - 1, top - 15, 5, 3);
          c.fillStyle = col;
        } else if (roll < 0.7) {
          const tw = Math.max(6, Math.floor(bw * 0.4));
          c.fillRect(Math.round(nx), top + 10, tw, h);
          c.fillRect(Math.round(nx + bw - tw), top, tw, h + 10);
          c.fillRect(Math.round(nx + tw), top + 22, bw - tw * 2, 5);
        } else {
          c.fillRect(Math.round(nx), top + 14, bw, h);
          c.fillRect(Math.round(nx + 4), top + 7, bw - 8, 8);
          c.fillRect(Math.round(nx + 8), top, Math.max(6, bw - 16), 7);
        }
        // windows drawn on THIS building's footprint, so they always line up
        c.fillStyle = tipCol;
        for (let wy = top + 10; wy < ground - 4; wy += 9) {
          for (let wx = 4; wx < bw - 4; wx += 7) {
            if (hash(seed + wy * 0.7 + wx) > 0.55) {
              c.globalAlpha = 0.35 + hash(seed + wx + wy) * 0.35;
              c.fillRect(Math.round(nx + wx), Math.round(wy), 2, 2);
            }
          }
        }
        c.globalAlpha = 1;
        c.fillStyle = col;
      }
    }
  }

  // Every platform's artwork is deterministic (keyed by p.seed) and never
  // changes after it's generated, so we paint it once into an offscreen
  // canvas and blit that with a single drawImage() every frame instead of
  // redoing dozens of fillRect/hash() calls per platform per frame.
  private getPlatformCache(p: Platform): HTMLCanvasElement {
    if (p.cache && p.cacheEpoch === this.platformEpoch) return p.cache;
    const w = Math.max(1, Math.round(p.w) + 1);
    const pad = PLATFORM_CACHE_PAD;
    // Use the full depth so the sides reach the screen bottom with no gap.
    // GROUND_BOTTOM is VH+70, and p.y is typically 98-MAX_PLATFORM_Y, so this is at
    // most ~297px — fine for an offscreen canvas.
    const h = p.float ? 18 : Math.max(8, GROUND_BOTTOM - Math.round(p.y));
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h + pad;
    const c = cv.getContext('2d')!;
    const x = 0;
    const y = pad;
    const Z = this.zone;
    const bg = Z.bg;

    if (p.float) {
      c.fillStyle = Z.groundDark;
      c.fillRect(x, y + 3, w, 6);
      if (bg === 'desert') {
        // sandy shelf — no green accent lip
        c.fillStyle = shade(Z.ground, 0.12);
        c.fillRect(x, y + 1, w, 2);
        c.fillStyle = Z.ground;
        c.fillRect(x, y, w, 2);
        c.fillRect(x + 2, y + 4, w - 4, 5);
        c.fillStyle = Z.groundDark;
        c.fillRect(x + 6, y + 9, w - 12, 3);
        c.fillRect(x + 12, y + 12, Math.max(4, w - 24), 2);
      } else {
        c.fillStyle = Z.accent2;
        c.fillRect(x, y + 2, w, 2);
        c.fillStyle = Z.accent;
        c.fillRect(x, y, w, 2);
      }
      if (bg === 'jungle') {
        c.fillStyle = Z.ground;
        c.fillRect(x + 2, y + 4, w - 4, 4);
        c.fillStyle = Z.deco;
        c.fillRect(x + 2, y + 7, w - 4, 3);
        c.fillRect(x + Math.max(3, w / 4), y + 10, 2, 4);
        c.fillRect(x + Math.max(4, w - 4 - w / 4), y + 10, 2, 3);
      } else if (bg === 'tundra') {
        c.fillStyle = Z.deco;
        c.fillRect(x + 1, y + 2, w - 2, 4);
        c.fillStyle = Z.ground;
        c.fillRect(x + 2, y + 5, w - 4, 6);
        c.fillStyle = Z.groundDark;
        c.fillRect(x + 3, y + 9, w - 6, 3);
        c.fillStyle = this.cBolt;
        c.fillRect(x + 3, y + 12, Math.max(3, w * 0.28), 2);
        c.fillRect(x + Math.max(4, w - 4 - w * 0.28), y + 12, Math.max(3, w * 0.28), 2);
      } else {
        c.fillStyle = this.cBolt;
        c.fillRect(x + 2, y + 4, w - 4, 4);
        const legx1 = x + Math.max(3, Math.round(w * 0.22));
        const legx2 = x + Math.max(4, w - 3 - Math.round(w * 0.22));
        c.fillStyle = Z.groundDark;
        c.fillRect(legx1, y + 8, 3, 5);
        c.fillRect(legx2, y + 8, 3, 5);
        for (let i = 3; i < w - 2; i += 7) c.fillRect(x + i, y + 8, 1, 1);
      }
    } else {
      // ---- body: layered strata that get darker with depth
      c.fillStyle = Z.ground;
      c.fillRect(x, y + 4, w, h);
      c.fillStyle = this.cStrata1;
      c.fillRect(x, y + 16, w, h - 16);
      c.fillStyle = Z.groundDark;
      c.fillRect(x, y + 34, w, h - 34);
      c.fillStyle = this.cStrata2;
      c.fillRect(x, y + 62, w, h - 62);

      // ---- right cliff edge: 1px dark gradient
      for (let gy = y + 6; gy < y + h; gy++) {
        const ratio = Math.min(1, (gy - (y + 6)) / 40);
        c.globalAlpha = ratio * 0.45;
        c.fillStyle = '#0a0612';
        c.fillRect(x + w - 1, gy, 1, 1);
      }
      c.globalAlpha = 1;

      // ---- chunky rock blocks embedded in the strata (deterministic)
      const rockA = this.cRockA;
      const rockB = this.cRockB;
      const rockLit = this.cRockLit;
      const blocks = Math.min(14, Math.max(2, Math.floor(w / 22)));
      for (let i = 0; i < blocks; i++) {
        const hx = hash(p.seed + i * 3.7);
        const hy = hash(p.seed + i * 9.1);
        const hs = hash(p.seed + i * 5.5);
        const bx = x + 3 + Math.floor(hx * (w - 12));
        const by = y + 20 + Math.floor(hy * 52);
        const bw2 = 5 + Math.floor(hs * 9);
        const bh2 = 4 + Math.floor(hash(p.seed + i * 2.3) * 5);
        c.fillStyle = hy > 0.5 ? rockA : rockB;
        c.fillRect(bx, by, bw2, bh2);
        c.fillStyle = rockLit;
        c.fillRect(bx, by, bw2, 1);
      }

      // ---- surface cap: uneven, per-column height so the top isn't a ruler
      const capTop = bg === 'desert' ? shade(Z.ground, 0.22) : Z.accent;
      const capUnder = bg === 'desert' ? shade(Z.ground, 0.05) : Z.accent2;
      for (let sx = 0; sx < w; sx += 2) {
        const n = hash(p.seed * 0.7 + sx * 0.21);
        const bump = n > 0.72 ? 1 : 0;
        const capY = y - bump;
        c.fillStyle = capUnder;
        c.fillRect(x + sx, capY + 2, 2, 4);
        c.fillStyle = capTop;
        c.fillRect(x + sx, capY, 2, 2);
      }

      // ---- biome surface dressing
      if (bg === 'jungle') {
        c.fillStyle = Z.deco;
        for (let i = 0; i * 22 < w - 6; i++) {
          const hx = hash(p.seed + i * 7.7);
          if (hx < 0.4) continue;
          const gx = x + 4 + i * 22 + Math.floor(hx * 6);
          c.fillRect(gx, y - 2, 2, 2);
        }
      } else if (bg === 'desert') {
        // clean sand top — no green accent line
      } else if (bg === 'tundra') {
        c.fillStyle = '#ffffff';
        c.fillRect(x + 1, y - 2, w - 2, 2);
        c.fillStyle = Z.deco;
        c.fillRect(x + 2, y - 1, w - 4, 1);
      } else {
        c.fillStyle = this.cRivet;
        for (let i = 0; i * 18 < w - 8; i++) c.fillRect(x + 6 + i * 18, y + 7, 2, 2);
      }
    }

    p.cache = cv;
    p.cacheEpoch = this.platformEpoch;
    return cv;
  }

  private drawWorld() {
    const c = this.ctx;
    const cam = Math.round(this.camX);

    /* platforms — one drawImage() per platform, artwork pre-baked */
    for (const p of this.platforms) {
      const x = Math.floor(p.x - cam);
      if (x > VW + 4 || x + p.w < -4) continue;
      const y = Math.round(p.y);
      const cache = this.getPlatformCache(p);
      c.drawImage(cache, x, y - PLATFORM_CACHE_PAD);
    }

    /* springs */
    for (const s of this.springs) {
      const x = Math.round(s.x - cam);
      if (x > VW || x < -20) continue;
      const press = s.press > 0 ? 4 : 0;
      const baseY = Math.round(s.y);
      const y = baseY + press;
      const groundY = baseY + 9;
      if (s.mega) {
        // mega pad — big, golden, glowing
        c.fillStyle = '#3a2010';
        c.fillRect(x + 1, baseY + 6, 16, Math.max(1, groundY - (baseY + 6)));
        c.fillStyle = '#ffb03e';
        c.fillRect(x, y, 18, 5);
        c.fillStyle = '#ffe9a0';
        c.fillRect(x + 2, y + 1, 14, 1);
        c.globalAlpha = 0.3 + 0.25 * Math.sin(this.frame * 0.18);
        c.fillStyle = '#ffd166';
        c.fillRect(x - 2, y - 4, 22, 3);
        c.fillRect(x - 2, Math.min(groundY - 2, y + 5), 22, 2);
        c.globalAlpha = 1;
      } else {
        c.fillStyle = '#5b2f6e';
        c.fillRect(x + 1, baseY + 5, 12, Math.max(1, groundY - (baseY + 5)));
        c.fillStyle = '#ff4d6d';
        c.fillRect(x, y, 14, 4);
        c.fillStyle = '#ffd166';
        c.fillRect(x + 2, y + 1, 10, 1);
      }
    }

    /* spikes — sharp metal blades, grounded directly on the platform */
    for (const s of this.spikes) {
      const x0 = Math.round(s.x - cam);
      if (x0 > VW || x0 + s.n * 8 < 0) continue;
      for (let i = 0; i < s.n; i++) {
        const x = x0 + i * 8;
        const y = Math.round(s.y);
        // sharp triangular blade — wide at the base, single pixel tip
        c.fillStyle = '#8a8fa8';
        c.fillRect(x, y + 7, 8, 3);
        c.fillRect(x + 1, y + 5, 6, 2);
        c.fillRect(x + 2, y + 3, 4, 2);
        c.fillRect(x + 3, y + 1, 2, 2);
        c.fillRect(x + 3, y, 1, 1);
        // bright polished highlight down the centre
        c.fillStyle = '#e8ecff';
        c.fillRect(x + 3, y + 1, 1, 6);
        // hard shadow on the right side
        c.fillStyle = '#3a3d55';
        c.fillRect(x + 5, y + 3, 1, 4);
        c.fillRect(x + 6, y + 5, 1, 4);
      }
    }

    /* pickups */
    for (const k of this.pickups) {
      if (k.dead) continue;
      const x = Math.round(k.x - cam);
      if (x > VW + 10 || x < -10) continue;
      const bob = Math.sin(k.t * 0.9) * 1.6;
      const y = Math.round(k.y + bob);
      if (k.gem) {
        const pulse = (Math.sin(k.t * 1.6) + 1) * 0.5;
        c.globalAlpha = 0.25 + pulse * 0.25;
        c.fillStyle = '#7ef7ff';
        c.fillRect(x - 7, y - 7, 14, 14);
        c.globalAlpha = 1;
        c.fillStyle = '#3ef2c8';
        c.fillRect(x - 1, y - 5, 2, 10);
        c.fillRect(x - 3, y - 4, 6, 8);
        c.fillRect(x - 4, y - 2, 8, 4);
        c.fillStyle = '#ffffff';
        c.fillRect(x - 2, y - 3, 2, 2);
      } else {
        const Z = this.zone;
        const f = Math.floor(k.t * 1.1) % 4;
        const hw = COIN_HW[f];
        if (Z.bg === 'tundra') {
          // snowflake shard coin
          c.fillStyle = Z.coinEdge;
          c.fillRect(x - 4, y - 3, 8, 7);
          c.fillStyle = Z.coinFill;
          c.fillRect(x - 3, y - 2, 6, 5);
          c.fillStyle = Z.coinShine;
          c.fillRect(x - 1, y - 1, 2, 2);
          c.fillRect(x - 1, y - 5, 2, 2);
          c.fillRect(x - 5, y - 1, 2, 2);
          c.fillRect(x + 3, y - 1, 2, 2);
        } else if (Z.bg === 'desert') {
          // sun coin with rays
          c.fillStyle = Z.coinEdge;
          c.fillRect(x - hw, y - 3, hw * 2, 7);
          c.fillStyle = Z.coinFill;
          c.fillRect(x - hw, y - 3, hw * 2, 6);
          c.fillStyle = Z.coinShine;
          c.fillRect(x - hw + (f === 2 ? 0 : 1), y - 2, 1, 3);
          c.fillRect(x - 5, y - 4, 2, 2);
          c.fillRect(x + 3, y - 4, 2, 2);
          c.fillRect(x - 5, y + 2, 2, 2);
          c.fillRect(x + 3, y + 2, 2, 2);
        } else if (Z.bg === 'jungle') {
          // fruit coin — round with stem
          c.fillStyle = Z.coinEdge;
          c.fillRect(x - 3, y - 3, 6, 1);
          c.fillRect(x - 4, y - 2, 8, 5);
          c.fillRect(x - 3, y + 3, 6, 1);
          c.fillStyle = Z.coinFill;
          c.fillRect(x - 3, y - 2, 6, 4);
          c.fillStyle = Z.coinShine;
          c.fillRect(x - 2, y - 1, 2, 2);
          c.fillStyle = Z.accent2;
          c.fillRect(x, y - 5, 1, 2);
          c.fillRect(x + 1, y - 5, 2, 1);
        } else {
          // neon chip
          c.fillStyle = Z.coinEdge;
          c.fillRect(x - hw, y - 3, hw * 2, 7);
          c.fillStyle = Z.coinFill;
          c.fillRect(x - hw, y - 3, hw * 2, 6);
          c.fillStyle = Z.coinShine;
          c.fillRect(x - hw + (f === 2 ? 0 : 1), y - 2, 1, 3);
        }
      }
    }

    /* power-ups */
    for (const power of this.powerups) {
      if (power.dead) continue;
      const x = Math.round(power.x - cam);
      if (x > VW + 14 || x < -14) continue;
      const y = Math.round(power.y + Math.sin(power.t) * 2);
      const col = POWERUP_COLORS[power.kind];
      const pulse = 0.28 + (Math.sin(power.t * 1.7) + 1) * 0.1;
      c.globalAlpha = pulse;
      c.fillStyle = col;
      c.fillRect(x - 9, y - 9, 18, 18);
      c.globalAlpha = 1;
      c.drawImage(this.powerupSprite(power.kind), x - 9, y - 9);
    }

    /* enemies */
    const Z = this.zone;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const x = Math.round(e.x - cam);
      if (x > VW + 20 || x < -20) continue;
      const y = Math.round(e.y);
      const hurt = e.hurt > 0;

      if (e.kind === 'flyer') {
        // biome flyer (wasp / vulture / ice drone / neon drone)
        c.fillStyle = '#14101f';
        c.fillRect(x + 1, y + 3, 18, 8);
        c.fillStyle = hurt ? '#ffffff' : Z.flyerBody;
        c.fillRect(x, y + 2, 20, 8);
        // stripes
        c.fillStyle = Z.slimeDark;
        c.fillRect(x + 4, y + 2, 3, 8);
        c.fillRect(x + 12, y + 2, 3, 8);
        c.fillStyle = Z.flyerLight;
        c.fillRect(x + 1, y + 3, 18, 2);
        // blinking lens
        c.fillStyle = Math.sin(e.t * 3.5) > 0 ? '#ff4d6d' : '#ffd166';
        c.fillRect(x + 15, y + 5, 3, 3);
        c.fillStyle = '#ffffff';
        c.fillRect(x + 16, y + 6, 1, 1);
        // rotor
        c.fillStyle = '#c8cbe8';
        const rot = Math.sin(e.t * 8) * 8;
        c.fillRect(Math.round(x + 10 - 9 + rot * 0.25), y, 18, 2);
        c.fillStyle = '#8e91af';
        c.fillRect(x + 9, y + 2, 2, 2);
        // thrust
        c.fillStyle = Z.accent;
        c.globalAlpha = 0.5 + 0.4 * Math.sin(e.t * 5);
        c.fillRect(x + 6, y + 10, 8, 2);
        c.globalAlpha = 1;
      } else if (e.kind === 'hopper') {
        // jungle frog
        const air = e.vy < 0;
        const yy = air ? y - 2 : y;
        c.fillStyle = Z.slimeDark;
        c.fillRect(x + 1, yy + 11, 12, 3);
        c.fillStyle = hurt ? '#ffffff' : Z.slimeBody;
        c.fillRect(x, yy + 2, 14, 11);
        c.fillStyle = Z.slimeLight;
        c.fillRect(x + 3, yy + 8, 8, 4);
        c.fillStyle = Z.slimeDark;
        c.fillRect(x + 2, yy + 5, 2, 4);
        c.fillRect(x + 10, yy + 5, 2, 4);
        // eyes on top
        const eo = e.vx > 0 ? 1 : 0;
        c.fillStyle = '#ffffff';
        c.fillRect(x + 1 + eo, yy - 1, 4, 4);
        c.fillRect(x + 9 + eo, yy - 1, 4, 4);
        c.fillStyle = '#1a0a2a';
        c.fillRect(x + 3 + eo, yy + 1, 2, 2);
        c.fillRect(x + 11 + eo, yy + 1, 2, 2);
      } else if (e.kind === 'scarab') {
        // desert scarab — fast, low
        const front = e.vx > 0 ? x + 22 : x - 2;
        c.fillStyle = Z.slimeDark;
        c.fillRect(x + 1, y + 3, 20, 6);
        c.fillStyle = hurt ? '#ffffff' : Z.slimeBody;
        c.fillRect(x, y + 2, 22, 5);
        c.fillStyle = Z.slimeLight;
        c.fillRect(x + 2, y + 3, 18, 1);
        // legs
        c.fillStyle = Z.slimeDark;
        c.fillRect(x + 3, y + 7, 2, 3);
        c.fillRect(x + 9, y + 7, 2, 3);
        c.fillRect(x + 15, y + 7, 2, 3);
        // head + eyes
        c.fillStyle = Z.slimeDark;
        c.fillRect(front, y + 4, 5, 4);
        c.fillStyle = '#ffffff';
        c.fillRect(front + 1, y + 5, 2, 2);
        c.fillStyle = '#1a0a2a';
        c.fillRect(front + 1, y + 5, 1, 1);
      } else if (e.kind === 'spiker') {
        // rooted hazard: cactus / ice crystal — shatter only by slam
        c.fillStyle = Z.spikerDark;
        c.fillRect(x - 1, y + 15, 14, 5);
        c.fillStyle = hurt ? '#ffffff' : Z.spikerBody;
        c.fillRect(x, y + 4, 12, 14);
        c.fillStyle = Z.spikerLight;
        c.fillRect(x + 2, y + 5, 3, 11);
        // arms / shards
        c.fillStyle = Z.spikerDark;
        c.fillRect(x - 3, y + 9, 3, 5);
        c.fillRect(x + 12, y + 9, 3, 5);
        c.fillStyle = Z.spikerBody;
        c.fillRect(x - 2, y + 9, 2, 4);
        c.fillRect(x + 12, y + 9, 2, 4);
        // tips
        c.fillStyle = Z.spikerLight;
        c.fillRect(x + 2, y + 1, 2, 3);
        c.fillRect(x + 6, y, 2, 4);
        c.fillRect(x + 9, y + 2, 2, 2);
      } else {
        // slime (biome tinted)
        const sq = Math.sin(e.t * 2.4) * 2.0;
        const h = Math.round(14 - sq * 0.7);
        const w = Math.round(18 + sq * 0.8);
        const yy = y + (14 - h);
        c.fillStyle = Z.slimeDark;
        c.fillRect(x, yy + 2, w, h - 2);
        c.fillStyle = hurt ? '#ffffff' : Z.slimeBody;
        c.fillRect(x, yy, w, h - 1);
        c.fillStyle = Z.slimeLight;
        c.fillRect(x + 1, yy + 1, w - 2, 3);
        c.fillStyle = '#ffffff';
        const eo = e.vx > 0 ? 2 : 0;
        c.fillRect(x + 4 + eo, yy + 4, 3, 4);
        c.fillRect(x + 10 + eo, yy + 4, 3, 4);
        c.fillStyle = '#1a0a2a';
        c.fillRect(x + 5 + eo, yy + 5, 2, 2);
        c.fillRect(x + 11 + eo, yy + 5, 2, 2);
      }
    }
  }

  private drawPowerUpEffects(c: CanvasRenderingContext2D, cx: number, cy: number) {
    if (this.shielded) {
      c.globalAlpha = 0.12;
      c.fillStyle = '#7ef7ff';
      c.fillRect(cx - 7, cy - 7, 14, 14);
      c.globalAlpha = 0.62 + 0.12 * Math.sin(this.frame * 0.16);
      c.fillRect(cx - 6, cy - 9, 12, 1);
      c.fillRect(cx - 6, cy + 8, 12, 1);
      c.fillRect(cx - 9, cy - 6, 1, 12);
      c.fillRect(cx + 8, cy - 6, 1, 12);
      c.fillRect(cx - 8, cy - 8, 2, 2);
      c.fillRect(cx + 6, cy - 8, 2, 2);
      c.fillRect(cx - 8, cy + 6, 2, 2);
      c.fillRect(cx + 6, cy + 6, 2, 2);
      c.globalAlpha = 1;
    }
    if (this.tripleJump > 0) {
      c.fillStyle = '#c98cff';
      c.fillRect(cx - 5, cy - 11, 2, 2);
      c.fillRect(cx - 1, cy - 13, 2, 2);
      c.fillRect(cx + 3, cy - 11, 2, 2);
    }
    if (this.propellerHat > 0 || this.propellerFlashing) {
      const flash = this.propellerFlashing && Math.sin(this.frame * 0.75) > 0;
      c.fillStyle = flash ? '#ffffff' : '#b32a4d';
      c.fillRect(cx - 4, cy - 10, 8, 2);
      c.fillRect(cx - 2, cy - 12, 4, 2);
      c.fillStyle = flash ? '#ffffff' : '#7ef7ff';
      c.fillRect(cx - 8, cy - 15, 7, 2);
      c.fillRect(cx + 1, cy - 15, 7, 2);
      c.fillRect(cx - 1, cy - 19, 2, 4);
      c.fillStyle = '#ffffff';
      c.fillRect(cx - 1, cy - 15, 2, 2);
    }
  }

  private drawPlayer() {
    const c = this.ctx;
    const cam = Math.round(this.camX);

    /* landing shadow — helps judge jumps */
    const foot = this.py + PLAYER_H;
    const mid = this.px + PLAYER_W / 2;
    let land = Infinity;
    for (const p of this.platforms) {
      if (mid < p.x - 1 || mid > p.x + p.w + 1) continue;
      if (p.y >= foot - 2 && p.y < land) land = p.y;
    }
    if (land < Infinity && land - foot > 5) {
      const k = clamp(1 - (land - foot) / 130, 0.12, 1);
      const sw = Math.round(4 + 7 * k);
      c.globalAlpha = 0.1 + 0.28 * k;
      c.fillStyle = '#000000';
      c.fillRect(Math.round(mid - cam - sw / 2), Math.round(land), sw, 2);
      c.globalAlpha = 1;
    }

    /* ghosts */
    for (const g of this.ghosts) {
      c.globalAlpha = (g.life / 14) * 0.28;
      c.fillStyle = '#7ef7ff';
      c.fillRect(Math.round(g.x - cam), Math.round(g.y), PLAYER_W, PLAYER_H);
    }
    c.globalAlpha = 1;

    /* player body */
    const cx = Math.round(this.px - cam + PLAYER_W / 2);
    const cy = Math.round(this.py + PLAYER_H / 2);
    const qx = Math.abs(this.sx - 1) < 0.05 ? 1 : this.sx;
    const qy = Math.abs(this.sy - 1) < 0.05 ? 1 : this.sy;
    c.save();
    c.translate(cx, cy);
    if (this.spin > 0) c.rotate(this.spin * Math.PI * 2);
    if (qx !== 1 || qy !== 1) c.scale(qx, qy);
    const run = this.onGround ? Math.floor(this.animT) % 4 : -1;
    const air = !this.onGround;
    const f = (x: number, y: number, w: number, h: number, col: string) => {
      c.fillStyle = col;
      c.fillRect(x - PLAYER_W / 2, y - PLAYER_H / 2, w, h);
    };
    const flashing = this.invuln > 0;
    const flash = flashing ? 0.35 + (Math.sin(this.frame * 0.75) + 1) * 0.325 : 0;
    const tint = (base: string, extra?: string) => {
      if (!flashing) return extra ?? base;
      return mix(extra ?? base, '#ffffff', flash);
    };
    const SUIT = tint(PLAYER_SUIT);
    const SUIT_D = tint(PLAYER_SUIT_D);
    const SKIN = tint(PLAYER_SKIN);
    const BOOT = tint(PLAYER_BOOT, this.jumpShoes > 0 ? PLAYER_BOOT_SHOES : PLAYER_BOOT);

    // legs
    if (this.diving) {
      f(1, 10, 4, 4, BOOT);
      f(5, 9, 5, 3, BOOT);
    } else if (air) {
      f(2, 10, 3, 4, BOOT);
      f(6, 9, 3, 4, BOOT);
    } else {
      const legs = PLAYER_RUN_LEGS[run];
      f(legs[0], legs[1], legs[2], legs[3], BOOT);
      f(legs[4], legs[5], legs[6], legs[7], BOOT);
    }
    // body
    f(2, 5, 7, 6, SUIT);
    f(2, 9, 7, 2, SUIT_D);
    // arm
    if (air) {
      f(6, 3, 2, 3, SUIT_D);
      f(8, 3, 2, 2, SKIN);
    } else {
      const armX = [5, 6, 7, 6][run];
      f(armX, 6, 2, 3, SUIT_D);
      f(armX + 2, 6, 2, 2, SKIN);
    }
    // head
    f(2, 0, 7, 6, SUIT);
    f(5, 2, 4, 4, SKIN);
    f(2, 0, 8, 2, SUIT_D);
    // eye
    f(7, 3, 1, 2, '#20122e');
    // scarf knot
    f(1, 5, 3, 2, tint(PLAYER_SCARF));
    c.restore();
    this.drawPowerUpEffects(c, cx, cy);

    /* off-screen indicator */
    if (this.py + PLAYER_H < 4) {
      const ix = Math.round(this.px - cam + PLAYER_W / 2);
      c.fillStyle = '#ffffff';
      c.fillRect(ix - 3, 4, 7, 2);
      c.fillRect(ix - 2, 2, 5, 2);
      c.fillRect(ix - 1, 0, 3, 2);
    }
  }

  private drawParticles() {
    const c = this.ctx;
    const cam = Math.round(this.camX);
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      if (p.life <= 0) continue;
      const a = p.life / p.max;
      c.globalAlpha = a > 0.55 ? 1 : a / 0.55;
      c.fillStyle = p.col;
      const s = a < 0.35 ? 1 : p.size;
      c.fillRect(Math.round(p.x - cam), Math.round(p.y), s, s);
    }
    c.globalAlpha = 1;
  }

  private drawTexts() {
    const c = this.ctx;
    const cam = Math.round(this.camX);
    for (const t of this.texts) {
      const a = t.life / t.max;
      c.globalAlpha = a > 0.4 ? 1 : a / 0.4;
      const pop = t.life > t.max - 6;
      const img = pop ? t.spritePop : t.sprite;
      const tx = Math.round(t.x - cam);
      const tw = textWidth(t.text, pop ? t.scale + 1 : t.scale);
      c.drawImage(img, Math.round(tx - tw / 2) - 2, Math.round(t.y) - 2);
      c.globalAlpha = 1;
    }
  }

  private drawBiomeEvent() {
    if (this.eventTimer <= 0 || this.eventMax <= 0) return;
    const c = this.ctx;
    const fade = Math.min(1, (this.eventMax - this.eventTimer) / 24, this.eventTimer / 24);
    const strength = 0.25 + 0.75 * Math.max(0, fade);
    const alpha = 0.2 * strength;
    const Z = this.zone;

    if (this.eventKind === 'desert') {
      c.globalAlpha = 0.1 * strength;
      c.fillStyle = Z.sunB;
      c.fillRect(0, 0, VW, VH);
    } else if (this.eventKind === 'tundra') {
      c.globalAlpha = 0.13 * strength;
      c.fillStyle = '#dff6ff';
      c.fillRect(0, 0, VW, VH);
    }

    if (this.eventKind === 'jungle') {
      for (let i = 0; i < 22; i++) {
        const x = wrap(hash(this.eventSeed + i * 7.1) * (VW + 30) + this.frame * (0.45 + (i % 3) * 0.12), VW + 30) - 15;
        const y = 24 + hash(this.eventSeed + i * 13.7) * Math.max(80, VH * 0.7);
        c.globalAlpha = alpha * (0.65 + 0.35 * Math.sin(this.frame * 0.08 + i));
        c.fillStyle = i % 3 === 0 ? Z.accent : Z.deco;
        c.fillRect(Math.round(x), Math.round(y), i % 4 === 0 ? 3 : 2, 1);
        if (i % 5 === 0) c.fillRect(Math.round(x + 1), Math.round(y + 1), 1, 2);
      }
    } else if (this.eventKind === 'desert') {
      for (let i = 0; i < 20; i++) {
        const x = wrap(this.frame * (1.4 + i * 0.08) + this.eventSeed + i * 31, VW + 64) - 32;
        const y = 24 + hash(this.eventSeed + i * 9.3) * Math.max(90, VH - 48);
        const len = 10 + Math.round(hash(this.eventSeed + i * 5.2) * 24);
        c.globalAlpha = alpha * 0.9;
        c.fillStyle = i % 2 ? Z.coinFill : Z.deco;
        c.fillRect(Math.round(x), Math.round(y), len, 1);
        if (i % 4 === 0) c.fillRect(Math.round(x + len * 0.35), Math.round(y + 1), 6, 1);
      }
    } else if (this.eventKind === 'tundra') {
      for (let i = 0; i < 60; i++) {
        const x = wrap(hash(this.eventSeed + i * 4.2) * VW - this.frame * (0.5 + (i % 4) * 0.12), VW);
        const y = wrap(hash(this.eventSeed + i * 11.6) * (VH + 30) + this.frame * (1.1 + (i % 3) * 0.22), VH + 30) - 15;
        c.globalAlpha = Math.min(0.62, alpha * (1.45 + (i % 3) * 0.15));
        c.fillStyle = i % 4 === 0 ? '#ffffff' : Z.accent;
        c.fillRect(Math.round(x), Math.round(y), i % 5 === 0 ? 2 : 1, i % 4 === 0 ? 3 : 2);
      }
    }
    c.globalAlpha = 1;
  }

  private drawForeground() {
    const c = this.ctx;
    // dust motes
    c.fillStyle = '#ffffff';
    for (let i = 0; i < this.motes.length; i += 4) {
      const spd = this.motes[i + 2];
      const x = ((this.motes[i] - this.camX * spd * 0.5) % VW + VW) % VW;
      const y = this.motes[i + 1] + Math.sin(this.frame * 0.02 + this.motes[i + 3]) * 6;
      c.globalAlpha = 0.12 + 0.12 * spd;
      c.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
    c.globalAlpha = 1;
    // speed lines
    const sp = this.vx;
    if (sp > 3.2 && this.phase === 'playing') {
      c.fillStyle = '#ffffff';
      for (let i = 0; i < 5; i++) {
        const y = (hash(i * 12.3 + Math.floor(this.frame / 7)) * VH) | 0;
        const len = 14 + hash(i + this.frame) * 26;
        const x = ((this.frame * -9 - i * 90) % (VW + 80) + VW + 80) % (VW + 80);
        c.globalAlpha = 0.1 + (sp - 3.2) * 0.16;
        c.fillRect(Math.round(x - len), y, Math.round(len), 1);
      }
      c.globalAlpha = 1;
    }
    this.drawBiomeEvent();
  }

  private drawPowerUpHud() {
    const c = this.ctx;
    let x = 6;
    const y = 45;
    const status = (remaining: number, kind: PowerUpKind) => {
      // The propeller flashes with 0s left — draw the icon alone, no "0".
      const text = remaining > 0 ? String(Math.ceil(remaining / 60)) : '';
      const width = textWidth(text, 1) + 12;
      if (x + width > VW - 6) return;
      const col = POWERUP_COLORS[kind];
      c.fillStyle = col;
      if (kind === 'shield') {
        c.fillRect(x, y, 5, 1);
        c.fillRect(x - 1, y + 1, 7, 1);
        c.fillRect(x - 1, y + 2, 7, 1);
        c.fillRect(x - 1, y + 3, 7, 1);
        c.fillRect(x, y + 4, 5, 1);
        c.fillRect(x + 1, y + 5, 3, 1);
      } else if (kind === 'shoes') {
        c.fillRect(x, y + 3, 3, 2);
        c.fillRect(x, y + 1, 2, 2);
        c.fillRect(x + 4, y + 3, 3, 2);
        c.fillRect(x + 4, y + 1, 2, 2);
      } else if (kind === 'triple') {
        c.fillRect(x, y, 2, 1);
        c.fillRect(x + 1, y + 1, 1, 2);
        c.fillRect(x + 3, y + 2, 2, 1);
        c.fillRect(x + 4, y + 3, 1, 2);
        c.fillRect(x + 6, y + 5, 2, 1);
        c.fillRect(x + 7, y + 6, 1, 1);
      } else {
        c.fillRect(x + 2, y + 2, 3, 3);
        c.fillRect(x + 3, y, 1, 2);
        c.fillRect(x, y + 3, 2, 1);
        c.fillRect(x + 5, y + 3, 2, 1);
      }
      if (text) drawText(c, text, x + 9, y, 1, col, '#150a24');
      x += width + 4;
    };
    if (this.shielded) status(this.shieldTimer, 'shield');
    if (this.jumpShoes > 0) status(this.jumpShoes, 'shoes');
    if (this.tripleJump > 0) status(this.tripleJump, 'triple');
    if (this.propellerHat > 0 || this.propellerFlashing) status(this.propellerHat, 'propeller');
  }

  private drawHud() {
    const c = this.ctx;
    if (this.phase === 'ready') return;
    const m = Math.floor(this.distance / 10);

    // score — only rebuild the padded strings when the values change
    drawText(c, 'SCORE', 6, 6, 1, this.zone.accent2, '#150a24');
    if (this.hudScore !== this.score) {
      this.hudScore = this.score;
      this.hudScoreStr = pad(this.score, 6);
    }
    const scoreStr = this.hudScoreStr;
    let leadingZeroes = 0;
    while (leadingZeroes < scoreStr.length && scoreStr[leadingZeroes] === '0') leadingZeroes++;
    if (leadingZeroes > 0) {
      c.globalAlpha = 0.35;
      drawText(c, scoreStr.slice(0, leadingZeroes), 6, 15, 2, '#8f7fd0', '#150a24');
      c.globalAlpha = 1;
    }
    drawText(c, scoreStr.slice(leadingZeroes), 6 + leadingZeroes * 12, 15, 2, '#ffffff', '#150a24');

    // best
    if (this.best > 0) {
      drawText(c, 'BEST', 6, 32, 1, this.zone.accent, '#150a24');
      drawText(c, pad(this.best, 6), 36, 32, 1, this.zone.accent, '#150a24');
    }
    this.drawPowerUpHud();

    // distance + coins (right)
    if (this.hudM !== m) {
      this.hudM = m;
      this.hudMText = m + 'M';
    }
    const dtxt = this.hudMText;
    drawText(c, dtxt, VW - 6 - textWidth(dtxt, 2), 6, 2, this.zone.accent, '#150a24');
    if (this.hudCoins !== this.coins) {
      this.hudCoins = this.coins;
      this.hudCoinsText = 'X' + pad(this.coins, 3);
    }
    const ctxt = this.hudCoinsText;
    const cw = textWidth(ctxt, 1) + 10;
    const cx0 = VW - 6 - cw;
    // HUD coin matches world coin shape per biome
    if (this.zone.bg === 'tundra') {
      c.fillStyle = this.zone.coinEdge;
      c.fillRect(cx0, 22, 8, 7);
      c.fillStyle = this.zone.coinFill;
      c.fillRect(cx0 + 1, 23, 6, 5);
      c.fillStyle = this.zone.coinShine;
      c.fillRect(cx0 + 3, 22, 2, 1);
      c.fillRect(cx0 + 3, 29, 2, 1);
      c.fillRect(cx0, 25, 1, 2);
      c.fillRect(cx0 + 7, 25, 1, 2);
    } else if (this.zone.bg === 'desert') {
      c.fillStyle = this.zone.coinEdge;
      c.fillRect(cx0, 23, 7, 7);
      c.fillStyle = this.zone.coinFill;
      c.fillRect(cx0, 23, 7, 6);
      c.fillStyle = this.zone.coinShine;
      c.fillRect(cx0 + 1, 24, 1, 3);
      c.fillRect(cx0 - 1, 22, 1, 1);
      c.fillRect(cx0 + 7, 22, 1, 1);
      c.fillRect(cx0 - 1, 30, 1, 1);
      c.fillRect(cx0 + 7, 30, 1, 1);
    } else if (this.zone.bg === 'jungle') {
      // fruit coin — round (matches world coin shape)
      c.fillStyle = this.zone.coinEdge;
      c.fillRect(cx0 + 1, 23, 6, 1);
      c.fillRect(cx0, 24, 8, 5);
      c.fillRect(cx0 + 1, 29, 6, 1);
      c.fillStyle = this.zone.coinFill;
      c.fillRect(cx0 + 1, 24, 6, 4);
      c.fillStyle = this.zone.coinShine;
      c.fillRect(cx0 + 2, 25, 2, 2);
      c.fillStyle = this.zone.accent2;
      c.fillRect(cx0 + 3, 21, 1, 2);
      c.fillRect(cx0 + 4, 21, 2, 1);
    } else {
      c.fillStyle = this.zone.coinEdge;
      c.fillRect(cx0, 23, 7, 7);
      c.fillStyle = this.zone.coinFill;
      c.fillRect(cx0, 23, 7, 6);
      c.fillStyle = this.zone.coinShine;
      c.fillRect(cx0 + 1, 24, 1, 3);
    }
    drawText(c, ctxt, cx0 + 10, 23, 1, this.zone.coinFill, '#150a24');

    // combo — fixed layout, colour-only pulse (no size jitter)
    if (this.combo > 1) {
      const t = this.comboT / COMBO_TIME;
      const label = 'X' + this.mult() + ' COMBO ' + this.combo;
      const flash = this.comboPulse;
      const col = flash > 0.4 ? '#ffffff' : '#ffd166';
      const bw = 78;
      drawTextCentered(c, label, VW / 2, 8, 1, col, '#150a24');
      c.fillStyle = '#150a24';
      c.fillRect(VW / 2 - bw / 2 - 1, 18, bw + 2, 5);
      c.fillStyle = t > 0.3 ? this.zone.accent : '#ff4d6d';
      c.fillRect(VW / 2 - bw / 2, 19, Math.round(bw * t), 3);
    }
  }
}
