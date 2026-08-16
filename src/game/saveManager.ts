/**
 * Save Manager for Pixel Run
 * Failsafe cross-browser & cross-device backup and restore.
 * Supports Base64-encoded JSON, legacy AES-GCM payloads, and raw JSON.
 */

const SAVE_MAGIC = 'PRSAVE1:';
const SECRET_PASSPHRASE = 'PixelRun_Secret_Encrypted_Save_Signature_2026_k982';
const SALT = new Uint8Array([112, 105, 120, 101, 108, 114, 117, 110, 95, 115, 97, 108, 116, 95, 118, 49]);

export interface ExportPayload {
  version: 1;
  timestamp: number;
  storage: Record<string, string>;
}

export const GAME_STORAGE_KEYS = [
  'pixeldash.best.v2',
  'pixeldash.scores.v1',
  'pixeldash.best',
  'pixeldash.lastrun.v1',
  'pixeldash.volumes.v1',
  'pixeldash.runs',
  'pixeldash.quests.v2',
  'pixeldash.quests.v1',
  'pixeldash.lifetime_stats',
  'pixeldash.unlocked_skins',
  'pixeldash.equipped_skin',
];

async function getEncryptionKey(): Promise<CryptoKey | null> {
  try {
    if (typeof crypto === 'undefined' || !crypto.subtle) return null;
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(SECRET_PASSPHRASE),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );
    return await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: SALT,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  } catch {
    return null;
  }
}

function bufferToBase64(buf: Uint8Array): string {
  let binary = '';
  const len = buf.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(buf[i]);
  }
  // URL-safe base64
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64ToBuffer(b64: string): Uint8Array {
  // Normalize iOS smart punctuation & whitespace
  let clean = b64
    .replace(/[\u2018\u2019]/g, "'")    // iOS smart single quotes
    .replace(/[\u201c\u201d]/g, '"')    // iOS smart double quotes
    .replace(/[\u2013\u2014]/g, '-')    // iOS en/em dashes -> hyphens
    .replace(/\s/g, '');               // any whitespace

  // Convert URL-safe base64 to standard base64
  clean = clean.replace(/-/g, '+').replace(/_/g, '/');

  // Re-pad
  while (clean.length % 4 !== 0) clean += '=';

  const binary = atob(clean);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function exportSaveData(): Promise<string> {
  const storageData: Record<string, string> = {};

  // Export all explicit game keys
  for (const key of GAME_STORAGE_KEYS) {
    const val = localStorage.getItem(key);
    if (val !== null) {
      storageData[key] = val;
    }
  }

  // Also dynamically capture any additional pixeldash keys
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('pixeldash.')) {
        const val = localStorage.getItem(key);
        if (val !== null) {
          storageData[key] = val;
        }
      }
    }
  } catch {}

  const payload: ExportPayload = {
    version: 1,
    timestamp: Date.now(),
    storage: storageData,
  };

  const jsonStr = JSON.stringify(payload);
  const enc = new TextEncoder();
  const data = enc.encode(jsonStr);

  return SAVE_MAGIC + bufferToBase64(data);
}

export function getSaveFilename(): string {
  const d = new Date();
  const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `pixel-run-${dateStr}.save`;
}

export async function downloadSaveFile(): Promise<boolean> {
  try {
    const content = await exportSaveData();
    const filename = getSaveFilename();
    const blob = new Blob([content], { type: 'application/octet-stream' });

    // 1. Mobile Share API fallback (Snapchat, Instagram, iOS Safari, Android)
    if (typeof navigator !== 'undefined' && 'canShare' in navigator && 'share' in navigator) {
      try {
        const file = new File([blob], filename, { type: 'application/octet-stream' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'Pixel Run Save File',
            text: 'My Pixel Run save backup',
          });
          return true;
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          return true;
        }
      }
    }

    // 2. Standard direct blob download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch {}
    }, 2000);
    return true;
  } catch {
    return false;
  }
}

export async function copySaveCodeToClipboard(givenContent?: string): Promise<boolean> {
  const content = (givenContent || (await exportSaveData())).trim();

  // 1. Try modern async Clipboard API
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(content);
      return true;
    } catch {}
  }

  // 2. iOS Safari & in-app webview (Snapchat, IG) compliant execCommand fallback
  try {
    const el = document.createElement('textarea');
    el.value = content;
    el.style.position = 'fixed';
    el.style.top = '0';
    el.style.left = '0';
    el.style.width = '100px';
    el.style.height = '100px';
    el.style.opacity = '0.01';
    el.style.pointerEvents = 'none';
    document.body.appendChild(el);
    el.focus({ preventScroll: true });
    el.setSelectionRange(0, content.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    if (ok) return true;
  } catch {}

  return false;
}

export async function restoreSaveFromString(raw: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Aggressively clean input
    let clean = raw
      .trim()
      .replace(/\r\n/g, '\n')
      .replace(/[\u00a0\u200b\u200c\u200d\ufeff]/g, ' ') // zero-width & non-breaking spaces
      .trim();

    // Strip surrounding quotes or backticks
    if (
      (clean.startsWith('"') && clean.endsWith('"')) ||
      (clean.startsWith("'") && clean.endsWith("'")) ||
      (clean.startsWith('`') && clean.endsWith('`'))
    ) {
      clean = clean.slice(1, -1).trim();
    }
    // Strip markdown code fences
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/, '').trim();
    }

    if (!clean) {
      return { success: false, error: 'EMPTY SAVE CODE' };
    }

    // Helper: apply storage entries to localStorage
    const applyStorage = (storageObj: Record<string, string>): boolean => {
      let applied = 0;
      for (const [key, val] of Object.entries(storageObj)) {
        if (typeof key === 'string' && key.startsWith('pixeldash.') && typeof val === 'string') {
          localStorage.setItem(key, val);
          applied++;
        }
      }
      return applied > 0;
    };

    // TIER 1: Direct JSON parsing
    if (clean.startsWith('{') && clean.endsWith('}')) {
      try {
        const parsed = JSON.parse(clean);
        if (parsed?.storage && typeof parsed.storage === 'object') {
          if (applyStorage(parsed.storage)) return { success: true };
        }
      } catch {}
    }

    // TIER 2: Extract base64 payload (with or without PRSAVE prefix)
    let b64Data = clean;
    const prefixMatch = clean.match(/^(?:PRSAVE\d*[:\s-]*)(.*)$/is);
    if (prefixMatch && prefixMatch[1]) {
      b64Data = prefixMatch[1].trim();
    }

    // Clean whitespace from base64
    b64Data = b64Data.replace(/[\s\r\n\t]/g, '');

    if (!b64Data) {
      return { success: false, error: 'EMPTY SAVE CODE' };
    }

    // Attempt Base64 Decoding
    let combined: Uint8Array;
    try {
      combined = base64ToBuffer(b64Data);
    } catch {
      return { success: false, error: 'INVALID SAVE CODE — CHECK FOR MISSING CHARACTERS' };
    }

    // TIER 2A: Direct Base64 JSON Payload (PRSAVE1 standard)
    try {
      const dec = new TextDecoder();
      const text = dec.decode(combined);
      if (text.startsWith('{') && text.endsWith('}')) {
        const parsed = JSON.parse(text);
        if (parsed?.storage && typeof parsed.storage === 'object') {
          if (applyStorage(parsed.storage)) return { success: true };
        }
      }
    } catch {}

    // TIER 2B: Legacy AES-GCM Encrypted Payload
    if (combined.length > 12) {
      try {
        const iv = combined.slice(0, 12);
        const ciphertext = combined.slice(12);
        const key = await getEncryptionKey();
        if (key) {
          const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            ciphertext
          );
          const dec = new TextDecoder();
          const jsonStr = dec.decode(decrypted);
          const parsed = JSON.parse(jsonStr);
          if (parsed?.storage && typeof parsed.storage === 'object') {
            if (applyStorage(parsed.storage)) return { success: true };
          }
        }
      } catch {}
    }

    // TIER 3: Fallback Regex Extraction for any embedded pixeldash keys
    try {
      const keyMatches = clean.matchAll(/"(pixeldash\.[a-zA-Z0-9_.-]+)"\s*:\s*("(?:[^"\\]|\\.)*"|\d+|true|false|\{[^}]*\}|\[[^\]]*\])/g);
      const extracted: Record<string, string> = {};
      for (const match of keyMatches) {
        const key = match[1];
        let rawVal = match[2];
        if (rawVal.startsWith('"') && rawVal.endsWith('"')) {
          try { rawVal = JSON.parse(rawVal); } catch {}
        }
        extracted[key] = typeof rawVal === 'string' ? rawVal : JSON.stringify(rawVal);
      }
      if (Object.keys(extracted).length > 0) {
        if (applyStorage(extracted)) return { success: true };
      }
    } catch {}

    return { success: false, error: 'INVALID SAVE CODE FORMAT' };
  } catch {
    return { success: false, error: 'FAILED TO RESTORE SAVE' };
  }
}

/**
 * Triggers a file picker programmatically
 */
export function triggerImportSaveDialog(onResult: (res: { success: boolean; error?: string }) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.save,.dat,.txt,text/plain';
  input.style.display = 'none';

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const result = await restoreSaveFromString(text);
      onResult(result);
    } catch {
      onResult({ success: false, error: 'FAILED TO READ FILE' });
    } finally {
      input.remove();
    }
  });

  document.body.appendChild(input);
  input.click();
  setTimeout(() => input.remove(), 60000);
}
