import { ZONES, type BgKind } from './palette';
import {
  clamp,
  GRAV,
  GRAV_FALL,
  MAX_FALL,
  MAX_PLATFORM_Y,
  MEGA_PAD_V,
  PAD_V,
  PAT,
  PLAYER_H,
  VH,
  type BiomeEventTrigger,
  type EnemyKind,
  type GenHost,
  type Pickup,
  type Platform,
  type PowerUpKind,
} from './types';

interface GenState {
  genX: number;
  lastY: number;
  genCount: number;
  lastPattern: number;
  patternRepeat: number;
  nextPowerUpX: number;
  lastPowerUpKind: PowerUpKind | null;
  eventTriggers: BiomeEventTrigger[];
  eventBiomeRolls: Set<number>;
}

/** Physics horizon used by the trajectory simulators — far beyond the longest
 *  possible pad arc, so the integration always reaches the landing surface. */
const TRAJECTORY_FRAMES = 150;

const POWERUP_KINDS: PowerUpKind[] = ['shield', 'shoes', 'triple', 'propeller'];

/**
 * Procedural world builder: emits platforms, pickups, power-ups, enemies,
 * spikes and springs into the host's arrays. Uses GenHost's seeded PRNG
 * for 100% deterministic layout generation.
 */
export class WorldGen {
  private genX!: number;
  private lastY!: number;
  private genCount!: number;
  private lastPattern!: number;
  private patternRepeat!: number;
  private nextPowerUpX!: number;
  private lastPowerUpKind!: PowerUpKind | null;
  eventTriggers!: BiomeEventTrigger[];
  private eventBiomeRolls!: Set<number>;

  constructor(private h: GenHost) {
    Object.assign(this, this.defaults());
  }

  reset() {
    Object.assign(this, this.defaults());
  }

  private defaults(): GenState {
    return {
      genX: -60,
      lastY: 170,
      genCount: 0,
      lastPattern: -1,
      patternRepeat: 0,
      nextPowerUpX: 700,
      lastPowerUpKind: null,
      eventTriggers: [],
      eventBiomeRolls: new Set(),
    };
  }

  private rnd(a: number, b: number): number {
    return this.h.rng ? this.h.rng.rnd(a, b) : a + Math.random() * (b - a);
  }

  private ri(a: number, b: number): number {
    return this.h.rng ? this.h.rng.ri(a, b) : Math.floor(this.rnd(a, b + 1));
  }

  private rand(): number {
    return this.h.rng ? this.h.rng.next() : Math.random();
  }

  // Follows the true jump/fall arc so coins always sit exactly where you travel.
  private addCoinArc(x0: number, x1: number, topY: number, arcH = 26, n = 4) {
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const y = topY - Math.sin(t * Math.PI) * arcH;
      this.h.pickups.push({ x: x0 + (x1 - x0) * t, y, t: this.rnd(0, 6), gem: false, dead: false });
    }
  }

  private addCoinLine(x0: number, x1: number, y: number, max = 4) {
    const n = clamp(Math.floor((x1 - x0) / 26) + 1, 2, max);
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      this.h.pickups.push({ x: x0 + (x1 - x0) * t, y, t: i * 0.7, gem: false, dead: false });
    }
  }

  private blobKind(bg: BgKind): EnemyKind {
    if (bg === 'jungle') return this.genCount % 2 === 0 ? 'slime' : 'hopper';
    if (bg === 'desert') return this.genCount % 2 === 0 ? 'scarab' : 'slime';
    return 'slime';
  }

  private addBlob(p: Platform, x: number) {
    const kind = this.blobKind(this.biomeAtX(p.x));
    const dims =
      kind === 'scarab' ? { w: 22, h: 10, dy: 10 } : kind === 'hopper' ? { w: 14, h: 15, dy: 15 } : { w: 18, h: 14, dy: 14 };
    const speed = kind === 'scarab' ? 1.0 : 0.48;
    this.h.enemies.push({
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
    this.h.enemies.push({
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
    this.h.enemies.push({
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
    const kinds = POWERUP_KINDS;
    let kind = kinds[this.ri(0, kinds.length - 1)];
    if (kind === this.lastPowerUpKind) kind = kinds[(kinds.indexOf(kind) + this.ri(1, kinds.length - 1)) % kinds.length];
    this.lastPowerUpKind = kind;
    return kind;
  }

  private addPowerUp(p: Platform) {
    const kind = this.pickPowerUp();
    this.h.powerups.push({
      x: p.x + p.w * 0.52,
      y: p.y - 18,
      t: this.rnd(0, 6),
      kind,
      dead: false,
    });
    this.nextPowerUpX = p.x + this.rnd(720, 980);
  }

  private biomeIndexAtX(x: number) {
    return Math.floor(Math.max(0, x - this.h.startX) / 3500);
  }

  private biomeAtX(x: number): BgKind {
    const index = this.biomeIndexAtX(x);
    return ZONES[this.h.zoneOrder[index % ZONES.length]].bg;
  }

  private diffAtX(x: number) {
    return clamp((x - this.h.startX) / 15000, 0, 1);
  }

  private anchoredToFloat(k: Pickup) {
    for (const f of this.h.platforms) {
      if (f.float && k.x > f.x && k.x < f.x + f.w && k.y > f.y - 36 && k.y < f.y) return true;
    }
    return false;
  }

  private decorate(
    p: Platform,
    gapStart: number,
    gapEnd: number,
    prevY: number,
    pattern: number,
  ) {
    const d = this.diffAtX(p.x);
    const intro = this.genCount < 4;
    const grace = this.genX - this.h.startX < 1000;
    const gap = gapEnd - gapStart;
    const bg = this.biomeAtX(p.x);

    // Exactly ONE coin placement per encounter: the gap arc only appears on rest
    // beats, so it never overlaps with a pattern's own coins.
    if (!intro && pattern === PAT.REST && gap > 34 && this.rand() < 0.6) {
      this.addCoinArc(gapStart + 6, gapEnd - 6, Math.min(prevY, p.y) - 15, 24, gap > 66 ? 4 : 3);
    }

    // Power-ups only appear on wide, calm platforms and are spaced by world
    // distance, so they never create a new procedural jump requirement.
    if (!intro && !grace && pattern === PAT.REST && gap > 34 && p.w >= 100 && p.x >= this.nextPowerUpX)
      this.addPowerUp(p);

    if (!intro) {
      const biomeIndex = this.biomeIndexAtX(p.x);
      if (!this.eventBiomeRolls.has(biomeIndex)) {
        this.eventBiomeRolls.add(biomeIndex);
        if (this.rand() < 0.2)
          this.eventTriggers.push({ x: p.x + 8, kind: bg, used: false });
      }
    }

    if (intro) {
      if (this.genCount === 1) this.addCoinLine(Math.max(p.x + 44, 158), p.x + p.w - 44, p.y - 16, 4);
      if (this.genCount === 2) {
        const bx = p.x + p.w * 0.62;
        this.addBlob(p, bx);
        this.addCoinArc(bx - 22, bx + 24, p.y - 25, 24, 3);
      }
      if (this.genCount === 3) {
        // teach the launch pad: pad + a clean bounce arc landing on this platform
        const sx = p.x + 40;
        const launchVx = this.h.runSpeed();
        this.h.springs.push({ x: sx, y: p.y - 9, press: 0, mega: false, launchVx });
        this.addPadArc(sx, p.y, p.y, PAD_V, launchVx, 4);
      }
      return;
    }

    const center = p.x + p.w * 0.52;

    switch (pattern) {
      case PAT.REST:
        if (gap <= 34 && this.rand() < 0.5) this.addCoinLine(center - 26, center + 26, p.y - 16, 3);
        break;

      case PAT.STOMP: {
        this.addBlob(p, center);
        this.addCoinArc(center - 22, center + 24, p.y - 25, 24, 3);
        if (p.w > (d > 0.7 ? 130 : 165) && this.rand() < (d > 0.7 ? 0.7 : 0.4))
          this.addBlob(p, p.x + p.w * 0.28);
        break;
      }

      case PAT.SPIKES: {
        const roll = this.rand();
        const maxN = d > 0.7 ? 7 : d > 0.6 ? 5 : d > 0.3 ? 4 : 3;
        if (bg === 'desert' && this.rand() < 0.5) {
          this.addSpiker(p, center - 20);
          if (p.w > 185 && this.rand() < 0.5) this.addSpiker(p, center + 40);
        } else if (roll < 0.4 && p.w >= 165) {
          const leftPad = 34;
          const rightPad = 26;
          const a = this.ri(2, Math.min(3, maxN));
          const b = this.ri(1, Math.min(3, maxN));
          const ax = p.x + leftPad;
          const bx = p.x + p.w - rightPad - b * 8;
          this.h.spikes.push({ x: ax, y: p.y - 10, n: a });
          this.h.spikes.push({ x: bx, y: p.y - 10, n: b });
          const mid = (ax + a * 8 + bx) / 2;
          this.addCoinArc(mid - 14, mid + 14, p.y - 27, 22, 2);
        } else {
          const count = this.ri(2, maxN);
          const spikeX = center - count * 4;
          this.h.spikes.push({ x: spikeX, y: p.y - 10, n: count });
          this.addCoinArc(spikeX - 14, spikeX + count * 8 + 14, p.y - 26, 24, 3);
        }
        break;
      }

      case PAT.LAUNCH: {
        break;
      }

      case PAT.MEGA: {
        break;
      }

      case PAT.UPPER: {
        const fw = clamp(p.w - 40, 30, 64);
        const fx = p.x + (p.w - fw) * this.rnd(0.35, 0.6);
        const fy = clamp(
          p.y - this.ri(40, 52),
          Math.max(72, p.y - 55),
          Math.max(VH - 66, p.y - 40),
        );
        this.h.platforms.push({ x: fx, y: fy, w: fw, float: true, seed: this.rand() * 999 });
        this.addCoinLine(fx + 8, fx + fw - 8, fy - 14, 3);
        if (this.rand() < 0.35)
          this.h.pickups.push({ x: fx + fw / 2, y: fy - 30, t: 0, gem: true, dead: false });
        break;
      }

      case PAT.FLYER:
      default: {
        const droneY = clamp(Math.min(prevY, p.y) - this.ri(30, 46), 66, VH - 54);
        this.addFlyer(center, droneY, this.ri(28, 40));
        if (this.rand() < 0.4) this.addCoinLine(center - 22, center + 22, p.y - 16, 3);
        break;
      }
    }
  }

  private padReach(startY: number, landingY: number, v: number, vx: number) {
    let py = startY - 9 - PLAYER_H;
    let vy = -v;
    let dx = 0;
    for (let f = 0; f < TRAJECTORY_FRAMES; f++) {
      vy = Math.min(MAX_FALL, vy + (vy < 0 ? GRAV : GRAV_FALL));
      dx += vx;
      py += vy;
      if (vy > 0 && py + PLAYER_H >= landingY) return dx;
    }
    return dx;
  }

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
    for (let f = 1; f < TRAJECTORY_FRAMES; f++) {
      vy = Math.min(MAX_FALL, vy + (vy < 0 ? GRAV : GRAV_FALL));
      x += vx;
      py += vy;
      if (f % 2 === 0) pts.push(x, py + PLAYER_H / 2);
      if (vy > 0 && py + PLAYER_H >= landingY) break;
    }
    const count = Math.min(n, pts.length >> 1);
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(((i + 0.5) / count) * (pts.length >> 1));
      this.h.pickups.push({
        x: pts[idx * 2],
        y: pts[idx * 2 + 1],
        t: i * 0.6,
        gem: false,
        dead: false,
      });
    }
  }

  // Weighted, non-repeating pattern picker -> a fresh deterministic sequence every run.
  private pickPattern(): number {
    const d = this.diffAtX(this.genX);
    const weights = [
      1.4 - 0.6 * d, // rest thins out as it speeds up
      1.6,
      1.0 + 1.2 * d, // more spikes later
      0.9,
      0.7,
      0.9,
      0.8 + 0.8 * d + (d > 0.8 ? 0.5 : 0),
    ];
    if (this.genX - this.h.startX < 3000) {
      weights[PAT.SPIKES] = 0;
      weights[PAT.FLYER] = 0;
    }
    for (let attempt = 0; attempt < 8; attempt++) {
      let total = 0;
      for (const w of weights) total += w;
      let r = this.rand() * total;
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

  generate(untilX: number) {
    let guard = 0;
    while (this.genX < untilX && guard++ < 60) {
      const d = this.diffAtX(this.genX);
      const intro = this.genCount < 4;
      const grace = this.genX - this.h.startX < 1000;
      const prevEnd = this.genX;
      const prevY = this.lastY;

      const pattern = intro || grace ? PAT.REST : this.pickPattern();

      let y = prevY;
      if (!intro) {
        if (pattern === PAT.LAUNCH) {
          y = clamp(prevY + this.rnd(26, 50), 112, MAX_PLATFORM_Y);
        } else if (pattern === PAT.MEGA) {
          y = clamp(prevY + this.rnd(34, 58), 112, MAX_PLATFORM_Y);
        } else if (pattern === PAT.UPPER) {
          y = clamp(prevY + this.rnd(-10, 18), 98, MAX_PLATFORM_Y);
        } else {
          const dy = this.rnd(-46, 58) * (0.45 + 0.55 * d);
          y = clamp(prevY + dy, 98, MAX_PLATFORM_Y);
          if (y < prevY - 40) y = prevY - 40;
        }
      }

      let gap = 0;
      let launchLandingWidth = 0;
      if (this.genCount === 0) gap = 0;
      else if (intro) gap = 30 + this.genCount * 8;
      else if (pattern === PAT.LAUNCH) {
        const vx = this.h.runSpeed();
        const reach = this.padReach(prevY, y, PAD_V, vx);
        gap = clamp(reach * this.rnd(0.72, 0.8) - 23, 44, 70);
        launchLandingWidth = reach - gap + 12;
      } else if (pattern === PAT.MEGA) {
        const vx = this.h.runSpeed();
        const reach = this.padReach(prevY, y, MEGA_PAD_V, vx);
        gap = clamp(reach * this.rnd(0.74, 0.82) - 23, 74, 108);
        launchLandingWidth = reach - gap + 14;
      } else if (pattern === PAT.UPPER) {
        gap = this.rnd(44, 58);
      } else {
        gap = this.rnd(26 + 10 * d, 42 + 24 * d);
        const rise = prevY - y;
        if (rise > 0) gap *= 1 - 0.55 * (rise / 40);
        else gap *= 1 + 0.2 * (-rise / 58);
        gap = Math.max(24, gap);
        if (pattern === PAT.FLYER) gap = Math.min(gap, 50);
      }

      const x = prevEnd + gap;
      let w: number;
      if (intro) w = this.genCount === 0 ? 380 : 200;
      else if (pattern === PAT.LAUNCH || pattern === PAT.MEGA) w = this.rnd(90, 130);
      else if (pattern === PAT.SPIKES) w = this.rnd(120, 200);
      else if (pattern === PAT.REST) w = this.rnd(80, 130);
      else w = this.rnd(100, 190 - 40 * d);
      if (launchLandingWidth > 0) w = Math.max(w, clamp(launchLandingWidth, 96, 148));
      const p: Platform = { x, y, w, float: false, seed: this.rand() * 999 };
      this.h.platforms.push(p);

      if (!intro && (pattern === PAT.LAUNCH || pattern === PAT.MEGA)) {
        const mega = pattern === PAT.MEGA;
        const sx = prevEnd - (mega ? 30 : 28);
        const v = mega ? MEGA_PAD_V : PAD_V;
        const launchVx = this.h.runSpeed();

        const clearFrom = prevEnd - 118;
        for (let i = this.h.pickups.length - 1; i >= 0; i--) {
          const k = this.h.pickups[i];
          if (k.x > clearFrom && k.x < x + 8 && !this.anchoredToFloat(k))
            this.h.pickups.splice(i, 1);
        }
        let depX = prevEnd - 130;
        for (let i = this.h.platforms.length - 1; i >= 0; i--) {
          const q = this.h.platforms[i];
          if (q.x + q.w > prevEnd - 1 && q.x + q.w < prevEnd + 1) {
            depX = q.x;
            break;
          }
        }
        for (let i = this.h.spikes.length - 1; i >= 0; i--)
          if (this.h.spikes[i].x + this.h.spikes[i].n * 8 > depX - 12)
            this.h.spikes.splice(i, 1);
        for (let i = this.h.enemies.length - 1; i >= 0; i--)
          if (this.h.enemies[i].x + this.h.enemies[i].w > depX - 12)
            this.h.enemies.splice(i, 1);

        this.h.springs.push({ x: sx, y: prevY - 9, press: 0, mega, launchVx });
        this.addPadArc(sx, prevY, y, v, launchVx, mega ? 6 : 4);
      }
      this.decorate(p, prevEnd, x, prevY, pattern);
      this.lastY = y;
      this.genX = x + w;
      this.genCount++;
    }
  }
}
