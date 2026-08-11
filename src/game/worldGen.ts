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
  rnd,
  ri,
  VH,
  type BiomeEventTrigger,
  type EnemyKind,
  type GenHost,
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

/**
 * Procedural world builder: emits platforms, pickups, power-ups, enemies,
 * spikes and springs into the host's arrays. Owns its generation cursor
 * (genX/genCount/…) and the biome-event trigger list it plants.
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

  // Follows the true jump/fall arc so coins always sit exactly where you travel.
  private addCoinArc(x0: number, x1: number, topY: number, arcH = 26, n = 4) {
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const y = topY - Math.sin(t * Math.PI) * arcH;
      this.h.pickups.push({ x: x0 + (x1 - x0) * t, y, t: rnd(0, 6), gem: false, dead: false });
    }
  }

  private addCoinLine(x0: number, x1: number, y: number, max = 4) {
    const n = clamp(Math.floor((x1 - x0) / 26) + 1, 2, max);
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      this.h.pickups.push({ x: x0 + (x1 - x0) * t, y, t: i * 0.7, gem: false, dead: false });
    }
  }

  private blobKind(): EnemyKind {
    if (this.h.zone.bg === 'jungle') return this.genCount % 2 === 0 ? 'slime' : 'hopper';
    if (this.h.zone.bg === 'desert') return this.genCount % 2 === 0 ? 'scarab' : 'slime';
    return 'slime';
  }

  private addBlob(p: Platform, x: number) {
    const kind = this.blobKind();
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
    const kinds: PowerUpKind[] = ['shield', 'shoes', 'triple', 'propeller'];
    let kind = kinds[ri(0, kinds.length - 1)];
    if (kind === this.lastPowerUpKind) kind = kinds[(kinds.indexOf(kind) + ri(1, kinds.length - 1)) % kinds.length];
    this.lastPowerUpKind = kind;
    return kind;
  }

  private addPowerUp(p: Platform) {
    const kind = this.pickPowerUp();
    this.h.powerups.push({
      x: p.x + p.w * 0.52,
      y: p.y - 9,
      t: rnd(0, 6),
      kind,
      dead: false,
    });
    this.nextPowerUpX = p.x + rnd(720, 980);
  }

  private biomeIndexAtX(x: number) {
    return Math.floor(Math.max(0, x - this.h.startX) / 3500);
  }

  private biomeAtX(x: number): BgKind {
    const index = this.biomeIndexAtX(x);
    return ZONES[this.h.zoneOrder[index % ZONES.length]].bg;
  }

  private decorate(
    p: Platform,
    gapStart: number,
    gapEnd: number,
    prevY: number,
    pattern: number,
  ) {
    const d = this.h.diff();
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
        const launchVx = this.h.runSpeed();
        this.h.springs.push({ x: sx, y: p.y - 9, press: 0, mega: false, launchVx });
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
        if (this.h.zone.bg === 'desert' && Math.random() < 0.5) {
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
          this.h.spikes.push({ x: ax, y: p.y - 10, n: a });
          this.h.spikes.push({ x: bx, y: p.y - 10, n: b });
          const mid = (ax + a * 8 + bx) / 2;
          this.addCoinArc(mid - 14, mid + 14, p.y - 27, 22, 2);
        } else {
          const count = ri(2, maxN);
          const spikeX = center - count * 4;
          this.h.spikes.push({ x: spikeX, y: p.y - 10, n: count });
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
        this.h.platforms.push({ x: fx, y: fy, w: fw, float: true, seed: Math.random() * 999 });
        this.addCoinLine(fx + 8, fx + fw - 8, fy - 14, 3);
        if (Math.random() < 0.35)
          this.h.pickups.push({ x: fx + fw / 2, y: fy - 30, t: 0, gem: true, dead: false });
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
      this.h.pickups.push({
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
    const d = this.h.diff();
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

  generate(untilX: number) {
    let guard = 0;
    while (this.genX < untilX && guard++ < 60) {
      const d = this.h.diff();
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
        const vx = this.h.runSpeed();
        const reach = this.padReach(prevY, y, PAD_V, vx);
        gap = clamp(reach * rnd(0.72, 0.8) - 23, 44, 70);
        launchLandingWidth = reach - gap + 12;
      } else if (pattern === PAT.MEGA) {
        const vx = this.h.runSpeed();
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
      this.h.platforms.push(p);

      // A launch encounter belongs to the gap just generated. Put the pad on
      // the departure edge and build its coin path to this exact landing.
      if (!intro && (pattern === PAT.LAUNCH || pattern === PAT.MEGA)) {
        const mega = pattern === PAT.MEGA;
        const sx = prevEnd - (mega ? 30 : 28);
        const v = mega ? MEGA_PAD_V : PAD_V;
        const launchVx = this.h.runSpeed();

        // The launch is the only pickup read in this space. Remove a previous
        // pattern's nearby coins/hazards so the departure edge stays legible.
        const clearFrom = prevEnd - 118;
        for (let i = this.h.pickups.length - 1; i >= 0; i--)
          if (this.h.pickups[i].x > clearFrom && this.h.pickups[i].x < x + 8)
            this.h.pickups.splice(i, 1);
        for (let i = this.h.spikes.length - 1; i >= 0; i--)
          if (this.h.spikes[i].x + this.h.spikes[i].n * 8 > prevEnd - 54)
            this.h.spikes.splice(i, 1);
        for (let i = this.h.enemies.length - 1; i >= 0; i--)
          if (this.h.enemies[i].x + this.h.enemies[i].w > prevEnd - 48)
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
