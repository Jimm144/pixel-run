import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

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

// ---------------------------------------------------------------
// Shared pixel helpers
// ---------------------------------------------------------------
function makeCanvas(W, H) {
  const buf = Buffer.alloc(W * H * 4);

  function hexToRgba(hex) {
    const h = hex.replace('#', '');
    return [
      parseInt(h.substring(0, 2), 16),
      parseInt(h.substring(2, 4), 16),
      parseInt(h.substring(4, 6), 16),
      255,
    ];
  }

  function setPixel(x, y, r, g, b, a = 255) {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const idx = (y * W + x) * 4;
    buf[idx] = r; buf[idx + 1] = g; buf[idx + 2] = b; buf[idx + 3] = a;
  }

  function fillRect(x, y, w, h, hex) {
    const [r, g, b] = hexToRgba(hex);
    for (let py = Math.floor(y); py < Math.floor(y + h); py++)
      for (let px = Math.floor(x); px < Math.floor(x + w); px++)
        setPixel(px, py, r, g, b);
  }

  return { buf, fillRect, setPixel, hexToRgba };
}

// ---------------------------------------------------------------
// App Icon — Bob facing FORWARD, standing idle, centered
// Uses the same 11-wide pixel grid as playerSprite.ts but front-facing
// ---------------------------------------------------------------
function generateSquareAppIcon(size) {
  const { buf, fillRect } = makeCanvas(size, size);

  // Dark background with very subtle radial centre-glow
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

  // ---- Draw front-facing idle Bob (20 rows x 14 cols logical pixels) ----
  // Scale so Bob fills ~75% of icon height
  const scale = Math.max(1, Math.floor(size * 0.75 / 20));
  const bobW = 14 * scale;
  const bobH = 20 * scale;
  const ox = Math.floor((size - bobW) / 2);
  const oy = Math.floor((size - bobH) / 2);

  function f(x, y, w, h, col) {
    fillRect(ox + x * scale, oy + y * scale, w * scale, h * scale, col);
  }

  // === HEAD (rows 0..5, cols 2..11) ===
  f(2, 0, 10, 6, '#20122e');   // head shape (dark purple)
  f(3, 1, 8,  4, '#2a1b3d');   // face lighter
  // Eyes (front facing = two eyes)
  f(3, 2, 2, 2, '#ffffff');    // left eye white
  f(4, 2, 1, 1, '#20122e');    // left pupil
  f(9, 2, 2, 2, '#ffffff');    // right eye white
  f(10,2, 1, 1, '#20122e');    // right pupil
  // Tiny pixel nose
  f(6, 4, 2, 1, '#1a0a22');

  // === BODY/SUIT (rows 6..12) ===
  // Neck
  f(6, 6, 2, 1, '#ffcf9e');    // skin neck
  // Shoulders / torso
  f(2, 7, 10, 5, '#ff4d6d');   // red suit body
  f(2, 7, 10, 2, '#b32a4d');   // suit top darker
  // Scarf / collar
  f(4, 6, 6, 2, '#3ef2c8');    // teal scarf band
  // Chest stripe
  f(6, 9, 2, 3, '#b32a4d');    // centre chest stripe

  // === ARMS (rows 7..11, sides) ===
  f(0, 7, 2, 5, '#ff4d6d');    // left arm
  f(0, 11,2, 1, '#ffcf9e');    // left hand
  f(12,7, 2, 5, '#ff4d6d');    // right arm
  f(12,11,2, 1, '#ffcf9e');    // right hand

  // === LEGS (rows 12..17) — both feet flat on ground ===
  f(3, 12, 3, 4, '#59427e');   // left upper leg
  f(8, 12, 3, 4, '#59427e');   // right upper leg
  // Boots
  f(2, 16, 4, 2, '#2b1b45');   // left boot
  f(8, 16, 4, 2, '#2b1b45');   // right boot
  // Boot toe highlight
  f(2, 16, 2, 1, '#3d2660');
  f(8, 16, 2, 1, '#3d2660');

  // === SUBTLE PIXEL ART SHADOW under feet ===
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
// Preview Card — 1200×630 proper game banner
// ---------------------------------------------------------------
function generatePreviewCard() {
  const W = 1200;
  const H = 630;
  const { buf, fillRect } = makeCanvas(W, H);

  // === Background gradient (dark purple → near black) ===
  for (let y = 0; y < H; y++) {
    const t = y / H;
    const r = Math.floor(13 + (8 - 13) * t);
    const g = Math.floor(6 + (4 - 6) * t);
    const b = Math.floor(25 + (15 - 25) * t);
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 4;
      buf[idx] = r; buf[idx + 1] = g; buf[idx + 2] = b; buf[idx + 3] = 255;
    }
  }

  // === Subtle city skyline silhouette ===
  const buildings = [
    { x: 20,  w: 70,  h: 160 },
    { x: 100, w: 100, h: 210 },
    { x: 210, w: 60,  h: 140 },
    { x: 280, w: 90,  h: 240 },
    { x: 380, w: 70,  h: 190 },
    { x: 460, w: 110, h: 170 },
    // right side
    { x: 750, w: 80,  h: 200 },
    { x: 840, w: 120, h: 260 },
    { x: 970, w: 90,  h: 180 },
    { x: 1070,w: 80,  h: 230 },
    { x: 1160,w: 40,  h: 150 },
  ];
  const groundY = 490;
  buildings.forEach((b) => {
    fillRect(b.x, groundY - b.h, b.w, b.h, '#180c2e');
    // Lit windows
    for (let wy = groundY - b.h + 18; wy < groundY - 20; wy += 28) {
      for (let wx = b.x + 12; wx < b.x + b.w - 12; wx += 22) {
        if ((wx + wy) % 3 !== 0) fillRect(wx, wy, 10, 14, '#3a2560');
      }
    }
  });

  // === Ground platform ===
  fillRect(0, groundY,     W, 140, '#0a0418');
  fillRect(0, groundY,     W, 8,   '#3ef2c8');
  fillRect(0, groundY + 8, W, 5,   '#1da88a');

  // === Floating platform mid-left ===
  fillRect(80, 360, 200, 10, '#3ef2c8');
  fillRect(80, 370, 200, 5,  '#1da88a');

  // === Coins on platform (simple yellow circles) ===
  [130, 165, 200, 235].forEach((cx) => {
    fillRect(cx - 8, 334, 16, 20, '#ffd166');
    fillRect(cx - 6, 332, 12, 4,  '#ffd166');
    fillRect(cx - 6, 354, 12, 4,  '#ffd166');
    fillRect(cx - 4, 336, 4,  4,  '#ffe99a'); // shine
  });

  // === Gem (right side decorative) ===
  const gx = 600, gy = 310;
  fillRect(gx + 4, gy,     8,  4,  '#3ef2c8');
  fillRect(gx,     gy + 4, 16, 8,  '#3ef2c8');
  fillRect(gx + 4, gy + 12,8,  4,  '#3ef2c8');
  fillRect(gx + 4, gy,     4,  4,  '#7ef7ff'); // highlight

  // === Bob running (left side, large, facing right) ===
  const bobScale = 16;
  const bobX = 80;
  const bobY = groundY - 20 * bobScale;

  function bobF(x, y, w, h, col) {
    fillRect(bobX + x * bobScale, bobY + y * bobScale, w * bobScale, h * bobScale, col);
  }

  // Head
  bobF(2, 0, 7, 6, '#20122e');
  bobF(3, 1, 5, 3, '#2a1b3d');
  // Eye
  bobF(7, 3, 1, 2, '#ffffff');
  bobF(7, 3, 1, 1, '#20122e');
  // Scarf
  bobF(1, 5, 3, 2, '#3ef2c8');
  // Body
  bobF(2, 6, 7, 5, '#ff4d6d');
  bobF(2, 6, 7, 2, '#b32a4d');
  // Arm pumping forward
  bobF(8, 7, 2, 3, '#ff4d6d');
  bobF(9, 9, 2, 1, '#ffcf9e');
  // Arm back
  bobF(0, 8, 2, 3, '#ff4d6d');
  bobF(0,10, 2, 1, '#ffcf9e');
  // Running legs — stride
  bobF(3, 11, 3, 3, '#59427e'); // left leg forward
  bobF(2, 13, 3, 2, '#2b1b45'); // left boot
  bobF(7, 10, 3, 4, '#59427e'); // right leg back
  bobF(7, 14, 3, 1, '#2b1b45'); // right boot

  // === "PIXEL RUN" TITLE text (hand-drawn pixel font blocks) ===
  // Using large pixel blocks to spell the title
  const titleX = 580;
  const titleY = 130;
  const tScale = 14; // pixels per font pixel
  const titleColor = '#3ef2c8';
  const shadowColor = '#0a2e26';

  // Draw thick pixel-art letter glyphs
  // Each letter defined as array of [col, row] filled cells on a 5x7 grid
  const letters = {
    P: [[0,0],[1,0],[2,0],[3,0],[0,1],[4,1],[0,2],[1,2],[2,2],[3,2],[0,3],[0,4],[0,5],[0,6]],
    I: [[0,0],[1,0],[2,0],[3,0],[4,0],[2,1],[2,2],[2,3],[2,4],[2,5],[0,6],[1,6],[2,6],[3,6],[4,6]],
    X: [[0,0],[4,0],[1,1],[3,1],[2,2],[1,3],[3,3],[0,4],[4,4],[0,5],[4,5],[0,6],[4,6]],
    E: [[0,0],[1,0],[2,0],[3,0],[4,0],[0,1],[0,2],[1,2],[2,2],[3,2],[0,3],[0,4],[0,5],[0,6],[1,6],[2,6],[3,6],[4,6]],
    L: [[0,0],[0,1],[0,2],[0,3],[0,4],[0,5],[0,6],[1,6],[2,6],[3,6],[4,6]],
    R: [[0,0],[1,0],[2,0],[3,0],[0,1],[4,1],[0,2],[1,2],[2,2],[3,2],[0,3],[3,3],[0,4],[4,4],[0,5],[4,5],[0,6],[4,6]],
    U: [[0,0],[4,0],[0,1],[4,1],[0,2],[4,2],[0,3],[4,3],[0,4],[4,4],[0,5],[4,5],[1,6],[2,6],[3,6]],
    N: [[0,0],[4,0],[0,1],[1,1],[4,1],[0,2],[2,2],[4,2],[0,3],[3,3],[4,3],[0,4],[4,4],[0,5],[4,5],[0,6],[4,6]],
    ' ': [],
  };

  function drawLetter(letter, lx, ly, scale, color) {
    const cells = letters[letter] || [];
    cells.forEach(([cx, cy]) => {
      fillRect(lx + cx * scale, ly + cy * scale, scale, scale, color);
    });
  }

  const word1 = 'PIXEL';
  const word2 = 'RUN';
  const letterW = 5 * tScale + 3; // letter width + gap

  // Shadow pass
  word1.split('').forEach((ch, i) => drawLetter(ch, titleX + i * (letterW + 2) + 3, titleY + 3, tScale, shadowColor));
  word2.split('').forEach((ch, i) => drawLetter(ch, titleX + i * (letterW + 2) + 3, titleY + (7 * tScale + 20) + 3, tScale, shadowColor));
  // Main pass
  word1.split('').forEach((ch, i) => drawLetter(ch, titleX + i * (letterW + 2), titleY, tScale, titleColor));
  word2.split('').forEach((ch, i) => drawLetter(ch, titleX + i * (letterW + 2), titleY + (7 * tScale + 20), tScale, titleColor));

  // === Subtitle "INFINITE PLATFORMER" in smaller pixel text ===
  const sub = 'INFINITE PLATFORMER';
  const sScale = 5;
  const sLetterW = 5 * sScale + 2;
  const subY = titleY + 7 * tScale * 2 + 50;
  const subX = titleX;
  // Shadow
  sub.split('').forEach((ch, i) => drawLetter(ch, subX + i * (sLetterW) + 2, subY + 2, sScale, shadowColor));
  // Text
  sub.split('').forEach((ch, i) => drawLetter(ch, subX + i * (sLetterW), subY, sScale, '#6f5fa8'));

  // === URL tag ===
  const url = 'JIMM144.GITHUB.IO/PIXEL-RUN';
  const uScale = 3;
  const uLetterW = 5 * uScale + 1;
  const urlY = H - 60;
  const urlW = url.split('').length * uLetterW;
  const urlX = Math.floor((W - urlW) / 2);
  url.split('').forEach((ch, i) => drawLetter(ch, urlX + i * uLetterW, urlY, uScale, '#3d2e6e'));

  // === Decorative teal border ===
  fillRect(0, 0, W, 6, '#3ef2c8');
  fillRect(0, H - 6, W, 6, '#3ef2c8');
  fillRect(0, 0, 6, H, '#3ef2c8');
  fillRect(W - 6, 0, 6, H, '#3ef2c8');

  return createPNG(W, H, buf);
}

const pubDir = path.resolve('public');
fs.writeFileSync(path.join(pubDir, 'icon-192.png'), generateSquareAppIcon(192));
fs.writeFileSync(path.join(pubDir, 'icon-512.png'), generateSquareAppIcon(512));
fs.writeFileSync(path.join(pubDir, 'apple-touch-icon.png'), generateSquareAppIcon(180));
fs.writeFileSync(path.join(pubDir, 'preview.png'), generatePreviewCard());

console.log('Generated: icon-192.png, icon-512.png, apple-touch-icon.png, preview.png');
