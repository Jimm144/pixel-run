import React, { useState, useEffect, useRef } from 'react';
import { setFeedbackNeverShow } from '../game/storage';
import { inputManager, type GamepadAction } from '../game/input';
import { sfx } from '../game/audio';

interface FeedbackModalProps {
  onClose: () => void;
}

const GITHUB_REPO_URL = 'https://github.com/Jimm144/pixel-run';
const GITHUB_ISSUES_URL = 'https://github.com/Jimm144/pixel-run/issues/new';

export function FeedbackModal({ onClose }: FeedbackModalProps) {
  const [mode, setMode] = useState<'prompt' | 'star_prompt' | 'write'>('prompt');
  const [issueText, setIssueText] = useState('');
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [focusIndex, setFocusIndex] = useState(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const finalizeClose = () => {
    if (dontShowAgain) {
      setFeedbackNeverShow(true);
    }
    onClose();
  };

  const handlePromptYes = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    sfx.play('ui');
    setFocusIndex(-1);
    setMode('star_prompt');
  };

  const handlePromptNo = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    sfx.play('ui');
    setFocusIndex(-1);
    setMode('write');
  };

  const handleStarYes = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    sfx.play('gem');
    window.open(GITHUB_REPO_URL, '_blank', 'noopener,noreferrer');
    finalizeClose();
  };

  const handleStarNo = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    sfx.play('ui');
    finalizeClose();
  };

  const handleSubmitIssue = (e?: React.MouseEvent | React.FormEvent) => {
    e?.stopPropagation();
    sfx.play('gem');
    const text = issueText.trim() || 'Feedback / Bug Report';
    const title = `[Feedback] ${text.slice(0, 45)}${text.length > 45 ? '...' : ''}`;
    const body = `${text}\n\n---\n**Diagnostics**:\n- Screen: ${window.innerWidth}x${window.innerHeight}\n- Device: ${navigator.userAgent.slice(0, 100)}`;
    const url = `${GITHUB_ISSUES_URL}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    finalizeClose();
  };

  // Auto focus textarea when entering write mode
  useEffect(() => {
    if (mode === 'write') {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [mode]);

  // Keyboard & Gamepad Navigation
  useEffect(() => {
    if (mode === 'write') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        finalizeClose();
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        setFocusIndex((prev) => (prev === -1 ? 0 : (prev + 1) % (mode === 'star_prompt' ? 3 : 2)));
      } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        const count = mode === 'star_prompt' ? 3 : 2;
        setFocusIndex((prev) => (prev === -1 ? 0 : (prev - 1 + count) % count));
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        if (mode === 'star_prompt') setFocusIndex(2);
      } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        setFocusIndex(0);
      } else if (e.key === 'Enter' || e.key === ' ') {
        if (mode === 'prompt') {
          if (focusIndex === 0) handlePromptYes();
          else if (focusIndex === 1) handlePromptNo();
        } else if (mode === 'star_prompt') {
          if (focusIndex === 0) handleStarYes();
          else if (focusIndex === 1) handleStarNo();
          else if (focusIndex === 2) setDontShowAgain((prev) => !prev);
        }
      }
    };

    const cleanupAction = inputManager.onAction((action: GamepadAction) => {
      if (action === 'back') {
        finalizeClose();
      } else if (action === 'right') {
        setFocusIndex((prev) => (prev === -1 ? 0 : (prev + 1) % (mode === 'star_prompt' ? 3 : 2)));
      } else if (action === 'left') {
        const count = mode === 'star_prompt' ? 3 : 2;
        setFocusIndex((prev) => (prev - 1 + count) % count);
      } else if (action === 'down') {
        if (mode === 'star_prompt') setFocusIndex(2);
      } else if (action === 'up') {
        setFocusIndex(0);
      } else if (action === 'confirm') {
        if (mode === 'prompt') {
          if (focusIndex === 0) handlePromptYes();
          else if (focusIndex === 1) handlePromptNo();
        } else if (mode === 'star_prompt') {
          if (focusIndex === 0) handleStarYes();
          else if (focusIndex === 1) handleStarNo();
          else if (focusIndex === 2) setDontShowAgain((prev) => !prev);
        }
      }
    });

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      cleanupAction();
    };
  }, [mode, focusIndex, dontShowAgain]);

  return (
    <div
      className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-40 w-[min(calc(100vw-24px),340px)] -translate-x-1/2 pointer-events-auto"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      <div
        className="flex w-full flex-col border-2 border-[var(--ui-accent)] bg-[var(--ui-panel)]/95 p-3 text-white shadow-[4px_4px_0_var(--ui-bg)]"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {mode === 'prompt' ? (
          <>
            {/* Header & Prompt */}
            <div className="flex items-center justify-between border-b-2 border-[var(--ui-border)] pb-2">
              <div className="font-pixel text-[12px] text-[var(--ui-accent)]">ENJOYING PIXEL RUN?</div>
              <button
                type="button"
                onClick={finalizeClose}
                className="font-pixel text-[8px] text-[var(--ui-muted)] hover:text-[#ffffff]"
              >
                [X]
              </button>
            </div>

            {/* Buttons: YES / NO */}
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                onClick={handlePromptYes}
                className={`flex-1 border-2 py-1.5 text-center font-pixel text-[10px] transition-all active:translate-x-[1px] active:translate-y-[1px] ${
                  focusIndex === 0
                    ? 'border-[var(--ui-bg)] bg-[var(--ui-accent)] text-[var(--ui-bg)] focus-ring'
                    : 'border-[var(--ui-bg)] bg-[var(--ui-accent)] text-[var(--ui-bg)] shadow-[1px_1px_0_var(--ui-bg)] hover:bg-[var(--ui-accent-hi)]'
                }`}
              >
                YES
              </button>

              <button
                type="button"
                onClick={handlePromptNo}
                className={`flex-1 border-2 py-1.5 text-center font-pixel text-[10px] transition-all active:translate-x-[1px] active:translate-y-[1px] ${
                  focusIndex === 1
                    ? 'border-[var(--ui-bg)] bg-[var(--ui-danger)] text-white focus-ring'
                    : 'border-[var(--ui-bg)] bg-[var(--ui-danger)] text-white shadow-[1px_1px_0_var(--ui-bg)] hover:bg-[var(--ui-danger-hi)]'
                }`}
              >
                NO
              </button>
            </div>
          </>
        ) : mode === 'star_prompt' ? (
          <>
            {/* Header & Prompt */}
            <div className="flex items-center justify-between border-b-2 border-[var(--ui-border)] pb-2">
              <div className="font-pixel text-[12px] text-[var(--ui-accent)]">WANT TO STAR GITHUB REPO?</div>
              <button
                type="button"
                onClick={finalizeClose}
                className="font-pixel text-[8px] text-[var(--ui-muted)] hover:text-[#ffffff]"
              >
                [X]
              </button>
            </div>

            {/* Buttons: YES / NO */}
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                onClick={handleStarYes}
                className={`flex-1 border-2 py-1.5 text-center font-pixel text-[10px] transition-all active:translate-x-[1px] active:translate-y-[1px] ${
                  focusIndex === 0
                    ? 'border-[var(--ui-bg)] bg-[var(--ui-accent)] text-[var(--ui-bg)] focus-ring'
                    : 'border-[var(--ui-bg)] bg-[var(--ui-accent)] text-[var(--ui-bg)] shadow-[1px_1px_0_var(--ui-bg)] hover:bg-[var(--ui-accent-hi)]'
                }`}
              >
                YES
              </button>

              <button
                type="button"
                onClick={handleStarNo}
                className={`flex-1 border-2 py-1.5 text-center font-pixel text-[10px] transition-all active:translate-x-[1px] active:translate-y-[1px] ${
                  focusIndex === 1
                    ? 'border-[var(--ui-bg)] bg-[var(--ui-border3)] text-white focus-ring'
                    : 'border-[var(--ui-bg)] bg-[var(--ui-border3)] text-white shadow-[1px_1px_0_var(--ui-bg)] hover:bg-[var(--ui-muted)]'
                }`}
              >
                NO
              </button>
            </div>

            {/* Checkbox: Don't show again */}
            <div className="mt-2 flex items-center justify-center border-t border-[var(--ui-border)] pt-1.5">
              <label
                onClick={(e) => e.stopPropagation()}
                className={`flex cursor-pointer items-center gap-1.5 select-none font-pixel text-[8px] transition-colors ${
                  focusIndex === 2 ? 'text-[var(--ui-accent)] focus-ring px-1.5 py-0.5' : 'text-[var(--ui-muted)] hover:text-[var(--ui-accent)]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={dontShowAgain}
                  onChange={(e) => {
                    e.stopPropagation();
                    setDontShowAgain(e.target.checked);
                  }}
                  className="h-3 w-3 accent-[var(--ui-accent)] cursor-pointer"
                />
                <span>Don't show again</span>
              </label>
            </div>
          </>
        ) : (
          <>
            {/* In-Site Text Box Mode */}
            <div className="flex items-center justify-between border-b-2 border-[var(--ui-border)] pb-1.5">
              <span className="font-pixel text-[12px] text-[var(--ui-danger)]">REPORT AN ISSUE</span>
              <button
                type="button"
                onClick={() => setMode('prompt')}
                className="font-pixel text-[8px] text-[var(--ui-muted)] hover:text-[#ffffff]"
              >
                [BACK]
              </button>
            </div>

            <div className="mt-2">
              <textarea
                ref={textareaRef}
                value={issueText}
                onChange={(e) => setIssueText(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="What happened or what can be improved?"
                rows={3}
                className="w-full resize-none border border-[var(--ui-border3)] bg-[var(--ui-panel3)] p-1.5 font-pixel text-[8px] text-[#ffffff] placeholder-[var(--ui-muted)] outline-none focus:border-[var(--ui-accent)]"
              />
            </div>

            <div className="mt-2 flex gap-1.5">
              <button
                type="button"
                onClick={handleSubmitIssue}
                className="flex-1 border-2 border-[var(--ui-bg)] bg-[var(--ui-accent)] py-1.5 text-center font-pixel text-[10px] text-[var(--ui-bg)] shadow-[1px_1px_0_var(--ui-bg)] hover:bg-[var(--ui-accent-hi)] active:translate-x-[1px] active:translate-y-[1px]"
              >
                SUBMIT
              </button>
              <button
                type="button"
                onClick={() => setMode('prompt')}
                className="border-2 border-[var(--ui-border)] bg-[#160b2c] px-3 py-1.5 text-center font-pixel text-[10px] text-[var(--ui-muted)] shadow-[1px_1px_0_var(--ui-bg)] hover:text-[#ffffff] active:translate-x-[1px] active:translate-y-[1px]"
              >
                CANCEL
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
