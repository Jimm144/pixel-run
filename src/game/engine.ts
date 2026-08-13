import { sfx } from './audio';
import { shade, ZONES, type BgKind, type Zone } from './palette';
import { ParticleSystem } from './particles';
import type { QuestRunStats } from './quests';
import { Renderer } from './renderer';
import { FloatTexts } from './texts';
import {
  anchorX,
  BUFFER,
  clamp,
  COIN_PTS,
  COMBO_TIME,
  COYOTE,
  DEATH_REPORT_FRAME,
  DJUMP_V,
  GEM_PTS,
  GRAV,
  GRAV_DIVE,
  GRAV_FALL,
  GRAV_HOLD,
  GROUND_BOTTOM,
  JUMP_V,
  MAX_FALL,
  MEGA_PAD_V,
  PAD_V,
  PIT_DEATH_Y,
  PLAYER_H,
  PLAYER_W,
  POWERUP_COLORS,
  POWERUP_PTS,
  POWERUP_TIME,
  ri,
  rnd,
  SLAM_PTS,
  SLAM_RADIUS,
  SLAM_VERT,
  STOMP_PTS,
  VW,
  WALL_MARGIN,
  ZONE_LEN_M,
  type Enemy,
  type GenHost,
  type Ghost,
  type Phase,
  type Pickup,
  type Platform,
  type PowerUp,
  type PowerUpKind,
  type RenderHost,
  type Spike,
  type Spring,
  type Stats,
} from './types';
import { WorldGen } from './worldGen';

export { BASE_VW, BASE_VH, MAX_VH, VW, VH, worldOffsetY, setViewportSize } from './types';
export type { Phase, Stats } from './types';

/**
 * Initial values for every mutable piece of run state. reset() re-applies
 * this object, so the run state is re-zeroed automatically — no manual
 * re-zero list to drift out of sync. GameState is DERIVED from Game (all
 * non-method fields minus the excluded ones below), so adding a reset-managed
 * field to the class without initialising it in defaults() is a compile
 * error. Excluded on purpose: ctx/onDeath/best (set from outside), the
 * subsystems (renderer/worldGen/particles/texts), frame/animT (kept running
 * across runs), countdownTicks, and the stats getter.
 */
type GameState = {
  [K in Exclude<
    {
      [K in keyof Game]: Game[K] extends (...a: never[]) => unknown ? never : K;
    }[keyof Game],
    | 'ctx'
    | 'onDeath'
    | 'best'
    | 'frame'
    | 'animT'
    | 'countdownTicks'
    | 'renderer'
    | 'worldGen'
    | 'particles'
    | 'texts'
    | 'stats'
  >]: Game[K];
};

/**
 * The game itself. Owns input, player physics, collisions, scoring, camera
 * and phase state, and delegates generation to WorldGen, per-frame visuals to
 * Renderer, and particles/float-texts to ParticleSystem/FloatTexts. The public
 * surface used by App/GameCanvas/Overlays is unchanged.
 */
export class Game implements GenHost, RenderHost {
  ctx: CanvasRenderingContext2D;
  phase!: Phase;
  onDeath: ((s: Stats) => void) | null = null;
  best = 0;

  /* ---- input */
  jumpHeld!: boolean;
  jumpBuf!: number;
  diveHeld!: boolean;
  moveDir!: number;
  savedJumpHeld!: boolean;
  savedDiveHeld!: boolean;
  savedMoveDir!: number;

  /* ---- world arrays (read by WorldGen + Renderer through the host contract) */
  platforms!: Platform[];
  pickups!: Pickup[];
  powerups!: PowerUp[];
  enemies!: Enemy[];
  spikes!: Spike[];
  springs!: Spring[];

  /* ---- camera / fx */
  camX!: number;
  shake!: number;
  shakeX!: number;
  shakeY!: number;
  freeze!: number;
  slowAcc!: number;
  flash!: number;
  flashCol!: string;
  /** Kept running across runs like the original — not reset by reset(). */
  frame = 0;
  deathTimer!: number;
  deathReported!: boolean;

  /* ---- player */
  px!: number;
  py!: number;
  vx!: number;
  vy!: number;
  onGround!: boolean;
  coyote!: number;
  jumps!: number;
  cut!: boolean;
  diving!: boolean;
  shielded!: boolean;
  shieldTimer!: number;
  jumpShoes!: number;
  tripleJump!: number;
  propellerHat!: number;
  propellerFlashing!: boolean;
  propellerFlashTimer!: number;
  invuln!: number;
  padFlight!: number;
  sx!: number;
  sy!: number;
  playerSquashX!: number;
  playerSquashY!: number;
  spin!: number;
  /** Kept running across runs like the original — not reset by reset(). */
  animT = 0;
  ghosts!: Ghost[];
  startX!: number;

  /* ---- score */
  distance!: number;
  score!: number;
  bonus!: number;
  coins!: number;
  kills!: number;
  combo!: number;
  comboT!: number;
  comboPulse!: number;
  countdown!: number;
  /** Frames the "GO" flash stays up after the countdown reaches zero. */
  goTimer!: number;
  /** Beep the countdown ticks — true for run starts, false for unpause resumes. */
  private countdownTicks = false;
  bestCombo!: number;
  nextMilestone!: number;
  questCoins!: number;
  questEnemies!: number;
  questPowerups!: number;
  questJumps!: number;
  questCleanRun!: boolean;
  questCleanMeters!: number;
  questCleanScore!: number;
  questBiomeEffects!: BgKind[];
  questTwoPowerups!: boolean;
  eventTimer!: number;
  eventMax!: number;
  eventSeed!: number;
  eventKind!: BgKind;
  zoneIdx!: number;
  zone!: Zone;
  zoneOrder!: number[];

  /* ---- subsystems */
  private renderer!: Renderer;
  private worldGen!: WorldGen;
  private particles!: ParticleSystem;
  private texts!: FloatTexts;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    Object.assign(this, this.defaults());
    this.particles = new ParticleSystem();
    this.texts = new FloatTexts();
    this.renderer = new Renderer(this, this.particles, this.texts);
    this.worldGen = new WorldGen(this);
    this.reset();
  }

  private defaults(): GameState {
    return {
      phase: 'ready',
      jumpHeld: false,
      jumpBuf: 0,
      diveHeld: false,
      moveDir: 0,
      savedJumpHeld: false,
      savedDiveHeld: false,
      savedMoveDir: 0,
      platforms: [],
      pickups: [],
      powerups: [],
      enemies: [],
      spikes: [],
      springs: [],
      camX: 0,
      shake: 0,
      shakeX: 0,
      shakeY: 0,
      freeze: 0,
      slowAcc: 0,
      flash: 0,
      flashCol: '#ffffff',
      deathTimer: 0,
      deathReported: false,
      px: 0,
      py: 0,
      vx: 0,
      vy: 0,
      // The player is grounded at the start of a run — a false value here
      // shows the air pose during the countdown and lets dive fire early.
      onGround: true,
      coyote: 0,
      jumps: 0,
      cut: false,
      diving: false,
      shielded: false,
      shieldTimer: 0,
      jumpShoes: 0,
      tripleJump: 0,
      propellerHat: 0,
      propellerFlashing: false,
      propellerFlashTimer: 0,
      invuln: 0,
      padFlight: 0,
      sx: 1,
      sy: 1,
      playerSquashX: 1,
      playerSquashY: 1,
      spin: 0,
      ghosts: [],
      startX: 0,
      distance: 0,
      score: 0,
      bonus: 0,
      coins: 0,
      kills: 0,
      combo: 0,
      comboT: 0,
      comboPulse: 0,
      countdown: 0,
      goTimer: 0,
      bestCombo: 0,
      nextMilestone: 250,
      questCoins: 0,
      questEnemies: 0,
      questPowerups: 0,
      questJumps: 0,
      questCleanRun: true,
      questCleanMeters: 0,
      questCleanScore: 0,
      questBiomeEffects: [],
      questTwoPowerups: false,
      eventTimer: 0,
      eventMax: 0,
      eventSeed: 0,
      eventKind: 'city',
      zoneIdx: 0,
      zone: ZONES[0],
      zoneOrder: ZONES.map((_, i) => i),
    };
  }

  /* ------------------------------------------------------------- lifecycle */
  reset() {
    Object.assign(this, this.defaults());
    this.particles.reset();
    this.texts.reset();
    this.worldGen.reset();
    this.renderer.reset();
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
    this.renderer.refreshZoneColors(this.zone);
    this.px = anchorX();
    this.py = 170 - PLAYER_H;
    this.startX = this.px;
    this.worldGen.generate(this.camX + VW * 2.2);
  }

  startRun() {
    this.reset();
    this.phase = 'playing';
    this.countdown = 180;
    this.countdownTicks = true;
    this.flash = 0.35;
    this.flashCol = '#ffffff';
    sfx.startMusic(this.zone.bg, 0);
    sfx.play('start');
  }

  /** Called when the canvas size changes — drops size-dependent art caches. */
  invalidateViewport() {
    this.renderer.invalidateViewport();
  }

  /** HUD zoom (1 on desktop) — larger on phones where the canvas is scaled up. */
  setHudScale(v: number) {
    this.renderer.setHudScale(v);
  }

  /** Mobile view: compact score, no meters/coins, world lifted higher. */
  setMobileView(v: boolean) {
    this.renderer.setMobileView(v);
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
      if (this.countdown === 0) {
        this.goTimer = 0; // don't flash "GO" over the fresh countdown
        this.countdown = 180; // 3s of "3-2-1-GO" before control resumes
        this.countdownTicks = false; // silent countdown after unpause
      }
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

  getQuestRunStats(): QuestRunStats {
    return {
      coins: this.questCoins,
      meters: Math.floor(this.distance / 10),
      score: this.score,
      enemies: this.questEnemies,
      powerups: this.questPowerups,
      jumps: this.questJumps,
      maxCombo: this.bestCombo,
      cleanMeters: this.questCleanRun ? this.questCleanMeters : 0,
      cleanScore: this.questCleanRun ? this.questCleanScore : 0,
      cleanRun: this.questCleanRun,
      biomeEffects: [...this.questBiomeEffects],
      twoPowerups: this.questTwoPowerups,
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
    // A tap released during the countdown must not fire at GO — clearing the
    // buffer here cancels any buffered jump (held input survives via
    // jumpHeld, which resume()/the countdown re-buffers at GO).
    this.jumpBuf = 0;
    if (this.phase === 'paused') this.savedJumpHeld = false;
  }
  pressDive() {
    if (this.phase !== 'playing' || this.countdown > 0) return;
    this.diveHeld = true;
    if (!this.onGround && this.vy > -3) {
      this.diving = true;
      this.padFlight = 0;
      this.vy = Math.max(this.vy, 6.5);
      this.spin = 0;
      this.sx = 0.8;
      this.sy = 1.25;
    }
  }
  releaseDive() {
    this.diveHeld = false;
    if (this.phase === 'paused') this.savedDiveHeld = false;
  }
  setMove(d: number) {
    if (this.phase !== 'playing') {
      this.moveDir = 0;
      // Mirror releaseJump/releaseDive: letting go of the key while paused
      // must not be re-applied by resume() (savedMoveDir is restored there).
      if (this.phase === 'paused') this.savedMoveDir = 0;
      return;
    }
    this.moveDir = d > 0 ? 1 : 0;
  }

  /* --------------------------------------------------------------- helpers */
  diff() {
    const d = clamp(this.distance / 15000, 0, 1);
    return this.phase === 'ready' ? Math.min(d, 0.1) : d;
  }
  runSpeed() {
    const late = this.phase === 'ready' ? 0 : clamp((this.distance - 10500) / 15000, 0, 1);
    return 2.1 + 1.4 * this.diff() + 0.8 * late;
  }
  mult() {
    return Math.min(10, 1 + Math.floor(this.combo / 4));
  }

  private syncDistanceScore() {
    this.distance = Math.max(this.distance, this.px - this.startX);
    this.score = Math.floor(this.distance / 8) + this.bonus;
    if (this.questCleanRun) {
      this.questCleanMeters = Math.floor(this.distance / 10);
      this.questCleanScore = this.score;
    }
  }

  private addShake(v: number) {
    this.shake = Math.min(1, this.shake + v);
  }

  private addCombo(x: number, y: number, base: number, label?: string) {
    if (this.phase !== 'playing') return;
    this.questCleanRun = false;
    this.combo++;
    this.comboT = COMBO_TIME;
    this.comboPulse = 1; // smooth colour flash, decays in step()
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    const pts = base * this.mult();
    this.bonus += pts;
    this.texts.popText(x, y, (label ? label + ' ' : '+') + pts, this.mult() > 1 ? '#ffd166' : '#ffffff');
    if (this.combo > 1 && this.combo % 4 === 0) {
      this.texts.popText(x, y - 12, 'X' + this.mult(), '#ff4d6d', 1);
      sfx.play('combo', this.mult());
    }
  }

  private breakCombo() {
    this.combo = 0;
    this.comboT = 0;
  }

  private cullArr<T>(arr: T[], gone: (v: T) => boolean) {
    for (let i = arr.length - 1; i >= 0; i--) if (gone(arr[i])) arr.splice(i, 1);
  }

  private cull() {
    const lim = this.camX - 90;
    this.cullArr(this.platforms, (p) => p.x + p.w < lim);
    this.cullArr(this.pickups, (k) => k.dead || k.x < lim);
    this.cullArr(this.powerups, (u) => u.dead || u.x < lim);
    this.cullArr(this.worldGen.eventTriggers, (t) => t.used || t.x < lim);
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

  // Biome identity lives in the motion trail, not in the hero's fixed sprite.
  private emitTrail(dive: boolean) {
    const x = this.px - 1;
    const y = this.py + PLAYER_H - 1;
    if (this.zone.bg === 'jungle') {
      this.particles.spawnP(x, y, -rnd(0.3, 1.1), -rnd(0.2, 0.8), 14, 1, this.zone.deco, 0.02, 0.94);
      if (!dive && this.frame % 12 === 0)
        this.particles.spawnP(x + 3, y - 1, -rnd(0.1, 0.6), -rnd(0.4, 1), 12, 1, this.zone.accent2, 0.03, 0.94);
    } else if (this.zone.bg === 'desert') {
      this.particles.spawnP(x, y, -rnd(0.2, 0.8), -rnd(0.05, 0.35), 16, 1, this.zone.coinFill, 0.015, 0.97);
      if (dive) this.particles.spawnP(x + 2, y, -rnd(0.5, 1.4), -rnd(0.1, 0.6), 12, 1, this.zone.ground, 0.02, 0.95);
    } else if (this.zone.bg === 'tundra') {
      this.particles.spawnP(x, y, -rnd(0.3, 1), -rnd(0.5, 1.2), 16, 1, this.zone.accent, 0.01, 0.95);
      if (dive) this.particles.spawnP(x + 2, y - 1, -rnd(0.2, 0.9), -rnd(0.7, 1.5), 14, 1, '#ffffff', 0.01, 0.95);
    } else {
      this.particles.spawnP(x, y, -rnd(0.4, 1.3), -rnd(0.2, 0.9), 14, 1, this.zone.accent, -0.01, 0.94);
      if (dive) this.particles.spawnP(x + 2, y - 1, -rnd(0.3, 1.1), -rnd(0.4, 1.2), 12, 1, '#7ef7ff', 0, 0.94);
    }
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
      if (this.countdown === 0) {
        this.goTimer = 30;
        if (this.countdownTicks) sfx.play('start'); // GO
      } else if (this.countdownTicks && this.countdown % 60 === 0) {
        sfx.play('ui'); // 2, 1 ticks
      }
      this.particles.update(1);
      return;
    }
    if (this.goTimer > 0) this.goTimer--;

    // death slow-mo
    if (this.phase === 'dead') {
      this.deathTimer++;
      this.slowAcc += this.deathTimer < 40 ? 0.35 : 1;
      if (this.slowAcc < 1) {
        this.particles.update(0.35);
        return;
      }
      this.slowAcc -= 1;
      this.particles.update(1);
      this.texts.update();
      if (this.deathTimer > DEATH_REPORT_FRAME && !this.deathReported) {
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
    if (!this.jumpHeld && this.vy < -3 && !this.cut) {
      this.vy *= 0.52;
      this.cut = true;
    }

    /* ---- gravity */
    if (this.diveHeld && !this.onGround && !this.diving && this.vy > 0.5) {
      this.diving = true;
      this.spin = 0;
      this.sx = 0.8;
      this.sy = 1.25;
    }
    let g = GRAV_FALL;
    if (this.diving) g = GRAV_DIVE;
    else if ((this.propellerHat > 0 || this.propellerFlashing) && !this.onGround && this.jumpHeld) g = this.vy > 0 ? 0.08 : 0.16;
    else if (this.eventTimer > 0 && this.eventKind === 'desert' && this.padFlight <= 0) g = this.vy < 0 ? 0.3 : 0.48;
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
    this.playerSquashX += (1 - this.playerSquashX) * 0.2;
    this.playerSquashY += (1 - this.playerSquashY) * 0.2;
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
    this.particles.update(1);
    this.texts.update();

    /* ---- camera */
    const camTarget = this.px - anchorX();
    this.camX += (camTarget - this.camX) * 0.22;
    if (this.camX < 0) this.camX = 0;

    this.worldGen.generate(this.camX + VW * 2.2);
    if (this.frame % 20 === 0) this.cull();

    /* ---- score */
    if (this.phase === 'playing') {
      this.syncDistanceScore();
      const m = Math.floor(this.distance / 10);
      if (m >= this.nextMilestone) {
        this.bonus += 100;
        this.texts.popText(this.px, this.py - 24, this.nextMilestone + 'M!', '#3ef2c8', 1);
        this.nextMilestone += 250;
        this.addShake(0.16);
        sfx.play('combo', 6);
      }
      if (this.comboT > 0) {
        this.comboT--;
        if (this.comboT === 0) this.combo = 0;
      }
      if (this.comboPulse > 0) this.comboPulse = Math.max(0, this.comboPulse - 0.12);
      const zi = Math.floor(m / ZONE_LEN_M);
      if (zi !== this.zoneIdx) {
        this.zoneIdx = zi;
        this.texts.popText(
          this.px + 40,
          46,
          ZONES[this.zoneOrder[zi % ZONES.length]].name,
          '#ffffff',
          1,
        );
      }
    }

    /* ---- death by pit */
    if (this.py > PIT_DEATH_Y) this.die('pit');
  }

  private doJump(dbl: boolean) {
    this.jumpBuf = 0;
    this.cut = false;
    this.diving = false;
    const jumpScale = this.jumpShoes > 0 ? 1.18 : 1;
    this.vy = -(dbl ? DJUMP_V : JUMP_V) * jumpScale;
    if (dbl) this.padFlight = 0;
    this.jumps = dbl ? Math.min(3, this.jumps + 1) : 1;
    if (this.phase === 'playing') this.questJumps++;
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
        this.particles.spawnP(bx, by - 6, Math.cos(a) * 1.7, Math.sin(a) * 1.2, 18, 1, this.zone.accent, 0.02, 0.9);
      }
      sfx.play('djump');
    } else {
      for (let i = 0; i < 6; i++) {
        this.particles.spawnP(bx, by, rnd(-1.4, 0.4), -rnd(0.2, 0.9), 16, 1, '#ffffff', 0.05, 0.93);
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
        if (this.vx > 0 && this.px + pw - this.vx <= p.x + WALL_MARGIN) {
          if (this.vy < 0) {
            this.px = p.x - pw - 1;
            this.vx = 0;
            continue;
          }
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
      if (this.px + pw <= p.x + WALL_MARGIN || this.px >= p.x + p.w - WALL_MARGIN) continue;
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
      if (impact > 2) {
        this.playerSquashX = 1 + Math.min(0.35, impact * 0.035);
        this.playerSquashY = 1 - Math.min(0.4, impact * 0.04);
        const n = wasDiving ? 16 : Math.min(10, Math.floor(impact));
        for (let i = 0; i < n; i++) {
          this.particles.spawnP(
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
        for (let i = 0; i < 5; i++) {
          this.particles.spawnP(
            this.px + PLAYER_W / 2 + rnd(-5, 5),
            this.py + PLAYER_H,
            rnd(-1.4, 1.4) - this.vx * 0.15,
            -rnd(0.1, 0.7),
            14,
            3,
            shade(this.zone.accent, -0.15),
            0.02,
            0.93,
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
            Math.abs(e.x + e.w / 2 - (this.px + PLAYER_W / 2)) < SLAM_RADIUS &&
            Math.abs(e.y - this.py) < SLAM_VERT
          ) {
            this.killEnemy(e, SLAM_PTS, e.kind === 'spiker' ? 'SMASH' : 'SLAM');
          }
        }
        for (let i = 0; i < 18; i++) {
          const dir = i % 2 === 0 ? 1 : -1;
          this.particles.spawnP(
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
    this.questEnemies++;
    this.addCombo(e.x + e.w / 2, e.y - 8, pts, label);
    this.particles.burst(e.x + e.w / 2, e.y + e.h / 2, 14, [this.zone.slimeBody, this.zone.accent, '#ffffff'], 2.6, 0.16);
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
          this.questCoins += 5;
          this.addCombo(c.x, c.y - 6, GEM_PTS, 'GEM');
          this.particles.burst(c.x, c.y, 16, ['#7ef7ff', '#ffffff', '#3ef2c8'], 2.4, 0.05);
          this.addShake(0.22);
          this.flash = 0.3;
          this.flashCol = '#7ef7ff';
          this.freeze = 2;
          sfx.play('gem');
        } else {
          this.coins++;
          this.questCoins++;
          this.addCombo(c.x, c.y - 4, COIN_PTS);
          this.particles.burst(c.x, c.y, 6, ['#ffd166', '#ffffff'], 1.7, 0.04);
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
        // Clamp inside the patrol range like the walkers — without this the
        // flyer drifts up to |vx| beyond its range on every bounce.
        if (e.x < e.minX) {
          e.x = e.minX;
          e.vx *= -1;
        } else if (e.x > e.maxX) {
          e.x = e.maxX;
          e.vx *= -1;
        }
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
              this.shieldPush(pushDir);
              shieldTriggered = true;
              break;
            }
            this.die('spike');
            return false;
          }
        } else {
          const stomping = fallVy > 0 && prevFeet <= e.y + e.h;
          if (stomping || this.diving) {
            this.killEnemy(e, this.diving ? SLAM_PTS : STOMP_PTS, this.diving ? 'SLAM' : undefined);
            stompedThisFrame = true;
          } else if (!stompedThisFrame) {
            if (this.absorbShieldHit()) {
              const pushDir = pxc + pw / 2 < e.x + e.w / 2 ? -1 : 1;
              this.shieldPush(pushDir);
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
      // Skip off-screen pads entirely — don't tick their press animation.
      if (sp.x > this.camX + VW + 20 || sp.x + 14 < this.camX - 20) continue;
      if (sp.press > 0) sp.press--;
      const padY = sp.y + (sp.press > 0 ? 4 : 0);
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
        sp.press = sp.mega ? 16 : 14;
        this.sx = 0.6;
        this.sy = 1.6;
        this.addShake(sp.mega ? 0.55 : 0.38);
        sfx.play(sp.mega ? 'slam' : 'spring');
        const n = sp.mega ? 20 : 12;
        const col = sp.mega ? '#ffd166' : '#ff4d6d';
        for (let i = 0; i < n; i++) {
          this.particles.spawnP(
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
        for (let i = 0; i < 5; i++) {
          this.particles.spawnP(
            sp.x + (sp.mega ? 9 : 7) + rnd(-6, 6),
            sp.y,
            rnd(-1.5, 1.5),
            -rnd(0.1, 0.8),
            16,
            3,
            shade(this.zone.ground, -0.1),
            0.02,
            0.93,
          );
        }
      }
    }
    return true;
  }

  private updateBiomeEvent() {
    if (this.eventTimer > 0) {
      // Biome flipped mid-event: don't cut it off cold. Wind the timer down
      // to the last 20 frames — the renderer's fade envelope (eventTimer/24)
      // fades the weather out over that window instead of snapping it off.
      if (this.eventKind !== this.zone.bg) {
        if (this.eventTimer > 20) this.eventTimer = 20;
      }
      // Do not queue several weather effects while one is active. Triggers
      // passed during the current effect are consumed and cannot restart it,
      // but they still count toward the biome-effect quest.
      for (const trigger of this.worldGen.eventTriggers) {
        if (!trigger.used && this.px + PLAYER_W >= trigger.x - 12) {
          trigger.used = true;
          if (!this.questBiomeEffects.includes(trigger.kind)) this.questBiomeEffects.push(trigger.kind);
        }
      }
      this.eventTimer--;
      if (this.eventTimer <= 0) {
        this.eventTimer = 0;
        this.eventMax = 0;
      }
      return;
    }
    this.eventMax = 0;
    for (const trigger of this.worldGen.eventTriggers) {
      if (trigger.used || this.px + PLAYER_W < trigger.x - 12) continue;
      trigger.used = true;
      this.eventKind = trigger.kind;
      if (!this.questBiomeEffects.includes(trigger.kind)) this.questBiomeEffects.push(trigger.kind);
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
      // The final second is the expiry warning blink; at zero the hat is gone.
      if (this.propellerHat === 60) {
        this.propellerFlashing = true;
        this.propellerFlashTimer = 60;
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
    this.questPowerups++;
    const activePowerups = Number(this.shielded) + Number(this.jumpShoes > 0) + Number(this.tripleJump > 0) + Number(this.propellerHat > 0 || this.propellerFlashing);
    if (activePowerups >= 2) this.questTwoPowerups = true;
    this.addCombo(x, y - 8, POWERUP_PTS, labels[kind]);
    this.texts.popText(x, y - 20, labels[kind], POWERUP_COLORS[kind], 1);
    this.particles.burst(x, y, 14, [POWERUP_COLORS[kind], '#ffffff'], 2.2, 0.04);
    this.flash = 0.24;
    this.flashCol = POWERUP_COLORS[kind];
    sfx.play('powerup', kind === 'shield' ? 0 : kind === 'shoes' ? 1 : kind === 'triple' ? 2 : 3);
  }

  private shieldPush(dir: number) {
    const pw = PLAYER_W;
    const ph = PLAYER_H;
    let px = this.px + dir * 6;
    for (const p of this.platforms) {
      if (p.float) continue;
      const bh = GROUND_BOTTOM - p.y;
      if (px + pw > p.x && px < p.x + p.w && this.py + ph > p.y + 3 && this.py < p.y + bh) {
        const edge = dir < 0 ? p.x + p.w : p.x - pw;
        px = dir < 0 ? Math.max(px, edge) : Math.min(px, edge);
      }
    }
    this.px = px;
    this.vx = dir * 1.2;
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
    this.particles.burst(this.px + PLAYER_W / 2, this.py + PLAYER_H / 2, 18, ['#7ef7ff', '#ffffff'], 2.8, 0.04);
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
      this.particles.spawnP(
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
    this.renderer.render();
  }
}
