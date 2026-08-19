// Tiny 5x7 bitmap font. Glyphs are written as 7 rows of 5 pixels separated by "/".
// Rendered once per colour into a canvas atlas, then blitted with drawImage (fast).

const G: Record<string, string> = {
  A: '.###./#...#/#...#/#####/#...#/#...#/#...#',
  B: '####./#...#/#...#/####./#...#/#...#/####.',
  C: '.####/#..../#..../#..../#..../#..../.####',
  D: '####./#...#/#...#/#...#/#...#/#...#/####.',
  E: '#####/#..../#..../####./#..../#..../#####',
  F: '#####/#..../#..../####./#..../#..../#....',
  G: '.###./#...#/#..../#.###/#...#/#...#/.###.',
  H: '#...#/#...#/#...#/#####/#...#/#...#/#...#',
  I: '#####/..#../..#../..#../..#../..#../#####',
  J: '..###/...#./...#./...#./...#./#..#./.##..',
  K: '#...#/#..#./#.#../##.../#.#../#..#./#...#',
  L: '#..../#..../#..../#..../#..../#..../#####',
  M: '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#',
  N: '#...#/##..#/#.#.#/#.#.#/#..##/#...#/#...#',
  O: '.###./#...#/#...#/#...#/#...#/#...#/.###.',
  P: '####./#...#/#...#/####./#..../#..../#....',
  Q: '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#',
  R: '####./#...#/#...#/####./#.#../#..#./#...#',
  S: '.####/#..../#..../.###./....#/....#/####.',
  T: '#####/..#../..#../..#../..#../..#../..#..',
  U: '#...#/#...#/#...#/#...#/#...#/#...#/.###.',
  V: '#...#/#...#/#...#/#...#/#...#/.#.#./..#..',
  W: '#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#',
  X: '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
  Y: '#...#/#...#/.#.#./..#../..#../..#../..#..',
  Z: '#####/....#/...#./..#../.#.../#..../#####',
  '0': '.###./#...#/#..##/#.#.#/##..#/#...#/.###.',
  '1': '..#../.##../..#../..#../..#../..#../.###.',
  '2': '.###./#...#/....#/...#./..#../.#.../#####',
  '3': '####./....#/....#/.###./....#/....#/####.',
  '4': '...#./..##./.#.#./#..#./#####/...#./...#.',
  '5': '#####/#..../####./....#/....#/#...#/.###.',
  '6': '..##./.#.../#..../####./#...#/#...#/.###.',
  '7': '#####/....#/...#./..#../.#.../.#.../.#...',
  '8': '.###./#...#/#...#/.###./#...#/#...#/.###.',
  '9': '.###./#...#/#...#/.####/....#/...#./.##..',
  '.': '...../...../...../...../...../.##../.##..',
  ',': '...../...../...../...../.##../.##../.#...',
  '!': '..#../..#../..#../..#../..#../...../..#..',
  '?': '.###./#...#/....#/..##./..#../...../..#..',
  ':': '...../.##../.##../...../.##../.##../.....',
  '-': '...../...../...../#####/...../...../.....',
  '+': '...../..#../..#../#####/..#../..#../.....',
  '/': '....#/....#/...#./..#../.#.../#..../#....',
  '=': '...../...../#####/...../#####/...../.....',
  "'": '..#../..#../...../...../...../...../.....',
  '(': '...#./..#../.#.../.#.../.#.../..#../...#.',
  ')': '.#.../..#../...#./...#./...#./..#../.#...',
  '%': '##..#/##.#./...#./..#../.#.../#.##./..##.',
  '*': '...../#.#.#/.###./#####/.###./#.#.#/.....',
  '<': '...#./..#../.#.../#..../.#.../..#../...#.',
  '>': '.#.../..#../...#./....#/...#./..#../.#...',
  '|': '..#../..#../..#../..#../..#../..#../..#..',
  '#': '.#.#./#####/.#.#./#####/.#.#./...../.....',
  a: '...../...../.###./....#/#####/#...#/.###.',
  b: '#..../#..../####./#...#/#...#/#...#/####.',
  c: '...../...../.####/#..../#..../#..../.####',
  d: '....#/....#/.####/#...#/#...#/#...#/.####',
  e: '...../...../.###./#...#/#####/#..../.###.',
  f: '..##./.#.../.###./.#.../.#.../.#.../.#...',
  g: '...../...../.####/#...#/.####/....#/.###.',
  h: '#..../#..../####./#...#/#...#/#...#/#...#',
  i: '..#../...../..#../..#../..#../..#../.###.',
  j: '...#./...../...#./...#./...#./#..#./.##..',
  k: '#..../#..../#...#/#..#./###../#..#./#...#',
  l: '.#.../.#.../.#.../.#.../.#.../.#.../...##',
  m: '...../...../##.##/#.#.#/#.#.#/#...#/#...#',
  n: '...../...../####./#...#/#...#/#...#/#...#',
  o: '...../...../.###./#...#/#...#/#...#/.###.',
  p: '...../...../####./#...#/#...#/####./#....',
  q: '...../...../.####/#...#/#...#/.####/....#',
  r: '...../...../####./#...#/#..../#..../#....',
  s: '...../...../.####/#..../.###./....#/####.',
  t: '..#../..#../#####/..#../..#../..#../...##',
  u: '...../...../#...#/#...#/#...#/#...#/.###.',
  v: '...../...../#...#/#...#/#...#/.#.#./..#..',
  w: '...../...../#...#/#...#/#.#.#/#.#.#/##.##',
  x: '...../...../#...#/.#.#./..#../.#.#./#...#',
  y: '...../...../#...#/#...#/.####/....#/.###.',
  z: '...../...../#####/....#/...#./..#../#####',
};

const CHARS: string[] = [];
const GLYPHS: string[] = [];
for (const k of Object.keys(G)) {
  const rows = G[k].split('/');
  let flat = '';
  for (let i = 0; i < 7; i++) flat += (rows[i] ?? '.....').padEnd(5, '.').slice(0, 5);
  CHARS.push(k);
  GLYPHS.push(flat);
}
const INDEX: Record<string, number> = {};
CHARS.forEach((c, i) => (INDEX[c] = i));

export const FONT_W = 5;
export const FONT_H = 7;
const CELL = FONT_W + 1;

const atlasCache = new Map<string, HTMLCanvasElement>();
/** Cap on cached atlases. Zone-fade HUD colours used to accumulate one atlas
 *  per distinct lerped colour forever; beyond this we drop the whole cache
 *  (rebaking a handful of atlases is trivial) so long sessions stay bounded. */
const ATLAS_CAP = 128;

function atlas(color: string): HTMLCanvasElement {
  let a = atlasCache.get(color);
  if (a) return a;
  if (atlasCache.size >= ATLAS_CAP) atlasCache.clear();
  const cv = document.createElement('canvas');
  cv.width = CELL * GLYPHS.length;
  cv.height = FONT_H;
  const c = cv.getContext('2d')!;
  c.fillStyle = color;
  for (let g = 0; g < GLYPHS.length; g++) {
    const data = GLYPHS[g];
    const ox = g * CELL;
    for (let y = 0; y < FONT_H; y++) {
      for (let x = 0; x < FONT_W; x++) {
        if (data[y * FONT_W + x] === '#') c.fillRect(ox + x, y, 1, 1);
      }
    }
  }
  a = cv;
  atlasCache.set(color, a);
  return a;
}

function glyphMetrics(scale: number) {
  return {
    advance: Math.max(1, Math.round(CELL * scale)),
    width: Math.max(1, Math.round(FONT_W * scale)),
    height: Math.max(1, Math.round(FONT_H * scale)),
  };
}

export function textWidth(text: string, scale = 1): number {
  if (text.length === 0 || scale <= 0) return 0;
  const { advance, width } = glyphMetrics(scale);
  return (text.length - 1) * advance + width;
}

function blit(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  scale: number,
  color: string,
) {
  if (text.length === 0 || scale <= 0) return;
  const a = atlas(color);
  const { advance, width, height } = glyphMetrics(scale);
  const smoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === ' ') continue;
    const gi = INDEX[ch];
    if (gi === undefined) continue;
    ctx.drawImage(
      a,
      gi * CELL,
      0,
      FONT_W,
      FONT_H,
      x + i * advance,
      Math.round(y),
      width,
      height,
    );
  }
  ctx.imageSmoothingEnabled = smoothing;
}

export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  scale = 1,
  color = '#ffffff',
  shadow?: string,
  uppercase = true,
) {
  const rendered = uppercase ? text.toUpperCase() : text;
  const px = Math.round(x);
  const py = Math.round(y);
  if (shadow) blit(ctx, rendered, px, py + Math.max(1, Math.round(scale)), scale, shadow);
  blit(ctx, rendered, px, py, scale, color);
}

export function drawTextCentered(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  scale = 1,
  color = '#ffffff',
  shadow?: string,
  uppercase = true,
) {
  drawText(ctx, text, Math.round(cx - textWidth(text, scale) / 2), y, scale, color, shadow, uppercase);
}

export function pad(n: number, len: number): string {
  const s = Math.max(0, Math.floor(n)).toString();
  return s.length >= len ? s : '0'.repeat(len - s.length) + s;
}
