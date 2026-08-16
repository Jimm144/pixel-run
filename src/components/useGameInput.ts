import { useEffect, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { DIVE_SWIPE_PX } from '../game/types';
import type { Game } from '../game/engine';
import { inputManager, type GamepadAction } from '../game/input';

export type UI = 'start' | 'playing' | 'paused' | 'over';

const JUMP = ['Space', 'ArrowUp', 'KeyW', 'KeyZ', 'KeyK'];
const DIVE = ['ArrowDown', 'KeyS', 'KeyJ'];
const MOVE_RIGHT = ['ArrowRight', 'KeyD'];
const GAME_KEYS = JUMP.concat(DIVE, MOVE_RIGHT);

export interface GameInputOptions {
  gameRef: RefObject<Game | null>;
  ui: UI;
  modalOpen?: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onToggleMute: () => void;
  onRestartHint: () => void;
}

/** Which pointer currently owns the held dive — the play-area drag or the
 *  dive button. Only the owner may end the dive, so lifting the jump finger
 *  while the dive button is still held keeps the dive going (and vice versa). */
type DiveOwner = 'wrap' | 'button' | null;

/**
 * Single owner of ALL game input: keyboard (menu hotkeys + gameplay keys),
 * touch gestures (tap/hold/drag on the play area, dive button) and the blur
 * key-release cleanup. Listener closures only read refs, so they are
 * subscribed once and stay correct across re-renders and StrictMode remounts.
 */
export function useGameInput({ gameRef, ui, modalOpen, onStart, onPause, onResume, onToggleMute, onRestartHint }: GameInputOptions) {
  const uiRef = useRef(ui);
  const modalOpenRef = useRef(Boolean(modalOpen));
  const cbRef = useRef({ onStart, onPause, onResume, onToggleMute, onRestartHint });
  // The "latest value" refs are written in an effect (not during render) so
  // the subscribed-once listeners below always read the freshest callbacks.
  useEffect(() => {
    uiRef.current = ui;
  });
  useEffect(() => {
    modalOpenRef.current = Boolean(modalOpen);
  }, [modalOpen]);
  useEffect(() => {
    cbRef.current = { onStart, onPause, onResume, onToggleMute, onRestartHint };
  });

  const moveKeys = useRef(new Set<string>());
  const jumpId = useRef<number | null>(null);
  const diveId = useRef<number | null>(null);
  const diveOwner = useRef<DiveOwner>(null);
  const startY = useRef(0);
  /** Timestamp of the last KeyR press — a second press within 0.8s confirms. */
  const restartArmedAt = useRef(0);

  const handleRestart = () => {
    const now = performance.now();
    if (now - restartArmedAt.current <= 800) {
      restartArmedAt.current = 0;
      cbRef.current.onStart();
    } else {
      restartArmedAt.current = now;
      cbRef.current.onRestartHint();
    }
  };

  const applyMove = (g: Game) => {
    if (g.phase !== 'playing') return;
    const right = MOVE_RIGHT.some((code) => moveKeys.current.has(code));
    g.setMove(right ? 1 : 0);
  };

  const navigate2D = (dir: 'up' | 'down' | 'left' | 'right') => {
    const focusable = Array.from(
      document.querySelectorAll<HTMLElement>(
        'button:not([disabled]):not([aria-hidden="true"]), [tabindex="0"], a[href], input:not([disabled])'
      )
    ).filter((el) => {
      const style = window.getComputedStyle(el);
      return (
        el.offsetParent !== null &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        !el.closest('[aria-hidden="true"]')
      );
    });

    if (focusable.length === 0) return;
    document.body.classList.add('gamepad-active');

    const active = document.activeElement as HTMLElement | null;
    if (!active || !focusable.includes(active)) {
      const u = uiRef.current;
      let target: HTMLElement | null = null;
      if (u === 'start') {
        target = focusable.find((el) => el.textContent?.includes('START RUN') || el.textContent?.includes('START')) || null;
      } else if (u === 'paused') {
        target = focusable.find((el) => el.textContent?.includes('RESUME')) || null;
      } else if (u === 'over') {
        target = focusable.find((el) => el.textContent?.includes('RETRY')) || null;
      }
      const initial = target || focusable[0];
      try {
        initial?.focus({ focusVisible: true } as FocusOptions);
      } catch {
        initial?.focus();
      }
      return;
    }

    const curRect = active.getBoundingClientRect();
    const curCx = curRect.left + curRect.width / 2;
    const curCy = curRect.top + curRect.height / 2;

    let bestElem: HTMLElement | null = null;
    let bestScore = Infinity;

    for (const el of focusable) {
      if (el === active) continue;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;

      if (dir === 'right') {
        if (r.left >= curRect.left + 2 || cx > curCx + 2) {
          const distX = r.left >= curRect.right ? r.left - curRect.right : Math.max(0, cx - curCx);
          const distY = Math.abs(cy - curCy);
          const vOverlap = Math.min(curRect.bottom, r.bottom) - Math.max(curRect.top, r.top);
          const score = vOverlap > 0 ? distX + distY * 0.1 : distX + distY * 2.5 + 50;
          if (score < bestScore) {
            bestScore = score;
            bestElem = el;
          }
        }
      } else if (dir === 'left') {
        if (r.right <= curRect.right - 2 || cx < curCx - 2) {
          const distX = curRect.left >= r.right ? curRect.left - r.right : Math.max(0, curCx - cx);
          const distY = Math.abs(cy - curCy);
          const vOverlap = Math.min(curRect.bottom, r.bottom) - Math.max(curRect.top, r.top);
          const score = vOverlap > 0 ? distX + distY * 0.1 : distX + distY * 2.5 + 50;
          if (score < bestScore) {
            bestScore = score;
            bestElem = el;
          }
        }
      } else if (dir === 'down') {
        if (r.top >= curRect.top + 2 || cy > curCy + 2) {
          const distY = r.top >= curRect.bottom ? r.top - curRect.bottom : Math.max(0, cy - curCy);
          const distX = Math.abs(cx - curCx);
          const hOverlap = Math.min(curRect.right, r.right) - Math.max(curRect.left, r.left);
          const score = hOverlap > 0 ? distY + distX * 0.1 : distY + distX * 2.5 + 50;
          if (score < bestScore) {
            bestScore = score;
            bestElem = el;
          }
        }
      } else if (dir === 'up') {
        if (r.bottom <= curRect.bottom - 2 || cy < curCy - 2) {
          const distY = curRect.top >= r.bottom ? curRect.top - r.bottom : Math.max(0, curCy - cy);
          const distX = Math.abs(cx - curCx);
          const hOverlap = Math.min(curRect.right, r.right) - Math.max(curRect.left, r.left);
          const score = hOverlap > 0 ? distY + distX * 0.1 : distY + distX * 2.5 + 50;
          if (score < bestScore) {
            bestScore = score;
            bestElem = el;
          }
        }
      }
    }

    if (bestElem) {
      document.body.classList.add('gamepad-active');
      try {
        bestElem.focus({ focusVisible: true } as FocusOptions);
      } catch {
        bestElem.focus();
      }
      bestElem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    const isTyping =
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        (target as any).type === 'text');

    if (isTyping || modalOpenRef.current) {
      return; // Do NOT intercept typing in input fields or shift focus
    }

    document.body.classList.add('keyboard-active');
    const code = e.code;
    const g = gameRef.current;
    // Only swallow native behaviour for live gameplay keys — the menu keys
    // below are handled too, so preventDefault keeps them from also
    // activating the last-focused button or scrolling the page.
    if (g && g.phase === 'playing' && GAME_KEYS.includes(code)) e.preventDefault();
    if (g && g.phase === 'playing') {
      if (JUMP.includes(code)) {
        if (!e.repeat) g.pressJump();
      } else if (DIVE.includes(code)) {
        // Key repeat re-fires pressDive ~30/s, pinning the dive and freezing
        // the spin — guard it like jump does.
        if (!e.repeat) g.pressDive();
      } else if (MOVE_RIGHT.includes(code)) {
        moveKeys.current.add(code);
        applyMove(g);
      }
    }
    const u = uiRef.current;
    if (u === 'playing') {
      // Menu keys must ignore key-repeat (holding P flips pause/resume at
      // ~30 Hz) and must not trigger a previously focused button natively.
      if (e.repeat) return;
      if (code === 'Escape' || code === 'KeyP') {
        e.preventDefault();
        cbRef.current.onPause();
      } else if (code === 'KeyR') {
        e.preventDefault();
        handleRestart();
      }
      return;
    }
    if (e.repeat) return;

    if (u === 'start' || u === 'paused' || u === 'over') {
      if (code === 'ArrowDown' || code === 'KeyS') {
        e.preventDefault();
        navigate2D('down');
        return;
      }
      if (code === 'ArrowUp' || code === 'KeyW') {
        e.preventDefault();
        navigate2D('up');
        return;
      }
      if (code === 'ArrowLeft' || code === 'KeyA') {
        e.preventDefault();
        navigate2D('left');
        return;
      }
      if (code === 'ArrowRight' || code === 'KeyD') {
        e.preventDefault();
        navigate2D('right');
        return;
      }
    }

    const menuKey =
      code === 'Space' || code === 'Enter' || code === 'Escape' || code === 'KeyP' ||
      code === 'KeyR' || code === 'KeyM' || code === 'KeyZ' || code === 'KeyK';
    if (menuKey) e.preventDefault();
    if (code === 'KeyM') {
      cbRef.current.onToggleMute();
      return;
    }
    if (u === 'start') {
      if (code === 'Space' || code === 'Enter' || code === 'KeyR' || code === 'KeyZ' || code === 'KeyK') cbRef.current.onStart();
    } else if (u === 'paused') {
      if (code === 'Escape' || code === 'KeyP' || code === 'Space' || code === 'Enter') cbRef.current.onResume();
      else if (code === 'KeyR') handleRestart();
    } else if (u === 'over') {
      if (code === 'Space' || code === 'Enter' || code === 'KeyR' || code === 'KeyZ' || code === 'KeyK') cbRef.current.onStart();
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    const g = gameRef.current;
    if (!g) return;
    if (JUMP.includes(e.code)) g.releaseJump();
    else if (DIVE.includes(e.code)) g.releaseDive();
    else if (MOVE_RIGHT.includes(e.code)) {
      moveKeys.current.delete(e.code);
      applyMove(g);
    }
  };

  const onBlur = () => {
    const g = gameRef.current;
    if (!g) return;
    moveKeys.current.clear();
    g.releaseJump();
    g.releaseDive();
    g.setMove(0);
    // A blur can drop pointerup: clear the tracked pointers too, or a stale
    // id would block the next release cycle.
    jumpId.current = null;
    diveId.current = null;
    diveOwner.current = null;
  };

  const onPointerUp = (e: PointerEvent) => {
    const g = gameRef.current;
    if (jumpId.current !== null && e.pointerId === jumpId.current) {
      jumpId.current = null;
      g?.releaseJump();
      // Only end the dive if this pointer is the one that started it — a
      // dive held on the button survives the jump finger lifting.
      if (diveOwner.current === 'wrap') {
        diveOwner.current = null;
        g?.releaseDive();
      }
    }
    if (diveId.current !== null && e.pointerId === diveId.current) {
      diveId.current = null;
      if (diveOwner.current === 'button') {
        diveOwner.current = null;
        g?.releaseDive();
      }
    }
  };

  const onLostPointerCapture = (e: PointerEvent) => {
    // The OS took the pointer back (e.g. palm rejection, browser gesture):
    // release whatever this pointer was holding so inputs never stick.
    const g = gameRef.current;
    if (jumpId.current === e.pointerId) {
      jumpId.current = null;
      g?.releaseJump();
      if (diveOwner.current === 'wrap') {
        diveOwner.current = null;
        g?.releaseDive();
      }
    }
    if (diveId.current === e.pointerId) {
      diveId.current = null;
      if (diveOwner.current === 'button') {
        diveOwner.current = null;
        g?.releaseDive();
      }
    }
  };

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && (e.movementX !== 0 || e.movementY !== 0)) {
        document.body.classList.remove('keyboard-active');
        document.body.classList.remove('gamepad-active');
      }
    };
    const onTouchStart = () => {
      document.body.classList.remove('keyboard-active');
      document.body.classList.remove('gamepad-active');
    };
    const onPointerDown = () => {
      document.body.classList.remove('keyboard-active');
      document.body.classList.remove('gamepad-active');
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('mousedown', onPointerDown, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('lostpointercapture', onLostPointerCapture);

    const cleanupGamepad = inputManager.onGamepadUpdate((state) => {
      const g = gameRef.current;
      const u = uiRef.current;

      if (u === 'playing' && g && !modalOpenRef.current) {
        if (state.jumpPressed) g.pressJump();
        if (state.jumpReleased) g.releaseJump();
        if (state.divePressed) g.pressDive();
        if (state.diveReleased) g.releaseDive();
        g.setMove(state.moveRight ? 1 : 0);
        if (state.pausePressed) cbRef.current.onPause();
      } else {
        if (state.pausePressed) {
          document.body.classList.add('gamepad-active');
          if (u === 'paused') {
            cbRef.current.onResume();
          } else if (u === 'playing') {
            cbRef.current.onPause();
          }
        } else if (state.jumpPressed || state.confirmPressed) {
          document.body.classList.add('gamepad-active');
          const active = document.activeElement as HTMLElement | null;
          if (active && active.tagName === 'BUTTON' && active.offsetParent !== null) {
            active.click();
          } else if (!modalOpenRef.current) {
            if (u === 'start' || u === 'over') {
              cbRef.current.onStart();
            } else if (u === 'paused') {
              cbRef.current.onResume();
            }
          }
        } else if (state.backPressed) {
          document.body.classList.add('gamepad-active');
          if (!modalOpenRef.current) {
            if (u === 'paused') {
              cbRef.current.onResume();
            } else if (u === 'over') {
              const menuButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
                (btn) => btn.textContent?.includes('MENU') && btn.offsetParent !== null
              );
              if (menuButton) menuButton.click();
            }
          }
        }
      }
    });

    const cleanupAction = inputManager.onAction((action: GamepadAction) => {
      document.body.classList.add('gamepad-active');
      const u = uiRef.current;
      if (!modalOpenRef.current && u !== 'playing') {
        if (action === 'down') navigate2D('down');
        else if (action === 'up') navigate2D('up');
        else if (action === 'left') navigate2D('left');
        else if (action === 'right') navigate2D('right');
        else if (action === 'back') {
          if (u === 'paused') {
            cbRef.current.onResume();
          } else if (u === 'over') {
            const menuButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
              (btn) => btn.textContent?.includes('MENU') && btn.offsetParent !== null
            );
            if (menuButton) menuButton.click();
          }
        }
      }
    });

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('lostpointercapture', onLostPointerCapture);
      cleanupGamepad();
      cleanupAction();
    };
  }, []);

  const onWrapPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // Left button / primary touch only — right-clicks must not jump.
    if (e.button !== 0) return;
    const g = gameRef.current;
    if (!g || g.phase !== 'playing') return;
    jumpId.current = e.pointerId;
    startY.current = e.clientY;
    // Only capture pointer during active gameplay — capturing during transitions
    // causes the pointer to be stuck on the wrapper and miss overlay buttons.
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    g.pressJump();
  };

  const onWrapPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (jumpId.current === null || e.pointerId !== jumpId.current) return;
    if (e.clientY - startY.current > DIVE_SWIPE_PX) {
      gameRef.current?.pressDive();
      diveOwner.current = 'wrap';
      startY.current = e.clientY;
    }
  };

  const onDivePointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    diveId.current = e.pointerId;
    diveOwner.current = 'button';
    e.currentTarget.setPointerCapture(e.pointerId);
    gameRef.current?.pressDive();
  };

  const onDivePointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (diveId.current === e.pointerId) {
      diveId.current = null;
      if (diveOwner.current === 'button') {
        diveOwner.current = null;
        gameRef.current?.releaseDive();
      }
    }
  };

  const onPausePointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    cbRef.current.onPause();
  };

  const noContextMenu = (e: ReactMouseEvent<HTMLButtonElement>) => e.preventDefault();

  return {
    wrapHandlers: { onPointerDown: onWrapPointerDown, onPointerMove: onWrapPointerMove },
    diveHandlers: { onPointerDown: onDivePointerDown, onPointerUp: onDivePointerUp, onContextMenu: noContextMenu },
    pauseHandlers: { onPointerDown: onPausePointerDown, onContextMenu: noContextMenu },
  };
}
