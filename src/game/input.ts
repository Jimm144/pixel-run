export type GamepadAction = 'jump' | 'dive' | 'pause' | 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back';

export interface GamepadStateUpdate {
  jumpPressed: boolean;
  jumpReleased: boolean;
  jumpHeld: boolean;
  divePressed: boolean;
  diveReleased: boolean;
  diveHeld: boolean;
  moveRight: boolean;
  pausePressed: boolean;
  confirmPressed: boolean;
  backPressed: boolean;
}

type KonamiCallback = () => void;
type ActionCallback = (action: GamepadAction) => void;
type StateCallback = (state: GamepadStateUpdate) => void;

class InputManager {
  private konamiIndex = 0;
  private gamepadKonamiIndex = 0;
  private swipeKonamiIndex = 0;
  private konamiListeners: Set<KonamiCallback> = new Set();
  private actionListeners: Set<ActionCallback> = new Set();
  private stateListeners: Set<StateCallback> = new Set();

  private keySequence = [
    ['ArrowUp', 'w', 'W'],
    ['ArrowUp', 'w', 'W'],
    ['ArrowDown', 's', 'S'],
    ['ArrowDown', 's', 'S'],
    ['ArrowLeft', 'a', 'A'],
    ['ArrowRight', 'd', 'D'],
    ['ArrowLeft', 'a', 'A'],
    ['ArrowRight', 'd', 'D'],
    ['b', 'B'],
    ['a', 'A'],
  ];

  private gamepadSequence: GamepadAction[] = [
    'up',
    'up',
    'down',
    'down',
    'left',
    'right',
    'left',
    'right',
    'back',
    'confirm',
  ];

  private swipeSequence: string[] = [
    'up',
    'up',
    'down',
    'down',
    'left',
    'right',
    'left',
    'right',
  ];

  private prevJump = false;
  private prevDive = false;
  private prevPause = false;
  private prevConfirm = false;
  private prevBack = false;

  private prevUp = false;
  private prevDown = false;
  private prevLeft = false;
  private prevRight = false;

  private touchStartX = 0;
  private touchStartY = 0;
  private lastTapTime = 0;

  constructor() {
    if (typeof window === 'undefined') return;

    // Keyboard listener for Konami code
    window.addEventListener('keydown', (e) => {
      const match = this.keySequence[this.konamiIndex]?.includes(e.key);
      if (match) {
        this.konamiIndex++;
        if (this.konamiIndex === this.keySequence.length) {
          this.triggerKonami();
          this.konamiIndex = 0;
        }
      } else {
        this.konamiIndex = this.keySequence[0].includes(e.key) ? 1 : 0;
      }
    });

    // Touch listener for mobile swipe Konami code
    window.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length > 0) {
          this.touchStartX = e.touches[0].clientX;
          this.touchStartY = e.touches[0].clientY;
        }
      },
      { passive: true },
    );

    window.addEventListener(
      'touchend',
      (e) => {
        if (e.changedTouches.length === 0) return;
        const dx = e.changedTouches[0].clientX - this.touchStartX;
        const dy = e.changedTouches[0].clientY - this.touchStartY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        let gesture = '';
        if (dist > 30) {
          if (Math.abs(dx) > Math.abs(dy)) {
            gesture = dx > 0 ? 'right' : 'left';
          } else {
            gesture = dy > 0 ? 'down' : 'up';
          }
        } else {
          // Tap / Double tap
          const now = Date.now();
          if (now - this.lastTapTime < 450) {
            gesture = 'doubletap';
          }
          this.lastTapTime = now;
        }

        if (gesture) {
          if (gesture === 'doubletap' && this.swipeKonamiIndex === this.swipeSequence.length) {
            this.triggerKonami();
            this.swipeKonamiIndex = 0;
            return;
          }

          if (this.swipeSequence[this.swipeKonamiIndex] === gesture) {
            this.swipeKonamiIndex++;
          } else {
            this.swipeKonamiIndex = this.swipeSequence[0] === gesture ? 1 : 0;
          }
        }
      },
      { passive: true },
    );

    // Start Gamepad Polling Loop
    this.pollGamepads();
  }

  private triggerKonami() {
    this.konamiListeners.forEach((cb) => {
      try {
        cb();
      } catch {}
    });
  }

  onKonami(callback: KonamiCallback) {
    this.konamiListeners.add(callback);
    return () => this.konamiListeners.delete(callback);
  }

  onAction(callback: ActionCallback) {
    this.actionListeners.add(callback);
    return () => this.actionListeners.delete(callback);
  }

  onGamepadUpdate(callback: StateCallback) {
    this.stateListeners.add(callback);
    return () => this.stateListeners.delete(callback);
  }

  private dispatchAction(action: GamepadAction) {
    // Check Gamepad Konami code
    if (this.gamepadSequence[this.gamepadKonamiIndex] === action) {
      this.gamepadKonamiIndex++;
      if (this.gamepadKonamiIndex === this.gamepadSequence.length) {
        this.triggerKonami();
        this.gamepadKonamiIndex = 0;
      }
    } else {
      this.gamepadKonamiIndex = this.gamepadSequence[0] === action ? 1 : 0;
    }

    this.actionListeners.forEach((cb) => {
      try {
        cb(action);
      } catch {}
    });
  }

  private navRepeatTimer: Record<string, number> = {};

  private pollGamepads = () => {
    if (typeof navigator !== 'undefined' && navigator.getGamepads) {
      const gamepads = navigator.getGamepads();
      let jump = false;
      let dive = false;
      let moveRight = false;
      let pause = false;
      let confirm = false;
      let back = false;
      let up = false;
      let down = false;
      let left = false;
      let right = false;

      for (let i = 0; i < gamepads.length; i++) {
        const gp = gamepads[i];
        if (!gp || !gp.connected) continue;

        const isPressed = (btnIndex: number) => {
          const btn = gp.buttons[btnIndex];
          return Boolean(btn && (btn.pressed || btn.value > 0.35));
        };

        const isTriggerPressed = (btnIndex: number) => {
          const btn = gp.buttons[btnIndex];
          return Boolean(btn && (btn.pressed || btn.value > 0.15));
        };

        // Jump: Cross / A (0), Square / X (2), R1 (5), R2 (7)
        const curJump = isPressed(0) || isPressed(2) || isPressed(5) || isTriggerPressed(7);

        // Slam / Dive: Circle / B (1), L1 (4), L2 (6), Left Stick Down (axes[1] > 0.45), Right Stick Down (axes[3] > 0.45)
        const stickDown =
          (typeof gp.axes[1] === 'number' && gp.axes[1] > 0.45) ||
          (typeof gp.axes[3] === 'number' && gp.axes[3] > 0.45);
        const curDive = isPressed(1) || isPressed(4) || isTriggerPressed(6) || stickDown;

        // D-pad Right (15), Stick Right
        const curRight = isPressed(15) || (typeof gp.axes[0] === 'number' && gp.axes[0] > 0.35);
        // D-pad Left (14), Stick Left
        const curLeft = isPressed(14) || (typeof gp.axes[0] === 'number' && gp.axes[0] < -0.35);
        // D-pad Up (12), Stick Up
        const curUp = isPressed(12) || (typeof gp.axes[1] === 'number' && gp.axes[1] < -0.35);
        // D-pad Down (13), Stick Down
        const curDown = isPressed(13) || (typeof gp.axes[1] === 'number' && gp.axes[1] > 0.35);

        // Pause: Options / Start (9), Share / Select (8), Triangle / Y (3), PS Button (16), Touchpad (17)
        const curPause = isPressed(9) || isPressed(8) || isPressed(3) || isPressed(16) || isPressed(17);

        // Confirm: Cross / A (0)
        const curConfirm = isPressed(0);
        // Back: Circle / B (1)
        const curBack = isPressed(1);

        if (curJump) jump = true;
        if (curDive) dive = true;
        if (curRight) { moveRight = true; right = true; }
        if (curLeft) left = true;
        if (curUp) up = true;
        if (curDown) down = true;
        if (curPause) pause = true;
        if (curConfirm) confirm = true;
        if (curBack) back = true;
      }

      // Discrete Action Dispatches with responsive repeat (for menus & navigation)
      const now = performance.now();
      const checkRepeat = (dir: 'up' | 'down' | 'left' | 'right', active: boolean, prev: boolean) => {
        if (active) {
          if (!prev) {
            this.dispatchAction(dir);
            this.navRepeatTimer[dir] = now + 240;
          } else if (now >= (this.navRepeatTimer[dir] || 0)) {
            this.dispatchAction(dir);
            this.navRepeatTimer[dir] = now + 120;
          }
        }
      };

      checkRepeat('up', up, this.prevUp);
      checkRepeat('down', down, this.prevDown);
      checkRepeat('left', left, this.prevLeft);
      checkRepeat('right', right, this.prevRight);

      if (confirm && !this.prevConfirm) this.dispatchAction('confirm');
      if (back && !this.prevBack) this.dispatchAction('back');
      if (pause && !this.prevPause) this.dispatchAction('pause');
      if (jump && !this.prevJump) this.dispatchAction('jump');
      if (dive && !this.prevDive) this.dispatchAction('dive');

      // Continuous Gamepad State Dispatches (for 60 FPS platformer physics)
      if (this.stateListeners.size > 0) {
        const update: GamepadStateUpdate = {
          jumpPressed: jump && !this.prevJump,
          jumpReleased: !jump && this.prevJump,
          jumpHeld: jump,
          divePressed: dive && !this.prevDive,
          diveReleased: !dive && this.prevDive,
          diveHeld: dive,
          moveRight,
          pausePressed: pause && !this.prevPause,
          confirmPressed: confirm && !this.prevConfirm,
          backPressed: back && !this.prevBack,
        };

        this.stateListeners.forEach((cb) => {
          try {
            cb(update);
          } catch {}
        });
      }

      this.prevJump = jump;
      this.prevDive = dive;
      this.prevPause = pause;
      this.prevConfirm = confirm;
      this.prevBack = back;
      this.prevUp = up;
      this.prevDown = down;
      this.prevLeft = left;
      this.prevRight = right;
    }

    requestAnimationFrame(this.pollGamepads);
  };
}

export const inputManager = new InputManager();
