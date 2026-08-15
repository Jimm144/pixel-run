export type BgKind = 'jungle' | 'desert' | 'tundra' | 'city';

export interface Zone {
  name: string;
  bg: BgKind;
  sky: [string, string, string, string];
  skyNight: [string, string, string, string];
  far: string;
  mid: string;
  decoFar: string;
  decoMid: string;
  sunA: string;
  sunB: string;
  star: string;
  accent: string;
  accent2: string;
  ground: string;
  groundDark: string;
  deco: string;
  coinFill: string;
  coinShine: string;
  coinEdge: string;
  slimeBody: string;
  slimeLight: string;
  slimeDark: string;
  flyerBody: string;
  flyerLight: string;
  spikerBody: string;
  spikerLight: string;
  spikerDark: string;
}

export const ZONES: Zone[] = [
  {
    name: 'NEON JUNGLE',
    bg: 'jungle',
    sky: ['#041810', '#0d3524', '#1d5c3c', '#3e8a5a'],
    skyNight: ['#010906', '#03140c', '#062416', '#0d3a24'],
    far: '#0a2415',
    mid: '#04120a',
    decoFar: '#7ff08a',
    decoMid: '#54c866',
    sunA: '#eaffb0',
    sunB: '#6fd45a',
    star: '#d6ffc4',
    accent: '#aaff4d',
    accent2: '#3f9e2a',
    ground: '#2f5230',
    groundDark: '#17301b',
    deco: '#5ec45e',
    coinFill: '#ffd166',
    coinShine: '#fff0a8',
    coinEdge: '#8a5a12',
    slimeBody: '#7ae04a',
    slimeLight: '#c0ff96',
    slimeDark: '#2e6e1c',
    flyerBody: '#ffb03e',
    flyerLight: '#ffe9a0',
    spikerBody: '#4a9e4a',
    spikerLight: '#9be08a',
    spikerDark: '#1f5c2c',
  },
  {
    name: 'SCORCHED DESERT',
    bg: 'desert',
    sky: ['#1d0d18', '#55301c', '#a85a2a', '#f0a85c'],
    skyNight: ['#0a0512', '#140b20', '#241238', '#421f52'],
    far: '#4a1d16',
    mid: '#2b0f12',
    decoFar: '#98b564',
    decoMid: '#7ea050',
    sunA: '#fff3b0',
    sunB: '#ff8f3c',
    star: '#ffe6b0',
    accent: '#ffd166',
    accent2: '#c9762b',
    ground: '#b0753f',
    groundDark: '#6b4222',
    deco: '#5ea04e',
    coinFill: '#ffd166',
    coinShine: '#ffe9a0',
    coinEdge: '#8a5a12',
    slimeBody: '#e8a45a',
    slimeLight: '#ffd9a0',
    slimeDark: '#7a4a1e',
    flyerBody: '#c97b4a',
    flyerLight: '#ffc9a0',
    spikerBody: '#5ea04e',
    spikerLight: '#a8e08a',
    spikerDark: '#2e6e2e',
  },
  {
    name: 'FROZEN TUNDRA',
    bg: 'tundra',
    sky: ['#0a1030', '#1b2a63', '#355c9e', '#7aa8e0'],
    skyNight: ['#02040e', '#060c20', '#0f1c3d', '#1b325c'],
    far: '#152047',
    mid: '#0a1230',
    decoFar: '#c8eaff',
    decoMid: '#a8dcf0',
    sunA: '#ffffff',
    sunB: '#9fd6ff',
    star: '#e6f6ff',
    accent: '#9ef0ff',
    accent2: '#3a86b8',
    ground: '#3d5c8a',
    groundDark: '#1c2e52',
    deco: '#e8f6ff',
    coinFill: '#bfefff',
    coinShine: '#ffffff',
    coinEdge: '#4a7ab0',
    slimeBody: '#8ec4ee',
    slimeLight: '#d4ecff',
    slimeDark: '#3a6ba0',
    flyerBody: '#d0e8ff',
    flyerLight: '#ffffff',
    spikerBody: '#9fd6ff',
    spikerLight: '#e6f6ff',
    spikerDark: '#4a7ab0',
  },
  {
    name: 'NEON CITY',
    bg: 'city',
    sky: ['#150c40', '#2d1c63', '#583a8f', '#a976c4'],
    skyNight: ['#060312', '#0d0722', '#1a0d3a', '#30165c'],
    far: '#291149',
    mid: '#1a0a33',
    decoFar: '#7ef7ff',
    decoMid: '#ff9db1',
    sunA: '#ffd166',
    sunB: '#ff4d6d',
    star: '#ffd9f0',
    accent: '#3ef2c8',
    accent2: '#1e9b8a',
    ground: '#3a2258',
    groundDark: '#241338',
    deco: '#ff4d6d',
    coinFill: '#ffd166',
    coinShine: '#fff0a8',
    coinEdge: '#8a5a12',
    slimeBody: '#a24bff',
    slimeLight: '#d9a8ff',
    slimeDark: '#5a1d8a',
    flyerBody: '#3ef2c8',
    flyerLight: '#b8fff2',
    spikerBody: '#c98cff',
    spikerLight: '#e6ccff',
    spikerDark: '#6a3ba8',
  },
];

const HEX_CACHE = new Map<string, [number, number, number]>();

function hex2rgb(h: string): [number, number, number] {
  let rgb = HEX_CACHE.get(h);
  if (!rgb) {
    const n = parseInt(h.slice(1), 16);
    rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    HEX_CACHE.set(h, rgb);
  }
  return rgb;
}

export function mix(a: string, end: string, t: number): string {
  if (t <= 0) return a;
  if (t >= 1) return end;
  if (a === end) return a;
  const A = hex2rgb(a);
  const B = hex2rgb(end);
  const r = Math.round(A[0] + (B[0] - A[0]) * t);
  const g = Math.round(A[1] + (B[1] - A[1]) * t);
  const b = Math.round(A[2] + (B[2] - A[2]) * t);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export function shade(c: string, amt: number): string {
  return amt >= 0 ? mix(c, '#ffffff', amt) : mix(c, '#000000', -amt);
}

export function sampleSky(stops: [string, string, string, string], t: number): string {
  const p = Math.min(0.9999, Math.max(0, t)) * 3;
  const i = Math.floor(p);
  return mix(stops[i], stops[i + 1], p - i);
}

type ColorKey = Exclude<keyof Zone, 'name' | 'bg' | 'sky' | 'skyNight'>;

export function lerpZone(a: Zone, b: Zone, t: number): Zone {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const mixAll = (k: ColorKey) => mix(a[k], b[k], t);
  return {
    name: t < 0.5 ? a.name : b.name,
    bg: t < 0.5 ? a.bg : b.bg,
    sky: [
      mix(a.sky[0], b.sky[0], t),
      mix(a.sky[1], b.sky[1], t),
      mix(a.sky[2], b.sky[2], t),
      mix(a.sky[3], b.sky[3], t),
    ],
    skyNight: [
      mix(a.skyNight[0], b.skyNight[0], t),
      mix(a.skyNight[1], b.skyNight[1], t),
      mix(a.skyNight[2], b.skyNight[2], t),
      mix(a.skyNight[3], b.skyNight[3], t),
    ],
    far: mixAll('far'),
    mid: mixAll('mid'),
    decoFar: mixAll('decoFar'),
    decoMid: mixAll('decoMid'),
    sunA: mixAll('sunA'),
    sunB: mixAll('sunB'),
    star: mixAll('star'),
    accent: mixAll('accent'),
    accent2: mixAll('accent2'),
    ground: mixAll('ground'),
    groundDark: mixAll('groundDark'),
    deco: mixAll('deco'),
    coinFill: mixAll('coinFill'),
    coinShine: mixAll('coinShine'),
    coinEdge: mixAll('coinEdge'),
    slimeBody: mixAll('slimeBody'),
    slimeLight: mixAll('slimeLight'),
    slimeDark: mixAll('slimeDark'),
    flyerBody: mixAll('flyerBody'),
    flyerLight: mixAll('flyerLight'),
    spikerBody: mixAll('spikerBody'),
    spikerLight: mixAll('spikerLight'),
    spikerDark: mixAll('spikerDark'),
  };
}
