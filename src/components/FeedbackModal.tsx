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
        className="flex w-full flex-col border-2 border-[#3ef2c8] bg-[#0e071e]/95 p-3 text-white shadow-[4px_4px_0_#06020c]"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {mode === 'prompt' ? (
          <>
            {/* Header & Prompt */}
            <div className="flex items-center justify-between border-b-2 border-[#251842] pb-2">
              <div className="font-pixel text-[12px] text-[#3ef2c8]">ENJOYING PIXEL RUN?</div>
              <button
                type="button"
                onClick={finalizeClose}
                className="font-pixel text-[8px] text-[#9d8fd6] hover:text-[#ffffff]"
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
                    ? 'border-[#08040f] bg-[#3ef2c8] text-[#08040f] focus-ring'
                    : 'border-[#08040f] bg-[#3ef2c8] text-[#08040f] shadow-[1px_1px_0_#08040f] hover:bg-[#7ef7ff]'
                }`}
              >
                YES
              </button>

              <button
                type="button"
                onClick={handlePromptNo}
                className={`flex-1 border-2 py-1.5 text-center font-pixel text-[10px] transition-all active:translate-x-[1px] active:translate-y-[1px] ${
                  focusIndex === 1
                    ? 'border-[#08040f] bg-[#ff4d6d] text-white focus-ring'
                    : 'border-[#08040f] bg-[#ff4d6d] text-white shadow-[1px_1px_0_#08040f] hover:bg-[#ff7088]'
                }`}
              >
                NO
              </button>
            </div>
          </>
        ) : mode === 'star_prompt' ? (
          <>
            {/* Header & Prompt */}
            <div className="flex items-center justify-between border-b-2 border-[#251842] pb-2">
              <div className="font-pixel text-[12px] text-[#3ef2c8]">WANT TO STAR GITHUB REPO?</div>
              <button
                type="button"
                onClick={finalizeClose}
                className="font-pixel text-[8px] text-[#9d8fd6] hover:text-[#ffffff]"
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
                    ? 'border-[#08040f] bg-[#3ef2c8] text-[#08040f] focus-ring'
                    : 'border-[#08040f] bg-[#3ef2c8] text-[#08040f] shadow-[1px_1px_0_#08040f] hover:bg-[#7ef7ff]'
                }`}
              >
                YES
              </button>

              <button
                type="button"
                onClick={handleStarNo}
                className={`flex-1 border-2 py-1.5 text-center font-pixel text-[10px] transition-all active:translate-x-[1px] active:translate-y-[1px] ${
                  focusIndex === 1
                    ? 'border-[#08040f] bg-[#59427e] text-white focus-ring'
                    : 'border-[#08040f] bg-[#59427e] text-white shadow-[1px_1px_0_#08040f] hover:bg-[#786b99]'
                }`}
              >
                NO
              </button>
            </div>

            {/* Checkbox: Don't show again */}
            <div className="mt-2 flex items-center justify-center border-t border-[#251842] pt-1.5">
              <label
                onClick={(e) => e.stopPropagation()}
                className={`flex cursor-pointer items-center gap-1.5 select-none font-pixel text-[8px] transition-colors ${
                  focusIndex === 2 ? 'text-[#3ef2c8] focus-ring px-1.5 py-0.5' : 'text-[#9d8fd6] hover:text-[#3ef2c8]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={dontShowAgain}
                  onChange={(e) => {
                    e.stopPropagation();
                    setDontShowAgain(e.target.checked);
                  }}
                  className="h-3 w-3 accent-[#3ef2c8] cursor-pointer"
                />
                <span>Don't show again</span>
              </label>
            </div>
          </>
        ) : (
          <>
            {/* In-Site Text Box Mode */}
            <div className="flex items-center justify-between border-b-2 border-[#251842] pb-1.5">
              <span className="font-pixel text-[12px] text-[#ff4d6d]">REPORT AN ISSUE</span>
              <button
                type="button"
                onClick={() => setMode('prompt')}
                className="font-pixel text-[8px] text-[#9d8fd6] hover:text-[#ffffff]"
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
                className="w-full resize-none border border-[#453c60] bg-[#090414] p-1.5 font-pixel text-[8px] text-[#ffffff] placeholder-[#9d8fd6] outline-none focus:border-[#3ef2c8]"
              />
            </div>

            <div className="mt-2 flex gap-1.5">
              <button
                type="button"
                onClick={handleSubmitIssue}
                className="flex-1 border-2 border-[#08040f] bg-[#3ef2c8] py-1.5 text-center font-pixel text-[10px] text-[#08040f] shadow-[1px_1px_0_#08040f] hover:bg-[#7ef7ff] active:translate-x-[1px] active:translate-y-[1px]"
              >
                SUBMIT
              </button>
              <button
                type="button"
                onClick={() => setMode('prompt')}
                className="border-2 border-[#251842] bg-[#160b2c] px-3 py-1.5 text-center font-pixel text-[10px] text-[#9d8fd6] shadow-[1px_1px_0_#08040f] hover:text-[#ffffff] active:translate-x-[1px] active:translate-y-[1px]"
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
