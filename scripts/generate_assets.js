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
// App Icon Generator (Square, 512x512 and 192x192)
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

  // 1. Dark Purple/Blue Arcade Background with subtle grid
  const bgDark = hexToRgba('#0d0619');
  const bgPurple = hexToRgba('#1b0b33');
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const grad = y / size;
      const r = Math.floor(bgDark[0] + (bgPurple[0] - bgDark[0]) * grad);
      const g = Math.floor(bgDark[1] + (bgPurple[1] - bgDark[1]) * grad);
      const b = Math.floor(bgDark[2] + (bgPurple[2] - bgDark[2]) * grad);
      setPixel(x, y, r, g, b, 255);
    }
  }

  // 2. Crisp 8-Bit Neon Border Frame (outer border)
  const borderWidth = Math.max(4, Math.floor(size * 0.035));
  fillRect(0, 0, size, borderWidth, '#3ef2c8');
  fillRect(0, size - borderWidth, size, borderWidth, '#ff4d6d');
  fillRect(0, 0, borderWidth, size, '#3ef2c8');
  fillRect(size - borderWidth, 0, borderWidth, size, '#ff4d6d');

  // Inner border offset
  const innerB = borderWidth * 2;
  fillRect(innerB, innerB, size - innerB * 2, 2, '#251842');
  fillRect(innerB, size - innerB - 2, size - innerB * 2, 2, '#251842');

  // 3. Draw Bob Character running in the center
  // Bob sprite grid (16x16 logical)
  const scale = Math.floor(size / 24);
  const startX = Math.floor((size - 14 * scale) / 2);
  const startY = Math.floor((size - 18 * scale) / 2);

  function drawPixel(px, py, hex) {
    fillRect(startX + px * scale, startY + py * scale, scale, scale, hex);
  }

  // Bob's signature pixel artwork
  // Head
  fillRect(startX + 4 * scale, startY + 1 * scale, 7 * scale, 6 * scale, '#ff4d6d');
  fillRect(startX + 7 * scale, startY + 3 * scale, 4 * scale, 4 * scale, '#ffcf9e');
  fillRect(startX + 9 * scale, startY + 4 * scale, 1 * scale, 2 * scale, '#150a24'); // eye
  // Hair / Hat peak
  fillRect(startX + 3 * scale, startY + 0 * scale, 8 * scale, 2 * scale, '#b32a4d');

  // Scarf
  fillRect(startX + 3 * scale, startY + 6 * scale, 4 * scale, 3 * scale, '#3ef2c8');
  fillRect(startX + 2 * scale, startY + 7 * scale, 2 * scale, 2 * scale, '#7ef7ff');

  // Body / Suit
  fillRect(startX + 4 * scale, startY + 7 * scale, 7 * scale, 6 * scale, '#ff4d6d');
  fillRect(startX + 4 * scale, startY + 11 * scale, 7 * scale, 2 * scale, '#b32a4d');

  // Arms running
  fillRect(startX + 9 * scale, startY + 7 * scale, 2 * scale, 3 * scale, '#b32a4d');
  fillRect(startX + 11 * scale, startY + 7 * scale, 2 * scale, 2 * scale, '#ffcf9e');

  // Legs running
  fillRect(startX + 3 * scale, startY + 13 * scale, 3 * scale, 4 * scale, '#59427e');
  fillRect(startX + 8 * scale, startY + 13 * scale, 4 * scale, 3 * scale, '#59427e');

  // Floating gold coin
  const coinX = startX + 13 * scale;
  const coinY = startY + 2 * scale;
  fillRect(coinX, coinY, 3 * scale, 3 * scale, '#ffd166');
  fillRect(coinX + scale, coinY + scale, 1 * scale, 1 * scale, '#ffe9a0');

  // Cyan Gem
  const gemX = startX - 3 * scale;
  const gemY = startY + 4 * scale;
  fillRect(gemX, gemY, 3 * scale, 3 * scale, '#3ef2c8');
  fillRect(gemX + scale, gemY + scale, 1 * scale, 1 * scale, '#ffffff');

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

  // 1. Synthwave / Cyberpunk Neon Sunset Gradient
  for (let y = 0; y < H; y++) {
    const t = y / H;
    let r, g, b;
    if (t < 0.5) {
      const u = t / 0.5;
      r = Math.floor(13 + (42 - 13) * u);
      g = Math.floor(6 + (16 - 6) * u);
      b = Math.floor(25 + (70 - 25) * u);
    } else {
      const u = (t - 0.5) / 0.5;
      r = Math.floor(42 + (15 - 42) * u);
      g = Math.floor(16 + (8 - 16) * u);
      b = Math.floor(70 + (28 - 70) * u);
    }
    for (let x = 0; x < W; x++) {
      setPixel(x, y, r, g, b, 255);
    }
  }

  // 2. Giant Blood / Neon Moon in the upper right
  const moonCx = 960;
  const moonCy = 190;
  const moonR = 120;
  for (let y = moonCy - moonR; y <= moonCy + moonR; y++) {
    for (let x = moonCx - moonR; x <= moonCx + moonR; x++) {
      const dist = Math.sqrt((x - moonCx) ** 2 + (y - moonCy) ** 2);
      if (dist <= moonR) {
        if (dist <= moonR - 10) {
          fillRect(x, y, 1, 1, '#ff4d6d');
        } else {
          fillRect(x, y, 1, 1, '#ff7a90');
        }
      }
    }
  }

  // 3. Pixel City Skyline in background
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
    // Windows
    for (let wy = 480 - b.h + 20; wy < 460; wy += 30) {
      for (let wx = b.x + 15; wx < b.x + b.w - 15; wx += 25) {
        if ((wx + wy) % 5 !== 0) {
          fillRect(wx, wy, 12, 16, '#ffd166');
        }
      }
    }
  });

  // 4. Ground Platform Layer
  fillRect(0, 480, W, 150, '#120824');
  fillRect(0, 480, W, 8, '#3ef2c8');
  fillRect(0, 488, W, 6, '#1da88a');

  // 5. Giant PIXEL RUN 8-Bit Title Logo
  // P
  function drawBlock(bx, by, bw, bh, color) {
    fillRect(bx, by, bw, bh, color);
  }
  const titleY = 80;

  // Outer framing
  fillRect(0, 0, W, 12, '#3ef2c8');
  fillRect(0, H - 12, W, 12, '#ff4d6d');

  // Bob sprite running on ground
  const bobScale = 9;
  const bobX = 260;
  const bobY = 320;

  // Draw Bob on ground
  fillRect(bobX + 4 * bobScale, bobY + 1 * bobScale, 7 * bobScale, 6 * bobScale, '#ff4d6d');
  fillRect(bobX + 7 * bobScale, bobY + 3 * bobScale, 4 * bobScale, 4 * bobScale, '#ffcf9e');
  fillRect(bobX + 9 * bobScale, bobY + 4 * bobScale, 1 * bobScale, 2 * bobScale, '#150a24'); // eye
  fillRect(bobX + 3 * bobScale, bobY + 0 * bobScale, 8 * bobScale, 2 * bobScale, '#b32a4d');
  fillRect(bobX + 3 * bobScale, bobY + 6 * bobScale, 4 * bobScale, 3 * bobScale, '#3ef2c8'); // scarf
  fillRect(bobX + 4 * bobScale, bobY + 7 * bobScale, 7 * bobScale, 6 * bobScale, '#ff4d6d'); // suit
  fillRect(bobX + 4 * bobScale, bobY + 11 * bobScale, 7 * bobScale, 2 * bobScale, '#b32a4d');
  fillRect(bobX + 9 * bobScale, bobY + 7 * bobScale, 2 * bobScale, 3 * bobScale, '#b32a4d');
  fillRect(bobX + 11 * bobScale, bobY + 7 * bobScale, 2 * bobScale, 2 * bobScale, '#ffcf9e');
  fillRect(bobX + 3 * bobScale, bobY + 13 * bobScale, 3 * bobScale, 4 * bobScale, '#59427e');
  fillRect(bobX + 8 * bobScale, bobY + 13 * bobScale, 4 * bobScale, 3 * bobScale, '#59427e');

  return createPNG(W, H, buf);
}

const pubDir = path.resolve('public');
fs.writeFileSync(path.join(pubDir, 'icon-192.png'), generateSquareAppIcon(192));
fs.writeFileSync(path.join(pubDir, 'icon-512.png'), generateSquareAppIcon(512));
fs.writeFileSync(path.join(pubDir, 'apple-touch-icon.png'), generateSquareAppIcon(180));
fs.writeFileSync(path.join(pubDir, 'preview.png'), generatePreviewCard());

console.log('Successfully generated icon-192.png, icon-512.png, apple-touch-icon.png, and preview.png!');
