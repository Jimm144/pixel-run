import { drawText, drawTextCentered, pad, textWidth } from './font';
import { lerpZone, mix, sampleSky, shade, ZONES, type Zone } from './palette';
import { ParticleSystem } from './particles';
import { FloatTexts } from './texts';
import {
  clamp,
  COIN_HW,
  COMBO_TIME,
  GROUND_BOTTOM,
  hash,
  PLAYER_BOOT,
  PLAYER_BOOT_SHOES,
  PLAYER_H,
  PLAYER_RUN_LEGS,
  PLAYER_SCARF,
  PLAYER_SKIN,
  PLAYER_SUIT,
  PLAYER_SUIT_D,
  PLAYER_W,
  PLATFORM_CACHE_PAD,
  POWERUP_COLORS,
  rnd,
  VH,
  VW,
  worldOffsetY,
  wrap,
  type Platform,
  type PowerUpKind,
  type RenderHost,
} from './types';

/** Ground-palette fade granularity — steps of the platform re-bake across
 *  a biome crossfade. Small enough that the steps read as one smooth fade. */
const PLATFORM_FADE_STEPS = 12;

/**
 * Everything that paints a frame: all draw* methods, the baked sprite caches
 * (sun, power-up icons, band tiles, platform art, sky bands, HUD strings) and
 * the zone-derived colour constants. Reads world state through the RenderHost
 * (the Game), writes only `zone` + the platform cache epoch on zone changes.
 */
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private zoneMeters = -1;
  private lastZoneZi = -1;
  private lastZoneT = -1;
  /** Continuous 0..1 crossfade progress into the next biome. */
  private zoneFadeT = 0;
  private transOut: Zone = ZONES[0];
  private transIn: Zone = ZONES[1];
  /** Bumped at each zone boundary; platform caches rebuild against the new
   *  pure palette exactly once (see getPlatformCache). */
  private platformEpoch = 0;
  /** Quantised fade step (0..PLATFORM_FADE_STEPS) — bumps platformEpoch so
   *  the ground palette steps along with the sky during the crossfade. */
  private platformFadeStep = -1;
  private stars: number[] = [];
  private motes: number[] = [];
  private skyBands: string[] = [];
  /** Pre-baked silhouette strip (512px wide). Built once per shape/colour,
   *  then scrolled with integer drawImage offsets — no live sampling, no
   *  subpixel crawl, no antialiased diagonals. */
  private bandCache = new Map<string, HTMLCanvasElement>();
  /** Sun disc + glow, baked whenever the sky palette changes. */
  private sunSprite: HTMLCanvasElement | null = null;
  /** Dark backing + icon per power-up kind, baked once. */
  private powerupSprites = new Map<PowerUpKind, HTMLCanvasElement>();
  private cBolt = shade(ZONES[0].groundDark, -0.3);
  private cStrata1 = mix(ZONES[0].ground, ZONES[0].groundDark, 0.45);
  private cStrata2 = shade(ZONES[0].groundDark, -0.3);
  private cRockA = shade(ZONES[0].ground, -0.16);
  private cRockB = shade(ZONES[0].groundDark, 0.12);
  private cRockLit = shade(ZONES[0].ground, 0.1);
  private cRivet = shade(ZONES[0].accent, -0.35);
  private cCloud = shade(ZONES[0].far, 0.07);
  /** HUD zoom (1 on desktop) — keeps the score/distance text readable on
   *  phones, where the whole canvas is scaled up from a small buffer. */
  private hudScale = 1;
  /** Mobile layout: hides the right-side meters/coins, compacts the score and
   *  lifts the world so the play field sits higher in the view. */
  private mobileView = false;
  /** Extra world translate applied only in mobile view (negative = up). */
  private worldLift = 0;
  // HUD strings are only rebuilt when their values change (perf).
  private hudScore = -1;
  private hudScoreStr = '';
  private hudM = -1;
  private hudMText = '';
  private hudCoins = -1;
  private hudCoinsText = '';

  constructor(
    private g: RenderHost,
    private particles: ParticleSystem,
    private texts: FloatTexts,
  ) {
    this.ctx = g.ctx;
    for (let i = 0; i < 90; i++) {
      this.stars.push(rnd(0, 1400), rnd(2, 140), rnd(0, 6.28), Math.random() < 0.25 ? 2 : 1);
    }
    for (let i = 0; i < 26; i++) {
      this.motes.push(rnd(0, VW), rnd(0, VH), rnd(0.3, 1.1), rnd(0, 6.28));
    }
  }

  /** Re-zero the per-run zone/platform cache state (called from Game.reset). */
  reset() {
    this.zoneMeters = -1;
    this.lastZoneZi = -1;
    this.lastZoneT = -1;
    this.zoneFadeT = 0;
    this.platformEpoch = 0;
    this.platformFadeStep = -1;
  }

  /** Called when the canvas size changes — drops size-dependent art caches. */
  invalidateViewport() {
    this.bandCache.clear();
    for (const p of this.g.platforms) {
      p.cache = undefined;
      p.cacheEpoch = undefined;
    }
  }

  setHudScale(v: number) {
    this.hudScale = Math.max(1, v);
  }

  setMobileView(v: boolean) {
    this.mobileView = v;
    this.worldLift = v ? -22 : 0;
  }

  // Cache every derived platform colour once per zone change (never per frame).
  refreshZoneColors(Z: Zone) {
    this.cBolt = shade(Z.groundDark, -0.3);
    this.cStrata1 = mix(Z.ground, Z.groundDark, 0.45);
    this.cStrata2 = shade(Z.groundDark, -0.3);
    this.cRockA = shade(Z.ground, -0.16);
    this.cRockB = shade(Z.groundDark, 0.12);
    this.cRockLit = shade(Z.ground, 0.1);
    this.cRivet = shade(Z.accent, -0.35);
    this.cCloud = shade(Z.far, 0.07);
    // Band tiles are immutable and keyed by (geometry, pure zone colour) —
    // the fade draws each biome with its own pure colours, so the cache
    // stays bounded (one tile per biome band) and never needs clearing.
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
    c.fillStyle = this.g.zone.sunB;
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
      c.fillStyle = mix(this.g.zone.sunA, this.g.zone.sunB, (y + r) / (2 * r));
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

  render() {
    const c = this.ctx;
    const m = Math.floor(this.g.distance / 10);
    // Continuous crossfade into the next biome: colours, sky and the whole
    // parallax structure morph over the last 8% of a zone (~28m, brisk) and
    // the ground palette steps along with them so nothing snaps at the
    // boundary. The refresh is cheap (band tiles are pure-colour keyed and
    // cached forever), so the fade runs unquantised — no stepping in the sky.
    const df = this.g.distance / 10;
    const zi = Math.floor(df / 350);
    const frac = df / 350 - zi;
    const t = frac > 0.92 ? Math.min(1, (frac - 0.92) / 0.08) : 0;
    if (m !== this.zoneMeters || t !== this.lastZoneT) {
      this.zoneMeters = m;
      this.lastZoneT = t;
      if (zi !== this.lastZoneZi) {
        this.lastZoneZi = zi;
        // Zone name flips while colours keep lerping, so keying the platform
        // cache on the name froze every platform at the half-blended palette.
        // Rebuild platform art at the boundary where the zone is pure.
        this.platformEpoch++;
      }
      const i = this.g.zoneOrder[zi % ZONES.length];
      const ni = this.g.zoneOrder[(zi + 1) % ZONES.length];
      this.g.zone = lerpZone(ZONES[i], ZONES[ni], t);
      this.transOut = ZONES[i];
      this.transIn = ZONES[ni];
      this.zoneFadeT = t;
      this.refreshZoneColors(this.g.zone);
      this.skyBands.length = 0;
      for (let b = 0; b < 15; b++) {
        this.skyBands.push(sampleSky(this.g.zone.sky, (b + 0.5) / 15));
      }
      // Platform art is baked with the palette at bake time. Bump the epoch
      // in quantised steps across the fade so the ground re-bakes with the
      // mid-blend colours and fades like the sky instead of snapping at the
      // boundary — a dozen small steps are invisible as "stepping".
      if (t > 0 && t < 1) {
        const step = Math.floor(t * PLATFORM_FADE_STEPS);
        if (step !== this.platformFadeStep) {
          this.platformFadeStep = step;
          this.platformEpoch++;
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
    // worldLift raises the world on phones so the play field sits higher.
    c.translate(
      Math.round(this.g.shakeX),
      Math.round(this.g.shakeY) + worldOffsetY() + this.worldLift,
    );
    this.drawParallax();
    this.drawWorld();
    this.particles.draw(c, this.g.camX);
    if (this.g.phase !== 'dead') this.drawPlayer();
    this.texts.draw(c, this.g.camX);
    c.restore();

    this.drawForeground();
    this.drawHud();

    if (this.g.flash > 0.002) {
      c.globalAlpha = Math.min(1, this.g.flash);
      c.fillStyle = this.g.flashCol;
      c.fillRect(0, 0, VW, VH);
      c.globalAlpha = 1;
    }

    if ((this.g.countdown > 0 || this.g.goTimer > 0) && this.g.phase !== 'dead') this.drawCountdown();
  }

  private drawCountdown() {
    const c = this.ctx;
    c.fillStyle = 'rgba(8,4,15,0.45)';
    c.fillRect(0, 0, VW, VH);
    const go = this.g.goTimer > 0;
    const n = Math.ceil(this.g.countdown / 60); // 3,2,1
    const label = go ? 'GO' : String(n);
    // Fixed size — no growth. Only a crisp alpha fade for tick feedback.
    const col = go ? this.g.zone.accent : '#ffffff';
    const within = go ? this.g.goTimer / 15 : ((this.g.countdown - 1) % 60) / 60; // 1 -> 0 across each second
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
    const sunX = (((300 - this.g.camX * 0.04) % period) + period) % period - 70;
    if (this.sunSprite) {
      // Mobile: low behind the mountains — only its top peeks over them.
      c.drawImage(this.sunSprite, Math.round(sunX) - 32, (this.mobileView ? 100 : 68) - 32);
    }
    // stars
    c.fillStyle = this.g.zone.star;
    for (let i = 0; i < this.stars.length; i += 4) {
      const sx = this.stars[i];
      const sy = this.stars[i + 1];
      const ph = this.stars[i + 2];
      const sz = this.stars[i + 3];
      const x = ((sx - this.g.camX * 0.06) % 1400 + 1400) % 1400;
      if (x > VW) continue;
      const tw = Math.sin(this.g.frame * 0.05 + ph);
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
    let ox = Math.floor(this.g.camX * spd) % tw;
    if (ox < 0) ox += tw;
    const c = this.ctx;
    // Two blits cover the full viewport as the tile wraps.
    c.drawImage(tile, -ox, 0);
    c.drawImage(tile, -ox + tw, 0);
  }

  private drawParallax() {
    const c = this.ctx;

    // soft distant clouds — always subtle, low contrast
    c.globalAlpha = 0.6;
    c.fillStyle = this.cCloud;
    for (let i = 0; i < 4; i++) {
      const cw = 46 + ((i * 37) % 30);
      const x = ((i * 340 + 20 - this.g.camX * 0.1) % 1500 + 1500) % 1500;
      if (x > VW + 60) continue;
      const y = 36 + ((i * 53) % 54);
      c.fillRect(Math.round(x), y, cw, 4);
      c.fillRect(Math.round(x + 10), y - 3, cw - 26, 3);
    }
    c.globalAlpha = 1;

    // Biome structure crossfade: outside the transition window one layer is
    // drawn; inside it the outgoing biome is drawn fully and the incoming one
    // fades in on top — a clean weighted blend with no sky bleed-through.
    const t = this.zoneFadeT;
    if (t <= 0 || t >= 1) {
      this.drawParallaxLayer(this.g.zone, 1);
    } else {
      this.drawParallaxLayer(this.transOut, 1);
      this.drawParallaxLayer(this.transIn, t);
    }
  }

  // One biome's far band + landmark rows. alpha blends the layer over what is
  // already on screen (used to crossfade the old biome out / new one in).
  private drawParallaxLayer(Z: Zone, alpha: number) {
    const c = this.ctx;
    const bg = Z.bg;
    const back = mix(Z.far, Z.mid, 0.5);
    c.globalAlpha = alpha;
    // Mobile view spreads the planes: the ridge sits higher and the landmark
    // rows sink, giving each parallax layer clear vertical breathing room.
    const m = this.mobileView;
    if (bg === 'jungle') {
      this.seeBand(0.12, m ? 116 : 120, m ? 40 : 30, 0.02, 0.15, 0, Z.far);
      this.drawLandmarks(Z, back, 0.19, m ? 124 : 142, 47, 29, Z.decoMid, m ? 0.8 : 0.65);
      this.drawLandmarks(Z, Z.mid, 0.28, m ? 158 : 160, 56, 73, Z.decoMid, 1);
    } else if (bg === 'desert') {
      this.seeBand(0.12, m ? 120 : 124, m ? 40 : 24, 0.014, 0.08, 0, Z.far);
      this.drawLandmarks(Z, back, 0.19, m ? 126 : 144, 72, 23, Z.decoMid, m ? 0.8 : 0.65);
      this.drawLandmarks(Z, Z.mid, 0.28, m ? 160 : 162, 84, 67, Z.decoMid, 1);
    } else if (bg === 'tundra') {
      this.seeBand(0.11, m ? 116 : 118, m ? 40 : 30, 0.018, 1.6, 0.5, Z.far);
      this.drawLandmarks(Z, back, 0.18, m ? 126 : 144, 53, 41, Z.decoMid, m ? 0.8 : 0.65);
      this.drawLandmarks(Z, Z.mid, 0.28, m ? 160 : 162, 58, 59, Z.decoMid, 1);
    } else {
      this.seeBand(0.13, m ? 118 : 122, m ? 40 : 38, 0.05, 0.2, 0.9, Z.far);
      this.drawLandmarks(Z, back, 0.18, m ? 124 : 142, 55, 19, Z.decoFar, m ? 0.8 : 0.7);
      this.drawLandmarks(Z, Z.mid, 0.28, m ? 158 : 160, 62, 37, Z.decoFar, 1);
    }
    c.globalAlpha = 1;
  }

  // Grounded landmark silhouettes — trees / cacti / icebergs / buildings share
  // one calm treeline base so nothing floats and everything reads as a set.
  private drawLandmarks(
    Z: Zone,
    col: string,
    spd: number,
    baseY: number,
    spacing: number,
    seedStep: number,
    tipCol: string,
    scale = 1,
  ) {
    const c = this.ctx;
    const bg = Z.bg;

    // Flat grounded strip under landmarks — integer-scrolled, no live sampling.
    // Landmarks sit on a fixed baseY so they never swim relative to the ground.
    c.fillStyle = col;
    c.fillRect(0, Math.round(baseY), VW, VH + 40 - Math.round(baseY));

    const cam = Math.floor(this.g.camX * spd);
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
    const Z = this.g.zone;
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
    const cam = Math.round(this.g.camX);

    /* platforms — one drawImage() per platform, artwork pre-baked */
    for (const p of this.g.platforms) {
      const x = Math.floor(p.x - cam);
      if (x > VW + 4 || x + p.w < -4) continue;
      const y = Math.round(p.y);
      const cache = this.getPlatformCache(p);
      c.drawImage(cache, x, y - PLATFORM_CACHE_PAD);
    }

    /* springs */
    for (const s of this.g.springs) {
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
        c.globalAlpha = 0.3 + 0.25 * Math.sin(this.g.frame * 0.18);
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
    for (const s of this.g.spikes) {
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
    for (const k of this.g.pickups) {
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
        const Z = this.g.zone;
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
    for (const power of this.g.powerups) {
      if (power.dead) continue;
      const x = Math.round(power.x - cam);
      if (x > VW + 14 || x < -14) continue;
      const y = Math.round(power.y - Math.max(0, Math.sin(power.t)) * 2);
      const col = POWERUP_COLORS[power.kind];
      const pulse = 0.28 + (Math.sin(power.t * 1.7) + 1) * 0.1;
      c.globalAlpha = pulse;
      c.fillStyle = col;
      c.fillRect(x - 9, y - 9, 18, 18);
      c.globalAlpha = 1;
      c.drawImage(this.powerupSprite(power.kind), x - 9, y - 9);
    }

    /* enemies */
    const Z = this.g.zone;
    for (const e of this.g.enemies) {
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
    if (this.g.shielded) {
      c.globalAlpha = 0.12;
      c.fillStyle = '#7ef7ff';
      c.fillRect(cx - 7, cy - 7, 14, 14);
      c.globalAlpha = 0.62 + 0.12 * Math.sin(this.g.frame * 0.16);
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
    if (this.g.tripleJump > 0) {
      c.fillStyle = '#c98cff';
      c.fillRect(cx - 5, cy - 11, 2, 2);
      c.fillRect(cx - 1, cy - 13, 2, 2);
      c.fillRect(cx + 3, cy - 11, 2, 2);
    }
    if (this.g.propellerHat > 0 || this.g.propellerFlashing) {
      const flash = this.g.propellerFlashing && Math.sin(this.g.frame * 0.75) > 0;
      c.fillStyle = flash ? '#ffffff' : '#b32a4d';
      c.fillRect(cx - 4, cy - 10, 8, 2);
      // One row taller than the old band so the mast touches the dot above.
      c.fillRect(cx - 2, cy - 13, 4, 3);
      c.fillStyle = flash ? '#ffffff' : '#7ef7ff';
      c.fillRect(cx - 8, cy - 15, 7, 2);
      c.fillRect(cx + 1, cy - 15, 7, 2);
      // Wider stub (4px, matches band) reaching down to the wings.
      c.fillRect(cx - 2, cy - 19, 4, 5);
      c.fillStyle = '#ffffff';
      c.fillRect(cx - 1, cy - 15, 2, 2);
    }
  }

  private drawPlayer() {
    const c = this.ctx;
    const cam = Math.round(this.g.camX);

    /* landing shadow — helps judge jumps */
    const foot = this.g.py + PLAYER_H;
    const mid = this.g.px + PLAYER_W / 2;
    let land = Infinity;
    for (const p of this.g.platforms) {
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
    for (const g of this.g.ghosts) {
      c.globalAlpha = (g.life / 14) * 0.28;
      c.fillStyle = '#7ef7ff';
      c.fillRect(Math.round(g.x - cam), Math.round(g.y), PLAYER_W, PLAYER_H);
    }
    c.globalAlpha = 1;

    /* player body */
    const cx = Math.round(this.g.px - cam + PLAYER_W / 2);
    const cy = Math.round(this.g.py + PLAYER_H / 2);
    const qx = Math.abs(this.g.sx - 1) < 0.05 ? 1 : this.g.sx;
    const qy = Math.abs(this.g.sy - 1) < 0.05 ? 1 : this.g.sy;
    c.save();
    c.translate(cx, cy);
    if (this.g.spin > 0) c.rotate(this.g.spin * Math.PI * 2);
    if (qx !== 1 || qy !== 1) c.scale(qx, qy);
    const run = this.g.onGround ? Math.floor(this.g.animT) % 4 : -1;
    const air = !this.g.onGround;
    const f = (x: number, y: number, w: number, h: number, col: string) => {
      c.fillStyle = col;
      c.fillRect(x - PLAYER_W / 2, y - PLAYER_H / 2, w, h);
    };
    const flashing = this.g.invuln > 0;
    const flash = flashing ? 0.35 + (Math.sin(this.g.frame * 0.75) + 1) * 0.325 : 0;
    const tint = (base: string, extra?: string) => {
      if (!flashing) return extra ?? base;
      return mix(extra ?? base, '#ffffff', flash);
    };
    const SUIT = tint(PLAYER_SUIT);
    const SUIT_D = tint(PLAYER_SUIT_D);
    const SKIN = tint(PLAYER_SKIN);
    const BOOT = tint(PLAYER_BOOT, this.g.jumpShoes > 0 ? PLAYER_BOOT_SHOES : PLAYER_BOOT);

    // legs
    if (this.g.diving) {
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
    if (this.g.py + PLAYER_H < 4) {
      const ix = Math.round(this.g.px - cam + PLAYER_W / 2);
      c.fillStyle = '#ffffff';
      c.fillRect(ix - 3, 4, 7, 2);
      c.fillRect(ix - 2, 2, 5, 2);
      c.fillRect(ix - 1, 0, 3, 2);
    }
  }

  private drawBiomeEvent() {
    if (this.g.eventTimer <= 0 || this.g.eventMax <= 0) return;
    const c = this.ctx;
    const fade = Math.min(1, (this.g.eventMax - this.g.eventTimer) / 24, this.g.eventTimer / 24);
    const strength = 0.25 + 0.75 * Math.max(0, fade);
    const alpha = 0.2 * strength;
    const Z = this.g.zone;

    if (this.g.eventKind === 'desert') {
      c.globalAlpha = 0.1 * strength;
      c.fillStyle = Z.sunB;
      c.fillRect(0, 0, VW, VH);
    } else if (this.g.eventKind === 'tundra') {
      c.globalAlpha = 0.13 * strength;
      c.fillStyle = '#dff6ff';
      c.fillRect(0, 0, VW, VH);
    }

    if (this.g.eventKind === 'jungle') {
      for (let i = 0; i < 22; i++) {
        const x = wrap(hash(this.g.eventSeed + i * 7.1) * (VW + 30) - this.g.frame * (0.45 + (i % 3) * 0.12), VW + 30) - 15;
        const y = 24 + hash(this.g.eventSeed + i * 13.7) * Math.max(80, VH * 0.7);
        c.globalAlpha = alpha * (0.65 + 0.35 * Math.sin(this.g.frame * 0.08 + i));
        c.fillStyle = i % 3 === 0 ? Z.accent : Z.deco;
        c.fillRect(Math.round(x), Math.round(y), i % 4 === 0 ? 3 : 2, 1);
        if (i % 5 === 0) c.fillRect(Math.round(x + 1), Math.round(y + 1), 1, 2);
      }
    } else if (this.g.eventKind === 'desert') {
      for (let i = 0; i < 20; i++) {
        const x = wrap(this.g.frame * (1.4 + i * 0.08) + this.g.eventSeed + i * 31, VW + 64) - 32;
        const y = 24 + hash(this.g.eventSeed + i * 9.3) * Math.max(90, VH - 48);
        const len = 10 + Math.round(hash(this.g.eventSeed + i * 5.2) * 24);
        c.globalAlpha = alpha * 0.9;
        c.fillStyle = i % 2 ? Z.coinFill : Z.deco;
        c.fillRect(Math.round(x), Math.round(y), len, 1);
        if (i % 4 === 0) c.fillRect(Math.round(x + len * 0.35), Math.round(y + 1), 6, 1);
      }
    } else if (this.g.eventKind === 'tundra') {
      for (let i = 0; i < 120; i++) {
        const x = wrap(hash(this.g.eventSeed + i * 4.2) * VW - this.g.frame * (0.5 + (i % 4) * 0.12), VW);
        const y = wrap(hash(this.g.eventSeed + i * 11.6) * (VH + 30) + this.g.frame * (1.1 + (i % 3) * 0.22), VH + 30) - 15;
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
      const x = ((this.motes[i] - this.g.camX * spd * 0.5) % VW + VW) % VW;
      const y = this.motes[i + 1] + Math.sin(this.g.frame * 0.02 + this.motes[i + 3]) * 6;
      c.globalAlpha = 0.12 + 0.12 * spd;
      c.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
    c.globalAlpha = 1;
    // speed lines
    const sp = this.g.vx;
    if (sp > 3.2 && this.g.phase === 'playing') {
      c.fillStyle = '#ffffff';
      for (let i = 0; i < 5; i++) {
        const y = (hash(i * 12.3 + Math.floor(this.g.frame / 7)) * VH) | 0;
        const len = 14 + hash(i + this.g.frame) * 26;
        const x = ((this.g.frame * -9 - i * 90) % (VW + 80) + VW + 80) % (VW + 80);
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
    // HUD space is scaled by hudScale; W is the virtual width in that space.
    // Mobile gives the row a little more air below the compacted BEST line.
    const y = this.mobileView ? 50 : 45;
    const W = Math.floor(VW / this.hudScale);
    const status = (remaining: number, kind: PowerUpKind) => {
      // The propeller flashes with 0s left — draw the icon alone, no "0".
      const text = remaining > 0 ? String(Math.ceil(remaining / 60)) : '';
      const width = textWidth(text, 1) + 12;
      if (x + width > W - 6) return;
      const col = POWERUP_COLORS[kind];
      c.fillStyle = col;
      if (kind === 'shield') {
        c.fillRect(x, y, 4, 1);
        c.fillRect(x - 1, y + 1, 6, 1);
        c.fillRect(x - 1, y + 2, 6, 1);
        c.fillRect(x - 1, y + 3, 6, 1);
        c.fillRect(x, y + 4, 4, 1);
        c.fillRect(x + 1, y + 5, 2, 1);
      } else if (kind === 'shoes') {
        c.fillRect(x, y + 3, 3, 2);
        c.fillRect(x, y + 1, 2, 2);
        c.fillRect(x + 4, y + 3, 3, 2);
        c.fillRect(x + 4, y + 1, 2, 2);
      } else if (kind === 'triple') {
        // three wings, each with a stem below — same shape as the pickup
        c.fillRect(x, y, 3, 1);
        c.fillRect(x + 1, y + 1, 1, 2);
        c.fillRect(x + 4, y + 2, 3, 1);
        c.fillRect(x + 5, y + 3, 1, 2);
        c.fillRect(x + 8, y + 4, 3, 1);
        c.fillRect(x + 9, y + 5, 1, 2);
      } else {
        // propeller — 3-blade rotor, same shape as the pickup sprite
        c.fillRect(x + 4, y, 1, 3);
        c.fillRect(x + 3, y + 2, 3, 3);
        c.fillRect(x + 2, y + 3, 2, 1);
        c.fillRect(x + 5, y + 3, 2, 1);
      }
      if (text) drawText(c, text, x + 9, y, 1, col, '#150a24');
      x += width + 4;
    };
    if (this.g.shielded) status(this.g.shieldTimer, 'shield');
    if (this.g.jumpShoes > 0) status(this.g.jumpShoes, 'shoes');
    if (this.g.tripleJump > 0) status(this.g.tripleJump, 'triple');
    if (this.g.propellerHat > 0 || this.g.propellerFlashing) status(this.g.propellerHat, 'propeller');
  }

  private drawHud() {
    const c = this.ctx;
    if (this.g.phase === 'ready') return;
    const m = Math.floor(this.g.distance / 10);
    // The HUD draws in its own scaled space so the text zooms up on phones
    // while the world keeps its pixel grid; W is the virtual width there.
    const hs = this.hudScale;
    const mobile = this.mobileView;
    // Mobile: score/best shrink so the top-center combo banner stays clear.
    const lblS = mobile ? 0.75 : 1;
    const digS = mobile ? 1.5 : 2;
    const bestS = mobile ? 0.75 : 1;
    const bestY = mobile ? 30 : 32;
    const adv = 6 * digS;
    c.save();
    if (hs !== 1) c.scale(hs, hs);
    const W = Math.floor(VW / hs);

    // score — only rebuild the padded strings when the values change
    drawText(c, 'SCORE', 6, 6, lblS, this.g.zone.accent2, '#150a24');
    if (this.hudScore !== this.g.score) {
      this.hudScore = this.g.score;
      this.hudScoreStr = pad(this.g.score, 6);
    }
    const scoreStr = this.hudScoreStr;
    let leadingZeroes = 0;
    while (leadingZeroes < scoreStr.length && scoreStr[leadingZeroes] === '0') leadingZeroes++;
    if (leadingZeroes > 0) {
      c.globalAlpha = 0.35;
      drawText(c, scoreStr.slice(0, leadingZeroes), 6, 15, digS, '#ffffff', '#150a24');
      c.globalAlpha = 1;
    }
    drawText(c, scoreStr.slice(leadingZeroes), 6 + leadingZeroes * adv, 15, digS, '#ffffff', '#150a24');

    // best
    if (this.g.best > 0) {
      drawText(c, 'BEST', 6, bestY, bestS, this.g.zone.accent, '#150a24');
      drawText(c, pad(this.g.best, 6), 36, bestY, bestS, this.g.zone.accent, '#150a24');
    }
    this.drawPowerUpHud();

    // distance + coins (right) — mobile keeps the top-right corner clean
    if (!mobile) {
      if (this.hudM !== m) {
        this.hudM = m;
        this.hudMText = m + 'M';
      }
      const dtxt = this.hudMText;
      drawText(c, dtxt, W - 6 - textWidth(dtxt, 2), 6, 2, this.g.zone.accent, '#150a24');
      if (this.hudCoins !== this.g.coins) {
        this.hudCoins = this.g.coins;
        this.hudCoinsText = 'X' + pad(this.g.coins, 3);
      }
      const ctxt = this.hudCoinsText;
      const cw = textWidth(ctxt, 1) + 10;
      const cx0 = W - 6 - cw;
      // HUD coin matches world coin shape per biome
      if (this.g.zone.bg === 'tundra') {
        c.fillStyle = this.g.zone.coinEdge;
        c.fillRect(cx0, 22, 8, 7);
        c.fillStyle = this.g.zone.coinFill;
        c.fillRect(cx0 + 1, 23, 6, 5);
        c.fillStyle = this.g.zone.coinShine;
        c.fillRect(cx0 + 3, 22, 2, 1);
        c.fillRect(cx0 + 3, 29, 2, 1);
        c.fillRect(cx0, 25, 1, 2);
        c.fillRect(cx0 + 7, 25, 1, 2);
      } else if (this.g.zone.bg === 'desert') {
        c.fillStyle = this.g.zone.coinEdge;
        c.fillRect(cx0, 23, 7, 7);
        c.fillStyle = this.g.zone.coinFill;
        c.fillRect(cx0, 23, 7, 6);
        c.fillStyle = this.g.zone.coinShine;
        c.fillRect(cx0 + 1, 24, 1, 3);
        c.fillRect(cx0 - 1, 22, 1, 1);
        c.fillRect(cx0 + 7, 22, 1, 1);
        c.fillRect(cx0 - 1, 30, 1, 1);
        c.fillRect(cx0 + 7, 30, 1, 1);
      } else if (this.g.zone.bg === 'jungle') {
        // fruit coin — round (matches world coin shape), stem aligned with the
        // other biome icons' tops (y 22) so the icon doesn't sit higher.
        c.fillStyle = this.g.zone.coinEdge;
        c.fillRect(cx0 + 1, 24, 6, 1);
        c.fillRect(cx0, 25, 8, 5);
        c.fillRect(cx0 + 1, 30, 6, 1);
        c.fillStyle = this.g.zone.coinFill;
        c.fillRect(cx0 + 1, 25, 6, 4);
        c.fillStyle = this.g.zone.coinShine;
        c.fillRect(cx0 + 2, 26, 2, 2);
        c.fillStyle = this.g.zone.accent2;
        c.fillRect(cx0 + 3, 22, 1, 2);
        c.fillRect(cx0 + 4, 22, 2, 1);
      } else {
        c.fillStyle = this.g.zone.coinEdge;
        c.fillRect(cx0, 23, 7, 7);
        c.fillStyle = this.g.zone.coinFill;
        c.fillRect(cx0, 23, 7, 6);
        c.fillStyle = this.g.zone.coinShine;
        c.fillRect(cx0 + 1, 24, 1, 3);
      }
      drawText(c, ctxt, cx0 + 10, 23, 1, this.g.zone.coinFill, '#150a24');
    }

    // combo — fixed layout, colour-only pulse (no size jitter). Mobile sits
    // it right-aligned, just below the touch pause button.
    if (mobile) {
      c.restore();
      this.drawCombo(VW - 45, 46);
    } else {
      this.drawCombo(W / 2, 8);
      c.restore();
    }
  }

  private drawCombo(labelCenterX: number, y: number) {
    if (this.g.combo <= 1) return;
    const c = this.ctx;
    const t = this.g.comboT / COMBO_TIME;
    const label = 'X' + this.g.mult() + ' COMBO ' + this.g.combo;
    const flash = this.g.comboPulse;
    const col = flash > 0.4 ? '#ffffff' : '#ffd166';
    const bw = 78;
    drawTextCentered(c, label, labelCenterX, y, 1, col, '#150a24');
    c.fillStyle = '#150a24';
    c.fillRect(labelCenterX - bw / 2 - 1, y + 10, bw + 2, 5);
    c.fillStyle = t > 0.3 ? this.g.zone.accent : '#ff4d6d';
    c.fillRect(labelCenterX - bw / 2, y + 11, Math.round(bw * t), 3);
  }
}
