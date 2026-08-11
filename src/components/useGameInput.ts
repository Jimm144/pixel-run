import { useEffect, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react';
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

/**
 * Single owner of ALL game input: keyboard (menu hotkeys + gameplay keys),
 * touch gestures (tap/hold/drag on the play area, dive button) and the blur
 * key-release cleanup. Listener closures only read refs, so they are
 * subscribed once and stay correct across re-renders and StrictMode remounts.
 */
export function useGameInput({ gameRef, ui, onStart, onPause, onResume, onToggleMute }: GameInputOptions) {
  const uiRef = useRef(ui);
  uiRef.current = ui;
  const cbRef = useRef({ onStart, onPause, onResume, onToggleMute });
  cbRef.current = { onStart, onPause, onResume, onToggleMute };

  const moveKeys = useRef(new Set<string>());
  const jumpId = useRef<number | null>(null);
  const diveId = useRef<number | null>(null);
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
    if (GAME_KEYS.includes(code)) e.preventDefault();
    if (g && g.phase === 'playing') {
      if (JUMP.includes(code)) {
        if (!e.repeat) g.pressJump();
      } else if (DIVE.includes(code)) {
        g.pressDive();
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
  };

  const onPointerUp = (e: PointerEvent) => {
    const g = gameRef.current;
    if (jumpId.current !== null && e.pointerId === jumpId.current) {
      jumpId.current = null;
      g?.releaseJump();
      g?.releaseDive();
    }
    if (diveId.current !== null && e.pointerId === diveId.current) {
      diveId.current = null;
      g?.releaseDive();
    }
  };

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, []);

  const onWrapPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gameRef.current;
    if (!g || g.phase !== 'playing') return;
    jumpId.current = e.pointerId;
    startY.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
    g.pressJump();
  };

  const onWrapPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (jumpId.current === null || e.pointerId !== jumpId.current) return;
    if (e.clientY - startY.current > 28) {
      gameRef.current?.pressDive();
      startY.current = e.clientY;
    }
  };

  const onDivePointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    diveId.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    gameRef.current?.pressDive();
  };

  const onDivePointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (diveId.current === e.pointerId) {
      diveId.current = null;
      gameRef.current?.releaseDive();
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
