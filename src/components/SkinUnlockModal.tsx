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
  const tierColor = TIER_COLORS[skin.tier]?.text || '#ffd166';

  useEffect(() => {
    sfx.play('gem');
  }, []);

  // Live Canvas Sprite Animation (4x scale)
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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#08040f]/85 p-4 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className="relative flex w-full max-w-[340px] flex-col items-center border-2 bg-[#120824] p-5 text-center font-pixel shadow-[0_0_30px_rgba(0,0,0,0.8)]"
        style={{ borderColor: tierColor }}
      >
        {/* Glowing Header Banner */}
        <div className="mb-3 flex items-center gap-1.5 text-[9px] uppercase tracking-wider tablet:text-[11px]" style={{ color: tierColor }}>
          <span>★</span>
          <span id="skin-unlock-title" className="drop-shadow-[0_0_8px_rgba(255,209,102,0.6)]">
            NEW SKIN UNLOCKED!
          </span>
          <span>★</span>
        </div>

        {/* Sprite Preview Frame */}
        <div
          className="relative mb-4 flex h-28 w-28 items-center justify-center border-2 bg-[#090314] shadow-inner"
          style={{ borderColor: `${tierColor}88` }}
        >
          {/* Radial light spotlight */}
          <div
            className="pointer-events-none absolute inset-0 opacity-20"
            style={{ background: `radial-gradient(circle, ${tierColor} 0%, transparent 70%)` }}
          />
          <canvas
            ref={canvasRef}
            width={112}
            height={112}
            className="relative z-10 [image-rendering:pixelated]"
          />
        </div>

        {/* Skin Name */}
        <h2 className="text-[14px] uppercase tracking-wide text-[#ffffff] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] tablet:text-[16px]">
          {skin.name}
        </h2>

        {/* Tier Badge */}
        <div
          className="mt-1 mb-2 inline-block border px-2 py-0.5 text-[7px] uppercase tracking-wider font-bold"
          style={{ borderColor: tierColor, color: tierColor, backgroundColor: `${tierColor}18` }}
        >
          {skin.tier}
        </div>

        {/* Unlock Requirement Info */}
        <p className="mb-5 text-[8px] text-[#9d8fd6] tablet:text-[9px]">
          {skin.unlock.desc || 'UNLOCKED'}
        </p>

        {/* Actions */}
        <div className="flex w-full flex-col gap-2">
          <PixelButton
            onClick={handleEquip}
            className="w-full py-2.5 text-[10px] text-[#08040f] tablet:text-[12px]"
            style={{ backgroundColor: tierColor, borderColor: tierColor }}
          >
            ⚡ EQUIP NOW
          </PixelButton>
          <PixelButton
            variant="ghost"
            onClick={handleClose}
            className="w-full py-2 text-[8px] text-[#9d8fd6] hover:text-[#ffffff] tablet:text-[9px]"
          >
            LATER
          </PixelButton>
        </div>
      </div>
    </div>
  );
}
