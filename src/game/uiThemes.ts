/**
 * UI theme system — CSS-variable driven, zero-rerender switching.
 * Ported from Rosint+'s THEMES (App.jsx) mapped onto Pixel Run's UI roles.
 * Only React chrome (menus/modals/toasts) is themed; the canvas game keeps
 * its biome palette. Switching sets ~14 custom properties on <html>, so the
 * browser repaints once — no React state, no re-mounts.
 */

export interface UiTheme {
  id: string;
  name: string;
  /** page background + deepest shadow tone */
  bg: string;
  panel: string;
  panel2: string;
  panel3: string;
  border: string;
  border2: string;
  border3: string;
  accent: string;
  danger: string;
  gold: string;
  purple: string;
  muted: string;
  text: string;
}

export const UI_THEMES: UiTheme[] = [
  {
    id: 'default',
    name: 'PIXEL',
    bg: '#08040f',
    panel: '#0e071e',
    panel2: '#140a26',
    panel3: '#0d0619',
    border: '#251842',
    border2: '#2c1f4d',
    border3: '#453c60',
    accent: '#3ef2c8',
    danger: '#ff4d6d',
    gold: '#ffd166',
    purple: '#c98cff',
    muted: '#9d8fd6',
    text: '#e8ecff',
  },
  {
    id: 'nord',
    name: 'NORD',
    bg: '#0b0e13',
    panel: '#2e3440',
    panel2: '#333a46',
    panel3: '#272c36',
    border: '#3b4252',
    border2: '#434c5e',
    border3: '#4c566a',
    accent: '#88c0d0',
    danger: '#bf616a',
    gold: '#ebcb8b',
    purple: '#b48ead',
    muted: '#9ba8b8',
    text: '#eceff4',
  },
  {
    id: 'catppuccin',
    name: 'MOCHA',
    bg: '#11111b',
    panel: '#1e1e2e',
    panel2: '#24243a',
    panel3: '#181825',
    border: '#313244',
    border2: '#45475a',
    border3: '#585b70',
    accent: '#cba6f7',
    danger: '#f38ba8',
    gold: '#f9e2af',
    purple: '#f5c2e7',
    muted: '#a6adc8',
    text: '#cdd6f4',
  },
  {
    id: 'cyber',
    name: 'CYBER',
    bg: '#0b0716',
    panel: '#100a20',
    panel2: '#171030',
    panel3: '#0d0819',
    border: '#2a1f4d',
    border2: '#372866',
    border3: '#4b3a85',
    accent: '#fcee0a',
    danger: '#ff2e88',
    gold: '#24e0ff',
    purple: '#b26bff',
    muted: '#8f8ac0',
    text: '#eae6ff',
  },
  {
    id: 'mono',
    name: 'MONO',
    bg: '#000000',
    panel: '#0a0a0a',
    panel2: '#121212',
    panel3: '#060606',
    border: '#222222',
    border2: '#2e2e2e',
    border3: '#444444',
    accent: '#ffffff',
    danger: '#e8e8e8',
    gold: '#d4d4d4',
    purple: '#bdbdbd',
    muted: '#8a8a8a',
    text: '#f5f5f5',
  },
  {
    id: 'gruvbox',
    name: 'GRUVBOX',
    bg: '#131516',
    panel: '#282828',
    panel2: '#32302f',
    panel3: '#222222',
    border: '#3c3836',
    border2: '#504945',
    border3: '#665c54',
    accent: '#ebdbb2',
    danger: '#fb4934',
    gold: '#fabd2f',
    purple: '#d3869b',
    muted: '#bdae93',
    text: '#fbf1c7',
  },
  {
    id: 'dracula',
    name: 'DRACULA',
    bg: '#101116',
    panel: '#282a36',
    panel2: '#2f3141',
    panel3: '#21222c',
    border: '#44475a',
    border2: '#565971',
    border3: '#6272a4',
    accent: '#ff79c6',
    danger: '#ff5555',
    gold: '#f1fa8c',
    purple: '#bd93f9',
    muted: '#9299b8',
    text: '#f8f8f2',
  },
  {
    id: 'solarized',
    name: 'SOLARIZED',
    bg: '#001520',
    panel: '#002b36',
    panel2: '#073642',
    panel3: '#00252e',
    border: '#0a4250',
    border2: '#11505e',
    border3: '#586e75',
    accent: '#859900',
    danger: '#dc322f',
    gold: '#d3b106',
    purple: '#6c71c4',
    muted: '#8fa5ab',
    text: '#eee8d5',
  },
  {
    id: 'synthwave',
    name: 'SYNTHWAVE',
    bg: '#150f22',
    panel: '#2b213a',
    panel2: '#342a49',
    panel3: '#241c35',
    border: '#3f3358',
    border2: '#4d3f6b',
    border3: '#5f4f82',
    accent: '#f92aad',
    danger: '#fe4450',
    gold: '#ffcb47',
    purple: '#7a5fcf',
    muted: '#a99fd0',
    text: '#f0eaff',
  },
];

const KEY = 'pixeldash.uitheme';

function resolve(): UiTheme {
  try {
    const id = localStorage.getItem(KEY);
    return UI_THEMES.find((t) => t.id === id) ?? UI_THEMES[0];
  } catch {
    return UI_THEMES[0];
  }
}

/** Push the theme's colors into CSS custom properties on <html>. */
export function applyUiTheme(theme: UiTheme): void {
  const s = document.documentElement.style;
  s.setProperty('--ui-bg', theme.bg);
  s.setProperty('--ui-panel', theme.panel);
  s.setProperty('--ui-panel2', theme.panel2);
  s.setProperty('--ui-panel3', theme.panel3);
  s.setProperty('--ui-border', theme.border);
  s.setProperty('--ui-border2', theme.border2);
  s.setProperty('--ui-border3', theme.border3);
  s.setProperty('--ui-accent', theme.accent);
  s.setProperty('--ui-danger', theme.danger);
  s.setProperty('--ui-gold', theme.gold);
  s.setProperty('--ui-purple', theme.purple);
  s.setProperty('--ui-muted', theme.muted);
  s.setProperty('--ui-text', theme.text);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme.bg);
}

export function loadUiTheme(): UiTheme {
  const theme = resolve();
  applyUiTheme(theme);
  return theme;
}

export function saveUiTheme(theme: UiTheme): void {
  try {
    localStorage.setItem(KEY, theme.id);
  } catch {}
  applyUiTheme(theme);
}

export function cycleUiTheme(currentId: string): UiTheme {
  const i = UI_THEMES.findIndex((t) => t.id === currentId);
  return UI_THEMES[(i + 1) % UI_THEMES.length];
}

export function getUiTheme(id: string): UiTheme {
  return UI_THEMES.find((t) => t.id === id) ?? UI_THEMES[0];
}

