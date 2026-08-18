import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';

const MIGRATION_PREFIX = '#pixelrun-migrate=';

function restoreMigratedStorage() {
  if (typeof window === 'undefined' || !window.location.hash.startsWith(MIGRATION_PREFIX)) return;
  try {
    let encoded = window.location.hash.slice(MIGRATION_PREFIX.length).replace(/-/g, '+').replace(/_/g, '/');
    while (encoded.length % 4 !== 0) encoded += '=';
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const storage = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
    for (const [key, value] of Object.entries(storage)) {
      if (key.startsWith('pixeldash.') && typeof value === 'string') localStorage.setItem(key, value);
    }
    localStorage.setItem('pixeldash.origin_migration_v2', '1');
  } catch {}
  window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}`);
}

restoreMigratedStorage();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
