import { useEffect, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { DIVE_SWIPE_PX } from '../game/types';
import type { Game } from '../game/engine';
import { inputManager, type GamepadAction } from '../game/input';

export type UI = 'start' | 'playing' | 'paused' | 'over' | 'results';

// Modals sit at different z-layers: Battle/Skins at z-50, Save/Load and skin
// unlock at z-[100], the feedback banner at z-40. Search highest-first.
const MODAL_ROOT_SELECTOR = '.fixed.z-\\[100\\], .fixed.z-50, .fixed.z-40';
const CLOSE_BUTTON_SELECTOR =
  '.fixed.z-50 button[aria-label="Close"], .fixed.z-50 button[title="Close"], ' +
  '.fixed.z-\\[100\\] button[aria-label="Close"], .fixed.z-\\[100\\] button[title="Close"]';

const JUMP = ['Space', 'ArrowUp', 'KeyW', 'KeyZ', 'KeyK'];
const DIVE = ['ArrowDown', 'KeyS', 'KeyJ'];
const MOVE_RIGHT = ['ArrowRight', 'KeyD'];
const MOVE_LEFT = ['ArrowLeft', 'KeyA'];
const GAME_KEYS = JUMP.concat(DIVE, MOVE_RIGHT, MOVE_LEFT);

export interface GameInputOptions {
  gameRef: RefObject<Game | null>;
  ui: UI;
  modalOpen?: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onToggleMute: () => void;
  onRestartHint: () => void;
  onRestart: () => void;
  onMenu?: () => void;
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
export function useGameInput({ gameRef, ui, modalOpen, onStart, onPause, onResume, onToggleMute, onRestartHint, onRestart, onMenu }: GameInputOptions) {
  const uiRef = useRef(ui);
  const modalOpenRef = useRef(Boolean(modalOpen));
  const cbRef = useRef({ onStart, onPause, onResume, onToggleMute, onRestartHint, onRestart, onMenu });
  // The "latest value" refs are written in an effect (not during render) so
  // the subscribed-once listeners below always read the freshest callbacks.
  useEffect(() => {
    uiRef.current = ui;
  });
  useEffect(() => {
    modalOpenRef.current = Boolean(modalOpen);
  }, [modalOpen]);
  useEffect(() => {
    cbRef.current = { onStart, onPause, onResume, onToggleMute, onRestartHint, onRestart, onMenu };
  });

  const moveKeys = useRef(new Set<string>());
  const playerMoveKeys = useRef<Map<string, Set<string>>>(new Map());
  const jumpId = useRef<number | null>(null);
  const diveId = useRef<number | null>(null);
  const diveOwner = useRef<DiveOwner>(null);
  const startY = useRef(0);

  const handleRestart = () => {
    cbRef.current.onRestart();
  };

  const applyMove = (g: Game) => {
    if (g.phase !== 'playing') return;
    const right = MOVE_RIGHT.some((code) => moveKeys.current.has(code));
    const left = MOVE_LEFT.some((code) => moveKeys.current.has(code));
    g.setMove(right ? 1 : left ? -1 : 0);
  };

  const navigate2D = (dir: 'up' | 'down' | 'left' | 'right') => {
    const isModalOpen = modalOpenRef.current;
    const root = isModalOpen
      ? document.querySelector<HTMLElement>(MODAL_ROOT_SELECTOR) || document.body
      : document.body;

    const focusable = Array.from(
      root.querySelectorAll<HTMLElement>(
        'button:not([disabled]):not([aria-hidden="true"]), select:not([disabled]), input:not([disabled]), [tabindex="0"], a[href]'
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
      if (isModalOpen) {
        target = focusable.find((el) => el.tagName === 'BUTTON' && !el.getAttribute('aria-label')?.includes('Close')) || focusable[0];
      } else if (u === 'start') {
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
    const isTextInput =
      target &&
      (target.tagName === 'TEXTAREA' ||
        (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'text') ||
        target.isContentEditable);

    const code = e.code;
    const g = gameRef.current;
    const u = uiRef.current;
    const isModalOpen = modalOpenRef.current;

    // Allow normal typing inside input fields unless Esc
    if (isTextInput) {
      if (code === 'Escape') {
        e.preventDefault();
        target.blur();
      }
      return;
    }

    document.body.classList.add('keyboard-active');

    // 1. LIVE GAMEPLAY (playing phase and NO modal open)
    if (g && g.phase === 'playing' && !isModalOpen) {
      if (GAME_KEYS.includes(code) || code.startsWith('Arrow') || code.startsWith('Numpad') || code === 'KeyI' || code === 'KeyK' || code === 'KeyJ' || code === 'KeyL') {
        e.preventDefault();
      }
      if (g.isLocalBattle) {
        const getPlayerForScheme = (scheme: string, fallbackIdx: number): number => {
          if (g.playerControls && Array.isArray(g.playerControls)) {
            const idx = g.playerControls.indexOf(scheme);
            if (idx !== -1) return idx;
          }
          return fallbackIdx;
        };

        // WASD Scheme
        const wasdIdx = getPlayerForScheme('wasd', 0);
        if (code === 'KeyW') {
          if (!e.repeat) g.pressPlayerJump(wasdIdx);
        } else if (code === 'KeyS') {
          if (!e.repeat) g.pressPlayerDive(wasdIdx);
        } else if (code === 'KeyD' || code === 'KeyA') {
          if (!playerMoveKeys.current.has('wasd')) playerMoveKeys.current.set('wasd', new Set());
          playerMoveKeys.current.get('wasd')!.add(code);
          const keys = playerMoveKeys.current.get('wasd')!;
          g.setPlayerMove(wasdIdx, keys.has('KeyD') ? 1 : keys.has('KeyA') ? -1 : 0);
        }

        // Arrows Scheme
        const arrIdx = getPlayerForScheme('arrows', 1);
        if (code === 'ArrowUp') {
          if (!e.repeat) g.pressPlayerJump(arrIdx);
        } else if (code === 'ArrowDown') {
          if (!e.repeat) g.pressPlayerDive(arrIdx);
        } else if (code === 'ArrowRight' || code === 'ArrowLeft') {
          if (!playerMoveKeys.current.has('arrows')) playerMoveKeys.current.set('arrows', new Set());
          playerMoveKeys.current.get('arrows')!.add(code);
          const keys = playerMoveKeys.current.get('arrows')!;
          g.setPlayerMove(arrIdx, keys.has('ArrowRight') ? 1 : keys.has('ArrowLeft') ? -1 : 0);
        }

        // IJKL Scheme
        const ijklIdx = getPlayerForScheme('ijkl', 2);
        if (code === 'KeyI') {
          if (!e.repeat) g.pressPlayerJump(ijklIdx);
        } else if (code === 'KeyK') {
          if (!e.repeat) g.pressPlayerDive(ijklIdx);
        } else if (code === 'KeyL' || code === 'KeyJ') {
          if (!playerMoveKeys.current.has('ijkl')) playerMoveKeys.current.set('ijkl', new Set());
          playerMoveKeys.current.get('ijkl')!.add(code);
          const keys = playerMoveKeys.current.get('ijkl')!;
          g.setPlayerMove(ijklIdx, keys.has('KeyL') ? 1 : keys.has('KeyJ') ? -1 : 0);
        }

        // Numpad Scheme
        const numIdx = getPlayerForScheme('numpad', 3);
        if (code === 'Numpad8') {
          if (!e.repeat) g.pressPlayerJump(numIdx);
        } else if (code === 'Numpad5' || code === 'Numpad2') {
          if (!e.repeat) g.pressPlayerDive(numIdx);
        } else if (code === 'Numpad6' || code === 'Numpad4') {
          if (!playerMoveKeys.current.has('numpad')) playerMoveKeys.current.set('numpad', new Set());
          playerMoveKeys.current.get('numpad')!.add(code);
          const keys = playerMoveKeys.current.get('numpad')!;
          g.setPlayerMove(numIdx, keys.has('Numpad6') ? 1 : keys.has('Numpad4') ? -1 : 0);
        }
      } else {
        if (JUMP.includes(code)) {
          if (!e.repeat) g.pressJump();
        } else if (DIVE.includes(code)) {
          if (!e.repeat) g.pressDive();
        } else if (MOVE_RIGHT.includes(code) || MOVE_LEFT.includes(code)) {
          moveKeys.current.add(code);
          applyMove(g);
        }
      }

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

    // 2. MENU & MODAL NAVIGATION (ui !== 'playing' OR modal is open)
    if (e.repeat) return;

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

    if (code === 'Space' || code === 'Enter') {
      const active = document.activeElement as HTMLElement | null;
      if (active && (active.tagName === 'BUTTON' || active.tagName === 'A' || active.tagName === 'SELECT') && active.offsetParent !== null) {
        e.preventDefault();
        active.click();
        return;
      }
      if (!isModalOpen) {
        e.preventDefault();
        if (u === 'start' || u === 'over') cbRef.current.onStart();
        else if (u === 'paused') cbRef.current.onResume();
      }
      return;
    }

    if (code === 'Escape') {
      e.preventDefault();
      if (isModalOpen) {
        const closeBtn = document.querySelector<HTMLButtonElement>(CLOSE_BUTTON_SELECTOR);
        if (closeBtn) closeBtn.click();
      } else if (u === 'paused' || u === 'over' || u === 'results') {
        cbRef.current.onMenu?.();
      }
      return;
    }

    if (code === 'KeyP' && u === 'paused' && !isModalOpen) {
      e.preventDefault();
      cbRef.current.onResume();
      return;
    }

    if (code === 'KeyM') {
      e.preventDefault();
      cbRef.current.onToggleMute();
      return;
    }

    if (code === 'KeyR' && !isModalOpen) {
      e.preventDefault();
      handleRestart();
      return;
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    const g = gameRef.current;
    if (!g) return;
    const code = e.code;
    if (g.isLocalBattle) {
      const getPlayerForScheme = (scheme: string, fallbackIdx: number): number => {
        if (g.playerControls && Array.isArray(g.playerControls)) {
          const idx = g.playerControls.indexOf(scheme);
          if (idx !== -1) return idx;
        }
        return fallbackIdx;
      };

      const wasdIdx = getPlayerForScheme('wasd', 0);
      if (code === 'KeyW') g.releasePlayerJump(wasdIdx);
      else if (code === 'KeyS') g.releasePlayerDive(wasdIdx);
      else if (code === 'KeyD' || code === 'KeyA') {
        playerMoveKeys.current.get('wasd')?.delete(code);
        const keys = playerMoveKeys.current.get('wasd');
        g.setPlayerMove(wasdIdx, keys?.has('KeyD') ? 1 : keys?.has('KeyA') ? -1 : 0);
      }

      const arrIdx = getPlayerForScheme('arrows', 1);
      if (code === 'ArrowUp') g.releasePlayerJump(arrIdx);
      else if (code === 'ArrowDown') g.releasePlayerDive(arrIdx);
      else if (code === 'ArrowRight' || code === 'ArrowLeft') {
        playerMoveKeys.current.get('arrows')?.delete(code);
        const keys = playerMoveKeys.current.get('arrows');
        g.setPlayerMove(arrIdx, keys?.has('ArrowRight') ? 1 : keys?.has('ArrowLeft') ? -1 : 0);
      }

      const ijklIdx = getPlayerForScheme('ijkl', 2);
      if (code === 'KeyI') g.releasePlayerJump(ijklIdx);
      else if (code === 'KeyK') g.releasePlayerDive(ijklIdx);
      else if (code === 'KeyL' || code === 'KeyJ') {
        playerMoveKeys.current.get('ijkl')?.delete(code);
        const keys = playerMoveKeys.current.get('ijkl');
        g.setPlayerMove(ijklIdx, keys?.has('KeyL') ? 1 : keys?.has('KeyJ') ? -1 : 0);
      }

      const numIdx = getPlayerForScheme('numpad', 3);
      if (code === 'Numpad8') g.releasePlayerJump(numIdx);
      else if (code === 'Numpad5' || code === 'Numpad2') g.releasePlayerDive(numIdx);
      else if (code === 'Numpad6' || code === 'Numpad4') {
        playerMoveKeys.current.get('numpad')?.delete(code);
        const keys = playerMoveKeys.current.get('numpad');
        g.setPlayerMove(numIdx, keys?.has('Numpad6') ? 1 : keys?.has('Numpad4') ? -1 : 0);
      }
    } else {
      if (JUMP.includes(e.code)) g.releaseJump();
      else if (DIVE.includes(e.code)) g.releaseDive();
      else if (MOVE_RIGHT.includes(e.code) || MOVE_LEFT.includes(e.code)) {
        moveKeys.current.delete(e.code);
        applyMove(g);
      }
    }
  };

  const onBlur = () => {
    const g = gameRef.current;
    if (!g) return;
    moveKeys.current.clear();
    playerMoveKeys.current.clear();
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

    let gpAnimId = 0;
    let isPollingBattleGp = false;
    const prevGpButtons = [
      { jump: false, dive: false },
      { jump: false, dive: false },
      { jump: false, dive: false },
      { jump: false, dive: false },
    ];

    const pollAllGamepads = () => {
      const g = gameRef.current;
      const isModalOpen = modalOpenRef.current;
      if (!g || g.phase !== 'playing' || isModalOpen || !g.isLocalBattle) {
        isPollingBattleGp = false;
        return;
      }

      if (typeof navigator !== 'undefined' && navigator.getGamepads) {
        const gamepads = navigator.getGamepads();
        let connectedCount = 0;
        const getPlayerForScheme = (scheme: string, fallbackIdx: number): number => {
          if (g.playerControls && Array.isArray(g.playerControls)) {
            const idx = g.playerControls.indexOf(scheme);
            if (idx !== -1) return idx;
          }
          return fallbackIdx;
        };

        for (let i = 0; i < 4; i++) {
          const gp = gamepads[i];
          if (!gp || !gp.connected) continue;
          connectedCount++;
          const pIdx = getPlayerForScheme(`gp${i}`, i);

          const stickDown =
            (typeof gp.axes[1] === 'number' && gp.axes[1] > 0.38) ||
            (typeof gp.axes[3] === 'number' && gp.axes[3] > 0.38);
          const jump = Boolean(gp.buttons[0]?.pressed || gp.buttons[2]?.pressed || gp.buttons[5]?.pressed || gp.buttons[12]?.pressed);
          const dive = Boolean(gp.buttons[1]?.pressed || gp.buttons[4]?.pressed || gp.buttons[7]?.pressed || gp.buttons[13]?.pressed || stickDown);
          const right = Boolean(gp.buttons[15]?.pressed || (typeof gp.axes[0] === 'number' && gp.axes[0] > 0.35));
          const left = Boolean(gp.buttons[14]?.pressed || (typeof gp.axes[0] === 'number' && gp.axes[0] < -0.35));
          const dir = right ? 1 : left ? -1 : 0;

          if (jump && !prevGpButtons[i].jump) g.pressPlayerJump(pIdx);
          else if (!jump && prevGpButtons[i].jump) g.releasePlayerJump(pIdx);

          if (dive && !prevGpButtons[i].dive) g.pressPlayerDive(pIdx);
          else if (!dive && prevGpButtons[i].dive) g.releasePlayerDive(pIdx);

          g.setPlayerMove(pIdx, dir);

          prevGpButtons[i].jump = jump;
          prevGpButtons[i].dive = dive;
        }

        if (connectedCount === 0) {
          isPollingBattleGp = false;
          return;
        }
      }

      gpAnimId = requestAnimationFrame(pollAllGamepads);
    };

    const startBattleGpPolling = () => {
      if (isPollingBattleGp) return;
      const g = gameRef.current;
      if (!g || g.phase !== 'playing' || modalOpenRef.current || !g.isLocalBattle) return;
      isPollingBattleGp = true;
      gpAnimId = requestAnimationFrame(pollAllGamepads);
    };

    const onGpConnected = () => {
      startBattleGpPolling();
    };
    window.addEventListener('gamepadconnected', onGpConnected);

    const cleanupGamepad = inputManager.onGamepadUpdate((state) => {
      const g = gameRef.current;
      const u = uiRef.current;
      const isModalOpen = modalOpenRef.current;

      if (u === 'playing' && g && !isModalOpen) {
        if (!g.isLocalBattle) {
          if (state.jumpPressed) g.pressJump();
          if (state.jumpReleased) g.releaseJump();
          if (state.divePressed) g.pressDive();
          if (state.diveReleased) g.releaseDive();
          g.setMove(state.moveRight ? 1 : state.moveLeft ? -1 : 0);
        }
        if (state.pausePressed) cbRef.current.onPause();
      } else {
        if (state.pausePressed) {
          document.body.classList.add('gamepad-active');
          if (isModalOpen) {
            const closeBtn = document.querySelector<HTMLButtonElement>(CLOSE_BUTTON_SELECTOR);
            if (closeBtn) closeBtn.click();
          } else if (u === 'paused') {
            cbRef.current.onResume();
          } else if (u === 'playing') {
            cbRef.current.onPause();
          }
        } else if (state.jumpPressed || state.confirmPressed) {
          document.body.classList.add('gamepad-active');
          const active = document.activeElement as HTMLElement | null;
          if (active && (active.tagName === 'BUTTON' || active.tagName === 'A' || active.tagName === 'SELECT') && active.offsetParent !== null) {
            active.click();
          } else if (isModalOpen) {
            navigate2D('down');
          } else if (u === 'start' || u === 'over') {
            cbRef.current.onStart();
          } else if (u === 'paused') {
            cbRef.current.onResume();
          }
        } else if (state.backPressed) {
          document.body.classList.add('gamepad-active');
          if (isModalOpen) {
            const closeBtn = document.querySelector<HTMLButtonElement>(CLOSE_BUTTON_SELECTOR);
            if (closeBtn) closeBtn.click();
          } else if (u === 'paused') {
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

    const cleanupAction = inputManager.onAction((action: GamepadAction) => {
      document.body.classList.add('gamepad-active');
      const u = uiRef.current;
      const isModalOpen = modalOpenRef.current;
      if (isModalOpen || u !== 'playing') {
        if (action === 'down') navigate2D('down');
        else if (action === 'up') navigate2D('up');
        else if (action === 'left') navigate2D('left');
        else if (action === 'right') navigate2D('right');
        else if (action === 'back') {
          if (isModalOpen) {
            const closeBtn = document.querySelector<HTMLButtonElement>(CLOSE_BUTTON_SELECTOR);
            if (closeBtn) closeBtn.click();
          } else if (u === 'paused' || u === 'over' || u === 'results') {
            cbRef.current.onMenu?.();
          }
        }
      }
    });

    return () => {
      cancelAnimationFrame(gpAnimId);
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
      window.removeEventListener('gamepadconnected', onGpConnected);
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
