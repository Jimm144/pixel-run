import { drawText, drawTextCentered, pad, textWidth } from './font';
import { lerpZone, mix, sampleSky, shade, ZONES, type Zone } from './palette';
import { ParticleSystem } from './particles';
import { FloatTexts } from './texts';
import { SKINS, type SkinDef } from './skins';
import { drawPlayerSprite } from './playerSprite';
import {
  clamp,
  COIN_HW,
  COMBO_TIME,
  FADE_START_FRAC,
  FADE_WINDOW,
  GROUND_BOTTOM,
  hash,
  PLAYER_H,
  PLAYER_W,
  PLATFORM_CACHE_PAD,
  POWERUP_COLORS,
  rnd,
  VH,
  VW,
  worldOffsetY,
  wrap,
  ZONE_LEN_M,
  type Enemy,
  type Platform,
  type PowerUpKind,
  type RenderHost,
} from './types';

/** Palette-fade granularity — the biome blend re-bakes in this many steps
 *  (sky, sun, ground art and HUD colours all step together). Small enough
 *  that the steps read as one smooth fade. */
const FADE_STEPS = 12;

/**
 * Everything that paints a frame: all draw* methods, the baked sprite caches
 * (sun, power-up icons, band tiles, platform art, sky bands, HUD strings) and
 * the zone-derived colour constants. Reads world state through the RenderHost
 * (the Game), writes only `zone` + the platform crossfade pair on zone changes.
 */
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private lastZoneZi = -1;
  private lastZoneT = -1;
  /** Continuous 0..1 crossfade progress into the next biome (used only for
   *  the parallax layer alpha — the palette itself steps at FADE_STEPS). */
  private zoneFadeT = 0;
  private transOut: Zone = ZONES[0];
  private transIn: Zone = ZONES[1];
  /** Pure-biome zoneOrder indices the platform art is baked against. A
   *  transition bakes every platform exactly twice (once per pure biome) and
   *  crossfades the two, so there are no per-fade-step rebakes. */
  private platI = 0;
  private platNI = 1;
  /** Platform art keyed by `zoneIndex|seed|w|float|y` — one bake per pure
   *  biome per platform, reused until the zone pair changes. */
  private platformCaches = new Map<string, HTMLCanvasElement>();
  private stars: [x: number, y: number, phase: number, size: number][] = [];
  private motes: [x: number, y: number, spd: number, phase: number][] = [];
  /** Pre-baked silhouette strip (512px wide). Built once per shape/colour,
   *  then scrolled with integer drawImage offsets — no live sampling, no
   *  subpixel crawl, no antialiased diagonals. */
  private bandCache = new Map<string, HTMLCanvasElement>();
  /** Sun disc, baked whenever the sky palette changes. */
  private sunSprite: HTMLCanvasElement | null = null;
  /** Moon phase sprites (Full -> Waning Gibbous -> Half -> Crescent -> Eclipse), baked whenever the sky palette changes. */
  private moonPhaseSprites: HTMLCanvasElement[] = [];
  /** Dark backing + icon per power-up kind, baked once. */
  private powerupSprites = new Map<PowerUpKind, HTMLCanvasElement>();
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
  private hudBest = -1;
  private hudBestStr = '';
  private hudM = -1;
  private hudMText = '';
  private hudGems = -1;
  private hudGemsText = '';
  private hudComboKey = '';
  private hudComboStr = '';
  /** Per-opponent smoothed render positions (opponent px/py only move on tick
   *  arrival every ~33-66ms; exponential lerp hides the steps). */
  private oppSmooth = new Map<string, { x: number; y: number }>();

  constructor(
    private g: RenderHost,
    private particles: ParticleSystem,
    private texts: FloatTexts,
  ) {
    this.ctx = g.ctx;
    for (let i = 0; i < 90; i++) {
      this.stars.push([rnd(0, 1400), rnd(2, 140), rnd(0, 6.28), Math.random() < 0.25 ? 2 : 1]);
    }
    for (let i = 0; i < 26; i++) {
      this.motes.push([rnd(0, VW), rnd(0, VH), rnd(0.3, 1.1), rnd(0, 6.28)]);
    }
  }

  /** Re-zero the per-run zone/platform cache state (called from Game.reset). */
  reset() {
    this.lastZoneZi = -1;
    this.lastZoneT = -1;
    this.zoneFadeT = 0;
    this.platI = 0;
    this.platNI = 1;
    this.platformCaches.clear();
    this.oppSmooth.clear();
  }

  /** Called when the canvas size changes — drops the size-dependent art
   *  caches (band tiles are baked VH-tall); platform art is rebuilt for
   *  safety even though its height comes from the constant ground line. */
  invalidateViewport() {
    this.bandCache.clear();
    this.platformCaches.clear();
    // Re-seed the motes so a viewport shrink doesn't leave most of them
    // below the visible area (they were sampled once against the old VH),
    // and so a viewport grow doesn't leave them clustered on the old left edge.
    for (const m of this.motes) {
      m[0] = rnd(0, VW);
      m[1] = rnd(0, VH);
    }
  }

  setHudScale(v: number) {
    // Keep the HUD transform on the pixel grid. The canvas itself may still
    // use a fractional CSS fit scale, but its logical HUD raster stays crisp.
    this.hudScale = Math.max(1, Math.round(v));
  }

  setMobileView(v: boolean) {
    this.mobileView = v;
    this.worldLift = v ? -22 : 0;
  }

  // Cache every derived platform colour once per zone change (never per frame).
  refreshZoneColors(_Z: Zone) {
    // Band tiles are immutable and keyed by (geometry, pure zone colour) —
    // the fade draws each biome with its own pure colours, so the cache
    // stays bounded (one tile per biome band) and never needs clearing.
    this.bakeSun();
    this.bakeMoonPhases();
  }

  private bakeSun() {
    const gr = 32;
    const size = gr * 2 + 1;
    const cv = document.createElement('canvas');
    cv.width = size;
    cv.height = size;
    const c = cv.getContext('2d')!;
    const r = 24;
    for (let y = -r; y <= r; y++) {
      const hw = Math.round(Math.sqrt(Math.max(0, r * r - y * y)));
      if (hw < 2) continue;
      c.fillStyle = mix(this.g.zone.sunA, this.g.zone.sunB, (y + r) / (2 * r));
      c.fillRect(gr - hw, gr + y, hw * 2, 1);
    }
    this.sunSprite = cv;
  }

  private bakeMoonPhases() {
    const gr = 32;
    const size = gr * 2 + 1;
    const r = 24;
    this.moonPhaseSprites = [];

    // Progressive phase angles: Full (0), Waning Gibbous (0.33π), Half Moon (0.5π), Waning Crescent (0.67π), Blood Eclipse (π)
    const phaseAngles = [
      0,
      Math.PI * 0.33,
      Math.PI * 0.5,
      Math.PI * 0.67,
      Math.PI,
    ];

    for (let phase = 0; phase < 5; phase++) {
      const cv = document.createElement('canvas');
      cv.width = size;
      cv.height = size;
      const c = cv.getContext('2d')!;
      const isEclipse = phase === 4;

      // 1. Translucent spherical earthshine disc (shadow backing)
      c.globalAlpha = isEclipse ? 0.95 : 0.28;
      c.fillStyle = isEclipse ? '#09030d' : '#080d1e';
      for (let y = -r; y <= r; y++) {
        const hw = Math.round(Math.sqrt(Math.max(0, r * r - y * y)));
        if (hw < 2) continue;
        c.fillRect(gr - hw, gr + y, hw * 2, 1);
      }
      c.globalAlpha = 1;

      // 2. Moon illuminated surface with curved phase terminator & craters
      const angle = phaseAngles[phase];

      for (let y = -r; y <= r; y++) {
        const hw = Math.round(Math.sqrt(Math.max(0, r * r - y * y)));
        if (hw < 2) continue;
        const xTerm = Math.round(Math.cos(angle) * hw);
        const yFrac = (y + r) / (2 * r);

        if (isEclipse) {
          // Blood Moon: deep eclipsed dark center with a flat red rim
          for (let x = -hw; x <= hw; x++) {
            const d_sq = x * x + y * y;
            if (d_sq >= 22 * 22 && d_sq <= 24 * 24) {
              c.fillStyle = '#ff2e63';
              c.fillRect(gr + x, gr + y, 1, 1);
            } else if (d_sq >= 10 * 10) {
              c.fillStyle = '#4a0822';
              c.fillRect(gr + x, gr + y, 1, 1);
            }
          }
        } else {
          // Lit surface from -hw to xTerm with soft lunar crater geography
          for (let x = -hw; x <= xTerm; x++) {
            const xFrac = (x + hw) / Math.max(1, hw + xTerm);
            let col = mix('#ffffff', '#c8e2fa', yFrac * 0.45 + xFrac * 0.4);
            if (xFrac > 0.85) {
              col = mix(col, '#84a8cc', ((xFrac - 0.85) / 0.15) * 0.6);
            }

            // Authentic lunar craters (maria)
            const nx = x + 12;
            const ny = y + 12;
            const isMaria =
              (nx >= 4 && nx <= 10 && ny >= 6 && ny <= 12) ||
              (nx >= 2 && nx <= 8 && ny >= 14 && ny <= 20) ||
              (nx >= 12 && nx <= 16 && ny >= 10 && ny <= 15);
            if (isMaria && phase <= 2) {
              col = mix(col, '#98b8d8', 0.28);
            }

            c.fillStyle = col;
            c.fillRect(gr + x, gr + y, 1, 1);
          }
        }
      }

      this.moonPhaseSprites.push(cv);
    }
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
    c.fillRect(1, 1, 1, 15);
    c.fillRect(16, 1, 1, 15);

    if (kind === 'shield') {
      // 1. Aegis Shield: dark base, cyan rim, center crest
      c.fillStyle = '#165e68';
      c.fillRect(5, 4, 8, 1);
      c.fillRect(4, 5, 10, 5);
      c.fillRect(5, 10, 8, 2);
      c.fillRect(6, 12, 6, 2);
      c.fillRect(7, 14, 4, 1);
      c.fillRect(8, 15, 2, 1);

      c.fillStyle = col;
      c.fillRect(6, 5, 6, 4);
      c.fillRect(6, 9, 6, 2);
      c.fillRect(7, 11, 4, 2);
      c.fillRect(8, 13, 2, 1);

      c.fillStyle = '#ffffff';
      c.fillRect(5, 4, 8, 1);
      c.fillRect(4, 5, 1, 4);
      c.fillRect(8, 6, 2, 6);
      c.fillRect(6, 8, 6, 2);
    } else if (kind === 'shoes') {
      // 2. Hermes Winged Sneaker: winged feather + high-top boot + sole
      c.fillStyle = '#ffffff';
      c.fillRect(3, 4, 3, 2);
      c.fillRect(4, 6, 3, 2);
      c.fillRect(5, 8, 3, 1);

      c.fillStyle = '#ff9e22';
      c.fillRect(7, 6, 4, 3);
      c.fillStyle = '#ffffff';
      c.fillRect(7, 5, 4, 1);

      c.fillStyle = col;
      c.fillRect(6, 9, 7, 3);
      c.fillRect(9, 10, 5, 2);

      c.fillStyle = '#fff4b8';
      c.fillRect(12, 11, 2, 2);
      c.fillRect(8, 7, 2, 1);
      c.fillRect(8, 9, 2, 1);

      c.fillStyle = '#ffffff';
      c.fillRect(5, 12, 10, 2);
      c.fillStyle = '#3a2010';
      c.fillRect(5, 14, 10, 1);
    } else if (kind === 'triple') {
      // 3. Triple Jump: 3 ascending neon energy chevrons (^ ^ ^)
      c.fillStyle = '#ffffff';
      c.fillRect(8, 3, 2, 2);
      c.fillStyle = '#e2b8ff';
      c.fillRect(6, 5, 2, 2);
      c.fillRect(10, 5, 2, 2);
      c.fillStyle = col;
      c.fillRect(4, 7, 2, 2);
      c.fillRect(12, 7, 2, 2);

      c.fillStyle = '#ffffff';
      c.fillRect(8, 8, 2, 2);
      c.fillStyle = col;
      c.fillRect(6, 10, 2, 2);
      c.fillRect(10, 10, 2, 2);

      c.fillStyle = '#ffffff';
      c.fillRect(8, 13, 2, 2);
      c.fillStyle = '#6e2fa8';
      c.fillRect(7, 15, 4, 1);
    } else {
      // 4. Propeller Beanie: dual aerodynamic rotor blades + cap dome & golden brim
      c.fillStyle = '#ffffff';
      c.fillRect(3, 4, 5, 2);
      c.fillRect(10, 4, 5, 2);
      c.fillStyle = '#ffd166';
      c.fillRect(8, 3, 2, 4);

      c.fillStyle = '#ff385c';
      c.fillRect(6, 7, 6, 2);
      c.fillRect(5, 9, 8, 3);

      c.fillStyle = '#ff7a90';
      c.fillRect(6, 7, 3, 2);
      c.fillRect(5, 9, 3, 3);
      c.fillStyle = '#ffffff';
      c.fillRect(6, 8, 2, 1);

      c.fillStyle = '#ffd166';
      c.fillRect(4, 12, 10, 2);
      c.fillStyle = '#e8a838';
      c.fillRect(3, 13, 12, 1);
    }
    this.powerupSprites.set(kind, cv);
    return cv;
  }

  render() {
    const c = this.ctx;
    // Crossfade into the next biome over the last 8% of a zone (~28m, brisk).
    // The parallax layer alpha blends continuously, but the palette itself is
    // quantised to FADE_STEPS so the sky bands, the baked sun and the font
    // atlases only re-bake at step boundaries — a dozen steps read as one
    // smooth fade, and the ground already stepped like this. Platform art is
    // baked once per pure biome and crossfaded (drawPlatforms), so it never
    // re-bakes mid-fade and can't drift into half-blended colours.
    const df = this.g.distance / 10;
    const zi = Math.floor(df / ZONE_LEN_M);
    const frac = df / ZONE_LEN_M - zi;
    const fadeT = frac > FADE_START_FRAC ? Math.min(1, (frac - FADE_START_FRAC) / FADE_WINDOW) : 0;
    const t = Math.floor(fadeT * FADE_STEPS) / FADE_STEPS;
    this.zoneFadeT = fadeT;
    if (zi !== this.lastZoneZi || t !== this.lastZoneT) {
      const ziChanged = zi !== this.lastZoneZi;
      this.lastZoneZi = zi;
      this.lastZoneT = t;
      const i = this.g.zoneOrder[zi % ZONES.length];
      const ni = this.g.zoneOrder[(zi + 1) % ZONES.length];
      this.platI = i;
      this.platNI = ni;
      if (ziChanged) this.prunePlatformCaches();
      this.g.zone = lerpZone(ZONES[i], ZONES[ni], t);
      this.transOut = ZONES[i];
      this.transIn = ZONES[ni];
      this.refreshZoneColors(this.g.zone);
    }

    c.imageSmoothingEnabled = false;
    c.setTransform(1, 0, 0, 1, 0, 0);
    this.drawSky();

    // Parallax background (clouds, far ridges, landmarks):
    // Damped shake (0.25) keeps distant silhouettes stable against the static sky without jarring jitter.
    c.save();
    c.translate(
      Math.round(this.g.shakeX * 0.25),
      Math.round(this.g.shakeY * 0.25) + worldOffsetY() + this.worldLift,
    );
    this.drawParallax();
    c.restore();

    // Foreground world (platforms, springs, spikes, pickups, enemies, player, particles, texts, shockwave):
    // Full impact shake so stomp, slam, and landing feel punchy and juicy.
    c.save();
    c.translate(
      Math.round(this.g.shakeX),
      Math.round(this.g.shakeY) + worldOffsetY() + this.worldLift,
    );
    this.applyDeathZoom();
    this.drawWorld();
    this.particles.draw(c, this.g.camX);
    if (this.g.phase !== 'dead') this.drawPlayer();
    this.drawDeathShockwave();
    this.texts.draw(c, this.g.camX);

    // Subtle atmospheric ambient lighting on foreground (noticeable difference between day and night, but not too extreme)
    const period = VW + 140;
    const progress = 300 - this.g.camX * 0.045;
    const cycle = Math.floor(progress / period);
    const isMoon = (((cycle % 2) + 2) % 2) === 1;
    const angle = ((progress - 300) / period) * Math.PI;
    const nightT = clamp(0.5 - 0.5 * Math.cos(angle), 0, 1);
    const nightIndex = Math.max(0, Math.floor((-cycle - 1) / 2));
    const isEclipse = isMoon && nightIndex >= 4;

    if (nightT > 0.05) {
      c.globalAlpha = isEclipse ? nightT * 0.16 : nightT * 0.13;
      c.fillStyle = isEclipse ? '#680c26' : '#081232';
      c.fillRect(-40, -40, VW + 80, VH + 80);
      c.globalAlpha = 1;
    }

    c.restore();

    this.drawForeground();
    // World effects restore their own alpha, but the HUD must never inherit a
    // transient particle/flash alpha from a future renderer path.
    c.globalAlpha = 1;
    this.drawHud();

    if (this.g.flash > 0.002) {
      c.globalAlpha = Math.min(1, this.g.flash);
      c.fillStyle = this.g.flashCol;
      c.fillRect(0, 0, VW, VH);
      c.globalAlpha = 1;
    }

    if ((this.g.countdown > 0 || this.g.goTimer > 0) && this.g.phase !== 'dead' && this.g.phase !== 'over') this.drawCountdown();
  }

  /** Zoom-out punch as the death slow-mo opens: 1.04 easing back to 1 over
   *  the first ~20 death frames, about the screen centre. A pure transform —
   *  no palette or cache work, and the HUD/foreground stay unscaled. */
  private applyDeathZoom() {
    if (this.g.phase !== 'dead') return;
    const dt = (this.g as RenderHost & { deathTimer?: number }).deathTimer ?? 0;
    const z = 1 + 0.04 * (1 - Math.min(1, dt / 20));
    if (z === 1) return;
    const c = this.ctx;
    c.translate(Math.round(VW / 2), Math.round(VH / 2));
    c.scale(z, z);
    c.translate(-Math.round(VW / 2), -Math.round(VH / 2));
  }

  /** Expanding pixel ring from the death point — the engine already maxes
   *  the shake and fires the flash on die(); this adds the ring on top. */
  private drawDeathShockwave() {
    if (this.g.phase !== 'dead') return;
    const dt = (this.g as RenderHost & { deathTimer?: number }).deathTimer ?? 0;
    if (dt <= 0 || dt > 24) return;
    const c = this.ctx;
    const cam = Math.round(this.g.camX);
    const cx = Math.round(this.g.px - cam + PLAYER_W / 2);
    const cy = Math.round(this.g.py + PLAYER_H / 2);
    const r = Math.round(dt * 1.9);
    c.globalAlpha = 0.5 * (1 - dt / 24);
    c.fillStyle = '#ffffff';
    c.fillRect(cx - r, cy - r, r * 2, 1);
    c.fillRect(cx - r, cy + r, r * 2, 1);
    c.fillRect(cx - r, cy - r, 1, r * 2);
    c.fillRect(cx + r, cy - r, 1, r * 2);
    c.globalAlpha = 1;
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

    // Celestial geometry & Day/Night progression
    const period = VW + 140;
    const progress = 300 - this.g.camX * 0.045;
    const celestialX = (((progress % period) + period) % period) - 70;
    const cycle = Math.floor(progress / period);
    const isMoon = (((cycle % 2) + 2) % 2) === 1;

    // Continuous day/night curve: 0.0 (Day / Sun zenith) -> 0.5 (Dusk/Dawn) -> 1.0 (Night / Moon zenith)
    const angle = ((progress - 300) / period) * Math.PI;
    const dayFactor = Math.cos(angle);
    const nightT = clamp(0.5 - 0.5 * dayFactor, 0, 1);

    let moonPhase = 0;
    let sprite: HTMLCanvasElement | null = null;
    if (isMoon) {
      const nightIndex = Math.max(0, Math.floor((-cycle - 1) / 2));
      moonPhase = Math.min(4, nightIndex);
      sprite = this.moonPhaseSprites[moonPhase] ?? this.moonPhaseSprites[0] ?? null;
    } else {
      sprite = this.sunSprite;
    }

    // Blend sky gradient: Day Sky -> Night Sky (and Eclipse sky if final phase)
    const baseSky = this.g.zone.sky;
    const nightSky = this.g.zone.skyNight;
    const isEclipse = isMoon && moonPhase === 4;
    const eclipseSky: [string, string, string, string] = ['#0a0208', '#1c0514', '#3d0a24', '#661436'];

    const targetSky = isEclipse ? eclipseSky : nightSky;
    const activeStops: [string, string, string, string] = [
      mix(baseSky[0], targetSky[0], nightT),
      mix(baseSky[1], targetSky[1], nightT),
      mix(baseSky[2], targetSky[2], nightT),
      mix(baseSky[3], targetSky[3], nightT),
    ];

    for (let i = 0; i < 15; i++) {
      c.fillStyle = sampleSky(activeStops, (i + 0.5) / 15);
      c.fillRect(0, i * bh, VW, bh + 1);
    }

    // Celestial body (Sun / Moon)
    if (sprite) {
      // Mobile: low behind the mountains — only its top peeks over them.
      c.drawImage(sprite, Math.round(celestialX) - 32, (this.mobileView ? 100 : 68) - 32);
    }

    // Stars: dynamically fade in at dusk/night, hidden during bright day
    if (nightT > 0.15) {
      const starVisibility = Math.min(1, (nightT - 0.15) / 0.65);
      const starCol = isEclipse ? '#ffd166' : this.g.zone.star;
      c.fillStyle = starCol;
      const baseTw = this.g.frame * 0.05;
      const camOffset = this.g.camX * 0.06;
      const yFactor = (VH * 0.66) / 140;
      for (const [sx0, sy0, ph, sz] of this.stars) {
        const x = ((sx0 - camOffset) % 1400 + 1400) % 1400;
        if (x > VW) continue;
        const tw = Math.sin(baseTw + ph);
        if (tw < -0.4) continue;
        const twinkle = 0.35 + 0.65 * (tw * 0.5 + 0.5);
        c.globalAlpha = starVisibility * twinkle;
        c.fillRect(Math.round(x), Math.round(sy0 * yFactor), sz, sz);
      }
      c.globalAlpha = 1;
    }
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
    const c = this.ctx;
    const camOffset = Math.round(this.g.camX * spd);
    const H = VH + 48;

    c.fillStyle = col;
    for (let screenX = -20; screenX <= VW + 20; screenX++) {
      const worldX = screenX + camOffset;
      const wx = worldX * freq + seed;
      let h =
        Math.sin(wx) * 0.55 +
        Math.sin(wx * 2.13 + 1.4) * 0.28 +
        Math.sin(wx * 4.7 + 0.6) * 0.17;
      if (sharpness > 0) h = 1 - Math.pow(1 - Math.abs(h), 1 + sharpness);
      const top = Math.max(0, Math.round(horizon - amp * (h * 0.5 + 0.5)));
      c.fillRect(screenX, top, 1, H - top);
    }
  }

  private getShadedLayerColors(Z: Zone, nightT: number, isEclipse: boolean) {
    // Night shadow silhouette tone: always deeper and darker than the night sky base
    const nightShadowFar = isEclipse
      ? mix(Z.far, '#10030c', 0.84)
      : mix(Z.far, Z.skyNight[0], 0.82);
    const nightShadowMid = isEclipse
      ? mix(Z.mid, '#070205', 0.90)
      : mix(Z.mid, '#020104', 0.88);

    const far = mix(Z.far, nightShadowFar, nightT);
    const mid = mix(Z.mid, nightShadowMid, nightT);
    const back = mix(far, mid, 0.5);

    const decoFar = isEclipse
      ? mix(Z.decoFar, '#ff4d6d', 0.6)
      : mix(Z.decoFar, Z.skyNight[3], nightT * 0.5);
    const decoMid = isEclipse
      ? mix(Z.decoMid, '#ffd166', 0.5)
      : mix(Z.decoMid, Z.skyNight[2], nightT * 0.5);

    return { far, mid, back, decoFar, decoMid };
  }

  private drawParallax() {
    const c = this.ctx;

    // Celestial progress for atmospheric cloud and mountain lighting
    const period = VW + 140;
    const progress = 300 - this.g.camX * 0.045;
    const angle = ((progress - 300) / period) * Math.PI;
    const nightT = clamp(0.5 - 0.5 * Math.cos(angle), 0, 1);
    const cycle = Math.floor(progress / period);
    const isMoon = (((cycle % 2) + 2) % 2) === 1;
    const nightIndex = Math.max(0, Math.floor((-cycle - 1) / 2));
    const isEclipse = isMoon && Math.min(4, nightIndex) === 4;

    // Soft high-altitude distant clouds — gentle slow drift, far above the mountain peaks
    const dayCloud = mix('#ffffff', this.g.zone.star, 0.2);
    const nightCloud = mix(this.g.zone.far, '#0b0616', 0.6);
    const cloudColor = mix(dayCloud, nightCloud, nightT);
    c.globalAlpha = 0.35 - nightT * 0.12;
    c.fillStyle = cloudColor;
    for (let i = 0; i < 5; i++) {
      const cw = 42 + ((i * 31) % 24);
      // High in the sky: y between 10 and 32 (mountain peaks start around 80-120)
      const y = 10 + ((i * 19) % 22);
      // Independent slow atmospheric drift
      const x = (((i * 280 + 15 - this.g.camX * 0.03 - this.g.frame * 0.08) % 1400) + 1400) % 1400;
      if (x > VW + 50 && x < 1400 - 50) continue;
      const rx = x > VW + 50 ? x - 1400 : x;
      c.fillRect(Math.round(rx), y, cw, 3);
      c.fillRect(Math.round(rx + 8), y - 2, cw - 18, 2);
    }
    c.globalAlpha = 1;

    // Biome structure crossfade:
    // Outgoing biome smoothly fades out from 1 down to 0,
    // incoming biome smoothly fades in from 0 up to 1.
    const t = this.zoneFadeT;
    if (t <= 0) {
      this.drawParallaxLayer(this.transOut, 1, nightT, isEclipse);
    } else if (t >= 1) {
      this.drawParallaxLayer(this.transIn, 1, nightT, isEclipse);
    } else {
      this.drawParallaxLayer(this.transOut, 1 - t, nightT, isEclipse);
      this.drawParallaxLayer(this.transIn, t, nightT, isEclipse);
    }
  }

  // One biome's far band + landmark rows. alpha blends the layer over what is
  // already on screen (used to crossfade the old biome out / new one in).
  private drawParallaxLayer(Z: Zone, alpha: number, nightT: number, isEclipse: boolean) {
    const c = this.ctx;
    const bg = Z.bg;
    const colors = this.getShadedLayerColors(Z, nightT, isEclipse);
    c.globalAlpha = alpha;
    const m = this.mobileView;
    if (bg === 'jungle') {
      this.seeBand(0.12, m ? 116 : 120, m ? 40 : 30, 0.02, 0.15, 0, colors.far);
      this.drawLandmarks(Z, colors.back, 0.19, m ? 124 : 142, 38, 29, colors.decoMid, m ? 0.8 : 0.65);
      this.drawLandmarks(Z, colors.mid, 0.28, m ? 158 : 160, 46, 73, colors.decoMid, 1);
    } else if (bg === 'desert') {
      this.seeBand(0.12, m ? 120 : 124, m ? 40 : 24, 0.014, 0.08, 0, colors.far);
      this.drawLandmarks(Z, colors.back, 0.19, m ? 126 : 144, 44, 23, colors.decoMid, m ? 0.8 : 0.65);
      this.drawLandmarks(Z, colors.mid, 0.28, m ? 160 : 162, 54, 67, colors.decoMid, 1);
    } else if (bg === 'tundra') {
      this.seeBand(0.11, m ? 116 : 118, m ? 40 : 30, 0.018, 1.6, 0.5, colors.far);
      this.drawLandmarks(Z, colors.back, 0.18, m ? 126 : 144, 40, 41, colors.decoMid, m ? 0.8 : 0.65);
      this.drawLandmarks(Z, colors.mid, 0.28, m ? 160 : 162, 50, 59, colors.decoMid, 1);
    } else {
      this.seeBand(0.13, m ? 118 : 122, m ? 40 : 38, 0.05, 0.2, 0.9, colors.far);
      this.drawLandmarks(Z, colors.back, 0.18, m ? 124 : 142, 42, 19, colors.decoFar, m ? 0.8 : 0.7);
      this.drawLandmarks(Z, colors.mid, 0.28, m ? 158 : 160, 52, 37, colors.decoFar, 1);
    }
    c.globalAlpha = 1;
  }

  // Grounded landmark silhouettes — infinite deterministic grid on the pixel
  // grid, so subpixel camera movement cannot alter a landmark's geometry.
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

    // Flat grounded strip under landmarks with margin padding so shake never reveals edge gaps.
    c.fillStyle = col;
    c.fillRect(-40, Math.round(baseY), VW + 80, VH + 60 - Math.round(baseY));

    const cam = Math.round(this.g.camX * spd);
    const startK = Math.floor((cam - 80) / spacing);
    const endK = Math.ceil((cam + VW + 80) / spacing);

    for (let k = startK; k <= endK; k++) {
      const seed = ((k % 10000 + 10000) % 10000) * seedStep;
      // Controlled jitter per landmark index
      const jitter = (hash(seed + 11) - 0.5) * spacing * 0.35;
      const worldX = k * spacing + jitter;
      const nx = Math.round(worldX - cam);
      if (nx < -70 || nx > VW + 70) continue;
      const roll = hash(seed);
      const ground = Math.round(baseY) + 2;
      if (bg === 'jungle') this.drawJungleShape(roll, nx, ground, seed, scale, col);
      else if (bg === 'desert') this.drawDesertShape(roll, nx, ground, seed, scale, col);
      else if (bg === 'tundra') this.drawTundraShape(roll, nx, ground, seed, scale, col, tipCol);
      else this.drawCityShape(roll, nx, ground, seed, scale, col, tipCol);
    }
  }

  private drawJungleShape(roll: number, nx: number, ground: number, seed: number, scale: number, col: string) {
    const c = this.ctx;
    c.fillStyle = col;
    const h = Math.round((22 + Math.floor(hash(seed + 3) * 18)) * scale);

    if (roll < 0.25) {
      // 1. Broad canopy rainforest banyan tree: compact tiered dome
      const cw = 20 + hash(seed + 4) * 12;
      c.fillRect(Math.round(nx - 3), ground - 3, 7, 3);
      c.fillRect(Math.round(nx - 2), ground - h, 4, h + 2);
      c.fillRect(Math.round(nx - cw / 2), ground - h - 3, Math.round(cw), 8);
      c.fillRect(Math.round(nx - cw * 0.3), ground - h - 8, Math.round(cw * 0.6), 6);
      c.fillRect(Math.round(nx - cw * 0.15), ground - h - 11, Math.round(cw * 0.3), 4);
    } else if (roll < 0.5) {
      // 2. Jungle palm: elegant compact fronds connected to crown hub
      c.fillRect(Math.round(nx - 1), ground - h, 3, h + 2);
      c.fillRect(Math.round(nx - 2), ground - h - 3, 5, 5);
      // Left fronds
      c.fillRect(Math.round(nx - 5), ground - h - 2, 4, 3);
      c.fillRect(Math.round(nx - 11), ground - h, 8, 3);
      c.fillRect(Math.round(nx - 13), ground - h + 2, 3, 2);
      // Right fronds
      c.fillRect(Math.round(nx + 2), ground - h - 3, 4, 3);
      c.fillRect(Math.round(nx + 4), ground - h - 1, 9, 3);
      c.fillRect(Math.round(nx + 12), ground - h + 2, 3, 2);
      // Top fronds
      c.fillRect(Math.round(nx - 6), ground - h - 6, 6, 3);
      c.fillRect(Math.round(nx + 1), ground - h - 7, 6, 3);
      c.fillRect(Math.round(nx - 1), ground - h - 9, 3, 5);
    } else if (roll < 0.7) {
      // 3. Forked twin-trunk jungle tree
      const splitH = Math.round(h * 0.4);
      c.fillRect(Math.round(nx - 2), ground - splitH, 5, splitH + 2);
      // Left branch
      c.fillRect(Math.round(nx - 4), ground - Math.round(h * 0.5), 3, 4);
      c.fillRect(Math.round(nx - 6), ground - h + 2, 3, Math.round(h * 0.6));
      c.fillRect(Math.round(nx - 11), ground - h - 1, 10, 6);
      c.fillRect(Math.round(nx - 9), ground - h - 5, 7, 4);
      // Right branch
      c.fillRect(Math.round(nx + 1), ground - Math.round(h * 0.5), 3, 4);
      c.fillRect(Math.round(nx + 3), ground - h, 3, Math.round(h * 0.65));
      c.fillRect(Math.round(nx + 1), ground - h - 4, 11, 6);
      c.fillRect(Math.round(nx + 3), ground - h - 7, 7, 4);
    } else if (roll < 0.85) {
      // 4. Giant jungle spore mushroom
      const capW = Math.round(18 * scale);
      c.fillRect(Math.round(nx - 2), ground - h + 2, 4, h);
      c.fillRect(Math.round(nx - capW / 2), ground - h - 2, capW, 5);
      c.fillRect(Math.round(nx - capW * 0.32), ground - h - 6, Math.round(capW * 0.64), 5);
      c.fillRect(Math.round(nx - capW * 0.16), ground - h - 8, Math.round(capW * 0.32), 3);
      // Baby mushroom
      c.fillRect(Math.round(nx + 4), ground - 6, 2, 6);
      c.fillRect(Math.round(nx + 2), ground - 8, 5, 3);
    } else {
      // 5. Giant jungle fern tree with drooping vines
      const fw = Math.round(20 * scale);
      c.fillRect(Math.round(nx - 2), ground - h, 4, h + 2);
      c.fillRect(Math.round(nx - fw / 2), ground - h - 3, fw, 5);
      c.fillRect(Math.round(nx - fw * 0.35), ground - h - 7, Math.round(fw * 0.7), 5);
      c.fillRect(Math.round(nx - fw * 0.18), ground - h - 10, Math.round(fw * 0.36), 4);
      // Drooping hanging vine tendrils
      c.fillRect(Math.round(nx - fw / 2 + 2), ground - h + 2, 2, 7);
      c.fillRect(Math.round(nx + fw / 2 - 4), ground - h + 2, 2, 6);
      c.fillRect(Math.round(nx - 5), ground - h + 2, 2, 4);
      c.fillRect(Math.round(nx + 3), ground - h + 2, 2, 5);
    }
  }

  private drawDesertShape(roll: number, nx: number, ground: number, seed: number, scale: number, col: string) {
    const c = this.ctx;
    c.fillStyle = col;

    if (roll < 0.25) {
      // 1. Multi-arm giant saguaro cactus
      const h = Math.round((16 + Math.floor(hash(seed + 3) * 16)) * scale);
      c.fillRect(Math.round(nx), ground - h, 4, h + 2);
      c.fillRect(Math.round(nx - 5), ground - h + 7, 5, 3);
      c.fillRect(Math.round(nx - 5), ground - h + 3, 3, 6);
      c.fillRect(Math.round(nx + 4), ground - h + 10, 5, 3);
      c.fillRect(Math.round(nx + 6), ground - h + 5, 3, 7);
    } else if (roll < 0.45) {
      // 2. Barrel & prickly pear cactus cluster
      const h2 = Math.round((9 + Math.floor(hash(seed + 3) * 8)) * scale);
      c.fillRect(Math.round(nx - 5), ground - h2, 11, h2 + 2);
      c.fillRect(Math.round(nx - 3), ground - h2 - 3, 7, 4);
      c.fillRect(Math.round(nx + 7), ground - 6, 6, 6);
    } else if (roll < 0.65) {
      // 3. Spiky ocotillo bush
      const h3 = Math.round((12 + Math.floor(hash(seed + 3) * 12)) * scale);
      c.fillRect(Math.round(nx), ground - h3, 2, h3 + 2);
      c.fillRect(Math.round(nx - 6), ground - 9, 6, 3);
      c.fillRect(Math.round(nx + 2), ground - 11, 7, 3);
      c.fillRect(Math.round(nx - 4), ground - h3 + 3, 2, 8);
      c.fillRect(Math.round(nx + 5), ground - h3 + 2, 2, 10);
    } else if (roll < 0.85) {
      // 4. Desert sandstone butte / mesa rock formation
      const mw = Math.round((24 + Math.floor(hash(seed + 4) * 14)) * scale);
      const mh = Math.round((14 + Math.floor(hash(seed + 3) * 12)) * scale);
      c.fillRect(Math.round(nx - mw / 2), ground - mh, mw, mh + 2);
      c.fillRect(Math.round(nx - mw * 0.4), ground - mh - 4, Math.round(mw * 0.8), 5);
      c.fillRect(Math.round(nx - mw * 0.2), ground - mh - 7, Math.round(mw * 0.4), 4);
    } else {
      // 5. Ancient desert pyramid / obelisk
      const pw = Math.round(22 * scale);
      const ph = Math.round(18 * scale);
      c.fillRect(Math.round(nx - pw / 2), ground - 6, pw, 8);
      c.fillRect(Math.round(nx - pw * 0.35), ground - 11, Math.round(pw * 0.7), 6);
      c.fillRect(Math.round(nx - pw * 0.2), ground - 15, Math.round(pw * 0.4), 5);
      c.fillRect(Math.round(nx - 2), ground - ph, 4, 4);
    }
  }

  private drawTundraShape(
    roll: number,
    nx: number,
    ground: number,
    seed: number,
    scale: number,
    col: string,
    tipCol: string,
  ) {
    const c = this.ctx;
    c.fillStyle = col;

    if (roll < 0.28) {
      // 1. Snowy evergreen fir tree
      const h = Math.round((24 + Math.floor(hash(seed + 3) * 16)) * scale);
      const top = ground - h;
      c.fillRect(Math.round(nx - 1), top, 3, h + 2);
      c.fillRect(Math.round(nx - 4), top + 3, 9, 3);
      c.fillRect(Math.round(nx - 2), top, 5, 3);
      c.fillRect(Math.round(nx - 8), top + 9, 17, 4);
      c.fillRect(Math.round(nx - 5), top + 6, 11, 3);
      c.fillRect(Math.round(nx - 12), top + 17, 25, 5);
      c.fillRect(Math.round(nx - 9), top + 13, 19, 4);
      // Snowy branch tips
      c.fillStyle = tipCol;
      c.fillRect(Math.round(nx - 1), top, 3, 1);
      c.fillRect(Math.round(nx - 3), top + 3, 2, 1);
      c.fillRect(Math.round(nx + 2), top + 3, 2, 1);
      c.fillRect(Math.round(nx - 7), top + 9, 3, 1);
      c.fillRect(Math.round(nx + 4), top + 9, 3, 1);
      c.fillRect(Math.round(nx - 11), top + 17, 4, 1);
      c.fillRect(Math.round(nx + 7), top + 17, 4, 1);
      c.fillStyle = col;
    } else if (roll < 0.5) {
      // 2. Twin pine tree cluster (tall pine + smaller companion)
      const h = Math.round(26 * scale);
      const top = ground - h;
      c.fillRect(Math.round(nx - 3), top, 3, h + 2);
      c.fillRect(Math.round(nx - 7), top + 4, 9, 4);
      c.fillRect(Math.round(nx - 10), top + 11, 15, 5);
      const h2 = Math.round(14 * scale);
      c.fillRect(Math.round(nx + 5), ground - h2, 2, h2 + 2);
      c.fillRect(Math.round(nx + 2), ground - h2 + 2, 8, 4);
      c.fillRect(Math.round(nx + 1), ground - h2 + 6, 10, 4);
      c.fillStyle = tipCol;
      c.fillRect(Math.round(nx - 4), top, 3, 1);
      c.fillRect(Math.round(nx + 4), ground - h2, 3, 1);
      c.fillStyle = col;
    } else if (roll < 0.72) {
      // 3. Snowy glacial peak mountain shard
      const h = Math.round((20 + Math.floor(hash(seed + 3) * 24)) * scale);
      const w = Math.round((28 + Math.floor(hash(seed + 4) * 20)) * scale);
      const halfW = w / 2;
      for (let colOffset = -Math.floor(halfW); colOffset <= Math.floor(halfW); colOffset++) {
        const ratio = 1 - Math.abs(colOffset) / halfW;
        const colH = Math.round(h * ratio);
        if (colH > 0) {
          c.fillRect(Math.round(nx + colOffset), ground - colH, 1, colH + 2);
        }
      }
      c.fillStyle = tipCol;
      c.fillRect(Math.round(nx - 2), ground - h, 5, 2);
      c.fillRect(Math.round(nx - 4), ground - h + 2, 9, 2);
      c.fillStyle = col;
    } else if (roll < 0.86) {
      // 4. Steep arctic horn mountain peak
      const h = Math.round((24 + Math.floor(hash(seed + 3) * 20)) * scale);
      const w = Math.round(20 * scale);
      const halfW = w / 2;
      for (let colOffset = -Math.floor(halfW); colOffset <= Math.floor(halfW); colOffset++) {
        const ratio = Math.pow(1 - Math.abs(colOffset) / halfW, 1.4);
        const colH = Math.round(h * ratio);
        if (colH > 0) {
          c.fillRect(Math.round(nx + colOffset), ground - colH, 1, colH + 2);
        }
      }
      c.fillStyle = tipCol;
      c.fillRect(Math.round(nx - 1), ground - h, 3, 3);
      c.fillRect(Math.round(nx - 3), ground - h + 3, 7, 2);
      c.fillStyle = col;
    } else {
      // 5. Dense arctic pine grove trio
      const h = Math.round(22 * scale);
      // Center tree
      c.fillRect(Math.round(nx - 1), ground - h, 3, h + 2);
      c.fillRect(Math.round(nx - 5), ground - h + 4, 11, 4);
      c.fillRect(Math.round(nx - 8), ground - h + 10, 17, 5);
      // Left companion
      c.fillRect(Math.round(nx - 8), ground - 12, 2, 14);
      c.fillRect(Math.round(nx - 11), ground - 10, 7, 4);
      // Right companion
      c.fillRect(Math.round(nx + 7), ground - 15, 2, 17);
      c.fillRect(Math.round(nx + 4), ground - 13, 8, 4);
      // Snow tips
      c.fillStyle = tipCol;
      c.fillRect(Math.round(nx - 2), ground - h, 4, 1);
      c.fillRect(Math.round(nx - 10), ground - 12, 4, 1);
      c.fillRect(Math.round(nx + 5), ground - 15, 4, 1);
      c.fillStyle = col;
    }
  }

  private drawCityShape(
    roll: number,
    nx: number,
    ground: number,
    seed: number,
    scale: number,
    col: string,
    tipCol: string,
  ) {
    const c = this.ctx;
    c.fillStyle = col;
    const h = Math.round((24 + Math.floor(hash(seed + 3) * 34)) * scale);
    const bw = Math.round((16 + Math.floor(hash(seed + 4) * 20)) * scale);
    const top = ground - h;

    if (roll < 0.25) {
      // 1. Antenna slab megatower with beacon lamp
      c.fillRect(Math.round(nx), top, bw, h + 2);
      c.fillRect(Math.round(nx + bw * 0.45), top - 12, 3, 12);
      c.fillStyle = tipCol;
      c.fillRect(Math.round(nx + bw * 0.45) - 1, top - 15, 5, 3);
      c.fillStyle = col;
    } else if (roll < 0.45) {
      // 2. Cyber twin towers with skybridge
      const tw = Math.max(6, Math.floor(bw * 0.4));
      c.fillRect(Math.round(nx), top + 10, tw, h);
      c.fillRect(Math.round(nx + bw - tw), top, tw, h + 10);
      c.fillRect(Math.round(nx + tw), top + 22, bw - tw * 2, 5);
    } else if (roll < 0.65) {
      // 3. Stepped ziggurat cyber-pyramid tower
      c.fillRect(Math.round(nx), top + 14, bw, h);
      c.fillRect(Math.round(nx + 4), top + 7, bw - 8, 8);
      c.fillRect(Math.round(nx + 8), top, Math.max(6, bw - 16), 7);
    } else if (roll < 0.85) {
      // 4. Crowned skyscraper with observation deck and broadcast spire
      c.fillRect(Math.round(nx), top, bw, h + 2);
      c.fillRect(Math.round(nx - 2), top + 8, bw + 4, 3);
      c.fillRect(Math.round(nx + 3), top - 6, bw - 6, 7);
      c.fillRect(Math.round(nx + bw * 0.5 - 1), top - 14, 2, 9);
      c.fillStyle = tipCol;
      c.fillRect(Math.round(nx + bw * 0.5 - 1), top - 16, 2, 2);
      c.fillStyle = col;
    } else {
      // 5. Angled high-tech skyscraper with helipad / spire
      c.fillRect(Math.round(nx), top + 8, bw, h);
      // Angled roofline
      for (let i = 0; i < bw; i++) {
        const stepH = Math.round(8 * (1 - i / bw));
        c.fillRect(Math.round(nx + i), top + 8 - stepH, 1, stepH);
      }
      c.fillRect(Math.round(nx + 2), top - 6, 2, 14);
      c.fillStyle = tipCol;
      c.fillRect(Math.round(nx + 1), top - 8, 4, 3);
      c.fillStyle = col;
    }

    // Windows drawn strictly INSIDE each building's solid wall footprint (zero floating disconnected lights)
    const layerAlpha = c.globalAlpha;
    c.fillStyle = tipCol;
    if (roll < 0.25 || (roll >= 0.65 && roll < 0.85)) {
      // 1 & 4. Standard building slab
      for (let wy = top + 10; wy < ground - 4; wy += 9) {
        for (let wx = 4; wx < bw - 4; wx += 7) {
          if (hash(seed + wy * 0.7 + wx) > 0.55) {
            c.globalAlpha = layerAlpha * (0.35 + hash(seed + wx + wy) * 0.35);
            c.fillRect(Math.round(nx + wx), Math.round(wy), 2, 2);
          }
        }
      }
    } else if (roll < 0.45) {
      // 2. Twin towers: windows strictly on left tower and right tower (never in middle gap)
      const tw = Math.max(6, Math.floor(bw * 0.4));
      for (let wy = top + 14; wy < ground - 4; wy += 9) {
        for (let wx = 2; wx < tw - 2; wx += 5) {
          if (hash(seed + wy * 0.7 + wx) > 0.55) {
            c.globalAlpha = layerAlpha * (0.35 + hash(seed + wx + wy) * 0.35);
            c.fillRect(Math.round(nx + wx), Math.round(wy), 2, 2);
          }
        }
        for (let wx = bw - tw + 2; wx < bw - 2; wx += 5) {
          if (hash(seed + wy * 0.7 + wx) > 0.55) {
            c.globalAlpha = layerAlpha * (0.35 + hash(seed + wx + wy) * 0.35);
            c.fillRect(Math.round(nx + wx), Math.round(wy), 2, 2);
          }
        }
      }
    } else if (roll < 0.65) {
      // 3. Stepped ziggurat: windows strictly inside each tier
      for (let wy = top + 6; wy < ground - 4; wy += 8) {
        let leftX = 4;
        let rightX = bw - 4;
        if (wy < top + 7) {
          leftX = 10;
          rightX = Math.max(14, bw - 10);
        } else if (wy < top + 14) {
          leftX = 6;
          rightX = bw - 6;
        }
        for (let wx = leftX; wx < rightX; wx += 6) {
          if (hash(seed + wy * 0.7 + wx) > 0.55) {
            c.globalAlpha = layerAlpha * (0.35 + hash(seed + wx + wy) * 0.35);
            c.fillRect(Math.round(nx + wx), Math.round(wy), 2, 2);
          }
        }
      }
    } else {
      // 5. Angled skyscraper: windows strictly below the roofline
      for (let wy = top + 12; wy < ground - 4; wy += 9) {
        for (let wx = 4; wx < bw - 4; wx += 7) {
          if (hash(seed + wy * 0.7 + wx) > 0.55) {
            c.globalAlpha = layerAlpha * (0.35 + hash(seed + wx + wy) * 0.35);
            c.fillRect(Math.round(nx + wx), Math.round(wy), 2, 2);
          }
        }
      }
    }
    c.globalAlpha = layerAlpha;
    c.fillStyle = col;
  }

  // Every platform's artwork is deterministic (keyed by p.seed) and never
  // changes after it's generated, so we paint it once into an offscreen
  // canvas and blit that with a single drawImage() every frame instead of
  // redoing dozens of fillRect/hash() calls per platform per frame. Two
  // pure-biome bakes crossfade over a transition, so the art never re-bakes
  // at fade steps and every platform in a frame shares one palette.
  private getPlatformCache(p: Platform, k: number, Z: Zone): HTMLCanvasElement {
    const key = `${k}|${p.seed}|${p.w}|${p.float}|${p.y}`;
    let cv = this.platformCaches.get(key);
    if (cv) return cv;
    const w = Math.max(1, Math.round(p.w) + 1);
    const pad = PLATFORM_CACHE_PAD;
    // Use the full depth so the sides reach the screen bottom with no gap.
    // GROUND_BOTTOM is VH+70, and p.y is typically 98-MAX_PLATFORM_Y, so this is at
    // most ~297px — fine for an offscreen canvas.
    const h = p.float ? 18 : Math.max(8, GROUND_BOTTOM - Math.round(p.y));
    cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h + pad;
    const c = cv.getContext('2d')!;
    const x = 0;
    const y = pad;
    const bg = Z.bg;
    // Derived colours come from the bake's pure palette — never the live
    // lerped zone — so the two transition bakes stay pure and consistent.
    const cBolt = shade(Z.groundDark, -0.3);
    const cStrata1 = mix(Z.ground, Z.groundDark, 0.45);
    const cRockA = shade(Z.ground, -0.16);
    const cRockB = shade(Z.groundDark, 0.12);
    const cRockLit = shade(Z.ground, 0.1);
    const cRivet = shade(Z.accent, -0.35);

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
        c.fillStyle = cBolt;
        c.fillRect(x + 3, y + 12, Math.max(3, w * 0.28), 2);
        c.fillRect(x + Math.max(4, w - 4 - w * 0.28), y + 12, Math.max(3, w * 0.28), 2);
      } else {
        c.fillStyle = cBolt;
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
      c.fillStyle = cStrata1;
      c.fillRect(x, y + 16, w, h - 16);
      c.fillStyle = Z.groundDark;
      c.fillRect(x, y + 34, w, h - 34);
      c.fillStyle = cBolt;
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
      const rockA = cRockA;
      const rockB = cRockB;
      const rockLit = cRockLit;
      const blocks = Math.min(14, Math.max(2, Math.floor(w / 22)));
      for (let i = 0; i < blocks; i++) {
        const hx = hash(p.seed + i * 3.7);
        const hy = hash(p.seed + i * 9.1);
        const hs = hash(p.seed + i * 5.5);
        const bw2 = 5 + Math.floor(hs * 9);
        const bh2 = 4 + Math.floor(hash(p.seed + i * 2.3) * 5);
        // Clamp so a block never pokes past the cache's right edge (clipped).
        const bx = Math.min(x + 3 + Math.floor(hx * (w - 12)), w - bw2 - 2);
        const by = y + 20 + Math.floor(hy * 52);
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

      // ---- biome surface dressing (desert gets a clean sand top — no cap
      // decorations; the surface cap above already gives it its rim)
      if (bg === 'jungle') {
        c.fillStyle = Z.deco;
        for (let i = 0; i * 22 < w - 6; i++) {
          const hx = hash(p.seed + i * 7.7);
          if (hx < 0.4) continue;
          const gx = x + 4 + i * 22 + Math.floor(hx * 6);
          c.fillRect(gx, y - 2, 2, 2);
        }
      } else if (bg === 'tundra') {
        c.fillStyle = '#ffffff';
        c.fillRect(x + 1, y - 2, w - 2, 2);
        c.fillStyle = Z.deco;
        c.fillRect(x + 2, y - 1, w - 4, 1);
      } else {
        c.fillStyle = cRivet;
        for (let i = 0; i * 18 < w - 8; i++) c.fillRect(x + 6 + i * 18, y + 7, 2, 2);
      }
    }

    this.platformCaches.set(key, cv);
    return cv;
  }

  /** Drop platform bakes from earlier biomes once a zone boundary passes. */
  private prunePlatformCaches() {
    const a = this.platI + '|';
    const b = this.platNI + '|';
    for (const key of this.platformCaches.keys()) {
      if (!key.startsWith(a) && !key.startsWith(b)) this.platformCaches.delete(key);
    }
  }

  private drawWorld() {
    this.drawPlatforms();
    this.drawSprings();
    this.drawSpikes();
    this.drawPickups();
    this.drawPowerUps();
    this.drawEnemies();
  }

  private drawPlatforms() {
    const c = this.ctx;
    const cam = Math.round(this.g.camX);
    const outZ = ZONES[this.platI];
    const inZ = ZONES[this.platNI];
    const t = this.zoneFadeT;
    // Crossfade the two pure-biome bakes, mirroring the band-tile blend.
    // Outside a transition only one drawImage is issued per platform.
    const fading = t > 0 && t < 1;

    /* platforms — one drawImage() per platform, artwork pre-baked */
    for (const p of this.g.platforms) {
      const x = Math.floor(p.x - cam);
      if (x > VW + 4 || x + p.w < -4) continue;
      const y = Math.round(p.y);
      if (!fading) {
        c.drawImage(this.getPlatformCache(p, this.platI, outZ), x, y - PLATFORM_CACHE_PAD);
        continue;
      }
      c.globalAlpha = 1;
      c.drawImage(this.getPlatformCache(p, this.platI, outZ), x, y - PLATFORM_CACHE_PAD);
      c.globalAlpha = t;
      c.drawImage(this.getPlatformCache(p, this.platNI, inZ), x, y - PLATFORM_CACHE_PAD);
      c.globalAlpha = 1;
    }
  }

  private drawSprings() {
    const c = this.ctx;
    const cam = Math.round(this.g.camX);

    /* springs */
    for (const s of this.g.springs) {
      const x = Math.round(s.x - cam);
      if (x > VW || x < -20) continue;
      const press = s.press > 0 ? 4 : 0;
      const baseY = Math.round(s.y);
      const y = baseY + press;
      const groundY = baseY + 9;
      if (s.mega) {
        // mega pad — big, golden
        c.fillStyle = '#3a2010';
        c.fillRect(x + 1, baseY + 6, 16, Math.max(1, groundY - (baseY + 6)));
        c.fillStyle = '#ffb03e';
        c.fillRect(x, y, 18, 5);
        c.fillStyle = '#ffe9a0';
        c.fillRect(x + 2, y + 1, 14, 1);
      } else {
        c.fillStyle = '#5b2f6e';
        c.fillRect(x + 1, baseY + 5, 12, Math.max(1, groundY - (baseY + 5)));
        c.fillStyle = '#ff4d6d';
        c.fillRect(x, y, 14, 4);
        c.fillStyle = '#ffd166';
        c.fillRect(x + 2, y + 1, 10, 1);
      }
    }
  }

  private drawSpikes() {
    const c = this.ctx;
    const cam = Math.round(this.g.camX);

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
  }

  private drawPickups() {
    const c = this.ctx;
    const cam = Math.round(this.g.camX);

    /* pickups */
    for (const k of this.g.pickups) {
      if (k.dead) continue;
      const x = Math.round(k.x - cam);
      if (x > VW + 10 || x < -10) continue;
      const bob = Math.sin(k.t * 0.9) * 1.6;
      const y = Math.round(k.y + bob);
      if (k.gem) {
        // Clean pixel diamond outline
        c.fillStyle = '#08121e';
        c.fillRect(x - 4, y - 4, 8, 8);
        c.fillRect(x - 3, y - 5, 6, 10);
        c.fillRect(x - 5, y - 3, 10, 6);

        // Bright vibrant cyan jewel body (clean, flat, radiant with no dark muddy shading)
        c.fillStyle = '#3ef2c8';
        c.fillRect(x - 3, y - 4, 6, 8);
        c.fillRect(x - 4, y - 3, 8, 6);

        // Radiant jewel highlight
        c.fillStyle = '#7ef7ff';
        c.fillRect(x - 2, y - 4, 4, 3);
        c.fillRect(x - 4, y - 2, 3, 4);

        // Crisp white glint
        c.fillStyle = '#ffffff';
        c.fillRect(x - 2, y - 3, 2, 2);
        if (Math.sin(k.t * 4.5) > 0.3) {
          c.fillRect(x - 4, y - 4, 1, 1);
          c.fillRect(x + 2, y + 2, 1, 1);
        }
      } else {
        const Z = this.g.zone;
        if (Z.bg === 'tundra') {
          // snowflake shard coin — frozen shard by design (no spin frame)
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
          const f = Math.floor(k.t * 1.1) % 4;
          const hw = COIN_HW[f];
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
          const f = Math.floor(k.t * 1.1) % 4;
          const hw = COIN_HW[f];
          c.fillStyle = Z.coinEdge;
          c.fillRect(x - hw, y - 3, hw * 2, 7);
          c.fillStyle = Z.coinFill;
          c.fillRect(x - hw, y - 3, hw * 2, 6);
          c.fillStyle = Z.coinShine;
          c.fillRect(x - hw + (f === 2 ? 0 : 1), y - 2, 1, 3);
        }
      }
    }
  }

  private drawPowerUps() {
    const c = this.ctx;
    const cam = Math.round(this.g.camX);

    /* power-ups */
    for (const power of this.g.powerups) {
      if (power.dead) continue;
      const x = Math.round(power.x - cam);
      if (x > VW + 14 || x < -14) continue;
      const y = Math.round(power.y - Math.max(0, Math.sin(power.t)) * 2);
      c.drawImage(this.powerupSprite(power.kind), x - 9, y - 9);
    }
  }

  private drawEnemies() {
    const cam = Math.round(this.g.camX);
    const Z = this.g.zone;
    for (const e of this.g.enemies) {
      if (e.dead) continue;
      const x = Math.round(e.x - cam);
      if (x > VW + 20 || x < -20) continue;
      const y = Math.round(e.y);
      this.drawEnemy(e, x, y, e.hurt > 0, Z);
    }
  }

  private drawEnemy(e: Enemy, x: number, y: number, hurt: boolean, Z: Zone) {
    const c = this.ctx;
    if (e.kind === 'flyer') {
      const dir = e.vx < 0 ? -1 : 1;
      const wingUp = Math.sin(e.t * 8) > 0;
      const wy = wingUp ? -2 : 2;

      // 1. Main chunky body (no black outline)
      c.fillStyle = hurt ? '#ffffff' : Z.flyerBody;
      c.fillRect(x + 2, y + 3, 14, 6);

      // 2. Highlight / belly strip
      c.fillStyle = Z.flyerLight;
      c.fillRect(x + 4, y + 5, 10, 2);

      // 3. Simple chunky flapping wings
      c.fillStyle = hurt ? '#ffffff' : Z.flyerLight;
      c.fillRect(x + 5, y + 1 + wy, 8, 2);

      // 4. Chunky pixel eye on front
      c.fillStyle = Z.accent;
      c.fillRect(x + (dir < 0 ? 3 : 13), y + 4, 2, 2);
      c.fillStyle = '#ffffff';
      c.fillRect(x + (dir < 0 ? 3 : 14), y + 4, 1, 1);
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
        const pupilLeft = e.vx > 0 ? 3 : 1;
        const pupilRight = e.vx > 0 ? 11 : 9;
        c.fillRect(x + pupilLeft + eo, yy + 1, 2, 2);
        c.fillRect(x + pupilRight + eo, yy + 1, 2, 2);
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
        const pupilLeft = e.vx > 0 ? 5 : 4;
        const pupilRight = e.vx > 0 ? 11 : 10;
        c.fillRect(x + pupilLeft + eo, yy + 5, 2, 2);
        c.fillRect(x + pupilRight + eo, yy + 5, 2, 2);
      }
  }

  private drawPowerUpEffects(c: CanvasRenderingContext2D, cx: number, cy: number) {
    if (this.g.shielded) {
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

    /* active skin & ghost trails */
    const skinId = this.g.activeSkin || 'bob';
    const skinDef: SkinDef = SKINS[skinId] || SKINS.bob;

    /* ghosts */
    if (this.g.phase === 'playing' && this.g.countdown === 0) {
      for (const g of this.g.ghosts) {
        c.globalAlpha = (g.life / 14) * 0.28;
        c.fillStyle = skinDef.ghostTrail;
        if (skinId === 'outline') {
          // Pure 1px hollow frame for ghost
          const gx = Math.round(g.x - cam);
          const gy = Math.round(g.y);
          c.fillRect(gx, gy, PLAYER_W, 1);
          c.fillRect(gx, gy + PLAYER_H - 1, PLAYER_W, 1);
          c.fillRect(gx, gy, 1, PLAYER_H);
          c.fillRect(gx + PLAYER_W - 1, gy, 1, PLAYER_H);
        } else {
          c.fillRect(Math.round(g.x - cam), Math.round(g.y), PLAYER_W, PLAYER_H);
        }
      }
      c.globalAlpha = 1;
    }

    /* player body */
    const cx = Math.round(this.g.px - cam + PLAYER_W / 2);
    const cy = Math.round(this.g.py + PLAYER_H / 2);
    const qx = Math.abs(this.g.sx - 1) < 0.05 ? 1 : this.g.sx;
    const qy = Math.abs(this.g.sy - 1) < 0.05 ? 1 : this.g.sy;
    const host = this.g as RenderHost & { playerSquashX?: number; playerSquashY?: number };
    const sqx = host.playerSquashX ?? 1;
    const sqy = host.playerSquashY ?? 1;
    c.save();
    c.translate(cx, cy);
    if (this.g.spin > 0) c.rotate(this.g.spin * Math.PI * 2);
    if (qx * sqx !== 1 || qy * sqy !== 1) c.scale(qx * sqx, qy * sqy);
    const run = this.g.onGround ? Math.floor(this.g.animT) % 4 : -1;
    const flashing = this.g.invuln > 0;
    const flash = flashing ? 0.35 + (Math.sin(this.g.frame * 0.75) + 1) * 0.325 : 0;

    drawPlayerSprite(c, 0, 0, {
      skinId,
      frame: this.g.frame,
      run,
      onGround: this.g.onGround,
      diving: this.g.diving,
      flashing,
      flashAmount: flash,
      jumpShoes: this.g.jumpShoes > 0,
      vx: this.g.vx,
    });

    // Gold Bob Sparkles
    if (skinId === 'gold_bob' && Math.random() < 0.3) {
      this.particles.spawnP(
        this.g.px + rnd(-2, 12),
        this.g.py + rnd(0, 14),
        rnd(-0.5, 0.5),
        -rnd(0.2, 0.8),
        12,
        1,
        '#fff3a3',
      );
    }

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

    /* Local Battle Players (P1 - P4) */
    if (this.g.mode === 'local' && this.g.localPlayers) {
      this.g.localPlayers.forEach((p, idx) => {
        if (!p.isAlive) return;
        const pCx = Math.round(p.px - cam + PLAYER_W / 2);
        const pCy = Math.round(p.py + PLAYER_H / 2);
        const badgeLabel = p.name ? p.name.substring(0, 8) : `P${idx + 1}`;

        if (idx === 0) {
          // P1 Badge above player 1
          drawTextCentered(c, badgeLabel, cx, cy - PLAYER_H / 2 - 8, 1, p.color || '#3ef2c8', '#150a24');
        } else {
          c.save();
          c.translate(pCx, pCy);
          if (p.spin > 0) c.rotate(p.spin * Math.PI * 2);
          // sx/sy lerp asymptotically toward 1 in the engine, so compare with
          // an epsilon — otherwise a perpetual near-1 scale keeps the sprite
          // on subpixel offsets and it shimmers every frame.
          const psx = Math.abs(p.sx - 1) < 0.05 ? 1 : p.sx;
          const psy = Math.abs(p.sy - 1) < 0.05 ? 1 : p.sy;
          if (psx !== 1 || psy !== 1) c.scale(psx, psy);

          drawPlayerSprite(c, 0, 0, {
            skinId: p.skinId || 'rob',
            frame: this.g.frame,
            run: p.onGround ? Math.floor(p.animT) % 4 : -1,
            onGround: p.onGround,
            diving: p.diving,
            vx: p.vx,
          });

          c.restore();

          // P2 / P3 / P4 Badge
          drawTextCentered(c, badgeLabel, pCx, pCy - PLAYER_H / 2 - 8, 1, p.color || '#ffd166', '#150a24');
        }
      });
    }

    /* Online Multiplayer Opponent Ghosts */
    if (this.g.mode === 'online' && this.g.opponentStates) {
      if (this.oppSmooth.size > this.g.opponentStates.size + 4) {
        for (const k of this.oppSmooth.keys()) if (!this.g.opponentStates.has(k)) this.oppSmooth.delete(k);
      }
      for (const opp of this.g.opponentStates.values()) {
        if (!opp.isAlive || opp.px === undefined || opp.py === undefined) continue;
        // Smooth the rendered position toward the latest tick. Big jumps
        // (respawn, throttled-tab catch-up) snap straight there instead of
        // lerping across the screen. After match end the world is frozen, so
        // snap too — no smoothing against a still target.
        let s = this.oppSmooth.get(opp.peerId);
        if (!s) {
          s = { x: opp.px, y: opp.py };
          this.oppSmooth.set(opp.peerId, s);
        } else if (this.g.phase === 'over' || Math.abs(opp.px - s.x) > 40 || Math.abs(opp.py - s.y) > 60) {
          s.x = opp.px;
          s.y = opp.py;
        } else {
          s.x += (opp.px - s.x) * 0.35;
          s.y += (opp.py - s.y) * 0.35;
        }
        const oppCx = Math.round(s.x - cam + PLAYER_W / 2);
        const oppCy = Math.round(s.y + PLAYER_H / 2);

        c.save();
        c.translate(oppCx, oppCy);
        c.globalAlpha = 0.75;

        drawPlayerSprite(c, 0, 0, {
          skinId: opp.skinId || 'bob',
          frame: opp.frame ?? this.g.frame,
          run: opp.run ?? -1,
          onGround: opp.run !== -1,
          diving: Boolean(opp.diving),
          vx: opp.vx ?? 0,
        });

        c.globalAlpha = 0.9;
        drawTextCentered(c, opp.name, 0, -PLAYER_H / 2 - 8, 1, '#ffd166', '#150a24');

        c.restore();
      }
    }
  }

  private drawBiomeEvent() {
    if (this.g.phase !== 'playing' || this.g.eventTimer <= 0 || this.g.eventMax <= 0) return;
    const c = this.ctx;
    const fadeWindow = 60;
    const inFade = Math.min(1, Math.max(0, (this.g.eventMax - this.g.eventTimer) / fadeWindow));
    const outFade = Math.min(1, Math.max(0, this.g.eventTimer / fadeWindow));
    const strength = Math.min(inFade, outFade);
    if (strength <= 0.001) return;
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
    } else if (this.g.eventKind === 'city') {
      // subtle neon flicker washing over the screen
      c.globalAlpha = (0.045 + 0.035 * Math.sin(this.g.frame * 0.21)) * strength;
      c.fillStyle = '#7ef7ff';
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
    } else if (this.g.eventKind === 'city') {
      // neon rain — thin cyan streaks, a few with a glint tip
      for (let i = 0; i < 70; i++) {
        const x = wrap(
          hash(this.g.eventSeed + i * 6.3) * (VW + 24) - this.g.frame * (1.5 + (i % 3) * 0.35),
          VW + 24,
        ) - 12;
        const y = wrap(
          hash(this.g.eventSeed + i * 14.9) * (VH + 80) - this.g.frame * (2.4 + (i % 4) * 0.45),
          VH + 80,
        ) - 40;
        const len = 5 + Math.round(hash(this.g.eventSeed + i * 3.1) * 9);
        c.globalAlpha = alpha * (0.75 + 0.25 * Math.sin(this.g.frame * 0.09 + i * 1.7));
        c.fillStyle = i % 3 === 0 ? '#7ef7ff' : Z.accent;
        c.fillRect(Math.round(x), Math.round(y), 1, len);
        if (i % 6 === 0) c.fillRect(Math.round(x), Math.round(y + len + 1), 1, 1);
      }
    }
    c.globalAlpha = 1;
  }

  private drawForeground() {
    const c = this.ctx;
    // dust motes
    c.fillStyle = '#ffffff';
    for (const [mx, my, spd, ph] of this.motes) {
      const x = ((mx - this.g.camX * spd * 0.5) % VW + VW) % VW;
      const y = my + Math.sin(this.g.frame * 0.02 + ph) * 6;
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
    const hasBest = this.g.best > 0;
    const y = hasBest ? 44 : 34;
    const W = Math.floor(VW / this.hudScale);
    const status = (remaining: number, kind: PowerUpKind) => {
      // The propeller flashes with 0s left — draw the icon alone, no "0".
      const text = remaining > 0 ? String(Math.ceil(remaining / 60)) : '';
      const width = textWidth(text, 1) + 12;
      if (x + width > W - 6) return;
      const col = POWERUP_COLORS[kind];
      // Same art as the pickup sprites, at half scale for the HUD row.
      c.drawImage(this.powerupSprite(kind), x, y, 9, 9);
      if (text) drawText(c, text, x + 11, y + 1, 1, col, '#150a24');
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
    const hs = this.hudScale;
    const mobile = this.mobileView;
    const isNarrow = VW < 300;
    const lblS = 1;
    const digS = 2;
    const bestS = 1;
    const bestY = 32;
    const adv = 6 * digS;
    c.save();
    if (hs !== 1) c.scale(hs, hs);
    const W = Math.floor(VW / hs);

    // 1. SCORE (Top Left)
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

    // 2. BEST / HIGH SCORE (Below Score)
    if (this.g.best > 0) {
      const isNewHigh = this.g.score > this.g.best;
      const displayBest = isNewHigh ? this.g.score : this.g.best;
      if (this.hudBest !== displayBest) {
        this.hudBest = displayBest;
        this.hudBestStr = pad(displayBest, 6);
      }
      const label = isNewHigh ? 'NEW BEST!' : 'BEST';
      const labelCol = isNewHigh ? '#ffd166' : this.g.zone.accent;
      const scoreCol = isNewHigh ? '#ffd166' : this.g.zone.accent;
      drawText(c, label, 6, bestY, bestS, labelCol, '#150a24');
      const scoreX = 6 + textWidth(label, bestS) + 6;
      drawText(c, this.hudBestStr, scoreX, bestY, bestS, scoreCol, '#150a24');
    }
    this.drawPowerUpHud();

    // 3. DISTANCE & GEMS (Top Right)
    const rightMargin = mobile ? 54 : 8;
    if (this.hudM !== m) {
      this.hudM = m;
      this.hudMText = m + 'M';
    }
    const dtxt = this.hudMText;
    const distScale = 2; // Nice and large for clarity
    drawText(c, dtxt, W - rightMargin - textWidth(dtxt, distScale), 6, distScale, this.g.zone.accent, '#150a24');

    // Gems counter (y: 24)
    if (this.hudGems !== this.g.runGems) {
      this.hudGems = this.g.runGems;
      this.hudGemsText = 'X' + pad(this.g.runGems, 2);
    }
    const gtxt = this.hudGemsText;
    const gw = textWidth(gtxt, 1) + 12;
    const gx0 = W - rightMargin - gw;
    const gy = 24;

    // Exact matching diamond jewel sprite
    c.fillStyle = '#08121e';
    c.fillRect(gx0, gy + 1, 6, 6);
    c.fillRect(gx0 + 1, gy, 4, 8);
    c.fillStyle = '#3ef2c8';
    c.fillRect(gx0 + 1, gy + 1, 4, 6);
    c.fillRect(gx0, gy + 2, 6, 4);
    c.fillStyle = '#7ef7ff';
    c.fillRect(gx0 + 1, gy + 1, 2, 2);
    c.fillStyle = '#ffffff';
    c.fillRect(gx0 + 1, gy + 2, 1, 1);

    drawText(c, gtxt, gx0 + 9, gy, 1, '#3ef2c8', '#150a24');

    // 4. COMBO BAR
    // On mobile / narrow screens, place below the top row (y = 56) centered in the open sky.
    // On wide desktop, place top center (y = 8).
    if (mobile || isNarrow) {
      this.drawCombo(Math.round(W / 2), 56);
    } else {
      this.drawCombo(Math.round(W / 2), 8);
    }

    // 5. BATTLE LIVE STATUS
    if (this.g.mode === 'local' && this.g.localPlayers && this.g.localPlayers.length > 0) {
      const midX = Math.round(W / 2);
      // Below the combo bar (y = 56, bar 65-72) on mobile / narrow screens.
      const vsY = mobile || isNarrow ? 78 : 26;
      const parts = this.g.localPlayers.map((p, idx) => ({
        txt: `${p.name ? p.name.substring(0, 7) : `P${idx + 1}`}:${p.isAlive ? p.score : 'DEAD'}`,
        col: p.isAlive ? (idx === 0 ? '#3ef2c8' : idx === 1 ? '#ffd166' : idx === 2 ? '#ff70a6' : '#7ef7ff') : '#6b5880',
      }));

      const sep = ' | ';
      let totalW = 0;
      parts.forEach((part, i) => {
        totalW += textWidth(part.txt, 1);
        if (i < parts.length - 1) totalW += textWidth(sep, 1);
      });
      let curX = midX - Math.floor(totalW / 2);

      parts.forEach((part, i) => {
        drawText(c, part.txt, curX, vsY, 1, part.col, '#150a24');
        curX += textWidth(part.txt, 1);
        if (i < parts.length - 1) {
          drawText(c, sep, curX, vsY, 1, '#ffffff', '#150a24');
          curX += textWidth(sep, 1);
        }
      });
    } else if (this.g.mode === 'online' && this.g.opponentStates && this.g.opponentStates.size > 0) {
      const midX = Math.round(W / 2);
      const vsY = mobile || isNarrow ? 78 : 26;
      const p1Score = this.g.score;
      const firstOpp = this.g.opponentStates.values().next().value;
      if (firstOpp) {
        const p2Score = firstOpp.score;
        const p1Ahead = p1Score >= p2Score;
        const p1Col = p1Ahead ? '#3ef2c8' : '#ffd166';
        const p2Col = !p1Ahead ? '#3ef2c8' : '#ff70a6';

        const p1Txt = `YOU:${p1Score}`;
        const vsTxt = ` VS `;
        const p2Txt = `${firstOpp.name.slice(0, 6)}:${p2Score}`;

        const totalW = textWidth(p1Txt, 1) + textWidth(vsTxt, 1) + textWidth(p2Txt, 1);
        const startX = midX - Math.floor(totalW / 2);

        drawText(c, p1Txt, startX, vsY, 1, p1Col, '#150a24');
        const vsX = startX + textWidth(p1Txt, 1);
        drawText(c, vsTxt, vsX, vsY, 1, '#ffffff', '#150a24');
        const p2X = vsX + textWidth(vsTxt, 1);
        drawText(c, p2Txt, p2X, vsY, 1, p2Col, '#150a24');
      }
    }

    c.restore();
  }

  private drawCombo(labelCenterX: number, y: number) {
    if (this.g.combo <= 1) return;
    const c = this.ctx;
    const t = this.g.comboT / COMBO_TIME;
    // Only rebuild the label string when its parts change.
    const key = this.g.combo + '|' + this.g.mult();
    if (key !== this.hudComboKey) {
      this.hudComboKey = key;
      this.hudComboStr = 'X' + this.g.mult() + ' COMBO ' + this.g.combo;
    }
    const label = this.hudComboStr;
    const flash = this.g.comboPulse;
    const col = flash > 0.4 ? '#ffffff' : '#ffd166';
    // Bar grows with the label so a long "X8 COMBO 9999" can't overflow it.
    const bw = Math.max(84, textWidth(label, 1) + 12);
    drawTextCentered(c, label, labelCenterX, y, 1, col, '#150a24');
    c.fillStyle = '#150a24';
    c.fillRect(labelCenterX - bw / 2 - 1, y + 9, bw + 2, 7);
    c.fillStyle = t > 0.3 ? this.g.zone.accent : '#ff4d6d';
    c.fillRect(labelCenterX - bw / 2, y + 10, Math.round(bw * t), 5);
  }
}
