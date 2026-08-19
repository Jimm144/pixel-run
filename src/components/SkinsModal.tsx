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
  isSkinAvailable,
  DISCORD_URL,
  claimDiscordReward,
  isDiscordRewardClaimed,
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
    <svg viewBox="0 0 16 16" className={className} fill="none" shapeRendering="crispEdges">
      {/* 8-bit Dark Outline */}
      <path d="M5 1h6v2h2v2h2v4h-2v2h-2v2H5v-2H3v-2H1V5h2V3h2V1z" fill="#08121e" />
      {/* Radiant Vibrant Cyan Body */}
      <path d="M6 2h4v2h3v2h1v2h-1v2h-3v2H6v-2H3V8H2V6h1V4h3V2z" fill="#3ef2c8" />
      {/* Bright Highlight Facet */}
      <path d="M6 2h4v2H6V2zM3 4h3v4H3V4z" fill="#7ef7ff" />
      {/* Crisp White Sparkling Glint */}
      <rect x="6" y="3" width="2" height="2" fill="#ffffff" />
    </svg>
  );
}

function PixelArrow({ dir, className = '' }: { dir: 'up' | 'down' | 'left' | 'right'; className?: string }) {
  if (dir === 'up') {
    return (
      <svg
        viewBox="0 0 7 7"
        className={`inline-block h-[7px] w-[7px] shrink-0 align-middle fill-current ${className}`}
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        <path d="M3 0h1v1H3V0z M2 1h3v1H2V1z M1 2h5v1H1V2z M0 3h7v1H0V3z M2 4h3v3H2V4z" />
      </svg>
    );
  }
  if (dir === 'down') {
    return (
      <svg
        viewBox="0 0 7 7"
        className={`inline-block h-[7px] w-[7px] shrink-0 align-middle fill-current ${className}`}
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        <path d="M2 0h3v3H2V0z M0 3h7v1H0V3z M1 4h5v1H1V4z M2 5h3v1H2V5z M3 6h1v1H3V6z" />
      </svg>
    );
  }
  if (dir === 'left') {
    return (
      <svg
        viewBox="0 0 7 7"
        className={`inline-block h-[7px] w-[7px] shrink-0 align-middle fill-current ${className}`}
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        <path d="M0 3h1v1H0V3z M1 2h1v3H1V2z M2 1h1v5H2V1z M3 0h1v7H3V0z M4 2h3v3H4V2z" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 7 7"
      className={`inline-block h-[7px] w-[7px] shrink-0 align-middle fill-current ${className}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <path d="M6 3h1v1H6V3z M5 2h1v3H5V2z M4 1h1v5H4V1z M3 0h1v7H3V0z M0 2h3v3H0V2z" />
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
  const [hoveredTier, setHoveredTier] = useState<string | null>(null);
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
  const [discordClaimed, setDiscordClaimed] = useState(() => isDiscordRewardClaimed());

  useEffect(() => {
    setStats(loadLifetimeStats());
  }, [lifetimeStats]);

  useEffect(() => {
    setSelectedSkinId(equippedSkin);
    const equippedIndex = filteredSkins.findIndex((skin) => skin.id === equippedSkin);
    setFocusedIndex(equippedIndex >= 0 ? equippedIndex : 0);
  }, [equippedSkin]);

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

  const handleDiscordClaim = useCallback(() => {
    if (discordClaimed) return;
    window.open(DISCORD_URL, '_blank', 'noopener,noreferrer');
    const reward = claimDiscordReward();
    setDiscordClaimed(true);
    setStats(reward.updatedStats);
    onUpdateUnlocked(reward.unlockedSkins, reward.updatedStats);
    if (reward.newlyClaimed) sfx.play('gem');
  }, [discordClaimed, onUpdateUnlocked]);

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
      document.body.classList.add('keyboard-active');
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

  // Live Canvas Sprite Animation — fps-independent at 60fps target
  useEffect(() => {
    const cv = previewCanvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    let frame = 0;
    let lastTime = 0;
    const FPS = 60;
    const FRAME_MS = 1000 / FPS;

    const render = (now: number) => {
      const delta = now - lastTime;
      if (delta >= FRAME_MS) {
        lastTime = now - (delta % FRAME_MS);
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
          scale: 4,
          onGround: true,
          run: Math.floor(frame / 6) % 4,
        });
      }
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
          <div className="mb-1.5 flex justify-between font-pixel text-[8px] leading-none text-[#ffd166]">
            <span>{pct}%</span>
            <span>{cur}/{max}</span>
          </div>
          <div className="h-2 w-full overflow-hidden border border-[#59427e] bg-[#100722]">
            <div className="h-full bg-[#ffd166] transition-all duration-200" style={{ width: `${pct}%` }} />
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
          <div className="mb-1.5 flex justify-between font-pixel text-[8px] leading-none text-[#ffd166]">
            <span>{pct}%</span>
            <span>{Math.floor(cur / 1000)}K/{Math.floor(max / 1000)}K</span>
          </div>
          <div className="h-2 w-full overflow-hidden border border-[#59427e] bg-[#100722]">
            <div className="h-full bg-[#ffd166] transition-all duration-200" style={{ width: `${pct}%` }} />
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
          <div className="mb-1.5 flex justify-between font-pixel text-[8px] leading-none text-[#ffd166]">
            <span>{pct}%</span>
            <span>{Math.floor(cur / 1000)}K/{Math.floor(max / 1000)}K</span>
          </div>
          <div className="h-2 w-full overflow-hidden border border-[#59427e] bg-[#100722]">
            <div className="h-full bg-[#ffd166] transition-all duration-200" style={{ width: `${pct}%` }} />
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
          <div className="mb-1.5 flex justify-between font-pixel text-[8px] leading-none text-[#ffd166]">
            <span>{pct}%</span>
            <span>{cur}/{max} SETS</span>
          </div>
          <div className="h-2 w-full overflow-hidden border border-[#59427e] bg-[#100722]">
            <div className="h-full bg-[#ffd166] transition-all duration-200" style={{ width: `${pct}%` }} />
          </div>
        </div>
      );
    }
    if (skin.unlock.type === 'moon') {
      return (
        <div className="flex h-[20px] sm:h-[22px] w-full items-center justify-center border border-[#ff4d6d]/40 bg-[#25050f] px-1 text-center font-pixel text-[8px] text-[#ff4d6d]">
          {skin.unlock.desc}
        </div>
      );
    }
    if (skin.unlock.type === 'konami') {
      return (
        <div className="flex h-[20px] sm:h-[22px] w-full items-center justify-center border border-[#c98cff]/40 bg-[#1c0830] px-1 text-center font-pixel text-[8px] text-[#c98cff]">
          {skin.unlock.desc}
        </div>
      );
    }
    if (skin.unlock.type === 'save') {
      return (
        <div className="flex h-[20px] sm:h-[22px] w-full items-center justify-center border border-[#ffd166]/40 bg-[#2b2005] px-1 text-center font-pixel text-[8px] text-[#ffd166]">
          {skin.unlock.desc}
        </div>
      );
    }
    if (skin.unlock.type === 'holiday') {
      const active = isSkinAvailable(skin);
      return (
        <div
          title={skin.unlock.desc}
          className={`flex min-h-[20px] w-full items-center justify-center border px-1 py-1 text-center font-pixel text-[8px] leading-tight ${
          active
            ? 'border-[#ff70a6]/60 bg-[#33081e] text-[#ff70a6]'
            : 'border-[#453c60] bg-[#1c162e] text-[#9d8fd6]'
        }`}
        >
          {active ? 'EVENT LIVE' : 'LIMITED EVENT'}
        </div>
      );
    }
    if (skin.unlock.type === 'discord') {
      return (
        <div className={`flex h-[20px] sm:h-[22px] w-full items-center justify-center border px-1 text-center font-pixel text-[8px] ${
          discordClaimed
            ? 'border-[#3ef2c8]/60 bg-[#092922] text-[#3ef2c8]'
            : 'border-[#5865f2]/60 bg-[#151942] text-[#9da9ff]'
        }`}>
          {discordClaimed ? 'REWARD CLAIMED' : 'JOIN THE DISCORD'}
        </div>
      );
    }
    return null;
  };

  return (
    <div
      className={
        touch
          ? 'fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#0d0619] p-3 text-white pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] tablet:items-center tablet:justify-center tablet:bg-[#08040f]/80 tablet:p-4'
          : 'fixed inset-0 z-50 flex items-center justify-center bg-[#08040f]/80 p-3'
      }
    >
      <div
        className={
          touch
            ? 'flex h-full min-h-0 w-full flex-col bg-[#0e071e] p-0 text-white tablet:h-auto tablet:max-h-[92vh] tablet:max-w-[780px] tablet:border-2 tablet:border-[#3ef2c8] tablet:p-4 tablet:shadow-[4px_4px_0_#06020c]'
            : 'flex max-h-[94vh] w-full max-w-[840px] flex-col border-2 border-[#3ef2c8] bg-[#0e071e] p-4 text-white shadow-[4px_4px_0_#06020c] tablet:max-w-[min(840px,calc(100vw-32px))]'
        }
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2 border-b-2 border-[#251842] pb-2 sm:pb-2.5">
          <div className="flex min-w-0 flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:gap-3">
            <h2 className="font-pixel text-[12px] text-[#3ef2c8] whitespace-nowrap md:text-[16px]">
              CHARACTER LOCKER
            </h2>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="flex shrink-0 items-center gap-1.5 border-2 border-[#3ef2c8]/60 bg-[#092922] px-2 py-0.5 font-pixel text-[8px] text-[#3ef2c8] shadow-[2px_2px_0_#08040f] whitespace-nowrap md:text-[10px]">
                <GemIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                <span>GEMS: {stats.gems}</span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 border-2 border-[#ffd166]/60 bg-[#2b2005] px-2 py-0.5 font-pixel text-[8px] text-[#ffd166] shadow-[2px_2px_0_#08040f] whitespace-nowrap md:text-[10px]">
                <span>UNLOCKED: {unlockedSkins.length}/{SKIN_LIST.length}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center border-2 border-[#ff4d6d] bg-[#ff4d6d]/20 font-pixel text-[10px] text-[#ff4d6d] shadow-[1px_1px_0_#08040f] hover:bg-[#ff4d6d]/40 active:translate-x-[1px] active:translate-y-[1px]"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        {/* Tier Tabs (Colored when selected, rarity hover on unselected, no individual counts) */}
        <div className="mt-2.5 flex flex-wrap gap-1.5 border-b-2 border-[#251842] pb-2.5">
          {TIERS.map((tier, idx) => {
            const active = selectedTier === tier;
            const theme = TIER_COLORS[tier];
            const isHovered = hoveredTier === tier && !active;
            const isTabFocused = focusSection === 'tabs' && selectedTierIndex === idx;

            return (
              <button
                key={tier}
                type="button"
                onClick={() => {
                  setSelectedTierIndex(idx);
                  setFocusSection('tabs');
                  setFocusedIndex(0);
                }}
                onMouseEnter={() => setHoveredTier(tier)}
                onMouseLeave={() => setHoveredTier(null)}
                style={{
                  color: active ? '#0b0616' : isHovered ? theme.text : '#9d8fd6',
                  backgroundColor: active ? theme.text : isHovered ? theme.bg : '#140a26',
                  borderColor: active ? theme.text : isHovered ? theme.border : '#251842',
                }}
                className={`cursor-pointer border-2 px-3 py-1 font-pixel text-[8px] uppercase tracking-wider shadow-[2px_2px_0_#08040f] transition-[color,background-color,border-color,transform] duration-75 hover:-translate-y-[1px] active:translate-x-[1px] active:translate-y-[1px] ${
                  isTabFocused ? 'nav-focus' : ''
                }`}
              >
                {tier}
              </button>
            );
          })}
        </div>

        {/* Content Area */}
        {/* Content Area */}
        <div
          className={
            touch
              ? 'mt-3 flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden tablet:grid tablet:grid-cols-[220px_1fr] tablet:gap-4'
              : 'mt-3 flex flex-col md:grid md:grid-cols-[230px_1fr] md:items-start gap-3 md:gap-4 overflow-hidden'
          }
        >
          {/* Left / Top: Stage Preview (h-fit, does not stretch to bottom) */}
          <div className="flex shrink-0 flex-row md:flex-col items-center justify-between md:justify-start gap-2.5 md:gap-0 self-stretch md:self-start border-2 border-[#251842] bg-[#120722] p-2.5 md:p-3.5 shadow-[2px_2px_0_#08040f]">
            <div className="flex items-center gap-2.5 md:flex-col md:gap-0">
              <div className="relative flex items-center justify-center border-2 border-[#38225c] bg-[#1a0e2e] p-1.5 md:p-2.5">
                <canvas ref={previewCanvasRef} width={96} height={96} style={{ imageRendering: 'pixelated' }} className="h-20 w-20 md:h-24 md:w-24 block [image-rendering:pixelated]" />
              </div>
              <div className="text-left md:mt-2.5 md:text-center">
                <div className="font-pixel text-[12px] text-white md:text-[16px]">{selectedSkin.name}</div>
                <span
                  className="mt-0.5 md:mt-1 inline-block border px-1.5 md:px-2 py-0.5 font-pixel text-[8px] uppercase"
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
                <div className="flex h-[32px] md:h-[36px] w-full items-center justify-center border-2 border-[#3ef2c8] bg-[#3ef2c8]/20 px-2 font-pixel text-[10px] text-[#3ef2c8] shadow-[2px_2px_0_#08040f]">
                  EQUIPPED
                </div>
              ) : isUnlocked ? (
                <button
                  type="button"
                  onClick={() => handleEquip(selectedSkinId)}
                  className="flex h-[32px] md:h-[36px] w-full items-center justify-center border-2 border-[#08040f] bg-[#3ef2c8] px-2 font-pixel text-[10px] text-[#0b0616] shadow-[3px_3px_0_#08040f] transition-all hover:bg-[#7ef7ff] active:translate-x-[2px] active:translate-y-[2px]"
                >
                  EQUIP
                </button>
              ) : selectedSkin.id === 'question' ? (
                <button
                  type="button"
                  onClick={() => inputManager.triggerKonami()}
                  className="flex h-[32px] md:h-[36px] w-full items-center justify-center border-2 border-[#ffd166] bg-[#ffd166]/20 px-2 font-pixel text-[8px] text-[#ffd166] shadow-[2px_2px_0_#08040f] hover:bg-[#ffd166]/40 active:translate-x-[1px] active:translate-y-[1px]"
                >
                  ???????
                </button>
              ) : selectedSkin.unlock.type === 'holiday' ? (
                <div
                  title={selectedSkin.unlock.desc}
                  className="flex min-h-[32px] md:min-h-[36px] w-full items-center justify-center border-2 border-[#453c60] bg-[#140a26] px-2 py-1 text-center font-pixel text-[8px] leading-tight text-[#9d8fd6] shadow-[2px_2px_0_#08040f]"
                >
                  {isSkinAvailable(selectedSkin) ? 'EVENT LIVE' : 'LIMITED EVENT'}
                </div>
              ) : selectedSkin.unlock.type === 'discord' ? (
                <button
                  type="button"
                  onClick={handleDiscordClaim}
                  disabled={discordClaimed}
                  className={`flex h-[32px] md:h-[36px] w-full items-center justify-center border-2 px-2 font-pixel text-[8px] shadow-[3px_3px_0_#08040f] transition-all active:translate-x-[2px] active:translate-y-[2px] ${
                    discordClaimed
                      ? 'cursor-not-allowed border-[#3ef2c8]/60 bg-[#092922] text-[#3ef2c8]'
                      : 'border-[#08040f] bg-[#5865f2] text-white hover:bg-[#7289da]'
                  }`}
                >
                  {discordClaimed ? 'REWARD CLAIMED' : 'JOIN THE DISCORD'}
                </button>
              ) : selectedSkin.unlock.type === 'gems' ? (
                <button
                  type="button"
                  disabled={stats.gems < (selectedSkin.unlock.cost || 0)}
                  onClick={() => handleBuy(selectedSkin)}
                  className={`flex h-[32px] md:h-[36px] w-full items-center justify-center border-2 px-2 font-pixel text-[8px] md:text-[10px] shadow-[3px_3px_0_#08040f] transition-all active:translate-x-[2px] active:translate-y-[2px] ${
                    stats.gems >= (selectedSkin.unlock.cost || 0)
                      ? 'border-[#08040f] bg-[#ffd166] text-[#120820] hover:bg-[#ffe9a0]'
                      : 'cursor-not-allowed border-[#38225c] bg-[#160a2c] text-[#9d8fd6]'
                  }`}
                >
                  BUY ({selectedSkin.unlock.cost} GEMS)
                </button>
              ) : (
                <div className="flex h-[32px] md:h-[36px] w-full items-center justify-center border-2 border-[#38225c] bg-[#140a26] px-2 text-center font-pixel text-[8px] text-[#9d8fd6] shadow-[2px_2px_0_#08040f]">
                  {selectedSkin.unlock.desc}
                </div>
              )}
            </div>
          </div>

          {/* Right: Grid of Skin Cards (3 columns on wide PC, 2 on narrow PC / mobile) */}
          <div
            className={
              touch
                ? 'grid min-h-0 min-w-0 flex-1 grid-cols-2 gap-2 overflow-y-auto p-1 pb-4 tablet:max-h-[580px] tablet:grid-cols-3'
                : 'grid max-h-[340px] sm:max-h-[380px] md:max-h-[420px] grid-cols-2 md:grid-cols-3 gap-2 overflow-y-auto p-1'
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
                    if (unlocked && !equipped) {
                      handleEquip(skin.id);
                    }
                  }}
                  className={`flex h-[104px] w-full flex-col justify-between border-2 p-3 text-left transition-all sm:h-[112px] ${
                    selected || isCardFocused
                      ? 'border-[#3ef2c8] bg-[#221038] shadow-[2px_2px_0_#3ef2c8]'
                      : 'border-[#2a1b49] bg-[#140a26] shadow-[2px_2px_0_#08040f] hover:border-[#4f3680]'
                  } ${isCardFocused ? 'nav-focus' : ''}`}
                >
                  <div className="w-full">
                    <div className="flex w-full items-center justify-between leading-none">
                      <span className="truncate font-pixel text-[8px] text-white sm:text-[10px]">{skin.name}</span>
                      <span
                        className="inline-flex min-h-[14px] items-center justify-center border px-1 font-pixel text-[8px] leading-none uppercase whitespace-nowrap sm:min-h-[16px]"
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
                      <span className="font-pixel text-[8px] text-[#3ef2c8]">EQUIPPED</span>
                    ) : unlocked ? (
                      <span className="font-pixel text-[8px] text-[#9d8fd6]">UNLOCKED</span>
                    ) : skin.unlock.type === 'gems' ? (
                      <span className="font-pixel text-[8px] text-[#ffd166]">{skin.unlock.cost} GEMS</span>
                    ) : (
                      renderCardProgressBar(skin)
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer with Controls */}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 border-t-2 border-[#251842] pt-1.5 text-center font-pixel text-[8px] text-[#9d8fd6]">
          {touch ? (
            <>
              <span>TAP: SELECT | DOUBLE TAP: EQUIP | SWIPE: BROWSE |</span>
              <button
                type="button"
                onClick={() => inputManager.triggerKonami()}
                className="inline-flex cursor-pointer items-center gap-[1px] text-[#453c60] transition-colors hover:text-[#453c60] active:translate-y-[1px]"
                title="???"
              >
                <PixelArrow dir="up" />
                <PixelArrow dir="up" />
                <PixelArrow dir="down" />
                <PixelArrow dir="down" />
                <PixelArrow dir="left" />
                <PixelArrow dir="right" />
                <PixelArrow dir="left" />
                <PixelArrow dir="right" />
                <span className="ml-[1px]">???????</span>
              </button>
            </>
          ) : (
            <>
              <span>ARROWS / D-PAD: SELECT | ENTER / A / X: EQUIP | ESC / B / O: CLOSE |</span>
              <button
                type="button"
                onClick={() => inputManager.triggerKonami()}
                className="inline-flex cursor-pointer items-center gap-[1px] text-[#453c60] transition-colors hover:text-[#453c60] active:translate-y-[1px]"
                title="???"
              >
                <PixelArrow dir="up" />
                <PixelArrow dir="up" />
                <PixelArrow dir="down" />
                <PixelArrow dir="down" />
                <PixelArrow dir="left" />
                <PixelArrow dir="right" />
                <PixelArrow dir="left" />
                <PixelArrow dir="right" />
                <span className="ml-[1px]">???????</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
