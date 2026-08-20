import { useEffect, useRef, useState } from 'react';
import {
  exportSaveData,
  downloadSaveFile,
  copySaveCodeToClipboard,
  restoreSaveFromString,
} from '../game/saveManager';
import { PixelButton, PixelCloseIcon } from './ui';
import { sfx } from '../game/audio';

interface SaveLoadModalProps {
  mode: 'save' | 'load';
  onClose: () => void;
  onRestoreSuccess: () => void;
  touch?: boolean;
}

export function SaveLoadModal({ mode, onClose, onRestoreSuccess }: SaveLoadModalProps) {
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
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-[#08040f]/80 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex w-full max-w-[380px] flex-col items-center border-2 border-[#3ef2c8] bg-[#0e071e] p-4 text-center font-pixel text-white shadow-[4px_4px_0_#06020c] sm:p-5">
        {/* Header */}
        <div className="mb-3 flex w-full items-center justify-between border-b-2 border-[#251842] pb-2">
          <h2 className="font-pixel text-[12px] uppercase tracking-wider text-[#3ef2c8]">
            {mode === 'save' ? 'EXPORT SAVE DATA' : 'RESTORE SAVE DATA'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center border-2 border-[#ff4d6d] bg-[#ff4d6d]/20 font-pixel text-[10px] text-[#ff4d6d] shadow-[1px_1px_0_#08040f] hover:bg-[#ff4d6d]/40 active:translate-x-[1px] active:translate-y-[1px]"
          >
            <PixelCloseIcon className="h-3.5 w-3.5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mb-3 w-full border border-[#ff4d6d] bg-[#ff4d6d]/15 p-2 text-[8px] text-[#ff4d6d]">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="mb-3 w-full border border-[#3ef2c8] bg-[#3ef2c8]/15 p-2 text-[8px] text-[#3ef2c8]">
            {successMsg}
          </div>
        )}

        {confirmPendingCode !== null ? (
          <div className="flex w-full flex-col gap-3">
            <div className="border border-[#ffd166] bg-[#ffd166]/10 p-3 text-center">
              <h3 className="font-pixel text-[10px] text-[#ffd166] mb-2">OVERWRITE PROGRESS?</h3>
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
                {loading ? 'RESTORING...' : 'CONFIRM OVERWRITE'}
              </PixelButton>

              <PixelButton
                variant="ghost"
                onClick={() => setConfirmPendingCode(null)}
                className="w-full min-h-[44px] py-2.5 text-[10px]"
              >
                CANCEL
              </PixelButton>
            </div>
          </div>
        ) : mode === 'save' ? (
          <div className="flex w-full flex-col gap-3">
            <p className="text-[8px] leading-relaxed text-[#9d8fd6] sm:text-[10px]">
              Download your backup file or copy the save code string to restore in Safari.
            </p>

            <div className="flex flex-col gap-2">
              <PixelButton
                onClick={handleDownload}
                className="w-full min-h-[44px] py-3 text-[10px]"
              >
                {loading ? 'EXPORTING...' : 'DOWNLOAD SAVE FILE'}
              </PixelButton>

              <PixelButton
                variant="ghost"
                onClick={handleCopy}
                className="w-full min-h-[44px] py-2.5 text-[10px]"
              >
                {copied ? 'COPIED TO CLIPBOARD!' : 'COPY SAVE CODE'}
              </PixelButton>
            </div>

            {/* Selectable Save Code Box */}
            <div className="mt-1 flex flex-col text-left">
              <span className="mb-1 text-[8px] text-[#9d8fd6]">
                BACKUP CODE STRING (TAP TO SELECT ALL):
              </span>
              <textarea
                ref={textareaRef}
                value={saveCode}
                onFocus={(e) => e.target.select()}
                onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                onChange={() => {}}
                className="h-16 w-full resize-none border-2 border-[#251842] bg-[#120722] p-2 font-mono text-[8px] text-[#ffd166] selection:bg-[#3ef2c8] selection:text-[#08040f] focus:border-[#3ef2c8] focus:outline-none"
              />
            </div>
          </div>
        ) : (
          <div className="flex w-full flex-col gap-3">
            <p className="text-[8px] leading-relaxed text-[#9d8fd6] sm:text-[10px]">
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
              className="flex min-h-[44px] w-full cursor-pointer items-center justify-center border-2 border-[#3ef2c8]/60 bg-[#092922] py-2.5 font-pixel text-[10px] text-[#3ef2c8] shadow-[2px_2px_0_#08040f] transition-colors hover:bg-[#0d3b2d] active:translate-x-[1px] active:translate-y-[1px]"
            >
              {loading ? 'LOADING...' : 'SELECT .SAVE FILE'}
            </label>

            <div className="flex flex-col text-left">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[8px] text-[#9d8fd6]">
                  OR PASTE SAVE CODE:
                </span>
                <button
                  type="button"
                  onClick={handlePasteFromClipboard}
                  className="cursor-pointer border-2 border-[#3ef2c8]/40 bg-[#092922] px-2 py-1 text-[8px] text-[#3ef2c8] hover:bg-[#0d3b2d]"
                >
                  PASTE FROM CLIPBOARD
                </button>
              </div>
              <textarea
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value)}
                placeholder="Paste PRSAVE1:... code here"
                className="h-20 w-full resize-none border-2 border-[#251842] bg-[#120722] p-2 font-mono text-[8px] text-[#ffd166] placeholder-[#9d8fd6] focus:border-[#3ef2c8] focus:outline-none"
              />
            </div>

            <PixelButton
              onClick={handleRestoreFromText}
              className="w-full min-h-[44px] py-3 text-[10px]"
            >
              {loading ? 'RESTORING...' : 'RESTORE PROGRESS'}
            </PixelButton>
          </div>
        )}
      </div>
    </div>
  );
}
