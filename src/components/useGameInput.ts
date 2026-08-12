import { useEffect, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { DIVE_SWIPE_PX } from '../game/types';
import type { Game } from '../game/engine';

export type UI = 'start' | 'playing' | 'paused' | 'over';

const JUMP = ['Space', 'ArrowUp', 'KeyW', 'KeyZ', 'KeyK'];
const DIVE = ['ArrowDown', 'KeyS', 'KeyJ'];
const MOVE_RIGHT = ['ArrowRight', 'KeyD'];
const GAME_KEYS = JUMP.concat(DIVE, MOVE_RIGHT);

export interface GameInputOptions {
  gameRef: RefObject<Game | null>;
  ui: UI;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onToggleMute: () => void;
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
export function useGameInput({ gameRef, ui, onStart, onPause, onResume, onToggleMute }: GameInputOptions) {
  const uiRef = useRef(ui);
  const cbRef = useRef({ onStart, onPause, onResume, onToggleMute });
  // The "latest value" refs are written in an effect (not during render) so
  // the subscribed-once listeners below always read the freshest callbacks.
  useEffect(() => {
    uiRef.current = ui;
  });
  useEffect(() => {
    cbRef.current = { onStart, onPause, onResume, onToggleMute };
  });

  const moveKeys = useRef(new Set<string>());
  const jumpId = useRef<number | null>(null);
  const diveId = useRef<number | null>(null);
  const diveOwner = useRef<DiveOwner>(null);
  const startY = useRef(0);

  const applyMove = (g: Game) => {
    if (g.phase !== 'playing') return;
    const right = MOVE_RIGHT.some((code) => moveKeys.current.has(code));
    g.setMove(right ? 1 : 0);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const code = e.code;
    if (code === 'KeyM') {
      cbRef.current.onToggleMute();
      return;
    }
    const g = gameRef.current;
    // Only swallow native behaviour for live gameplay keys — menus keep
    // Space/arrows working as the browser would (they already start/resume
    // via the UI branch below, and the page can't scroll).
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
    if (u === 'start') {
      if (code === 'Space' || code === 'Enter' || code === 'KeyW' || code === 'ArrowUp') cbRef.current.onStart();
    } else if (u === 'playing') {
      if (code === 'Escape' || code === 'KeyP') cbRef.current.onPause();
      else if (code === 'KeyR') cbRef.current.onStart();
    } else if (u === 'paused') {
      if (code === 'Escape' || code === 'KeyP' || code === 'Space' || code === 'Enter') cbRef.current.onResume();
      else if (code === 'KeyR') cbRef.current.onStart();
    } else if (u === 'over') {
      if (code === 'Space' || code === 'Enter' || code === 'KeyR' || code === 'ArrowUp') cbRef.current.onStart();
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
    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('lostpointercapture', onLostPointerCapture);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('lostpointercapture', onLostPointerCapture);
    };
  }, []);

  const onWrapPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // Left button / primary touch only — right-clicks must not jump.
    if (e.button !== 0) return;
    const g = gameRef.current;
    if (!g || g.phase !== 'playing') return;
    jumpId.current = e.pointerId;
    startY.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
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
