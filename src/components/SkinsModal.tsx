import { useState, useEffect, useRef, useCallback } from 'react';
import {
  SKINS,
  SKIN_LIST,
  TIERS,
  TIER_COLORS,
  type SkinDef,
  type SkinId,
  type LifetimeStats,
  saveEquippedSkin,
  saveUnlockedSkins,
  saveLifetimeStats,
  loadLifetimeStats,
} from '../game/skins';
import { drawPlayerSprite } from '../game/playerSprite';
import { inputManager, type GamepadAction } from '../game/input';
import { sfx } from '../game/audio';

interface SkinsModalProps {
  equippedSkin: SkinId;
  unlockedSkins: SkinId[];
  lifetimeStats: LifetimeStats;
  onEquip: (id: SkinId) => void;
  onUpdateUnlocked: (unlocked: SkinId[], updatedStats: LifetimeStats) => void;
  onClose: () => void;
  touch?: boolean;
}

function GemIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none">
      <path d="M4 2h8l4 5-8 8-8-8 4-5z" fill="#0a231f" stroke="#051310" strokeWidth="1" />
      <path d="M5 3h6l3 4-6 7-6-7 3-4z" fill="#16987e" />
      <path d="M5 3h6l-1 4H6L5 3z" fill="#7ef7ff" />
      <path d="M2 7l4-4 0 4-4 0z" fill="#3ef2c8" />
      <path d="M14 7l-4-4 0 4 4 0z" fill="#0f6856" />
      <path d="M6 7l2 7 0-7-2 0z" fill="#3ef2c8" />
      <path d="M8 7l2 0-2 7 0-7z" fill="#0f6856" />
      <rect x="6" y="3" width="2" height="2" fill="#ffffff" />
    </svg>
  );
}

export function SkinsModal({
  equippedSkin,
  unlockedSkins,
  lifetimeStats,
  onEquip,
  onUpdateUnlocked,
  onClose,
  touch = false,
}: SkinsModalProps) {
  const [selectedTierIndex, setSelectedTierIndex] = useState(0);
  const [focusSection, setFocusSection] = useState<'tabs' | 'grid'>('grid');
  const [selectedSkinId, setSelectedSkinId] = useState<SkinId>(equippedSkin);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef(0);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const selectedTier = TIERS[selectedTierIndex];

  const filteredSkins = SKIN_LIST.filter(
    (s) => selectedTier === 'all' || s.tier === selectedTier,
  );

  const selectedSkin = SKINS[selectedSkinId] || SKINS.bob;
  const isUnlocked = unlockedSkins.includes(selectedSkinId);
  const isEquipped = equippedSkin === selectedSkinId;

  const [stats, setStats] = useState<LifetimeStats>(() => loadLifetimeStats());

  useEffect(() => {
    setStats(loadLifetimeStats());
  }, [lifetimeStats]);

  const [windowWidth, setWindowWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1000,
  );

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const cols = touch ? (windowWidth >= 768 ? 3 : 2) : windowWidth < 768 ? 2 : 3;

  // Auto-scroll selected card into view
  useEffect(() => {
    if (focusSection === 'grid') {
      cardRefs.current[focusedIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [focusedIndex, focusSection]);

  // Buy with Gems
  const handleBuy = useCallback(
    (skin: SkinDef) => {
      const freshStats = loadLifetimeStats();
      if (skin.unlock.type !== 'gems' || !skin.unlock.cost) return;
      if (freshStats.gems < skin.unlock.cost) return;

      const nextGems = freshStats.gems - skin.unlock.cost;
      const nextStats = { ...freshStats, gems: nextGems };
      const nextUnlocked = [...unlockedSkins, skin.id];

      saveLifetimeStats(nextStats);
      setStats(nextStats);
      saveUnlockedSkins(nextUnlocked);
      onUpdateUnlocked(nextUnlocked, nextStats);
      onEquip(skin.id);
      saveEquippedSkin(skin.id);
      sfx.play('gem');
    },
    [unlockedSkins, onUpdateUnlocked, onEquip],
  );

  const handleEquip = useCallback(
    (id: SkinId) => {
      if (!unlockedSkins.includes(id)) return;
      onEquip(id);
      saveEquippedSkin(id);
      sfx.play('ui');
    },
    [unlockedSkins, onEquip],
  );

  // Full 2D Keyboard & Gamepad Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (focusSection === 'tabs') {
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
          setSelectedTierIndex((prev) => {
            const next = (prev + 1) % TIERS.length;
            setFocusedIndex(0);
            return next;
          });
          sfx.play('ui');
        } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
          setSelectedTierIndex((prev) => {
            const next = (prev - 1 + TIERS.length) % TIERS.length;
            setFocusedIndex(0);
            return next;
          });
          sfx.play('ui');
        } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S' || e.key === 'Enter' || e.key === ' ') {
          setFocusSection('grid');
          setFocusedIndex(0);
          if (filteredSkins[0]) setSelectedSkinId(filteredSkins[0].id);
          sfx.play('ui');
        }
      } else {
        // focusSection === 'grid'
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
          if (focusedIndex < filteredSkins.length - 1) {
            const next = focusedIndex + 1;
            setFocusedIndex(next);
            setSelectedSkinId(filteredSkins[next].id);
            sfx.play('ui');
          }
        } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
          if (focusedIndex > 0) {
            const next = focusedIndex - 1;
            setFocusedIndex(next);
            setSelectedSkinId(filteredSkins[next].id);
            sfx.play('ui');
          }
        } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
          if (focusedIndex + cols < filteredSkins.length) {
            const next = focusedIndex + cols;
            setFocusedIndex(next);
            setSelectedSkinId(filteredSkins[next].id);
            sfx.play('ui');
          } else if (focusedIndex < filteredSkins.length - 1) {
            const next = filteredSkins.length - 1;
            setFocusedIndex(next);
            setSelectedSkinId(filteredSkins[next].id);
            sfx.play('ui');
          }
        } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
          if (focusedIndex < cols) {
            setFocusSection('tabs');
            sfx.play('ui');
          } else {
            const next = focusedIndex - cols;
            setFocusedIndex(next);
            setSelectedSkinId(filteredSkins[next].id);
            sfx.play('ui');
          }
        } else if (e.key === 'Enter' || e.key === ' ') {
          const cur = filteredSkins[focusedIndex];
          if (cur) {
            if (unlockedSkins.includes(cur.id)) {
              handleEquip(cur.id);
            } else if (cur.unlock.type === 'gems') {
              handleBuy(cur);
            }
          }
        }
      }
    };

    const cleanupAction = inputManager.onAction((action: GamepadAction) => {
      if (action === 'back') {
        onClose();
        return;
      }

      if (focusSection === 'tabs') {
        if (action === 'right') {
          setSelectedTierIndex((prev) => (prev + 1) % TIERS.length);
          setFocusedIndex(0);
          sfx.play('ui');
        } else if (action === 'left') {
          setSelectedTierIndex((prev) => (prev - 1 + TIERS.length) % TIERS.length);
          setFocusedIndex(0);
          sfx.play('ui');
        } else if (action === 'down' || action === 'confirm') {
          setFocusSection('grid');
          setFocusedIndex(0);
          if (filteredSkins[0]) setSelectedSkinId(filteredSkins[0].id);
          sfx.play('ui');
        }
      } else {
        // focusSection === 'grid'
        if (action === 'right') {
          if (focusedIndex < filteredSkins.length - 1) {
            const next = focusedIndex + 1;
            setFocusedIndex(next);
            setSelectedSkinId(filteredSkins[next].id);
            sfx.play('ui');
          }
        } else if (action === 'left') {
          if (focusedIndex > 0) {
            const next = focusedIndex - 1;
            setFocusedIndex(next);
            setSelectedSkinId(filteredSkins[next].id);
            sfx.play('ui');
          }
        } else if (action === 'down') {
          if (focusedIndex + cols < filteredSkins.length) {
            const next = focusedIndex + cols;
            setFocusedIndex(next);
            setSelectedSkinId(filteredSkins[next].id);
            sfx.play('ui');
          } else if (focusedIndex < filteredSkins.length - 1) {
            const next = filteredSkins.length - 1;
            setFocusedIndex(next);
            setSelectedSkinId(filteredSkins[next].id);
            sfx.play('ui');
          }
        } else if (action === 'up') {
          if (focusedIndex < cols) {
            setFocusSection('tabs');
            sfx.play('ui');
          } else {
            const next = focusedIndex - cols;
            setFocusedIndex(next);
            setSelectedSkinId(filteredSkins[next].id);
            sfx.play('ui');
          }
        } else if (action === 'confirm') {
          const cur = filteredSkins[focusedIndex];
          if (cur) {
            if (unlockedSkins.includes(cur.id)) {
              handleEquip(cur.id);
            } else if (cur.unlock.type === 'gems') {
              handleBuy(cur);
            }
          }
        }
      }
    });

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      cleanupAction();
    };
  }, [focusSection, focusedIndex, filteredSkins, cols, unlockedSkins, handleEquip, handleBuy, onClose]);

  // Live Canvas Sprite Animation (Unified Single Source of Truth via drawPlayerSprite)
  useEffect(() => {
    const cv = previewCanvasRef.current;
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
        skinId: selectedSkin.id,
        frame,
        scale: 4.2,
        onGround: true,
        run: Math.floor(frame / 6) % 4,
      });

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [selectedSkin]);

  // Helper for progress bar directly rendered on card
  const renderCardProgressBar = (skin: SkinDef) => {
    if (skin.unlock.type === 'coins' && skin.unlock.threshold) {
      const cur = stats.coins;
      const max = skin.unlock.threshold;
      const pct = Math.min(100, Math.max(0, Math.round((cur / max) * 100)));
      return (
        <div className="w-full">
          <div className="mb-1.5 flex justify-between font-pixel text-[6.5px] leading-none text-[#ffd166] sm:text-[7.5px]">
            <span>{pct}%</span>
            <span>{cur}/{max}</span>
          </div>
          <div className="h-2 w-full overflow-hidden border border-[#59427e] bg-[#100722]">
            <div className="h-full bg-gradient-to-r from-[#ffd166] to-[#ff4d6d] transition-all duration-200" style={{ width: `${pct}%` }} />
          </div>
        </div>
      );
    }
    if (skin.unlock.type === 'distance' && skin.unlock.threshold) {
      const cur = stats.totalDistance;
      const max = skin.unlock.threshold;
      const pct = Math.min(100, Math.max(0, Math.round((cur / max) * 100)));
      return (
        <div className="w-full">
          <div className="mb-1.5 flex justify-between font-pixel text-[6.5px] leading-none text-[#ffd166] sm:text-[7.5px]">
            <span>{pct}%</span>
            <span>{Math.floor(cur / 1000)}K/{Math.floor(max / 1000)}K</span>
          </div>
          <div className="h-2 w-full overflow-hidden border border-[#59427e] bg-[#100722]">
            <div className="h-full bg-gradient-to-r from-[#ffd166] to-[#ff4d6d] transition-all duration-200" style={{ width: `${pct}%` }} />
          </div>
        </div>
      );
    }
    if (skin.unlock.type === 'score' && skin.unlock.threshold) {
      const cur = stats.score;
      const max = skin.unlock.threshold;
      const pct = Math.min(100, Math.max(0, Math.round((cur / max) * 100)));
      return (
        <div className="w-full">
          <div className="mb-1.5 flex justify-between font-pixel text-[6.5px] leading-none text-[#ffd166] sm:text-[7.5px]">
            <span>{pct}%</span>
            <span>{Math.floor(cur / 1000)}K/{Math.floor(max / 1000)}K</span>
          </div>
          <div className="h-2 w-full overflow-hidden border border-[#59427e] bg-[#100722]">
            <div className="h-full bg-gradient-to-r from-[#ffd166] to-[#ff4d6d] transition-all duration-200" style={{ width: `${pct}%` }} />
          </div>
        </div>
      );
    }
    if (skin.unlock.type === 'quests' && skin.unlock.threshold) {
      const cur = stats.dailySets;
      const max = skin.unlock.threshold;
      const pct = Math.min(100, Math.max(0, Math.round((cur / max) * 100)));
      return (
        <div className="w-full">
          <div className="mb-1.5 flex justify-between font-pixel text-[6.5px] leading-none text-[#ffd166] sm:text-[7.5px]">
            <span>{pct}%</span>
            <span>{cur}/{max} SETS</span>
          </div>
          <div className="h-2 w-full overflow-hidden border border-[#59427e] bg-[#100722]">
            <div className="h-full bg-gradient-to-r from-[#ffd166] to-[#ff4d6d] transition-all duration-200" style={{ width: `${pct}%` }} />
          </div>
        </div>
      );
    }
    if (skin.unlock.type === 'moon') {
      return (
        <div className="w-full border border-[#ff4d6d]/40 bg-[#25050f] py-0.5 text-center font-pixel text-[6px] text-[#ff4d6d]">
          {skin.unlock.desc}
        </div>
      );
    }
    if (skin.unlock.type === 'konami') {
      return (
        <div className="w-full border border-[#c98cff]/40 bg-[#1c0830] py-0.5 text-center font-pixel text-[6px] text-[#c98cff]">
          {skin.unlock.desc}
        </div>
      );
    }
    return null;
  };

  return (
    <div
      className={
        touch
          ? 'fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[#0d0619] p-3 text-white tablet:items-center tablet:justify-center tablet:bg-[#08040f]/90 tablet:p-4'
          : 'fixed inset-0 z-50 flex items-center justify-center bg-[#08040f]/90 p-3'
      }
    >
      <div
        className={
          touch
          ? 'flex min-h-full w-full flex-col bg-[#0d0619] p-0 text-white tablet:min-h-0 tablet:max-w-[840px] tablet:border-4 tablet:border-[#3ef2c8] tablet:p-4 tablet:shadow-[0_0_0_4px_#08040f,0_0_35px_rgba(62,242,200,0.25)]'
             : 'flex max-h-[94vh] w-full max-w-[840px] flex-col border-4 border-[#3ef2c8] bg-[#0d0619] p-4 text-white shadow-[0_0_0_4px_#08040f,0_0_35px_rgba(62,242,200,0.25)] tablet:max-w-[min(840px,calc(100vw-32px))]'
        }
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b-2 border-[#251842] pb-2 sm:pb-2.5">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <h2 className="font-pixel text-[12px] text-[#3ef2c8] whitespace-nowrap sm:text-[14px] md:text-[16px]">
              CHARACTER LOCKER
            </h2>
            <div className="flex shrink-0 items-center gap-1.5 border-2 border-[#3ef2c8]/60 bg-[#092922] px-2 py-0.5 font-pixel text-[8px] text-[#3ef2c8] shadow-[2px_2px_0_#08040f] whitespace-nowrap sm:text-[9px] md:text-[10px]">
              <GemIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span>GEMS: {stats.gems}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={
              touch
                  ? 'flex h-10 w-10 shrink-0 items-center justify-center border border-[#ff4d6d] bg-[#ff4d6d]/20 px-0 py-0 font-pixel text-[14px] text-[#ff4d6d] shadow-[1px_1px_0_#08040f] whitespace-nowrap hover:bg-[#ff4d6d]/40 active:translate-x-[1px] active:translate-y-[1px] tablet:h-12 tablet:w-12 tablet:border-2 tablet:text-[16px]'
                 : 'flex h-7 min-w-[64px] shrink-0 items-center justify-center border-2 border-[#ff4d6d] bg-[#ff4d6d]/20 px-2 py-0.5 font-pixel text-[9px] text-[#ff4d6d] shadow-[2px_2px_0_#08040f] whitespace-nowrap hover:bg-[#ff4d6d]/40 active:translate-x-[1px] active:translate-y-[1px] sm:min-w-[70px] sm:text-[10px]'
            }
          >
            <span className={touch ? 'relative -top-px' : undefined}>{touch ? '✕' : '[ X ]'}</span>
          </button>
        </div>

        {/* Tier Tabs (Colored only when selected, no glow) */}
        <div className="mt-2.5 flex flex-wrap gap-1.5 border-b-2 border-[#251842] pb-2.5">
          {TIERS.map((tier, idx) => {
            const active = selectedTier === tier;
            const theme = TIER_COLORS[tier];
            return (
              <button
                key={tier}
                type="button"
                onClick={() => {
                  setSelectedTierIndex(idx);
                  setFocusSection('tabs');
                  setFocusedIndex(0);
                }}
                style={{
                  color: active ? '#0b0616' : '#9d8fd6',
                  backgroundColor: active ? theme.text : '#140a26',
                  borderColor: active ? theme.text : '#251842',
                }}
                className="border-2 px-3 py-1 font-pixel text-[8px] uppercase tracking-wider shadow-[2px_2px_0_#08040f] sm:text-[9.5px] hover:border-[#4a3575]"
              >
                {tier}
              </button>
            );
          })}
        </div>

        {/* Content Area */}
        <div
          className={
              touch
                ? 'mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-hidden tablet:grid tablet:flex-none tablet:grid-cols-[230px_1fr] tablet:gap-4'
              : 'mt-3 flex flex-col md:grid md:grid-cols-[230px_1fr] md:items-start gap-3 md:gap-4 overflow-hidden'
          }
        >
          {/* Left / Top: Stage Preview (h-fit, does not stretch to bottom) */}
          <div className="flex flex-row md:flex-col items-center justify-between md:justify-start gap-2.5 md:gap-0 self-stretch md:self-start border-2 border-[#251842] bg-[#120722] p-2.5 md:p-3.5 shadow-[2px_2px_0_#08040f]">
            <div className="flex items-center gap-2.5 md:flex-col md:gap-0">
              <div className="relative flex items-center justify-center border-2 border-[#38225c] bg-[#1a0e2e] p-1.5 md:p-2.5 shadow-inner">
                <canvas ref={previewCanvasRef} width={96} height={96} className="h-16 w-16 md:h-24 md:w-24 block" />
              </div>
              <div className="text-left md:mt-2.5 md:text-center">
                <div className="font-pixel text-[12px] text-white sm:text-[13px] md:text-[15px]">{selectedSkin.name}</div>
                <span
                  className="mt-0.5 md:mt-1 inline-block border px-1.5 md:px-2 py-0.5 font-pixel text-[7px] md:text-[8px] uppercase"
                  style={{
                    color: TIER_COLORS[selectedSkin.tier].text,
                    borderColor: TIER_COLORS[selectedSkin.tier].border,
                    backgroundColor: TIER_COLORS[selectedSkin.tier].bg,
                  }}
                >
                  {selectedSkin.tier}
                </span>
              </div>
            </div>

            {/* Action Button */}
            <div className="w-36 md:mt-3 md:w-full">
              {isEquipped ? (
                <div className="w-full border-2 border-[#3ef2c8] bg-[#3ef2c8]/20 py-2 md:py-2.5 text-center font-pixel text-[8.5px] md:text-[9px] text-[#3ef2c8] shadow-[2px_2px_0_#08040f]">
                  EQUIPPED
                </div>
              ) : isUnlocked ? (
                <button
                  type="button"
                  onClick={() => handleEquip(selectedSkinId)}
                  className="w-full border-2 border-[#08040f] bg-[#3ef2c8] py-2 md:py-2.5 font-pixel text-[8.5px] md:text-[9px] text-[#0b0616] shadow-[3px_3px_0_#08040f] transition-all hover:bg-[#7ef7ff] active:translate-x-[2px] active:translate-y-[2px]"
                >
                  EQUIP
                </button>
              ) : selectedSkin.unlock.type === 'gems' ? (
                <button
                  type="button"
                  disabled={stats.gems < (selectedSkin.unlock.cost || 0)}
                  onClick={() => handleBuy(selectedSkin)}
                  className={`w-full border-2 py-2 md:py-2.5 font-pixel text-[8px] md:text-[8.5px] shadow-[3px_3px_0_#08040f] transition-all active:translate-x-[2px] active:translate-y-[2px] ${
                    stats.gems >= (selectedSkin.unlock.cost || 0)
                      ? 'border-[#08040f] bg-[#ffd166] text-[#120820] hover:bg-[#ffe9a0]'
                      : 'cursor-not-allowed border-[#38225c] bg-[#160a2c] text-[#6f5fa8]'
                  }`}
                >
                  BUY ({selectedSkin.unlock.cost} GEMS)
                </button>
              ) : (
                <div className="w-full border-2 border-[#38225c] bg-[#140a26] py-1.5 md:py-2 text-center font-pixel text-[7px] md:text-[7.5px] text-[#c4b8e8]">
                  {selectedSkin.unlock.desc}
                </div>
              )}
            </div>
          </div>

          {/* Right: Grid of Skin Cards (3 columns on wide PC, 2 on narrow PC / mobile) */}
          <div
            className={
              touch
                ? 'grid min-h-0 min-w-0 flex-1 grid-cols-2 gap-2 overflow-y-auto p-0 tablet:max-h-[600px] tablet:flex-none tablet:grid-cols-3'
                : 'grid max-h-[340px] sm:max-h-[380px] md:max-h-[420px] grid-cols-2 md:grid-cols-3 gap-2 overflow-y-auto p-0'
            }
          >
            {filteredSkins.map((skin, idx) => {
              const unlocked = unlockedSkins.includes(skin.id);
              const equipped = equippedSkin === skin.id;
              const isCardFocused = focusSection === 'grid' && focusedIndex === idx;
              const selected = selectedSkinId === skin.id;
              const tierTheme = TIER_COLORS[skin.tier];

              return (
                <button
                  key={skin.id}
                  ref={(el) => { cardRefs.current[idx] = el; }}
                  type="button"
                  onClick={() => {
                    setSelectedSkinId(skin.id);
                    setFocusedIndex(idx);
                    setFocusSection('grid');
                  }}
                  className={`flex h-[104px] w-full flex-col justify-between border-2 p-3 text-left transition-all sm:h-[112px] ${
                    selected || isCardFocused
                      ? 'border-[#3ef2c8] bg-[#221038] shadow-[2px_2px_0_#3ef2c8]'
                      : 'border-[#2a1b49] bg-[#140a26] shadow-[2px_2px_0_#08040f] hover:border-[#4f3680]'
                  }`}
                >
                  <div className="w-full">
                    <div className="flex w-full items-center justify-between leading-none">
                      <span className="truncate font-pixel text-[8px] text-white sm:text-[9px]">{skin.name}</span>
                      <span
                        className="inline-flex min-h-[14px] items-center justify-center border px-1 font-pixel text-[6.5px] leading-none uppercase whitespace-nowrap sm:min-h-[16px] sm:text-[7px]"
                        style={{
                          color: tierTheme.text,
                          borderColor: tierTheme.border,
                          backgroundColor: tierTheme.bg,
                        }}
                      >
                        <span className="relative top-px">{skin.tier}</span>
                      </span>
                    </div>

                    {/* Swatch preview */}
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 border border-[#08040f] sm:h-3 sm:w-3" style={{ backgroundColor: skin.suit }} />
                      <span className="h-2.5 w-2.5 border border-[#08040f] sm:h-3 sm:w-3" style={{ backgroundColor: skin.scarf }} />
                      <span className="h-2.5 w-2.5 border border-[#08040f] sm:h-3 sm:w-3" style={{ backgroundColor: skin.boot }} />
                    </div>
                  </div>

                  {/* Status / Progress slot with uniform height */}
                  <div className="mt-auto flex h-[26px] w-full flex-col justify-end">
                    {equipped ? (
                      <span className="font-pixel text-[7.5px] text-[#3ef2c8]">EQUIPPED</span>
                    ) : unlocked ? (
                      <span className="font-pixel text-[7.5px] text-[#a0a0b8]">UNLOCKED</span>
                    ) : skin.unlock.type === 'gems' ? (
                      <span className="font-pixel text-[7.5px] text-[#ffd166]">{skin.unlock.cost} GEMS</span>
                    ) : (
                      renderCardProgressBar(skin)
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        {!touch && (
          <div className="mt-3 border-t-2 border-[#251842] pt-2 text-center font-pixel text-[7px] text-[#6f5fa8] sm:text-[8.5px]">
            ARROWS / D-PAD: SELECT | ENTER / A: EQUIP | ESC / B: CLOSE
          </div>
        )}
      </div>
    </div>
  );
}
