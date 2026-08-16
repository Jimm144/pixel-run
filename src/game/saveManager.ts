/**
 * Encrypted Save Manager for Pixel Run
 * Uses AES-GCM encryption with Web Crypto API to ensure tamper-proof save files.
 */

const SAVE_MAGIC = 'PRSAVE1:';
const SECRET_PASSPHRASE = 'PixelRun_Secret_Encrypted_Save_Signature_2026_k982';
const SALT = new Uint8Array([112, 105, 120, 101, 108, 114, 117, 110, 95, 115, 97, 108, 116, 95, 118, 49]);

export interface ExportPayload {
  version: 1;
  timestamp: number;
  storage: Record<string, string>;
}

async function getEncryptionKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(SECRET_PASSPHRASE),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
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
}

function bufferToBase64(buf: Uint8Array): string {
  let binary = '';
  const len = buf.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(buf[i]);
  }
  // URL-safe base64: replace + with - and / with _ and remove padding =
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64ToBuffer(b64: string): Uint8Array {
  // Accept both standard and URL-safe base64; strip iOS smart chars
  let clean = b64
    .replace(/[\u2018\u2019]/g, "'")    // iOS smart single quotes
    .replace(/[\u201c\u201d]/g, '"')    // iOS smart double quotes
    .replace(/[\u2013\u2014]/g, '-')    // iOS en/em dashes -> hyphens
    .replace(/\s/g, '');               // any whitespace

  // Normalize URL-safe -> standard base64
  clean = clean.replace(/-/g, '+').replace(/_/g, '/');

  // Add padding
  while (clean.length % 4 !== 0) clean += '=';

  const binary = atob(clean);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
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

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getEncryptionKey();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return SAVE_MAGIC + bufferToBase64(combined);
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

    // 1. Mobile & Webview Share API fallback (Snapchat, Instagram, iOS Safari, Android)
    if (typeof navigator !== 'undefined' && 'canShare' in navigator && 'share' in navigator) {
      try {
        const file = new File([blob], filename, { type: 'application/octet-stream' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'Pixel Run Save File',
            text: 'My encrypted Pixel Run save backup',
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
  const content = givenContent || (await exportSaveData());
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(content);
      return true;
    }
  } catch {}

  // Fallback: document.execCommand
  try {
    const textArea = document.createElement('textarea');
    textArea.value = content;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '-9999px';
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    if (successful) return true;
  } catch {}

  return false;
}

export async function restoreSaveFromString(raw: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Aggressively clean the input
    let clean = raw
      .trim()
      .replace(/\r\n/g, '\n')
      .replace(/\u00a0/g, ' '); // non-breaking space

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

    // 1. Raw JSON support (unencrypted dev exports)
    if (clean.startsWith('{') && clean.endsWith('}')) {
      try {
        const parsed = JSON.parse(clean);
        if (parsed?.storage && typeof parsed.storage === 'object') {
          for (const [key, val] of Object.entries(parsed.storage)) {
            if (typeof key === 'string' && key.startsWith('pixeldash.') && typeof val === 'string') {
              localStorage.setItem(key, val);
            }
          }
          return { success: true };
        }
      } catch {}
    }

    // 2. Extract base64 payload — accept with or without PRSAVE1: prefix
    let b64Data: string;
    const magicIdx = clean.indexOf(SAVE_MAGIC);
    if (magicIdx !== -1) {
      b64Data = clean.slice(magicIdx + SAVE_MAGIC.length);
    } else if (/^[A-Za-z0-9+/=]+$/.test(clean.replace(/\s/g, ''))) {
      // Looks like raw base64 — try it directly
      b64Data = clean;
    } else {
      return { success: false, error: 'INVALID SAVE CODE FORMAT' };
    }

    // Strip all whitespace from base64
    b64Data = b64Data.replace(/[\s\r\n\t]/g, '');

    if (!b64Data) {
      return { success: false, error: 'EMPTY SAVE CODE' };
    }

    let combined: Uint8Array;
    try {
      combined = base64ToBuffer(b64Data);
    } catch {
      return { success: false, error: 'INVALID SAVE CODE — CHECK FOR MISSING CHARACTERS' };
    }

    if (combined.length <= 12) {
      return { success: false, error: 'SAVE CODE TOO SHORT — COPY THE FULL CODE' };
    }

    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const key = await getEncryptionKey();

    let decrypted: ArrayBuffer;
    try {
      decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext
      );
    } catch {
      return { success: false, error: 'SAVE CODE FROM DIFFERENT DEVICE OR CORRUPTED' };
    }

    const dec = new TextDecoder();
    const jsonStr = dec.decode(decrypted);

    let parsed: ExportPayload;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return { success: false, error: 'CORRUPTED SAVE DATA' };
    }

    if (!parsed?.storage || typeof parsed.storage !== 'object') {
      return { success: false, error: 'INCOMPATIBLE SAVE VERSION' };
    }

    for (const [key, val] of Object.entries(parsed.storage)) {
      if (typeof key === 'string' && key.startsWith('pixeldash.') && typeof val === 'string') {
        localStorage.setItem(key, val);
      }
    }

    return { success: true };
  } catch {
    return { success: false, error: 'FAILED TO RESTORE SAVE' };
  }
}

/**
 * Triggers a file picker completely programmatically without mounting inputs in React DOM.
 */
export function triggerImportSaveDialog(onResult: (res: { success: boolean; error?: string }) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.save,.dat,.txt';
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
