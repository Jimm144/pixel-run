const KEY = 'pixeldash.errors.v1';
const MAX_ERRORS = 10;
const MAX_BYTES = 4096;
const BEACON_URL = 'https://analytics.open-domains.com/api/send';

let ring: string[] = [];

function loadRing(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((e): e is string => typeof e === 'string').slice(-MAX_ERRORS)
      : [];
  } catch {
    return [];
  }
}

function saveRing() {
  try {
    let raw = JSON.stringify(ring);
    while (raw.length > MAX_BYTES && ring.length > 1) {
      ring.shift();
      raw = JSON.stringify(ring);
    }
    localStorage.setItem(KEY, raw);
  } catch {}
}

function capture(detail: Record<string, string>) {
  try {
    const entry = JSON.stringify(detail);
    ring = [...loadRing(), entry].slice(-MAX_ERRORS);
    saveRing();
    navigator.sendBeacon(
      BEACON_URL,
      JSON.stringify({
        ...detail,
        ua: navigator.userAgent,
        screen: `${window.screen.width}x${window.screen.height}`,
        origin: window.location.origin,
      }),
    );
  } catch {}
}

export function getErrorReport(): string {
  try {
    return loadRing().join('\n');
  } catch {
    return '';
  }
}

export function initErrorTelemetry() {
  try {
    ring = loadRing();
    window.addEventListener('error', (e) => {
      capture({
        message: e.message || String(e.error),
        source: e.filename || 'unknown',
        line: String(e.lineno),
        col: String(e.colno),
      });
    });
    window.addEventListener('unhandledrejection', (e) => {
      const r = e.reason;
      capture({
        message: r instanceof Error ? `${r.name}: ${r.message}` : String(r),
        source: 'unhandledrejection',
        line: '0',
        col: '0',
      });
    });
  } catch {}
}
