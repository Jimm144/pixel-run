import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

/**
 * Pixel-Perfect Asset Generator for Pixel Run
 * Generates app icons (192, 512, 180) and a gorgeous 1200x630 preview banner.
 */

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function createChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const crc = crc32(chunk.subarray(4, 8 + len));
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

function createPNG(w, h, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(6, 9);
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);
  const ihdrChunk = createChunk('IHDR', ihdr);

  const rowSize = 1 + w * 4;
  const rawData = Buffer.alloc(h * rowSize);
  for (let y = 0; y < h; y++) {
    rawData[y * rowSize] = 0;
    rgba.copy(rawData, y * rowSize + 1, y * w * 4, (y + 1) * w * 4);
  }

  const idatData = zlib.deflateSync(rawData, { level: 9 });
  const idatChunk = createChunk('IDAT', idatData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function hexToRgb(hex) {
  const c = parseInt(hex.replace('#', ''), 16);
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
}

function makeCanvas(w, h) {
  const buf = Buffer.alloc(w * h * 4);
  function fillRect(rx, ry, rw, rh, color, alpha = 255) {
    const [r, g, b] = hexToRgb(color);
    const x0 = Math.max(0, Math.floor(rx));
    const y0 = Math.max(0, Math.floor(ry));
    const x1 = Math.min(w, Math.floor(rx + rw));
    const y1 = Math.min(h, Math.floor(ry + rh));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const idx = (y * w + x) * 4;
        if (alpha === 255) {
          buf[idx] = r; buf[idx + 1] = g; buf[idx + 2] = b; buf[idx + 3] = 255;
        } else {
          const a = alpha / 255;
          buf[idx] = Math.round(buf[idx] * (1 - a) + r * a);
          buf[idx + 1] = Math.round(buf[idx + 1] * (1 - a) + g * a);
          buf[idx + 2] = Math.round(buf[idx + 2] * (1 - a) + b * a);
          buf[idx + 3] = 255;
        }
      }
    }
  }
  return { buf, fillRect };
}

// ---------------------------------------------------------------
// Square App Icon (192, 512, 180) — Front-facing symmetrical Bob
// ---------------------------------------------------------------
function generateSquareAppIcon(size) {
  const { buf, fillRect } = makeCanvas(size, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x / size - 0.5) * 2;
      const dy = (y / size - 0.5) * 2;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const t = Math.min(1, dist);
      const r = Math.floor(22 - t * 9);
      const g = Math.floor(10 - t * 4);
      const b = Math.floor(38 - t * 12);
      const idx = (y * size + x) * 4;
      buf[idx] = r; buf[idx + 1] = g; buf[idx + 2] = b; buf[idx + 3] = 255;
    }
  }

  const scale = Math.max(1, Math.floor(size * 0.75 / 20));
  const bobW = 14 * scale;
  const bobH = 20 * scale;
  const ox = Math.floor((size - bobW) / 2);
  const oy = Math.floor((size - bobH) / 2);

  function f(x, y, w, h, col) {
    fillRect(ox + x * scale, oy + y * scale, w * scale, h * scale, col);
  }

  // Head
  f(2, 0, 10, 6, '#20122e');
  f(3, 1, 8,  4, '#2a1b3d');
  // Eyes
  f(3, 2, 2, 2, '#ffffff');
  f(4, 2, 1, 1, '#20122e');
  f(9, 2, 2, 2, '#ffffff');
  f(10,2, 1, 1, '#20122e');
  // Nose
  f(6, 4, 2, 1, '#1a0a22');

  // Body/Suit
  f(6, 6, 2, 1, '#ffcf9e');
  f(2, 7, 10, 5, '#ff4d6d');
  f(2, 7, 10, 2, '#b32a4d');
  // Scarf
  f(4, 6, 6, 2, '#3ef2c8');
  // Chest stripe
  f(6, 9, 2, 3, '#b32a4d');

  // Arms
  f(0, 7, 2, 5, '#ff4d6d');
  f(0, 11,2, 1, '#ffcf9e');
  f(12,7, 2, 5, '#ff4d6d');
  f(12,11,2, 1, '#ffcf9e');

  // Legs & Boots
  f(3, 12, 3, 4, '#59427e');
  f(8, 12, 3, 4, '#59427e');
  f(2, 16, 4, 2, '#2b1b45');
  f(8, 16, 4, 2, '#2b1b45');
  f(2, 16, 2, 1, '#3d2660');
  f(8, 16, 2, 1, '#3d2660');

  // Ground shadow
  for (let sx = 3; sx <= 11; sx++) {
    const alpha = 80;
    const idx = ((oy + bobH) * size + ox + sx * scale) * 4;
    if (idx >= 0 && idx + 3 < buf.length) {
      buf[idx] = 10; buf[idx+1] = 5; buf[idx+2] = 20; buf[idx+3] = alpha;
    }
  }

  return createPNG(size, size, buf);
}

// ---------------------------------------------------------------
// Preview Card — 1200×630 Atmospheric Synthwave Banner
// ---------------------------------------------------------------
function generatePreviewCard() {
  const W = 1200;
  const H = 630;
  const { buf, fillRect } = makeCanvas(W, H);

  // 1. Synthwave sunset sky gradient
  for (let y = 0; y < H; y++) {
    const t = y / H;
    let r, g, b;
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
      const idx = (y * W + x) * 4;
      buf[idx] = r; buf[idx + 1] = g; buf[idx + 2] = b; buf[idx + 3] = 255;
    }
  }

  // 2. Distant stars
  const stars = [
    [100, 40], [250, 70], [420, 30], [580, 85], [750, 50], [920, 65], [1080, 35],
    [180, 120], [340, 150], [680, 130], [840, 110], [1020, 140], [50, 180]
  ];
  stars.forEach(([sx, sy]) => {
    fillRect(sx, sy, 3, 3, '#ffd166', 200);
    fillRect(sx + 1, sy - 1, 1, 5, '#ffffff', 240);
    fillRect(sx - 1, sy + 1, 5, 1, '#ffffff', 240);
  });

  // 3. Segmented Synthwave Retro Sun (Centered at x=400, y=260)
  const sunX = 380, sunY = 250, sunR = 120;
  for (let dy = -sunR; dy <= sunR; dy++) {
    const py = sunY + dy;
    if (py < 0 || py >= H) continue;
    const dxMax = Math.floor(Math.sqrt(sunR * sunR - dy * dy));
    // Retro horizontal slice lines
    const stripe = (dy + sunR) % 18;
    if (stripe > 13 && dy > 0) continue; // scanline cuts

    const sunT = (dy + sunR) / (2 * sunR);
    const sr = Math.floor(255 - sunT * 20);
    const sg = Math.floor(209 - sunT * 120);
    const sb = Math.floor(102 - sunT * 80);
    const hex = `#${sr.toString(16).padStart(2,'0')}${sg.toString(16).padStart(2,'0')}${sb.toString(16).padStart(2,'0')}`;
    fillRect(sunX - dxMax, py, dxMax * 2, 1, hex);
  }

  // 4. Skyline Mountain / City Silhouette
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

  // 5. Ground Platform & Floating Islands
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

  // 6. Glowing Gold Coins on Left Platform
  [160, 210, 260, 310].forEach((cx) => {
    fillRect(cx - 10, 320, 20, 26, '#ffd166');
    fillRect(cx - 12, 324, 24, 18, '#ffd166');
    fillRect(cx - 6, 324, 12, 18, '#ffe9a0'); // gleam
    fillRect(cx - 4, 326, 4, 8, '#ffffff');
  });

  // 7. Gem on Right Platform
  const gx = 910, gy = 330;
  fillRect(gx - 8, gy + 4, 32, 24, '#3ef2c8');
  fillRect(gx - 4, gy, 24, 32, '#3ef2c8');
  fillRect(gx, gy + 4, 16, 16, '#7ef7ff');
  fillRect(gx + 2, gy + 6, 6, 6, '#ffffff');

  // 8. Bob Running in Heroic Stride (Centered on floating platform)
  const bs = 16;
  const bx = 220;
  const by = 360 - 20 * bs;

  function bfill(x, y, w, h, col) {
    fillRect(bx + x * bs, by + y * bs, w * bs, h * bs, col);
  }

  // Head
  bfill(2, 0, 7, 6, '#ff4d6d');
  bfill(5, 2, 4, 4, '#ffcf9e');
  bfill(2, 0, 8, 2, '#b32a4d');
  // Eye
  bfill(7, 3, 1, 2, '#20122e');
  // Streaming Scarf
  bfill(-3, 5, 4, 2, '#3ef2c8');
  bfill(-5, 6, 3, 2, '#3ef2c8');
  bfill(1, 5, 3, 2, '#3ef2c8');
  // Body
  bfill(2, 6, 7, 5, '#ff4d6d');
  bfill(2, 6, 7, 2, '#b32a4d');
  // Arm forward
  bfill(8, 7, 2, 3, '#ff4d6d');
  bfill(9, 9, 2, 2, '#ffcf9e');
  // Arm back
  bfill(-1, 7, 2, 3, '#ff4d6d');
  bfill(-1, 9, 2, 2, '#ffcf9e');
  // Running legs
  bfill(4, 11, 3, 4, '#59427e');
  bfill(3, 15, 4, 2, '#2b1b45');
  bfill(8, 10, 3, 4, '#59427e');
  bfill(9, 14, 4, 2, '#2b1b45');

  // 9. PIXEL RUN Arcade Title Logo (Right side, crisp and bold)
  const font7x9 = {
    P: ['1111110','1000001','1000001','1111110','1000000','1000000','1000000','1000000','1000000'],
    I: ['1111111','0001000','0001000','0001000','0001000','0001000','0001000','0001000','1111111'],
    X: ['1000001','1000001','0100010','0010100','0001000','0010100','0100010','1000001','1000001'],
    E: ['1111111','1000000','1000000','1111110','1000000','1000000','1000000','1000000','1111111'],
    L: ['1000000','1000000','1000000','1000000','1000000','1000000','1000000','1000000','1111111'],
    R: ['1111110','1000001','1000001','1111110','1000100','1000010','1000001','1000001','1000001'],
    U: ['1000001','1000001','1000001','1000001','1000001','1000001','1000001','1000001','0111110'],
    N: ['1000001','1100001','1010001','1001001','1000101','1000011','1000001','1000001','1000001'],
    ' ': ['0000000','0000000','0000000','0000000','0000000','0000000','0000000','0000000','0000000'],
  };

  function drawGlyph(ch, gx, gy, sc, color) {
    const rows = font7x9[ch] || font7x9[' '];
    rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        if (row[c] === '1') {
          fillRect(gx + c * sc, gy + r * sc, sc, sc, color);
        }
      }
    });
  }

  function drawWord(text, wx, wy, sc, color, shadowCol) {
    const gw = 7 * sc + 2 * sc;
    if (shadowCol) {
      text.split('').forEach((ch, i) => drawGlyph(ch, wx + i * gw + sc, wy + sc, sc, shadowCol));
    }
    text.split('').forEach((ch, i) => drawGlyph(ch, wx + i * gw, wy, sc, color));
  }

  // Draw "PIXEL RUN"
  const titleScale = 12;
  const titleX = 540;
  const titleY = 110;
  drawWord('PIXEL', titleX, titleY, titleScale, '#3ef2c8', '#081d19');
  drawWord('RUN', titleX + (5 * 9 * titleScale + 20), titleY, titleScale, '#ffd166', '#261b04');

  // Subtitle banner badge: "★ RETRO INFINITE RUNNER ★"
  const subY = titleY + 9 * titleScale + 30;
  fillRect(titleX - 10, subY - 6, 610, 36, '#180a30');
  fillRect(titleX - 10, subY - 6, 610, 2, '#3ef2c8');
  fillRect(titleX - 10, subY + 28, 610, 2, '#3ef2c8');

  // Small pixel text for subtitle
  const subScale = 3;
  drawWord('RETRO INFINITE PLATFORMER', titleX + 20, subY + 4, subScale, '#ffffff', '#0a0418');

  // 10. Frame borders
  fillRect(0, 0, W, 8, '#3ef2c8');
  fillRect(0, H - 8, W, 8, '#3ef2c8');
  fillRect(0, 0, 8, H, '#3ef2c8');
  fillRect(W - 8, 0, 8, H, '#3ef2c8');

  return createPNG(W, H, buf);
}

const pubDir = path.resolve('public');
fs.writeFileSync(path.join(pubDir, 'icon-192.png'), generateSquareAppIcon(192));
fs.writeFileSync(path.join(pubDir, 'icon-512.png'), generateSquareAppIcon(512));
fs.writeFileSync(path.join(pubDir, 'apple-touch-icon.png'), generateSquareAppIcon(180));
fs.writeFileSync(path.join(pubDir, 'preview.png'), generatePreviewCard());

console.log('Successfully generated: icon-192.png, icon-512.png, apple-touch-icon.png, preview.png');
