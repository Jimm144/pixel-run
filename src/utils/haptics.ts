/**
 * Multi-device haptics supporting mobile navigator.vibrate and gamepad vibrationActuator / hapticActuators (PS5 DualSense, Xbox, Switch).
 */

function getActiveGamepads(): Gamepad[] {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return [];
  try {
    const list = navigator.getGamepads();
    const active: Gamepad[] = [];
    for (let i = 0; i < list.length; i++) {
      const gp = list[i];
      if (gp && gp.connected) active.push(gp);
    }
    return active;
  } catch {
    return [];
  }
}

function rumbleGamepad(durationMs: number, strong = 0.5, weak = 0.5, gamepadIndex?: number) {
  try {
    const gamepads = getActiveGamepads();
    // DualSense LRA voice-coil actuators require a minimum activation threshold and duration
    const safeDuration = Math.max(50, durationMs);
    const strongMag = Math.min(1, Math.max(0.1, strong));
    const weakMag = Math.min(1, Math.max(0.1, weak));

    for (const gp of gamepads) {
      if (gamepadIndex !== undefined && gp.index !== gamepadIndex) continue;

      const anyGp = gp as unknown as {
        vibrationActuator?: {
          type?: string;
          playEffect?: (type: string, opts: object) => Promise<unknown>;
          pulse?: (value: number, duration: number) => Promise<unknown> | void;
        };
        hapticActuators?: Array<{
          type?: string;
          pulse?: (value: number, duration: number) => Promise<unknown> | void;
          playEffect?: (type: string, opts: object) => Promise<unknown>;
        }>;
      };

      const actuator = anyGp.vibrationActuator || (anyGp.hapticActuators && anyGp.hapticActuators[0]);
      if (!actuator) continue;

      if (typeof actuator.playEffect === 'function') {
        const effectType = actuator.type || 'dual-rumble';
        actuator
          .playEffect(effectType, {
            startDelay: 0,
            duration: safeDuration,
            weakMagnitude: weakMag,
            strongMagnitude: strongMag,
            leftTrigger: strongMag,
            rightTrigger: weakMag,
          })
          .catch(() => {
            if (effectType !== 'dual-rumble' && typeof actuator.playEffect === 'function') {
              actuator
                .playEffect('dual-rumble', {
                  startDelay: 0,
                  duration: safeDuration,
                  weakMagnitude: weakMag,
                  strongMagnitude: strongMag,
                })
                .catch(() => {});
            }
          });
      } else if (typeof actuator.pulse === 'function') {
        try {
          actuator.pulse(Math.max(strongMag, weakMag), safeDuration);
        } catch {}
      }
    }
  } catch {}
}

function vibrateMobile(pattern: number | number[]) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(pattern);
  } catch {}
}

export const haptics = {
  jump: (gamepadIndex?: number) => {
    vibrateMobile(12);
    rumbleGamepad(50, 0.2, 0.35, gamepadIndex);
  },
  djump: (gamepadIndex?: number) => {
    vibrateMobile([10, 20, 15]);
    rumbleGamepad(60, 0.3, 0.5, gamepadIndex);
  },
  stomp: (gamepadIndex?: number) => {
    vibrateMobile(25);
    rumbleGamepad(80, 0.65, 0.45, gamepadIndex);
  },
  diveSlam: (gamepadIndex?: number) => {
    vibrateMobile([35, 20, 30]);
    rumbleGamepad(120, 0.95, 0.75, gamepadIndex);
  },
  powerup: (gamepadIndex?: number) => {
    vibrateMobile([15, 30, 20]);
    rumbleGamepad(80, 0.35, 0.6, gamepadIndex);
  },
  gem: (gamepadIndex?: number) => {
    vibrateMobile(18);
    rumbleGamepad(50, 0.2, 0.45, gamepadIndex);
  },
  milestone: (gamepadIndex?: number) => {
    vibrateMobile([20, 40, 25, 40, 30]);
    rumbleGamepad(140, 0.8, 0.8, gamepadIndex);
  },
  hit: (gamepadIndex?: number) => {
    vibrateMobile([30, 30, 40]);
    rumbleGamepad(110, 0.85, 0.65, gamepadIndex);
  },
  death: (gamepadIndex?: number) => {
    vibrateMobile([50, 40, 70]);
    rumbleGamepad(180, 1.0, 0.9, gamepadIndex);
  },
};
