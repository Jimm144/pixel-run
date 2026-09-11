import { useState, useEffect, useCallback } from 'react';
import { PixelCloseIcon, PixelReloadIcon } from './ui';
import { sfx } from '../game/audio';
import { inputManager, type GamepadAction } from '../game/input';

export interface UpdateModalProps {
  onClose: () => void;
  swUpdate?: ServiceWorkerRegistration | null;
  onApplyUpdate?: () => void;
  onCheckUpdate?: () => Promise<void>;
  touch?: boolean;
}

const CURRENT_VERSION = 'v1.2.0';
const BUILD_DATE = 'August 2026';

export function UpdateModal({
  onClose,
  swUpdate,
  onApplyUpdate,
  onCheckUpdate,
}: UpdateModalProps) {
  const [checking, setChecking] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(
    swUpdate ? 'UPDATE READY TO INSTALL!' : null,
  );

  useEffect(() => {
    setStatusMessage(swUpdate ? 'UPDATE READY TO INSTALL!' : null);
  }, [swUpdate]);

  const handleCheck = useCallback(async () => {
    if (checking) return;
    sfx.play('ui');
    setChecking(true);
    setStatusMessage('CHECKING REPOSITORY & SERVICE WORKER...');
    try {
      if (onCheckUpdate) {
        await onCheckUpdate();
      } else {
        await new Promise((r) => setTimeout(r, 1200));
      }
      if (swUpdate) {
        setStatusMessage('UPDATE READY TO INSTALL!');
      } else {
        setStatusMessage('YOU ARE ON THE LATEST VERSION!');
      }
    } catch {
      setStatusMessage('CHECK FAILED — TRY AGAIN');
    } finally {
      setChecking(false);
    }
  }, [checking, onCheckUpdate, swUpdate]);

  const handleReload = () => {
    sfx.play('start');
    if (onApplyUpdate) {
      onApplyUpdate();
    } else {
      window.location.reload();
    }
  };

  // Keyboard and gamepad handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.code === 'Space' || e.code === 'Enter') {
        const active = document.activeElement;
        if (active && active.tagName === 'BUTTON') return;
        e.preventDefault();
        if (swUpdate) {
          handleReload();
        } else {
          handleCheck();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, swUpdate, handleCheck]);

  useEffect(() => {
    const cleanup = inputManager.onAction((action: GamepadAction) => {
      if (action === 'back') {
        onClose();
      } else if (action === 'confirm' || action === 'jump') {
        if (swUpdate) handleReload();
        else handleCheck();
      }
    });
    return () => {
      cleanup();
    };
  }, [onClose, swUpdate, handleCheck]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ui-bg)]/85 p-3 sm:p-4 font-pixel select-none"
      onClick={onClose}
    >
      <div
        className="relative flex w-full max-w-[480px] max-h-[92vh] flex-col gap-3.5 border-4 border-[var(--ui-accent)] bg-[var(--ui-panel)] p-4 sm:p-5 shadow-[6px_6px_0_var(--ui-bg)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-[var(--ui-border)] pb-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-4 w-4 items-center justify-center bg-[var(--ui-accent)] text-[#08040f]">
              <PixelReloadIcon className="h-3 w-3" />
            </span>
            <h2 className="font-pixel text-[12px] sm:text-[14px] uppercase tracking-wider text-[var(--ui-accent)]">
              GAME UPDATES
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center border-2 border-[var(--ui-danger)] bg-[var(--ui-danger)]/20 text-[var(--ui-danger)] shadow-[2px_2px_0_var(--ui-bg)] hover:bg-[var(--ui-danger)]/40 active:translate-x-[1px] active:translate-y-[1px]"
          >
            <PixelCloseIcon className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Version Info & Check Bar */}
        <div className="flex flex-col gap-2 rounded border-2 border-[var(--ui-border)] bg-[var(--ui-panel2)] p-3">
          <div className="flex items-center justify-between text-[9px] sm:text-[10px]">
            <span className="text-[var(--ui-muted)]">INSTALLED VERSION:</span>
            <span className="text-[var(--ui-gold)] font-bold">{CURRENT_VERSION} ({BUILD_DATE})</span>
          </div>

          {statusMessage && (
            <div
              className={`text-center font-pixel text-[9px] sm:text-[10px] py-1 border ${
                swUpdate
                  ? 'border-[var(--ui-gold)] bg-[var(--ui-gold)]/15 text-[var(--ui-gold)]'
                  : 'border-[var(--ui-accent)] bg-[var(--ui-accent)]/15 text-[var(--ui-accent)]'
              }`}
            >
              {statusMessage}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            {swUpdate ? (
              <button
                type="button"
                onClick={handleReload}
                className="flex flex-1 items-center justify-center gap-2 border-2 border-[var(--ui-bg)] bg-[var(--ui-gold)] py-2 text-[10px] sm:text-[11px] font-bold text-[#08040f] shadow-[3px_3px_0_var(--ui-bg)] hover:bg-[var(--ui-gold-hi)] active:translate-x-[1px] active:translate-y-[1px]"
              >
                <PixelReloadIcon className="h-3.5 w-3.5 animate-spin" />
                <span>RELOAD & APPLY UPDATE</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCheck}
                disabled={checking}
                className={`flex flex-1 items-center justify-center gap-2 border-2 border-[var(--ui-bg)] bg-[var(--ui-accent)] py-2 text-[10px] sm:text-[11px] font-bold text-[#08040f] shadow-[3px_3px_0_var(--ui-bg)] transition-all ${
                  checking
                    ? 'opacity-60 cursor-not-allowed'
                    : 'hover:bg-[var(--ui-accent-hi)] active:translate-x-[1px] active:translate-y-[1px]'
                }`}
              >
                <PixelReloadIcon className={`h-3.5 w-3.5 ${checking ? 'animate-spin' : ''}`} />
                <span>{checking ? 'CHECKING...' : 'CHECK FOR UPDATES'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t-2 border-[var(--ui-border)] pt-2.5">
          <a
            href="https://github.com/Jimm144/pixel-run/releases"
            target="_blank"
            rel="noreferrer noopener"
            className="text-[8px] sm:text-[9px] text-[var(--ui-accent)] hover:underline"
          >
            VIEW FULL RELEASES &rarr;
          </a>
          <button
            type="button"
            onClick={onClose}
            className="border-2 border-[var(--ui-border)] bg-[var(--ui-panel2)] px-4 py-1.5 text-[9px] sm:text-[10px] text-[#ffffff] shadow-[2px_2px_0_var(--ui-bg)] hover:bg-[var(--ui-panel)] active:translate-x-[1px] active:translate-y-[1px]"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}
