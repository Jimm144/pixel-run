import { P_CAP, ri, rnd, VW, type Particle } from './types';

/**
 * Free-list particle pool. Every particle lives in exactly one of two lists:
 * `alive` (updated/drawn each frame) and `free` (reusable slots). Spawning
 * never allocates once the pool is warm, and update/draw only touch the
 * particles that are actually alive instead of scanning all P_CAP slots.
 */
export class ParticleSystem {
  private alive: Particle[] = [];
  private free: Particle[] = [];

  reset() {
    this.free.push(...this.alive);
    this.alive.length = 0;
  }

  spawnP(
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
    // Hard cap: recycle the oldest live particle, ring-buffer style.
    if (this.alive.length >= P_CAP) {
      const oldest = this.alive[0];
      this.alive[0] = this.alive[this.alive.length - 1];
      this.alive.pop();
      this.free.push(oldest);
    }
    let p = this.free.pop();
    if (!p) {
      p = { x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, col, grav: 0, drag: 1 };
    }
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
    this.alive.push(p);
  }

  burst(x: number, y: number, n: number, cols: string[], power: number, grav = 0.14) {
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

  update(sc: number) {
    for (let i = this.alive.length - 1; i >= 0; i--) {
      const p = this.alive[i];
      p.life -= sc;
      if (p.life <= 0) {
        this.free.push(p);
        this.alive[i] = this.alive[this.alive.length - 1];
        this.alive.pop();
        continue;
      }
      p.x += p.vx * sc;
      p.y += p.vy * sc;
      p.vy += p.grav * sc;
      // Drag is time-scaled like the motion above, so slow-mo (death hit) no
      // longer decelerates particles relatively faster than real time.
      if (p.drag !== 1) {
        const d = p.drag ** sc;
        p.vx *= d;
        p.vy *= d;
      }
    }
  }

  draw(c: CanvasRenderingContext2D, camX: number) {
    const cam = Math.round(camX);
    // Viewport cull: skip particles outside the frame (plus a small margin).
    for (const p of this.alive) {
      if (p.x < cam - 8 || p.x > cam + VW + 8) continue;
      const a = p.life / p.max;
      c.globalAlpha = a > 0.55 ? 1 : a / 0.55;
      c.fillStyle = p.col;
      const s = a < 0.35 ? 1 : p.size;
      c.fillRect(Math.round(p.x - cam), Math.round(p.y), s, s);
    }
    c.globalAlpha = 1;
  }
}
