const LEGACY_ORIGIN = 'https://jimm144.github.io';
const NEW_ORIGIN = 'https://pixelrun.localplayer.dev';
const LEGACY_MIGRATION_URL = `${LEGACY_ORIGIN}/pixel-run/migrate.html?v=1`;
const MIGRATION_KEY = 'pixeldash.origin_migration_v1';

function hasMeaningfulProgress(): boolean {
  try {
    return [
      'pixeldash.best.v2',
      'pixeldash.scores.v1',
      'pixeldash.lifetime_stats',
      'pixeldash.quests.v2',
      'pixeldash.equipped_skin',
      'pixeldash.total_runs.v1',
    ].some((key) => localStorage.getItem(key) !== null);
  } catch {
    return false;
  }
}

/** Import the old origin's local save once after the custom domain is opened. */
export function migrateLegacyStorage(): Promise<void> {
  if (typeof window === 'undefined' || window.location.origin !== NEW_ORIGIN) return Promise.resolve();

  try {
    if (localStorage.getItem(MIGRATION_KEY) === '1' || hasMeaningfulProgress()) {
      localStorage.setItem(MIGRATION_KEY, '1');
      return Promise.resolve();
    }
  } catch {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      frame.remove();
      resolve();
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== LEGACY_ORIGIN || event.source !== frame.contentWindow) return;
      if (event.data?.type !== 'PIXEL_RUN_STORAGE_RESPONSE') return;

      let imported = false;
      try {
        const storage = event.data.storage as Record<string, unknown>;
        for (const [key, value] of Object.entries(storage)) {
          if (!key.startsWith('pixeldash.') || typeof value !== 'string') continue;
          localStorage.setItem(key, value);
          imported = true;
        }
        localStorage.setItem(MIGRATION_KEY, '1');
      } catch {}

      finish();
      if (imported) window.location.reload();
    };

    const timeout = window.setTimeout(finish, 1500);
    window.addEventListener('message', onMessage);
    frame.setAttribute('aria-hidden', 'true');
    frame.style.display = 'none';
    frame.src = LEGACY_MIGRATION_URL;
    frame.addEventListener('load', () => {
      frame.contentWindow?.postMessage({ type: 'PIXEL_RUN_STORAGE_REQUEST' }, LEGACY_ORIGIN);
    });
    document.body.appendChild(frame);
  });
}
