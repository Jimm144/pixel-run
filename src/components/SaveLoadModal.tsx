import { useEffect, useRef, useState } from 'react';
import {
  exportSaveData,
  downloadSaveFile,
  copySaveCodeToClipboard,
  restoreSaveFromString,
} from '../game/saveManager';
import { PixelButton, PixelCloseIcon } from './ui';
import { sfx } from '../game/audio';
import { type SupportedLanguage, getTranslations } from '../game/i18n';

interface SaveLoadModalProps {
  mode: 'save' | 'load';
  onClose: () => void;
  onRestoreSuccess: () => void;
  touch?: boolean;
  lang?: SupportedLanguage;
}

export function SaveLoadModal({ mode, onClose, onRestoreSuccess, lang = 'en' }: SaveLoadModalProps) {
  const t = getTranslations(lang);
  const [saveCode, setSaveCode] = useState<string>('');
  const [inputCode, setInputCode] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Real file input rendered in the tree — required for iOS/Android file picker
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === 'save') {
      exportSaveData().then((code) => {
        setSaveCode(code);
      });
    }
  }, [mode]);

  const handleDownload = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const ok = await downloadSaveFile();
      if (ok) {
        sfx.play('gem');
        setSuccessMsg('SAVE FILE EXPORTED');
      } else {
        setErrorMsg('DOWNLOAD BLOCKED — USE COPY CODE BELOW');
      }
    } catch {
      setErrorMsg('DOWNLOAD BLOCKED — USE COPY CODE BELOW');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    const ok = await copySaveCodeToClipboard(saveCode);
    if (ok) {
      sfx.play('ui');
      setCopied(true);
      setSuccessMsg('COPIED TO CLIPBOARD!');
      setTimeout(() => setCopied(false), 3000);
    } else {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.select();
      }
      setCopied(false);
      setErrorMsg('CODE SELECTED — TAP AND HOLD TO COPY');
    }
  };

  const [confirmPendingCode, setConfirmPendingCode] = useState<string | null>(null);

  // File input change handler — reads the file and queues confirmation
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    try {
      const text = await file.text();
      setConfirmPendingCode(text);
    } catch {
      sfx.play('death');
      setErrorMsg('FAILED TO READ FILE');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRestoreFromText = () => {
    const raw = inputCode.trim();
    if (!raw) {
      setErrorMsg('PLEASE PASTE A SAVE CODE');
      return;
    }
    setErrorMsg(null);
    setConfirmPendingCode(raw);
  };

  const executeRestore = async (rawCode: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await restoreSaveFromString(rawCode);
      if (res.success) {
        sfx.play('gem');
        onRestoreSuccess();
        onClose();
      } else {
        sfx.play('death');
        setErrorMsg(res.error || 'INVALID SAVE DATA');
      }
    } catch {
      sfx.play('death');
      setErrorMsg('FAILED TO RESTORE SAVE');
    } finally {
      setLoading(false);
      setConfirmPendingCode(null);
    }
  };

  const handlePasteFromClipboard = async () => {
    setErrorMsg(null);
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
        const text = await navigator.clipboard.readText();
        if (text) {
          setInputCode(text.trim());
          sfx.play('ui');
          setSuccessMsg('PASTED FROM CLIPBOARD!');
          setTimeout(() => setSuccessMsg(null), 2500);
          return;
        }
      }
    } catch {}
    setErrorMsg('TAP INSIDE THE BOX AND PASTE MANUALLY');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-[var(--ui-bg)]/80 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex w-full max-w-[380px] flex-col items-center border-2 border-[var(--ui-accent)] bg-[var(--ui-panel)] p-4 text-center font-pixel text-white shadow-[4px_4px_0_var(--ui-bg)] sm:p-5">
        {/* Header */}
        <div className="mb-3 flex w-full items-center justify-between border-b-2 border-[var(--ui-border)] pb-2">
          <h2 className="font-pixel text-[12px] uppercase tracking-wider text-[var(--ui-accent)]">
            {mode === 'save' ? t.exportSaveData : t.restoreSaveData}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center border-2 border-[var(--ui-danger)] bg-[var(--ui-danger)]/20 font-pixel text-[10px] text-[var(--ui-danger)] shadow-[1px_1px_0_var(--ui-bg)] hover:bg-[var(--ui-danger)]/40 active:translate-x-[1px] active:translate-y-[1px]"
          >
            <PixelCloseIcon className="h-3.5 w-3.5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mb-3 w-full border border-[var(--ui-danger)] bg-[var(--ui-danger)]/15 p-2 text-[8px] text-[var(--ui-danger)]">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="mb-3 w-full border border-[var(--ui-accent)] bg-[var(--ui-accent)]/15 p-2 text-[8px] text-[var(--ui-accent)]">
            {successMsg}
          </div>
        )}

        {confirmPendingCode !== null ? (
          <div className="flex w-full flex-col gap-3">
            <div className="border border-[var(--ui-gold)] bg-[var(--ui-gold)]/10 p-3 text-center">
              <h3 className="font-pixel text-[10px] text-[var(--ui-gold)] mb-2">OVERWRITE PROGRESS?</h3>
              <p className="text-[8px] leading-relaxed text-[#f3f4f6]">
                This will replace your stats, unlocked skins, and scores with the restored save.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <PixelButton
                variant="danger"
                onClick={() => executeRestore(confirmPendingCode)}
                className="w-full min-h-[44px] py-3 text-[10px]"
              >
                {loading ? 'RESTORING...' : t.confirmOverwrite}
              </PixelButton>

              <PixelButton
                variant="ghost"
                onClick={() => setConfirmPendingCode(null)}
                className="w-full min-h-[44px] py-2.5 text-[10px]"
              >
                {t.cancel}
              </PixelButton>
            </div>
          </div>
        ) : mode === 'save' ? (
          <div className="flex w-full flex-col gap-3">
            <p className="text-[8px] leading-relaxed text-[var(--ui-muted)] sm:text-[10px]">
              Download your backup file or copy the save code string to restore in Safari.
            </p>

            <div className="flex flex-col gap-2">
              <PixelButton
                onClick={handleDownload}
                className="w-full min-h-[44px] py-3 text-[10px]"
              >
                {loading ? 'EXPORTING...' : t.downloadSaveFile}
              </PixelButton>

              <PixelButton
                variant="ghost"
                onClick={handleCopy}
                className="w-full min-h-[44px] py-2.5 text-[10px]"
              >
                {copied ? t.copiedToClipboard : t.copySaveCode}
              </PixelButton>
            </div>

            {/* Selectable Save Code Box */}
            <div className="mt-1 flex flex-col text-left">
              <span className="mb-1 text-[8px] text-[var(--ui-muted)]">
                BACKUP CODE STRING (TAP TO SELECT ALL):
              </span>
              <textarea
                ref={textareaRef}
                value={saveCode}
                onFocus={(e) => e.target.select()}
                onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                onChange={() => {}}
                className="h-16 w-full resize-none border-2 border-[var(--ui-border)] bg-[var(--ui-panel3)] p-2 font-mono text-[8px] text-[var(--ui-gold)] selection:bg-[var(--ui-accent)] selection:text-[var(--ui-bg)] focus:border-[var(--ui-accent)] focus:outline-none"
              />
            </div>
          </div>
        ) : (
          <div className="flex w-full flex-col gap-3">
            <p className="text-[8px] leading-relaxed text-[var(--ui-muted)] sm:text-[10px]">
              Select your .save file or paste your backup code string below.
            </p>

            {/* Hidden real file input — rendered in tree for iOS/Android reliability */}
            <input
              ref={fileInputRef}
              type="file"
              accept="*/*"
              aria-hidden="true"
              tabIndex={-1}
              onChange={handleFileChange}
              className="sr-only"
              id="save-file-input"
            />
            {/* Label acts as the click target — guaranteed to open file picker on all platforms */}
            <label
              htmlFor="save-file-input"
              className="flex min-h-[44px] w-full cursor-pointer items-center justify-center border-2 border-[var(--ui-accent)]/60 bg-[var(--ui-accent-dim)] py-2.5 font-pixel text-[10px] text-[var(--ui-accent)] shadow-[2px_2px_0_var(--ui-bg)] transition-colors hover:bg-[var(--ui-accent-dim2)] active:translate-x-[1px] active:translate-y-[1px]"
            >
              {loading ? 'LOADING...' : t.selectSaveFile}
            </label>

            <div className="flex flex-col text-left">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[8px] text-[var(--ui-muted)]">
                  OR PASTE SAVE CODE:
                </span>
                <button
                  type="button"
                  onClick={handlePasteFromClipboard}
                  className="cursor-pointer border-2 border-[var(--ui-accent)]/40 bg-[var(--ui-accent-dim)] px-2 py-1 text-[8px] text-[var(--ui-accent)] hover:bg-[var(--ui-accent-dim2)]"
                >
                  {t.pasteFromClipboard}
                </button>
              </div>
              <textarea
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value)}
                placeholder="Paste PRSAVE1:... code here"
                className="h-20 w-full resize-none border-2 border-[var(--ui-border)] bg-[var(--ui-panel3)] p-2 font-mono text-[8px] text-[var(--ui-gold)] placeholder-[var(--ui-muted)] focus:border-[var(--ui-accent)] focus:outline-none"
              />
            </div>

            <PixelButton
              onClick={handleRestoreFromText}
              className="w-full min-h-[44px] py-3 text-[10px]"
            >
              {loading ? 'RESTORING...' : t.restoreProgress}
            </PixelButton>
          </div>
        )}
      </div>
    </div>
  );
}
