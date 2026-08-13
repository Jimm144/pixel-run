import { drawText, FONT_H, textWidth } from './font';
import { T_CAP, type FloatText } from './types';

/** Floating score/combo texts, baked once into a crisp sprite. */
export class FloatTexts {
  private texts: FloatText[] = [];
  /** Canvas sprites recycled when their text expires — busy runs pop
   *  hundreds of texts and never need to reallocate a canvas. */
  private pool: HTMLCanvasElement[] = [];

  reset() {
    this.texts.length = 0;
  }

  popText(x: number, y: number, text: string, col: string, scale = 1) {
    if (this.texts.length >= T_CAP) {
      const dropped = this.texts.shift();
      if (dropped) this.pool.push(dropped.sprite);
    }
    const tw = textWidth(text, scale);
    this.texts.push({
      x,
      y,
      vy: -0.62,
      life: 52,
      max: 52,
      text,
      col,
      scale,
      w: tw,
      sprite: this.bakeFloatText(text, col, scale, tw),
    });
  }

  private bakeFloatText(text: string, col: string, scale: number, tw: number): HTMLCanvasElement {
    const h = FONT_H * scale;
    const w = tw + 4;
    const hh = h + 4;
    let cv = this.pool.pop();
    if (!cv || cv.width !== w || cv.height !== hh) {
      cv = document.createElement('canvas');
      cv.width = w;
      cv.height = hh;
      // Prevent the font atlas from being bilinearly interpolated when blitted
      // onto this small canvas — without this the 1px strokes blur on upscale.
      cv.getContext('2d')!.imageSmoothingEnabled = false;
    }
    const c = cv.getContext('2d')!;
    c.clearRect(0, 0, w, hh);
    drawText(c, text, 2, 2, scale, col, '#1a0a2a');
    return cv;
  }

  update() {
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life--;
      t.y += t.vy;
      t.vy *= 0.96;
      if (t.life <= 0) {
        this.pool.push(t.sprite);
        this.texts.splice(i, 1);
      }
    }
  }

  draw(c: CanvasRenderingContext2D, camX: number) {
    const cam = Math.round(camX);
    for (const t of this.texts) {
      const a = t.life / t.max;
      c.globalAlpha = a > 0.4 ? 1 : a / 0.4;
      const tx = Math.round(t.x - cam);
      const anchorX = Math.round(tx - t.w / 2);
      const anchorY = Math.round(t.y);

      // Smooth ease-out pop: scale from (scale+1) down to scale over the
      // first 6 frames, scaled about the sprite centre so the glyph stays
      // anchored. The steady-state draw below centres the sprite at
      // (tx, anchorY + h/2), so the pop translates to that exact point.
      const age = t.max - t.life;
      if (age < 6) {
        const popT = age / 6;
        const sf = (t.scale + (1 - popT) * (1 - popT)) / t.scale;
        c.save();
        c.translate(tx, anchorY + (FONT_H * t.scale) / 2);
        c.scale(sf, sf);
        c.drawImage(t.sprite, -(t.w + 4) / 2, -(FONT_H * t.scale + 4) / 2);
        c.restore();
      } else {
        c.drawImage(t.sprite, anchorX - 2, anchorY - 2);
      }
    }
    c.globalAlpha = 1;
  }
}
