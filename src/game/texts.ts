import { drawText, FONT_H, textWidth } from './font';
import { T_CAP, type FloatText } from './types';

/** Floating score/combo texts, baked once into a crisp sprite. */
export class FloatTexts {
  private texts: FloatText[] = [];

  reset() {
    this.texts.length = 0;
  }

  popText(x: number, y: number, text: string, col: string, scale = 1) {
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
    });
  }

  private bakeFloatText(text: string, col: string, scale: number): HTMLCanvasElement {
    const tw = textWidth(text, scale);
    const h = FONT_H * scale;
    const cv = document.createElement('canvas');
    cv.width = tw + 4;
    cv.height = h + 4;
    const c = cv.getContext('2d')!;
    // Prevent the font atlas from being bilinearly interpolated when blitted
    // onto this small canvas — without this the 1px strokes blur on upscale.
    c.imageSmoothingEnabled = false;
    drawText(c, text, 2, 2, scale, col, '#1a0a2a');
    return cv;
  }

  update() {
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life--;
      t.y += t.vy;
      t.vy *= 0.96;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
  }

  draw(c: CanvasRenderingContext2D, camX: number) {
    const cam = Math.round(camX);
    for (const t of this.texts) {
      const a = t.life / t.max;
      c.globalAlpha = a > 0.4 ? 1 : a / 0.4;
      const tx = Math.round(t.x - cam);
      const tw = textWidth(t.text, t.scale);
      const anchorX = Math.round(tx - tw / 2);
      const anchorY = Math.round(t.y);

      // Smooth ease-out pop: scale from (scale+1) down to scale over the
      // first 6 frames, anchored at the text center so the glyph stays put.
      const age = t.max - t.life;
      if (age < 6) {
        const popT = age / 6;
        const sf = (t.scale + (1 - popT) * (1 - popT)) / t.scale;
        c.save();
        c.translate(anchorX, anchorY);
        c.scale(sf, sf);
        c.translate(-2, -2);
        c.drawImage(t.sprite, 0, 0);
        c.restore();
      } else {
        c.drawImage(t.sprite, anchorX - 2, anchorY - 2);
      }
      c.globalAlpha = 1;
    }
  }
}
