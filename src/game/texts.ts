import { drawText, FONT_H, textWidth } from './font';
import { T_CAP, type FloatText } from './types';

/** Floating score/combo texts, each baked once into a 5-layer glyph sprite. */
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
      spritePop: this.bakeFloatText(text, col, scale + 1),
    });
  }

  private bakeFloatText(text: string, col: string, scale: number): HTMLCanvasElement {
    const tw = textWidth(text, scale);
    const h = FONT_H * scale;
    const cv = document.createElement('canvas');
    cv.width = tw + 4;
    cv.height = h + 4;
    const c = cv.getContext('2d')!;
    // Single offset shadow (same as the HUD) — the old 4-directional outline
    // cross-hatched the 1px strokes and read as blurry when upscaled.
    // Fill at local (2,2): the draw call maps that pixel to the text anchor.
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
      const pop = t.life > t.max - 6;
      const img = pop ? t.spritePop : t.sprite;
      const tx = Math.round(t.x - cam);
      const tw = textWidth(t.text, pop ? t.scale + 1 : t.scale);
      c.drawImage(img, Math.round(tx - tw / 2) - 2, Math.round(t.y) - 2);
      c.globalAlpha = 1;
    }
  }
}
