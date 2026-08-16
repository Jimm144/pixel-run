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

// -------------------------------------------------------------
// Pure in-game Bob drawing without any outlines
// -------------------------------------------------------------
function generateSquareAppIcon(size) {
  const buf = Buffer.alloc(size * size * 4);

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

  // Exact in-game playerSprite.ts coordinates for Bob (NO OUTLINES):
  // Hair / Cap
  f(2, 0, 7, 6, '#ff4d6d');   // SUIT
  f(2, 0, 8, 2, '#b32a4d');   // SUIT_D
  // Face
  f(5, 2, 4, 4, '#ffcf9e');   // SKIN
  // Eye
  f(7, 3, 1, 2, '#20122e');   // classic eye
  // Scarf
  f(1, 5, 3, 2, '#3ef2c8');   // SCARF
  // Body
  f(2, 6, 7, 4, '#ff4d6d');   // SUIT body
  f(2, 8, 7, 2, '#b32a4d');   // SUIT_D lower
  // Legs (running frame 1)
  f(3, 10, 3, 3, '#59427e');  // left leg
  f(3, 13, 3, 2, '#2b1b45');  // left boot
  f(7, 10, 3, 4, '#59427e');  // right leg
  f(7, 14, 3, 1, '#2b1b45');  // right boot

  return createPNG(size, size, buf);
}

// -------------------------------------------------------------
// Preview.png Generator (1200x630 Wide Card)
// -------------------------------------------------------------
function generatePreviewCard() {
  const W = 1200;
  const H = 630;
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

  // Background gradient
  for (let y = 0; y < H; y++) {
    const t = y / H;
    const r = Math.floor(13 + (26 - 13) * t);
    const g = Math.floor(6 + (10 - 6) * t);
    const b = Math.floor(25 + (45 - 25) * t);
    for (let x = 0; x < W; x++) {
      setPixel(x, y, r, g, b, 255);
    }
  }

  // Skyline
  const buildings = [
    { x: 100, w: 90, h: 220 },
    { x: 210, w: 140, h: 280 },
    { x: 370, w: 80, h: 180 },
    { x: 470, w: 120, h: 320 },
    { x: 610, w: 100, h: 240 },
    { x: 730, w: 130, h: 290 },
    { x: 880, w: 90, h: 200 },
    { x: 990, w: 140, h: 260 },
  ];
  buildings.forEach((b) => {
    fillRect(b.x, 480 - b.h, b.w, b.h, '#1a0d33');
    for (let wy = 480 - b.h + 20; wy < 460; wy += 30) {
      for (let wx = b.x + 15; wx < b.x + b.w - 15; wx += 25) {
        if ((wx + wy) % 5 !== 0) {
          fillRect(wx, wy, 12, 16, '#ffd166');
        }
      }
    }
  });

  // Ground Platform Layer (clean in-game platform)
  fillRect(0, 480, W, 150, '#120824');
  fillRect(0, 480, W, 8, '#3ef2c8');
  fillRect(0, 488, W, 6, '#1da88a');

  // Draw in-game Bob on the platform (exact in-game sprite, NO outlines)
  const bobScale = 14;
  const bobX = 260;
  const bobY = 270;

  function f(x, y, w, h, hex) {
    fillRect(bobX + x * bobScale, bobY + y * bobScale, w * bobScale, h * bobScale, hex);
  }

  f(2, 0, 7, 6, '#ff4d6d');   // SUIT
  f(2, 0, 8, 2, '#b32a4d');   // SUIT_D
  f(5, 2, 4, 4, '#ffcf9e');   // SKIN
  f(7, 3, 1, 2, '#20122e');   // classic eye
  f(1, 5, 3, 2, '#3ef2c8');   // SCARF
  f(2, 6, 7, 4, '#ff4d6d');   // SUIT body
  f(2, 8, 7, 2, '#b32a4d');   // SUIT_D lower
  f(3, 10, 3, 3, '#59427e');  // left leg
  f(3, 13, 3, 2, '#2b1b45');  // left boot
  f(7, 10, 3, 4, '#59427e');  // right leg
  f(7, 14, 3, 1, '#2b1b45');  // right boot

  return createPNG(W, H, buf);
}

const pubDir = path.resolve('public');
fs.writeFileSync(path.join(pubDir, 'icon-192.png'), generateSquareAppIcon(192));
fs.writeFileSync(path.join(pubDir, 'icon-512.png'), generateSquareAppIcon(512));
fs.writeFileSync(path.join(pubDir, 'apple-touch-icon.png'), generateSquareAppIcon(180));
fs.writeFileSync(path.join(pubDir, 'preview.png'), generatePreviewCard());

console.log('Regenerated clean, outline-free Bob app icons and preview banner!');
