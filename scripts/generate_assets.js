import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

/**
 * Pixel-Perfect Asset Generator for Pixel Run
 * Uses the exact in-game Bob sprite (side-profile, red suit, peach face, teal scarf).
 */

function createPNG(width, height, rgbaBuffer) {
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    crcTable[n] = c;
  }

  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    const crc = crc32(Buffer.concat([typeBuf, data]));
    crcBuf.writeUInt32BE(crc, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const scanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const scanlineOffset = y * (1 + width * 4);
    scanlines[scanlineOffset] = 0;
    rgbaBuffer.copy(scanlines, scanlineOffset + 1, y * width * 4, (y + 1) * width * 4);
  }

  const compressed = zlib.deflateSync(scanlines, { level: 9 });
  const idat = makeChunk('IDAT', compressed);
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, makeChunk('IHDR', ihdr), idat, iend]);
}

function hexToRgba(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
    255,
  ];
}

// -------------------------------------------------------------
// Pure in-game Bob drawing (authentic side-profile)
// -------------------------------------------------------------
function generateSquareAppIcon(size) {
  const buf = Buffer.alloc(size * size * 4);

  function setPixel(x, y, r, g, b, a = 255) {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const idx = (y * size + x) * 4;
    buf[idx] = r;
    buf[idx + 1] = g;
    buf[idx + 2] = b;
    buf[idx + 3] = a;
  }

  function fillRect(x, y, w, h, hex) {
    const [r, g, b, a] = hexToRgba(hex);
    for (let py = Math.floor(y); py < Math.floor(y + h); py++) {
      for (let px = Math.floor(x); px < Math.floor(x + w); px++) {
        setPixel(px, py, r, g, b, a);
      }
    }
  }

  // 1. Clean borderless deep dark arcade background
  const bgDark = hexToRgba('#0d0619');
  const bgDeep = hexToRgba('#140a26');
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const grad = y / size;
      const r = Math.floor(bgDark[0] + (bgDeep[0] - bgDark[0]) * grad);
      const g = Math.floor(bgDark[1] + (bgDeep[1] - bgDark[1]) * grad);
      const b = Math.floor(bgDark[2] + (bgDeep[2] - bgDark[2]) * grad);
      setPixel(x, y, r, g, b, 255);
    }
  }

  // 2. Draw in-game Bob exactly (11x15 logical pixel grid) centered
  const scale = Math.floor(size / 18);
  const startX = Math.floor((size - 11 * scale) / 2);
  const startY = Math.floor((size - 15 * scale) / 2);

  function f(x, y, w, h, hex) {
    fillRect(startX + x * scale, startY + y * scale, w * scale, h * scale, hex);
  }

  // Exact in-game playerSprite.ts coordinates for classic Bob:
  // Hair / Cap
  f(2, 0, 7, 6, '#ff4d6d');   // Red cap/suit
  f(2, 0, 8, 2, '#b32a4d');   // Dark red top
  // Peach Face
  f(5, 2, 4, 4, '#ffcf9e');   // Clean peach skin
  // Eye
  f(7, 3, 1, 2, '#20122e');   // Dark purple eye
  // Teal Scarf
  f(1, 5, 3, 2, '#3ef2c8');   // Bright teal scarf
  // Body
  f(2, 6, 7, 4, '#ff4d6d');   // Red suit torso
  f(2, 8, 7, 2, '#b32a4d');   // Dark red lower torso
  // Legs shifted toward the rear for the favicon stance
  f(1, 10, 3, 3, '#59427e');  // Rear-shifted leg
  f(1, 13, 3, 2, '#2b1b45');  // Rear-shifted boot
  f(5, 10, 3, 4, '#59427e');  // Rear-shifted leg
  f(5, 14, 3, 1, '#2b1b45');  // Rear-shifted boot

  return createPNG(size, size, buf);
}

// -------------------------------------------------------------
// Preview.png & og-image.png Generator (1200x630 Wide Card)
// -------------------------------------------------------------
function generatePreviewCard() {
  const W = 1200;
  const H = 630;
  const buf = Buffer.alloc(W * H * 4);

  function setPixel(x, y, r, g, b, a = 255) {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const idx = (y * W + x) * 4;
    buf[idx] = r;
    buf[idx + 1] = g;
    buf[idx + 2] = b;
    buf[idx + 3] = a;
  }

  function fillRect(x, y, w, h, hex, alpha = 255) {
    const [r, g, b] = hexToRgba(hex);
    for (let py = Math.floor(y); py < Math.floor(y + h); py++) {
      for (let px = Math.floor(x); px < Math.floor(x + w); px++) {
        if (alpha >= 255) {
          setPixel(px, py, r, g, b, 255);
        } else if (px >= 0 && px < W && py >= 0 && py < H) {
          const idx = (py * W + px) * 4;
          const blend = alpha / 255;
          buf[idx] = Math.round(buf[idx] * (1 - blend) + r * blend);
          buf[idx + 1] = Math.round(buf[idx + 1] * (1 - blend) + g * blend);
          buf[idx + 2] = Math.round(buf[idx + 2] * (1 - blend) + b * blend);
          buf[idx + 3] = 255;
        }
      }
    }
  }

  // Synthwave sunset sky gradient
  for (let y = 0; y < H; y++) {
    const t = y / H;
    let r;
    let g;
    let b;
    if (t < 0.5) {
      const st = t / 0.5;
      r = Math.floor(18 + (55 - 18) * st);
      g = Math.floor(10 + (16 - 10) * st);
      b = Math.floor(42 + (65 - 42) * st);
    } else {
      const st = (t - 0.5) / 0.5;
      r = Math.floor(55 + (180 - 55) * st * 0.5);
      g = Math.floor(16 + (60 - 16) * st * 0.4);
      b = Math.floor(65 + (35 - 65) * st);
    }
    for (let x = 0; x < W; x++) {
      setPixel(x, y, r, g, b, 255);
    }
  }

  // Distant stars
  const stars = [
    [100, 40], [250, 70], [420, 30], [580, 85], [750, 50], [920, 65], [1080, 35],
    [180, 120], [340, 150], [680, 130], [840, 110], [1020, 140], [50, 180],
  ];
  stars.forEach(([sx, sy]) => {
    fillRect(sx, sy, 3, 3, '#ffd166', 200);
    fillRect(sx + 1, sy - 1, 1, 5, '#ffffff', 240);
    fillRect(sx - 1, sy + 1, 5, 1, '#ffffff', 240);
  });

  // Segmented synthwave sun
  const sunX = 380;
  const sunY = 250;
  const sunR = 120;
  for (let dy = -sunR; dy <= sunR; dy++) {
    const py = sunY + dy;
    if (py < 0 || py >= H) continue;
    const dxMax = Math.floor(Math.sqrt(sunR * sunR - dy * dy));
    const stripe = (dy + sunR) % 18;
    if (stripe > 13 && dy > 0) continue;
    const sunT = (dy + sunR) / (2 * sunR);
    const sr = Math.floor(255 - sunT * 20);
    const sg = Math.floor(209 - sunT * 120);
    const sb = Math.floor(102 - sunT * 80);
    const hex = `#${sr.toString(16).padStart(2, '0')}${sg.toString(16).padStart(2, '0')}${sb.toString(16).padStart(2, '0')}`;
    fillRect(sunX - dxMax, py, dxMax * 2, 1, hex);
  }

  // Skyline silhouette
  const buildings = [
    { x: 0, w: 90, h: 140 },
    { x: 70, w: 110, h: 190 },
    { x: 160, w: 70, h: 130 },
    { x: 210, w: 90, h: 220 },
    { x: 290, w: 80, h: 170 },
    { x: 350, w: 100, h: 140 },
    { x: 440, w: 80, h: 200 },
    { x: 500, w: 120, h: 160 },
    { x: 600, w: 90, h: 230 },
    { x: 670, w: 110, h: 180 },
    { x: 770, w: 90, h: 240 },
    { x: 840, w: 130, h: 200 },
    { x: 950, w: 100, h: 260 },
    { x: 1030, w: 90, h: 170 },
    { x: 1100, w: 100, h: 210 },
  ];
  const horizonY = 470;
  buildings.forEach((b) => {
    fillRect(b.x, horizonY - b.h, b.w, b.h, '#130826');
    for (let wy = horizonY - b.h + 20; wy < horizonY - 20; wy += 26) {
      for (let wx = b.x + 12; wx < b.x + b.w - 12; wx += 20) {
        if ((wx * 3 + wy) % 5 === 0) fillRect(wx, wy, 8, 12, '#ffd166', 160);
        else if ((wx + wy * 2) % 7 === 0) fillRect(wx, wy, 8, 12, '#3ef2c8', 140);
      }
    }
  });

  // Ground platform and floating islands
  fillRect(0, horizonY, W, H - horizonY, '#0d051c');
  fillRect(0, horizonY, W, 8, '#3ef2c8');
  fillRect(0, horizonY + 8, W, 6, '#1da88a');

  // Floating platform left
  fillRect(120, 360, 260, 10, '#3ef2c8');
  fillRect(120, 370, 260, 6, '#1da88a');
  fillRect(120, 376, 260, 4, '#130826');

  // Floating platform right
  fillRect(780, 380, 280, 10, '#3ef2c8');
  fillRect(780, 390, 280, 6, '#1da88a');
  fillRect(780, 396, 280, 4, '#130826');

  // Glowing gold coins on the left platform
  [160, 210, 260, 310].forEach((cx) => {
    fillRect(cx - 10, 320, 20, 26, '#ffd166');
    fillRect(cx - 12, 324, 24, 18, '#ffd166');
    fillRect(cx - 6, 324, 12, 18, '#ffe9a0');
    fillRect(cx - 4, 326, 4, 8, '#ffffff');
  });

  // Gem on the right platform
  const gx = 910;
  const gy = 330;
  fillRect(gx - 8, gy + 4, 32, 24, '#3ef2c8');
  fillRect(gx - 4, gy, 24, 32, '#3ef2c8');
  fillRect(gx, gy + 4, 16, 16, '#7ef7ff');
  fillRect(gx + 2, gy + 6, 6, 6, '#ffffff');

  // Bob running in heroic stride
  const bobScale = 16;
  const bobX = 220;
  const bobY = 360 - 20 * bobScale;

  function bfill(x, y, w, h, col) {
    fillRect(bobX + x * bobScale, bobY + y * bobScale, w * bobScale, h * bobScale, col);
  }

  bfill(2, 0, 7, 6, '#ff4d6d');
  bfill(5, 2, 4, 4, '#ffcf9e');
  bfill(2, 0, 8, 2, '#b32a4d');
  bfill(7, 3, 1, 2, '#20122e');
  bfill(-3, 5, 4, 2, '#3ef2c8');
  bfill(-5, 6, 3, 2, '#3ef2c8');
  bfill(1, 5, 3, 2, '#3ef2c8');
  bfill(2, 6, 7, 5, '#ff4d6d');
  bfill(2, 6, 7, 2, '#b32a4d');
  bfill(8, 7, 2, 3, '#ff4d6d');
  bfill(9, 9, 2, 2, '#ffcf9e');
  bfill(-1, 7, 2, 3, '#ff4d6d');
  bfill(-1, 9, 2, 2, '#ffcf9e');
  bfill(4, 11, 3, 4, '#59427e');
  bfill(3, 15, 4, 2, '#2b1b45');
  bfill(8, 10, 3, 4, '#59427e');
  bfill(9, 14, 4, 2, '#2b1b45');

  // PIXEL RUN arcade title logo
  const font7x9 = {
    P: ['1111110', '1000001', '1000001', '1111110', '1000000', '1000000', '1000000', '1000000', '1000000'],
    I: ['1111111', '0001000', '0001000', '0001000', '0001000', '0001000', '0001000', '0001000', '1111111'],
    X: ['1000001', '1000001', '0100010', '0010100', '0001000', '0010100', '0100010', '1000001', '1000001'],
    E: ['1111111', '1000000', '1000000', '1111110', '1000000', '1000000', '1000000', '1000000', '1111111'],
    L: ['1000000', '1000000', '1000000', '1000000', '1000000', '1000000', '1000000', '1000000', '1111111'],
    T: ['1111111', '0001000', '0001000', '0001000', '0001000', '0001000', '0001000', '0001000', '0001000'],
    O: ['0111110', '1000001', '1000001', '1000001', '1000001', '1000001', '1000001', '1000001', '0111110'],
    F: ['1111111', '1000000', '1000000', '1111110', '1000000', '1000000', '1000000', '1000000', '1000000'],
    A: ['0111110', '1000001', '1000001', '1000001', '1111111', '1000001', '1000001', '1000001', '1000001'],
    M: ['1000001', '1100011', '1010101', '1001001', '1000001', '1000001', '1000001', '1000001', '1000001'],
    R: ['1111110', '1000001', '1000001', '1111110', '1000100', '1000010', '1000001', '1000001', '1000001'],
    U: ['1000001', '1000001', '1000001', '1000001', '1000001', '1000001', '1000001', '1000001', '0111110'],
    N: ['1000001', '1100001', '1010001', '1001001', '1000101', '1000011', '1000001', '1000001', '1000001'],
    ' ': ['0000000', '0000000', '0000000', '0000000', '0000000', '0000000', '0000000', '0000000', '0000000'],
  };

  function drawGlyph(ch, gx, gy, sc, color) {
    const rows = font7x9[ch] || font7x9[' '];
    rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        if (row[c] === '1') fillRect(gx + c * sc, gy + r * sc, sc, sc, color);
      }
    });
  }

  function drawWord(text, wx, wy, sc, color, shadowCol) {
    const gw = 7 * sc + 2 * sc;
    if (shadowCol) text.split('').forEach((ch, i) => drawGlyph(ch, wx + i * gw + sc, wy + sc, sc, shadowCol));
    text.split('').forEach((ch, i) => drawGlyph(ch, wx + i * gw, wy, sc, color));
  }

  const titleScale = 8;
  const titleX = 570;
  const titleY = 100;
  drawWord('PIXEL', titleX, titleY, titleScale, '#3ef2c8', '#081d19');
  drawWord('RUN', titleX + (5 * 9 * titleScale + 20), titleY, titleScale, '#ffd166', '#261b04');

  const subY = titleY + 9 * titleScale + 30;
  fillRect(titleX - 10, subY - 6, 610, 36, '#180a30');
  fillRect(titleX - 10, subY - 6, 610, 2, '#3ef2c8');
  fillRect(titleX - 10, subY + 28, 610, 2, '#3ef2c8');
  drawWord('RETRO INFINITE PLATFORMER', titleX + 20, subY + 4, 2, '#ffffff', '#0a0418');

  // Frame borders
  fillRect(0, 0, W, 8, '#3ef2c8');
  fillRect(0, H - 8, W, 8, '#3ef2c8');
  fillRect(0, 0, 8, H, '#3ef2c8');
  fillRect(W - 8, 0, 8, H, '#3ef2c8');

  return createPNG(W, H, buf);
}

const pubDir = path.resolve('public');
const previewBuf = generatePreviewCard();
fs.writeFileSync(path.join(pubDir, 'icon-192.png'), generateSquareAppIcon(192));
fs.writeFileSync(path.join(pubDir, 'icon-512.png'), generateSquareAppIcon(512));
fs.writeFileSync(path.join(pubDir, 'apple-touch-icon.png'), generateSquareAppIcon(180));
fs.writeFileSync(path.join(pubDir, 'preview.png'), previewBuf);
fs.writeFileSync(path.join(pubDir, 'og-image.png'), previewBuf);

console.log('Regenerated authentic in-game Bob icons and preview banner!');
