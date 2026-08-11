import { P_CAP, ri, rnd, type Particle } from './types';

/**
 * Ring-buffer particle pool. `parts` is a fixed array of reusable entries
 * (pIdx walks it forever), so the pool never grows and never GCs mid-run.
 */
export class ParticleSystem {
  private parts: Particle[] = [];
  private pIdx = 0;

  reset() {
    this.parts.length = 0;
    this.pIdx = 0;
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

  draw(c: CanvasRenderingContext2D, camX: number) {
    const cam = Math.round(camX);
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
}
