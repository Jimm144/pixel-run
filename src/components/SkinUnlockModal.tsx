import { useEffect, useRef } from 'react';
import { SKINS, type SkinId, TIER_COLORS } from '../game/skins';
import { drawPlayerSprite } from '../game/playerSprite';
import { PixelButton } from './ui';
import { sfx } from '../game/audio';
import { inputManager, type GamepadAction } from '../game/input';

interface SkinUnlockModalProps {
  skinId: SkinId;
  onEquip: (id: SkinId) => void;
  onClose: () => void;
}

export function SkinUnlockModal({ skinId, onEquip, onClose }: SkinUnlockModalProps) {
  const skin = SKINS[skinId] || SKINS.bob;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number>(0);
  const tierTheme = TIER_COLORS[skin.tier] || TIER_COLORS.common;

  useEffect(() => {
    sfx.play('gem');
  }, []);

  // Live Canvas Sprite Animation
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    let frame = 0;
    const render = () => {
      frame++;
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.imageSmoothingEnabled = false;
      const W = cv.width;
      const H = cv.height;
      const cx = Math.floor(W / 2);
      const cy = Math.floor(H / 2);

      drawPlayerSprite(ctx, cx, cy, {
        skinId: skin.id,
        frame,
        scale: 4,
        onGround: true,
        run: Math.floor(frame / 6) % 4,
      });

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current);
  }, [skin]);

  const handleEquip = () => {
    sfx.play('ui');
    onEquip(skin.id);
    onClose();
  };

  const handleClose = () => {
    sfx.play('ui');
    onClose();
  };

  // Keyboard & Gamepad bindings
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleEquip();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    };
    const cleanupAction = inputManager.onAction((action: GamepadAction) => {
      if (action === 'jump' || action === 'confirm') {
        handleEquip();
      } else if (action === 'dive' || action === 'pause' || action === 'back') {
        handleClose();
      }
    });
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      cleanupAction();
    };
  }, [skin.id, onEquip, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="skin-unlock-title"
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-[#08040f]/90 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className="relative flex w-full max-w-[340px] flex-col items-center border-4 bg-[#0d0619] p-5 text-center font-pixel text-white shadow-[0_0_0_4px_#08040f,0_0_35px_rgba(62,242,200,0.25)]"
        style={{ borderColor: tierTheme.border }}
      >
        {/* Header Title */}
        <h3
          id="skin-unlock-title"
          className="mb-3 text-[10px] tracking-wider uppercase drop-shadow-[0_2px_0_#08040f] sm:text-[11px]"
          style={{ color: tierTheme.text }}
        >
          NEW SKIN UNLOCKED
        </h3>

        {/* Sprite Preview Frame */}
        <div className="relative mb-3 flex h-28 w-28 items-center justify-center border-2 border-[#251842] bg-[#120722] p-2.5 shadow-[2px_2px_0_#08040f]">
          <canvas
            ref={canvasRef}
            width={112}
            height={112}
            style={{ imageRendering: 'pixelated' }}
            className="relative z-10 block [image-rendering:pixelated]"
          />
        </div>

        {/* Skin Name */}
        <h2 className="text-[14px] uppercase tracking-wide text-white drop-shadow-[0_2px_0_#08040f] sm:text-[16px]">
          {skin.name}
        </h2>

        {/* Tier Badge */}
        <span
          className="mt-1.5 mb-2 inline-flex min-h-[16px] items-center justify-center border px-2 font-pixel text-[7px] leading-none uppercase whitespace-nowrap sm:min-h-[18px] sm:text-[8px]"
          style={{
            color: tierTheme.text,
            borderColor: tierTheme.border,
            backgroundColor: tierTheme.bg,
          }}
        >
          <span className="relative top-px">{skin.tier}</span>
        </span>

        {/* Unlock Requirement Info */}
        <p className="mb-4 text-[7.5px] text-[#6f5fa8] sm:text-[8.5px]">
          {skin.unlock.desc || 'UNLOCKED'}
        </p>

        {/* Actions */}
        <div className="flex w-full flex-col gap-2">
          <PixelButton
            onClick={handleEquip}
            className="w-full py-3 text-[10px] sm:text-[11px]"
          >
            EQUIP
          </PixelButton>
          <PixelButton
            variant="ghost"
            onClick={handleClose}
            className="w-full py-2.5 text-[9px] text-[#6f5fa8] hover:text-white sm:text-[10px]"
          >
            LATER
          </PixelButton>
        </div>
      </div>
    </div>
  );
}
