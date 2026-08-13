import type { BgKind, Zone } from './palette';

/** Gameplay is authored against this size; physics never changes. */
export const BASE_VW = 400;
export const BASE_VH = 225;
/** Tallest internal buffer — beyond this the ground dirt can't reach bottom. */
export const MAX_VH = 575;
/** Shortest internal buffer — used by landscape phones to zoom the game in. */
export const MIN_VH = 170;

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
  VH = Math.min(MAX_VH, Math.max(MIN_VH, Math.round(h)));
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
export const GRAV = 0.44;
export const GRAV_HOLD = 0.36;
export const GRAV_FALL = 0.54;
export const GRAV_DIVE = 1.1;
export const JUMP_V = 6.4;
export const DJUMP_V = 6.4;
export const MAX_FALL = 10;
export const COYOTE = 12;
export const BUFFER = 8;
/** Camera anchor as a fraction of view width (112/400 on desktop). */
const ANCHOR_FRAC = 0.28;
export function anchorX() {
  return Math.round(VW * ANCHOR_FRAC);
}
export const GROUND_BOTTOM = BASE_VH + 70;
export const COMBO_TIME = 150; // frames
export const PLAYER_W = 10;
export const PLAYER_H = 14;
export const PLAYER_RUN_LEGS = [
  [1, 10, 3, 4, 6, 10, 3, 4],
  [2, 9, 3, 4, 5, 10, 3, 4],
  [4, 10, 3, 4, 0, 10, 3, 4],
  [2, 10, 3, 4, 5, 9, 3, 4],
];
export type PowerUpKind = 'shield' | 'shoes' | 'triple' | 'propeller';
export const POWERUP_TIME = 60 * 10;
export const POWERUP_PTS = 75;
export const POWERUP_COLORS: Record<PowerUpKind, string> = {
  shield: '#7ef7ff',
  shoes: '#ffd166',
  triple: '#c98cff',
  propeller: '#ff7a90',
};

export const COIN_PTS = 15;
export const GEM_PTS = 120;
export const STOMP_PTS = 45;
export const SLAM_PTS = 80;
/** Coin spin widths per animation frame, in order. */
export const COIN_HW = [3, 2, 1, 2];
export const PLAYER_SUIT = '#ff4d6d';
export const PLAYER_SUIT_D = '#b32a4d';
export const PLAYER_SKIN = '#ffcf9e';
export const PLAYER_BOOT = '#59427e';
export const PLAYER_BOOT_SHOES = '#ffd166';
export const PLAYER_SCARF = '#3ef2c8';
export const PAD_V = 9.6;
export const MEGA_PAD_V = 12.2;
export const PLATFORM_CACHE_PAD = 6; // headroom above y for cap bumps/grass/snow art
export const MAX_PLATFORM_Y = 180;
/** Biome zone length in tens-of-meters, and the crossfade window over its tail. */
export const ZONE_LEN_M = 350;
export const FADE_START_FRAC = 0.92;
export const FADE_WINDOW = 0.08;
/** Death by falling below the ground dirt (ground bottom sits at BASE_VH+70). */
export const PIT_DEATH_Y = BASE_VH + 60;
/** Slow-mo frames before the death report reaches App (onDeath fires). */
export const DEATH_REPORT_FRAME = 42;
/** Slam shockwave hitbox around the player. */
export const SLAM_RADIUS = 46;
export const SLAM_VERT = 28;
/** Horizontal overlap tolerance when hugging a wall (keeps px from poking in). */
export const WALL_MARGIN = 1;
/** Play-area drag distance (px) that triggers a dive on touch. */
export const DIVE_SWIPE_PX = 28;

/* ---------------------------------------------------------------- entities */
export interface Platform {
  x: number;
  y: number;
  w: number;
  float: boolean;
  seed: number;
  /** Pre-rendered artwork, built once and blitted every frame (perf). */
  cache?: HTMLCanvasElement;
  cacheEpoch?: number;
}
export interface Pickup {
  x: number;
  y: number;
  t: number;
  gem: boolean;
  dead: boolean;
}
export interface PowerUp {
  x: number;
  y: number;
  t: number;
  kind: PowerUpKind;
  dead: boolean;
}
export interface BiomeEventTrigger {
  x: number;
  kind: BgKind;
  used: boolean;
}
export type EnemyKind = 'slime' | 'hopper' | 'scarab' | 'spiker' | 'flyer';
export interface Enemy {
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
export interface Spike {
  x: number;
  y: number;
  n: number;
}
export interface Spring {
  x: number;
  y: number;
  press: number;
  mega: boolean;
  launchVx: number;
}
export interface Particle {
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
export interface FloatText {
  x: number;
  y: number;
  vy: number;
  life: number;
  max: number;
  text: string;
  col: string;
  scale: number;
  /** Rendered text width in world px — cached so draw() never re-measures. */
  w: number;
  /** Pre-rendered glyphs (shadow + fill) — drawn at native scale, scaled up via canvas transform for the pop. */
  sprite: HTMLCanvasElement;
}
export interface Ghost {
  x: number;
  y: number;
  life: number;
}

export const P_CAP = 320;
export const T_CAP = 18;

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const rnd = (a: number, b: number) => a + Math.random() * (b - a);
export const ri = (a: number, b: number) => Math.floor(rnd(a, b + 1));
export const wrap = (value: number, size: number) => ((value % size) + size) % size;

export enum PAT {
  REST = 0,
  STOMP = 1,
  SPIKES = 2,
  LAUNCH = 3,
  MEGA = 4,
  UPPER = 5,
  FLYER = 6,
}
export function hash(n: number) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

/* -------------------------------------------------- cross-module contracts */
/**
 * World state + tuning the world generator reads. Implemented by Game so the
 * generator never needs to import it (no circular imports).
 */
export interface GenHost {
  platforms: Platform[];
  pickups: Pickup[];
  powerups: PowerUp[];
  enemies: Enemy[];
  spikes: Spike[];
  springs: Spring[];
  startX: number;
  zone: Zone;
  zoneOrder: number[];
  diff(): number;
  runSpeed(): number;
}

/** Everything the renderer reads (and the one field it writes: zone). */
export interface RenderHost {
  ctx: CanvasRenderingContext2D;
  phase: Phase;
  frame: number;
  distance: number;
  score: number;
  coins: number;
  best: number;
  combo: number;
  comboT: number;
  comboPulse: number;
  mult(): number;
  camX: number;
  shakeX: number;
  shakeY: number;
  flash: number;
  flashCol: string;
  countdown: number;
  goTimer: number;
  vx: number;
  px: number;
  py: number;
  sx: number;
  sy: number;
  spin: number;
  onGround: boolean;
  animT: number;
  invuln: number;
  diving: boolean;
  jumpShoes: number;
  tripleJump: number;
  propellerHat: number;
  propellerFlashing: boolean;
  propellerFlashTimer: number;
  shielded: boolean;
  shieldTimer: number;
  ghosts: Ghost[];
  platforms: Platform[];
  springs: Spring[];
  spikes: Spike[];
  pickups: Pickup[];
  powerups: PowerUp[];
  enemies: Enemy[];
  zone: Zone;
  zoneOrder: number[];
  eventTimer: number;
  eventMax: number;
  eventKind: BgKind;
  eventSeed: number;
}
