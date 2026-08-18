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

function decodePNG(buffer) {
  let pos = 8;
  let width = 0, height = 0, colorType = 0;
  const idatChunks = [];

  while (pos < buffer.length) {
    const len = buffer.readUInt32BE(pos);
    const type = buffer.toString('ascii', pos + 4, pos + 8);
    const data = buffer.slice(pos + 8, pos + 8 + len);
    pos += 12 + len;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  const decompressed = zlib.inflateSync(Buffer.concat(idatChunks));
  const bytesPerPixel = colorType === 6 ? 4 : (colorType === 2 ? 3 : 4);
  const stride = width * bytesPerPixel;
  const rgba = Buffer.alloc(width * height * 4);

  let prevScanline = Buffer.alloc(stride);
  let srcPos = 0;

  function unfilter(type, raw, prev, bpp) {
    const res = Buffer.alloc(raw.length);
    for (let i = 0; i < raw.length; i++) {
      const a = i >= bpp ? res[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      const x = raw[i];

      if (type === 0) res[i] = x;
      else if (type === 1) res[i] = (x + a) & 255;
      else if (type === 2) res[i] = (x + b) & 255;
      else if (type === 3) res[i] = (x + Math.floor((a + b) / 2)) & 255;
      else if (type === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        let pr;
        if (pa <= pb && pa <= pc) pr = a;
        else if (pb <= pc) pr = b;
        else pr = c;
        res[i] = (x + pr) & 255;
      }
    }
    return res;
  }

  for (let y = 0; y < height; y++) {
    const filterType = decompressed[srcPos++];
    const rawLine = decompressed.slice(srcPos, srcPos + stride);
    srcPos += stride;
    const line = unfilter(filterType, rawLine, prevScanline, bytesPerPixel);
    prevScanline = line;

    for (let x = 0; x < width; x++) {
      const dstIdx = (y * width + x) * 4;
      const srcIdx = x * bytesPerPixel;
      if (colorType === 6) {
        rgba[dstIdx] = line[srcIdx];
        rgba[dstIdx + 1] = line[srcIdx + 1];
        rgba[dstIdx + 2] = line[srcIdx + 2];
        rgba[dstIdx + 3] = line[srcIdx + 3];
      } else if (colorType === 2) {
        rgba[dstIdx] = line[srcIdx];
        rgba[dstIdx + 1] = line[srcIdx + 1];
        rgba[dstIdx + 2] = line[srcIdx + 2];
        rgba[dstIdx + 3] = 255;
      }
    }
  }

  return { width, height, rgba };
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

// 5x7 Pixel Font Map
const G = {
  A: '.###./#...#/#...#/#####/#...#/#...#/#...#',
  B: '####./#...#/#...#/####./#...#/#...#/####.',
  C: '.####/#..../#..../#..../#..../#..../.####',
  D: '####./#...#/#...#/#...#/#...#/#...#/####.',
  E: '#####/#..../#..../#####/#..../#..../#####',
  F: '#####/#..../#..../#####/#..../#..../#....',
  G: '.####/#..../#..../#.###/#...#/#...#/.####',
  H: '#...#/#...#/#...#/#####/#...#/#...#/#...#',
  I: '#####/..#../..#../..#../..#../..#../#####',
  J: '..###/...#./...#./...#./...#./#..#./.##..',
  K: '#...#/#..#./#.#../##.../#.#../#..#./#...#',
  L: '#..../#..../#..../#..../#..../#..../#####',
  M: '#...#/##.##/#.#.#/#...#/#...#/#...#/#...#',
  N: '#...#/##..#/#.#.#/#..##/#...#/#...#/#...#',
  O: '.###./#...#/#...#/#...#/#...#/#...#/.###.',
  P: '####./#...#/#...#/####./#..../#..../#....',
  Q: '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#',
  R: '####./#...#/#...#/####./#.#../#..#./#...#',
  S: '.####/#..../#..../.###./....#/....#/####.',
  T: '#####/..#../..#../..#../..#../..#../..#..',
  U: '#...#/#...#/#...#/#...#/#...#/#...#/#####',
  V: '#...#/#...#/#...#/#...#/#...#/.#.#./..#..',
  W: '#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#',
  X: '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
  Y: '#...#/#...#/.#.#./..#../..#../..#../..#..',
  Z: '#####/....#/...#./..#../.#.../#..../#####',
  '.': '...../...../...../...../...../...../..#..',
  ':': '...../..#../...../...../..#../...../.....',
  '-': '...../...../...../#####/...../...../.....',
  '·': '...../...../...../..#../...../...../.....',
  ' ': '...../...../...../...../...../...../.....',
};

// -------------------------------------------------------------
// App Icon Generator (Authentic In-Game Bob)
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

  const scale = Math.floor(size / 18);
  const startX = Math.floor((size - 11 * scale) / 2);
  const startY = Math.floor((size - 15 * scale) / 2);

  function f(x, y, w, h, hex) {
    fillRect(startX + x * scale, startY + y * scale, w * scale, h * scale, hex);
  }

  f(2, 0, 7, 6, '#ff4d6d');   // Red cap
  f(2, 0, 8, 2, '#b32a4d');   // Dark cap rim
  f(5, 2, 4, 4, '#ffcf9e');   // Peach face
  f(7, 3, 1, 2, '#20122e');   // Eye
  f(1, 5, 3, 2, '#3ef2c8');   // Teal scarf
  f(2, 6, 7, 4, '#ff4d6d');   // Red torso
  f(2, 8, 7, 2, '#b32a4d');   // Dark lower torso
  f(1, 10, 3, 3, '#59427e');  // Leg
  f(1, 13, 3, 2, '#2b1b45');  // Boot
  f(5, 10, 3, 4, '#59427e');  // Leg
  f(5, 14, 3, 1, '#2b1b45');  // Boot

  return createPNG(size, size, buf);
}

// -------------------------------------------------------------
// Preview.png Generator
// -------------------------------------------------------------
function generatePreviewCard() {
  const W = 1200;
  const H = 630;
  const buf = Buffer.alloc(W * H * 4);

  // Load the authentic in-game screenshot
  const shotFile = path.resolve('public/screenshots/jungle.png');
  const shot = decodePNG(fs.readFileSync(shotFile));

  // Sample screenshot with 1:1 pixel aspect ratio (scale = 0.75)
  const scale = 1200 / 1600; // 0.75
  const srcYOffset = Math.floor(1018 - H / scale); // 178

  for (let y = 0; y < H; y++) {
    const srcY = Math.min(shot.height - 1, Math.floor(srcYOffset + y / scale));
    for (let x = 0; x < W; x++) {
      const srcX = Math.min(shot.width - 1, Math.floor(x / scale));
      const srcIdx = (srcY * shot.width + srcX) * 4;
      const dstIdx = (y * W + x) * 4;
      buf[dstIdx] = shot.rgba[srcIdx];
      buf[dstIdx + 1] = shot.rgba[srcIdx + 1];
      buf[dstIdx + 2] = shot.rgba[srcIdx + 2];
      buf[dstIdx + 3] = 255;
    }
  }

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
        setPixel(px, py, r, g, b, alpha);
      }
    }
  }

  // 1. Clean out the original centered moon & HUD numbers from the upper sky
  for (let y = 0; y < 210; y++) {
    const srcY = Math.min(shot.height - 1, Math.floor(srcYOffset + y / scale));
    const cleanSkyIdx = (srcY * shot.width + 40) * 4;
    const r = shot.rgba[cleanSkyIdx];
    const g = shot.rgba[cleanSkyIdx + 1];
    const b = shot.rgba[cleanSkyIdx + 2];

    for (let x = 0; x < W; x++) {
      setPixel(x, y, r, g, b, 255);
    }
  }

  // 2. Render In-Game Moon (Compact, tucked in the top-right corner)
  const moonX = 1055;
  const moonY = 78;
  const moonR = 60;
  const pixelStep = 3;

  for (let py = -moonR - 20; py <= moonR + 20; py += pixelStep) {
    const hwGlow = Math.round(Math.sqrt(Math.max(0, (moonR + 20) ** 2 - py ** 2)));
    fillRect(moonX - hwGlow, moonY + py, hwGlow * 2, pixelStep, '#375e24', 160);
  }
  for (let py = -moonR - 10; py <= moonR + 10; py += pixelStep) {
    const hwMid = Math.round(Math.sqrt(Math.max(0, (moonR + 10) ** 2 - py ** 2)));
    fillRect(moonX - hwMid, moonY + py, hwMid * 2, pixelStep, '#669638', 210);
  }
  for (let py = -moonR; py <= moonR; py += pixelStep) {
    const hw = Math.round(Math.sqrt(Math.max(0, moonR ** 2 - py ** 2)));
    if (hw <= 0) continue;
    const isScanline = (Math.floor((moonY + py) / 3) % 2) === 0;
    const col = isScanline ? '#c2f27c' : '#b0e76a';
    fillRect(moonX - hw, moonY + py, hw * 2, pixelStep, col);
  }

  // 3. Twinkling Sky Stars
  const stars = [
    [40, 25], [100, 70], [170, 35], [250, 95], [330, 45], [410, 110],
    [490, 35], [570, 85], [650, 40], [730, 105], [810, 35], [880, 75],
    [940, 35], [1160, 40], [1180, 100], [60, 150], [140, 180], [220, 140],
    [360, 170], [760, 170], [860, 160]
  ];
  stars.forEach(([sx, sy], i) => {
    const col = i % 3 === 0 ? '#ffffff' : (i % 3 === 1 ? '#d4f48a' : '#7ef7ff');
    fillRect(sx, sy, 3, 3, col);
  });

  // -------------------------------------------------------------
  // Typography Helpers (5x7 Glyph Matrix)
  // -------------------------------------------------------------
  function drawGlyph(ch, gx, gy, sc, color) {
    const raw = G[ch.toUpperCase()] || G[' '];
    const rows = raw.split('/');
    for (let r = 0; r < 7; r++) {
      const row = rows[r] || '.....';
      for (let c = 0; c < 5; c++) {
        if (row[c] === '#') {
          fillRect(gx + c * sc, gy + r * sc, sc, sc, color);
        }
      }
    }
  }

  function getWordWidth(text, sc, letterSpacing = 1) {
    return text.length * 5 * sc + (text.length - 1) * letterSpacing * sc;
  }

  function drawPixelTextWithShadow(text, x, y, sc, color, shadowColor, letterSpacing = 1) {
    const step = (5 + letterSpacing) * sc;
    if (shadowColor) {
      for (let i = 0; i < text.length; i++) {
        drawGlyph(text[i], x + i * step + sc, y + sc, sc, shadowColor);
      }
    }
    for (let i = 0; i < text.length; i++) {
      drawGlyph(text[i], x + i * step, y, sc, color);
    }
  }

  // 4. Centered Title Logo: "PIXEL RUN" in Clear Sky
  const titleScale = 10;
  const titleY = 28;
  const spaceWidth = titleScale * 3;

  const wPixel = getWordWidth('PIXEL', titleScale, 1);
  const wRun = getWordWidth('RUN', titleScale, 1);
  const totalTitleW = wPixel + spaceWidth + wRun;
  const startTitleX = Math.floor((W - totalTitleW) / 2);

  // PIXEL (Teal #3ef2c8 with dark shadow #04100c)
  drawPixelTextWithShadow('PIXEL', startTitleX, titleY, titleScale, '#3ef2c8', '#04100c', 1);

  // RUN (Coral Pink #ff4d6d with dark shadow #20060d)
  const startRunX = startTitleX + wPixel + spaceWidth;
  drawPixelTextWithShadow('RUN', startRunX, titleY, titleScale, '#ff4d6d', '#20060d', 1);

  // 5. Subtitle: "RUN · STOMP · SURVIVE" (Centered below Title in Clear Sky)
  const subText = 'RUN · STOMP · SURVIVE';
  const subScale = 4;
  const subY = titleY + 7 * titleScale + 18;
  const subW = getWordWidth(subText, subScale, 1);
  const subX = Math.floor((W - subW) / 2);
  drawPixelTextWithShadow(subText, subX, subY, subScale, '#a78bfa', '#090514', 1);

  // 6. Bottom Tagline: "PLAY FREE IN YOUR BROWSER" (Centered on ground)
  const bottomText = 'PLAY FREE IN YOUR BROWSER';
  const botScale = 4;
  const botY = H - 50;
  const botW = getWordWidth(bottomText, botScale, 1);
  const botX = Math.floor((W - botW) / 2);
  drawPixelTextWithShadow(bottomText, botX, botY, botScale, '#ffd166', '#1c1202', 1);

  return createPNG(W, H, buf);
}

const pubDir = path.resolve('public');
const previewBuf = generatePreviewCard();
fs.writeFileSync(path.join(pubDir, 'icon-192.png'), generateSquareAppIcon(192));
fs.writeFileSync(path.join(pubDir, 'icon-512.png'), generateSquareAppIcon(512));
fs.writeFileSync(path.join(pubDir, 'apple-touch-icon.png'), generateSquareAppIcon(180));
fs.writeFileSync(path.join(pubDir, 'preview.png'), previewBuf);
fs.writeFileSync(path.join(pubDir, 'og-image.png'), previewBuf);

console.log('Successfully regenerated clean preview banner!');
