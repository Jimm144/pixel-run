import { useEffect, useRef, useState } from 'react';
import type { MatchResult } from '../game/multiplayer/types';
import { SKINS, type SkinId } from '../game/skins';
import { drawPlayerSprite } from '../game/playerSprite';
import { PixelButton } from './ui';

/* RULE: NEVER USE BLUR OR BACKDROP-BLUR ANYWHERE IN THE CODEBASE (PERF & RETRO PIXEL INTEGRITY) */

// Online battles are NOT finished and are intentionally absent from the UI.
// This modal is local (2-4 players on one device) only.

const LOCAL_CFG_KEY = 'pixeldash.local_battle_config.v1';
const CONTROL_OPTIONS = ['wasd', 'arrows', 'ijkl', 'numpad', 'gp0', 'gp1', 'gp2', 'gp3'] as const;

interface LocalBattleConfig {
  names: string[];
  controls: string[];
  skins: SkinId[];
  count: 2 | 3 | 4;
}

function loadLocalConfig(): LocalBattleConfig | null {
  try {
    const raw = localStorage.getItem(LOCAL_CFG_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<LocalBattleConfig>;
    if (!p || !Array.isArray(p.names) || !Array.isArray(p.controls) || !Array.isArray(p.skins)) return null;

    const names = p.names.slice(0, 4).map((n, i) => (typeof n === 'string' && n.trim() ? n.trim() : `PLAYER ${i + 1}`));
    const controls = p.controls
      .slice(0, 4)
      .filter((c): c is string => typeof c === 'string' && (CONTROL_OPTIONS as readonly string[]).includes(c));
    const skins = p.skins
      .slice(0, 4)
      .filter((s): s is SkinId => typeof s === 'string' && s in SKINS);
    if (names.length < 2 || controls.length < 2 || skins.length < 2) return null;

    // The engine maps a control scheme -> player by indexOf, so every scheme
    // must stay unique or the first player silently hijacks a duplicate.
    const seen = new Set<string>();
    const uniqueControls: string[] = [];
    for (const c of controls) {
      if (!seen.has(c)) {
        seen.add(c);
        uniqueControls.push(c);
      }
    }
    for (const fallback of CONTROL_OPTIONS) {
      if (uniqueControls.length >= 4) break;
      if (!seen.has(fallback)) {
        seen.add(fallback);
        uniqueControls.push(fallback);
      }
    }
    while (uniqueControls.length < 4) uniqueControls.push('wasd');
    while (names.length < 4) names.push(`PLAYER ${names.length + 1}`);
    while (skins.length < 4) skins.push('bob');

    return {
      names,
      controls: uniqueControls,
      skins,
      count: p.count === 3 || p.count === 4 ? p.count : 2,
    };
  } catch {
    return null;
  }
}

function saveLocalConfig(cfg: LocalBattleConfig): void {
  try {
    localStorage.setItem(LOCAL_CFG_KEY, JSON.stringify(cfg));
  } catch {}
}

interface BattleModalProps {
  onClose: () => void;
  onStartLocalBattle: (skins: SkinId[], names?: string[], controls?: string[]) => void;
  localSkin: SkinId;
  unlockedSkins: SkinId[];
  matchResult: MatchResult | null;
  onClearMatchResult: () => void;
}

export function BattleModal({
  onClose,
  onStartLocalBattle,
  localSkin,
  unlockedSkins,
  matchResult,
  onClearMatchResult,
}: BattleModalProps) {
  // Local Battle 2-4 Players — persisted across matches and sessions
  const savedCfg = useRef<LocalBattleConfig | null>(loadLocalConfig()).current;
  const [playerCount, setPlayerCount] = useState<2 | 3 | 4>(savedCfg?.count ?? 2);
  const [playerNames, setPlayerNames] = useState<string[]>(savedCfg?.names ?? [
    'PLAYER 1',
    'PLAYER 2',
    'PLAYER 3',
    'PLAYER 4',
  ]);
  const [playerControlSchemes, setPlayerControlSchemes] = useState<string[]>(savedCfg?.controls ?? [
    'wasd',
    'arrows',
    'ijkl',
    'numpad',
  ]);
  const [localSkins, setLocalSkins] = useState<SkinId[]>(savedCfg?.skins ?? [
    localSkin,
    unlockedSkins.includes('rob') ? 'rob' : 'bob',
    unlockedSkins.includes('panda') ? 'panda' : 'bob',
    unlockedSkins.includes('gladiator') ? 'gladiator' : 'bob',
  ]);

  // Persist the local battle setup on every edit so a rematch (or a fresh
  // visit) never resets names / control schemes back to defaults.
  useEffect(() => {
    saveLocalConfig({ names: playerNames, controls: playerControlSchemes, skins: localSkins, count: playerCount });
  }, [playerNames, playerControlSchemes, localSkins, playerCount]);

  const pCanvasesRef = useRef<(HTMLCanvasElement | null)[]>([null, null, null, null]);

  // Render animated sprite previews in the local battle setup
  useEffect(() => {
    let animId = 0;
    let frame = 0;
    const render = () => {
      frame++;
      for (let i = 0; i < playerCount; i++) {
        const cv = pCanvasesRef.current[i];
        if (cv) {
          const ctx = cv.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, 60, 60);
            ctx.imageSmoothingEnabled = false;
            drawPlayerSprite(ctx, 30, 30, {
              skinId: localSkins[i] || 'bob',
              frame,
              scale: 2.2,
              onGround: true,
              run: Math.floor(frame / 6) % 4,
            });
          }
        }
      }
      animId = requestAnimationFrame(render);
    };
    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [localSkins, playerCount]);

  const handleStartLocal = () => {
    onClose();
    const activeSkins = localSkins.slice(0, playerCount);
    const activeNames = playerNames.slice(0, playerCount);
    const activeControls = playerControlSchemes.slice(0, playerCount);
    onStartLocalBattle(activeSkins, activeNames, activeControls);
  };

  const handleRematch = () => {
    onClearMatchResult();
    const activeSkins = localSkins.slice(0, playerCount);
    const activeNames = playerNames.slice(0, playerCount);
    const activeControls = playerControlSchemes.slice(0, playerCount);
    onStartLocalBattle(activeSkins, activeNames, activeControls);
  };

  const handleExit = () => {
    onClearMatchResult();
    onClose();
  };

  const playerColors = ['#3ef2c8', '#ffd166', '#ff70a6', '#7ef7ff'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#08040f]/80 p-3 sm:p-4 font-pixel">
      <div className="relative flex max-h-[92dvh] w-full max-w-[680px] flex-col items-center border-2 border-[#3ef2c8] bg-[#0e071e] p-4 sm:p-6 text-[#ffffff] shadow-[4px_4px_0_#06020c]">
        {/* Top Header */}
        <div className="flex w-full items-center justify-between border-b-2 border-[#251842] pb-2 mb-3">
          <h2 className="font-pixel text-[12px] uppercase tracking-wider text-[#3ef2c8]">
            {matchResult ? 'MATCH RESULTS' : 'LOCAL BATTLE'}
          </h2>
          <button
            type="button"
            onClick={handleExit}
            aria-label="Close"
            className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center border-2 border-[#ff4d6d] bg-[#ff4d6d]/20 font-pixel text-[10px] text-[#ff4d6d] shadow-[1px_1px_0_#08040f] hover:bg-[#ff4d6d]/40 active:translate-x-[1px] active:translate-y-[1px]"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        {/* 1. MATCH RESULTS OVERLAY */}
        {matchResult ? (
          <div className="flex w-full flex-col items-center py-3 text-center">
            <h3
              className={`text-[12px] ${
                matchResult.isWinner ? 'text-[#ffd166]' : 'text-[#ff4d6d]'
              }`}
            >
              {matchResult.isWinner ? 'VICTORY - 1ST PLACE' : `${matchResult.rank}TH PLACE`}
            </h3>
            <p className="mt-2 max-w-full break-words text-[20px] leading-tight text-[#ffd166] drop-shadow-[0_3px_0_#08040f] sm:text-[28px]">
              {matchResult.winnerName.toUpperCase()}
            </p>
            <p className="mt-1.5 text-[10px] text-[#9d8fd6]">
              WINS THE BATTLE!
            </p>

            {/* Leaderboard Table */}
            <div className="my-3 flex w-full max-w-md flex-col gap-1 border border-[#2c1f4d] bg-[#080312] p-2.5">
              <div className="grid grid-cols-5 text-[8px] text-[#9d8fd6] pb-1 border-b border-[#2c1f4d]">
                <span>RANK</span>
                <span className="col-span-2 text-left">PLAYER</span>
                <span>SCORE</span>
                <span>METERS</span>
              </div>
              {matchResult.leaderboard.map((entry) => (
                <div
                  key={entry.peerId}
                  className={`grid grid-cols-5 items-center py-1.5 text-[10px] ${
                    entry.isLocal
                      ? 'bg-[#3ef2c8]/10 border border-[#3ef2c8]/40 text-[#3ef2c8]'
                      : 'text-[#ffffff]'
                  }`}
                >
                  <span>
                    {entry.rank === 1 ? '1ST' : entry.rank === 2 ? '2ND' : entry.rank === 3 ? '3RD' : `#${entry.rank}`}
                  </span>
                  <span className="col-span-2 truncate text-left">
                    {entry.name}
                  </span>
                  <span className="text-[#ffd166]">{entry.score}</span>
                  <span>{entry.meters}M</span>
                </div>
              ))}
            </div>

            <div className="mt-3 flex w-full max-w-xs gap-3">
              <PixelButton
                variant="primary"
                onClick={handleRematch}
                className="flex-1 !bg-[#3ef2c8] !text-[#08040f] hover:!bg-[#6ef5d6]"
              >
                REMATCH
              </PixelButton>
              <PixelButton variant="ghost" onClick={handleExit} className="flex-1">
                MENU
              </PixelButton>
            </div>
          </div>
        ) : (
          /* 2. LOCAL BATTLE SETUP */
          <div className="flex w-full flex-col items-center overflow-y-auto py-1.5">
            {/* Player count buttons */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[8px] text-[#9d8fd6]">PLAYERS:</span>
              {([2, 3, 4] as const).map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => setPlayerCount(cnt)}
                  className={`min-h-[32px] px-3 py-1 text-[8px] border-2 transition-colors ${
                    playerCount === cnt
                      ? 'border-[#ffd166] bg-[#ffd166] text-[#08040f]'
                      : 'border-[#2c1f4d] bg-[#0c081e] text-[#9d8fd6] hover:text-[#ffffff]'
                  }`}
                >
                  {cnt} PLAYERS
                </button>
              ))}
            </div>

            {/* Player Config Grid */}
            <div className={`grid w-full gap-3 ${
              playerCount === 2
                ? 'grid-cols-2 max-w-md'
                : playerCount === 3
                ? 'grid-cols-1 sm:grid-cols-3 max-w-2xl'
                : 'grid-cols-2 sm:grid-cols-4 max-w-3xl'
            }`}>
              {Array.from({ length: playerCount }).map((_, idx) => {
                const col = playerColors[idx];
                return (
                  <div
                    key={`local-p-${idx}`}
                    className="flex flex-col items-center border-2 p-3 justify-between bg-[#0a0518] shadow-[2px_2px_0_#08040f]"
                    style={{ borderColor: col }}
                  >
                    <canvas
                      ref={(el) => {
                        pCanvasesRef.current[idx] = el;
                      }}
                      width={60}
                      height={60}
                      className="w-12 h-12 pixelated"
                    />

                    {/* Player Name Input */}
                    <input
                      type="text"
                      value={playerNames[idx]}
                      onChange={(e) => {
                        const next = [...playerNames];
                        next[idx] = e.target.value.toUpperCase();
                        setPlayerNames(next);
                      }}
                      maxLength={10}
                      className="mt-2 w-full border bg-[#080312] text-center text-[10px] py-1.5 uppercase focus:outline-none"
                      style={{ borderColor: col, color: col }}
                    />

                    {/* Skin Selector */}
                    <div className="w-full mt-2 flex flex-col items-start">
                      <span className="text-[8px] text-[#9d8fd6] uppercase mb-0.5">SKIN:</span>
                      <select
                        value={localSkins[idx] || 'bob'}
                        onChange={(e) => {
                          const next = [...localSkins];
                          next[idx] = e.target.value as SkinId;
                          setLocalSkins(next);
                        }}
                        className="w-full min-h-[40px] border bg-[#080312] text-[10px] px-2 py-1.5 focus:outline-none cursor-pointer"
                        style={{ borderColor: `${col}80`, color: col }}
                      >
                        {unlockedSkins.map((id) => (
                          <option key={id} value={id}>
                            {SKINS[id]?.name || id}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Controls Selector */}
                    <div className="w-full mt-2 flex flex-col items-start">
                      <span className="text-[8px] text-[#9d8fd6] uppercase mb-0.5">CONTROLS:</span>
                      <select
                        value={playerControlSchemes[idx]}
                        onChange={(e) => {
                          const chosen = e.target.value;
                          const next = [...playerControlSchemes];
                          // Exchange instead of allowing two players on the
                          // same scheme — the engine maps scheme -> player by
                          // indexOf, so a duplicate would hijack the first.
                          const dupIdx = next.indexOf(chosen);
                          if (dupIdx !== -1 && dupIdx !== idx) {
                            next[dupIdx] = playerControlSchemes[idx];
                          }
                          next[idx] = chosen;
                          setPlayerControlSchemes(next);
                        }}
                        className="w-full min-h-[40px] border bg-[#080312] text-[10px] px-2 py-1.5 focus:outline-none cursor-pointer"
                        style={{ borderColor: `${col}80`, color: '#ffffff' }}
                      >
                        <option value="wasd">WASD</option>
                        <option value="arrows">ARROWS</option>
                        <option value="ijkl">IJKL</option>
                        <option value="numpad">NUMPAD</option>
                        <option value="gp0">CONTROLLER 1</option>
                        <option value="gp1">CONTROLLER 2</option>
                        <option value="gp2">CONTROLLER 3</option>
                        <option value="gp3">CONTROLLER 4</option>
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Start Button */}
            <div className="mt-4 flex w-full max-w-sm justify-center">
              <button
                type="button"
                onClick={handleStartLocal}
                className="w-full border-2 border-[#ffd166] bg-[#ffd166] min-h-[44px] px-6 py-2.5 text-[10px] text-[#120726] transition-colors hover:bg-[#ffe082] active:translate-x-[1px] active:translate-y-[1px] shadow-[2px_2px_0_#08040f]"
              >
                START RUN
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}