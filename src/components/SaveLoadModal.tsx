import { useEffect, useRef, useState } from 'react';
import {
  exportSaveData,
  downloadSaveFile,
  copySaveCodeToClipboard,
  restoreSaveFromString,
  triggerImportSaveDialog,
} from '../game/saveManager';
import { PixelButton } from './ui';
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
      // If browser blocked automatic copy, select text and prompt user
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.select();
      }
      setCopied(false);
      setErrorMsg('CODE SELECTED — TAP COPY IN POPUP');
    }
  };

  const handleUploadFile = () => {
    setErrorMsg(null);
    triggerImportSaveDialog((res) => {
      if (res.success) {
        sfx.play('gem');
        onRestoreSuccess();
        onClose();
      } else {
        sfx.play('death');
        setErrorMsg(res.error || 'INVALID SAVE FILE');
      }
    });
  };

  const handleRestoreFromText = async () => {
    const raw = inputCode.trim();
    if (!raw) {
      setErrorMsg('PLEASE PASTE A SAVE CODE');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await restoreSaveFromString(raw);
      if (res.success) {
        sfx.play('gem');
        onRestoreSuccess();
        onClose();
      } else {
        sfx.play('death');
        setErrorMsg(res.error || 'INVALID SAVE CODE');
      }
    } catch {
      sfx.play('death');
      setErrorMsg('FAILED TO RESTORE SAVE');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-[#08040f]/90 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex w-full max-w-[380px] flex-col items-center border-4 border-[#3ef2c8] bg-[#0d0619] p-4 text-center font-pixel text-white shadow-[0_0_0_4px_#08040f,0_0_35px_rgba(62,242,200,0.25)] sm:p-5">
        {/* Header */}
        <div className="mb-3 flex w-full items-center justify-between border-b-2 border-[#251842] pb-2">
          <h2 className="text-[11px] uppercase tracking-wider text-[#3ef2c8] sm:text-[13px]">
            {mode === 'save' ? 'EXPORT SAVE DATA' : 'RESTORE SAVE DATA'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center border border-[#ff4d6d] bg-[#ff4d6d]/20 text-[10px] text-[#ff4d6d] hover:bg-[#ff4d6d]/40 active:translate-x-[1px] active:translate-y-[1px]"
          >
            ✕
          </button>
        </div>

        {errorMsg && (
          <div className="mb-3 w-full border border-[#ff4d6d] bg-[#ff4d6d]/15 p-2 text-[7px] text-[#ff4d6d] sm:text-[8px]">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="mb-3 w-full border border-[#3ef2c8] bg-[#3ef2c8]/15 p-2 text-[7px] text-[#3ef2c8] sm:text-[8px]">
            {successMsg}
          </div>
        )}

        {mode === 'save' ? (
          <div className="flex w-full flex-col gap-3">
            <p className="text-[7.5px] leading-relaxed text-[#9d8fd6] sm:text-[8.5px]">
              Download your encrypted backup or copy the save code to restore later.
            </p>

            <div className="flex flex-col gap-2">
              <PixelButton
                onClick={handleDownload}
                className="w-full py-3 text-[9.5px] sm:text-[11px]"
              >
                {loading ? 'EXPORTING...' : 'DOWNLOAD SAVE FILE'}
              </PixelButton>

              <PixelButton
                variant="ghost"
                onClick={handleCopy}
                className="w-full py-2.5 text-[8.5px] sm:text-[9.5px]"
              >
                {copied ? '✓ COPIED!' : 'COPY SAVE CODE'}
              </PixelButton>
            </div>

            {/* Selectable Save Code Box */}
            <div className="mt-1 flex flex-col text-left">
              <span className="mb-1 text-[6.5px] text-[#6f5fa8] sm:text-[7.5px]">
                BACKUP CODE STRING:
              </span>
              <textarea
                ref={textareaRef}
                readOnly
                value={saveCode}
                onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                className="h-16 w-full resize-none border-2 border-[#251842] bg-[#120722] p-2 font-mono text-[7px] text-[#ffd166] selection:bg-[#3ef2c8] selection:text-[#08040f] focus:border-[#3ef2c8] focus:outline-none"
              />
            </div>
          </div>
        ) : (
          <div className="flex w-full flex-col gap-3">
            <p className="text-[7.5px] leading-relaxed text-[#9d8fd6] sm:text-[8.5px]">
              Upload your .save file or paste your encrypted save code string below.
            </p>

            <PixelButton
              variant="ghost"
              onClick={handleUploadFile}
              className="w-full py-2.5 text-[9px] sm:text-[10px]"
            >
              UPLOAD .SAVE FILE
            </PixelButton>

            <div className="flex flex-col text-left">
              <span className="mb-1 text-[6.5px] text-[#6f5fa8] sm:text-[7.5px]">
                OR PASTE SAVE CODE:
              </span>
              <textarea
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value)}
                placeholder="Paste PRSAVE1:... code here"
                className="h-20 w-full resize-none border-2 border-[#251842] bg-[#120722] p-2 font-mono text-[7px] text-[#ffd166] placeholder-[#6f5fa8] focus:border-[#3ef2c8] focus:outline-none"
              />
            </div>

            <PixelButton
              onClick={handleRestoreFromText}
              className="w-full py-3 text-[9.5px] sm:text-[11px]"
            >
              {loading ? 'RESTORING...' : 'RESTORE PROGRESS'}
            </PixelButton>
          </div>
        )}
      </div>
    </div>
  );
}
