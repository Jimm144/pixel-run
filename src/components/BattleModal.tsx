import { useEffect, useRef, useState, useCallback } from 'react';
import { p2p, MAX_PLAYERS } from '../game/multiplayer/p2pManager';
import type { MatchResult, OpponentInfo, PublicLobbyInfo } from '../game/multiplayer/types';
import { type SkinId } from '../game/skins';
import { drawPlayerSprite } from '../game/playerSprite';
import { PixelButton } from './ui';
import { sfx } from '../game/audio';

interface BattleModalProps {
  onClose: () => void;
  onStartBattle: (seed: number) => void;
  localName: string;
  localSkin: SkinId;
  matchResult: MatchResult | null;
  onClearMatchResult: () => void;
  touch?: boolean;
}

export function BattleModal({
  onClose,
  onStartBattle,
  localName,
  localSkin,
  matchResult,
  onClearMatchResult,
  touch = false,
}: BattleModalProps) {
  const [tab, setTab] = useState<'host' | 'join'>('host');
  const [joinSubTab, setJoinSubTab] = useState<'code' | 'public'>('code');
  const [roomCode, setRoomCode] = useState<string>('');
  const [inputCode, setInputCode] = useState<string>('');
  const [isPublicRoom, setIsPublicRoom] = useState<boolean>(false);
  const [opponents, setOpponents] = useState<OpponentInfo[]>(() => Array.from(p2p.opponents.values()));
  const [publicLobbies, setPublicLobbies] = useState<PublicLobbyInfo[]>([]);
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  const localCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const oppCanvasesRef = useRef<Map<string, HTMLCanvasElement>>(new Map());

  // Initialize Host Room (Private by default)
  const initHost = useCallback(async (isPub = false) => {
    const code = await p2p.host(localName, localSkin, isPub);
    setRoomCode(code);
    setStatusMsg(`ROOM ${code} READY`);
  }, [localName, localSkin]);

  useEffect(() => {
    if (!matchResult && tab === 'host' && !roomCode) {
      initHost(isPublicRoom);
    }
  }, [tab, roomCode, matchResult, initHost, isPublicRoom]);

  // Browse public lobbies when in public tab
  useEffect(() => {
    if (tab === 'join' && joinSubTab === 'public') {
      p2p.startBrowsingPublicLobbies();
      p2p.onPublicLobbiesUpdate = (lobbies) => {
        setPublicLobbies([...lobbies]);
      };
      return () => {
        p2p.stopBrowsingPublicLobbies();
        p2p.onPublicLobbiesUpdate = null;
      };
    }
  }, [tab, joinSubTab]);

  // Auto-join from URL hash (#battle=CODE)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash.startsWith('#battle=')) {
      const codeFromUrl = window.location.hash.replace('#battle=', '').trim();
      if (codeFromUrl) {
        setTab('join');
        setJoinSubTab('code');
        setInputCode(codeFromUrl);
        handleJoinCode(codeFromUrl);
      }
    }
  }, []);

  // Listen to P2P manager events
  useEffect(() => {
    p2p.onOpponentsUpdate = (opps) => {
      setOpponents([...opps]);
      if (opps.length > 0) {
        sfx.play('gem');
        setStatusMsg(`${opps.length + 1}/${MAX_PLAYERS} PLAYERS IN LOBBY`);
      } else {
        setStatusMsg('WAITING FOR PLAYERS...');
      }
    };

    p2p.onCountdown = (sec) => {
      setCountdown(sec);
      if (sec > 0) sfx.play('jump');
      else sfx.play('superPad');
    };

    p2p.onMatchStart = (seed) => {
      onStartBattle(seed);
    };

    p2p.onError = (err) => {
      setStatusMsg(err);
      sfx.play('death');
    };

    return () => {
      p2p.onOpponentsUpdate = null;
      p2p.onCountdown = null;
      p2p.onMatchStart = null;
      p2p.onError = null;
    };
  }, [onStartBattle]);

  // Render animated sprite previews in lobby
  useEffect(() => {
    let animId = 0;
    let frame = 0;
    const render = () => {
      frame++;
      if (localCanvasRef.current) {
        const ctx = localCanvasRef.current.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, 60, 60);
          ctx.imageSmoothingEnabled = false;
          drawPlayerSprite(ctx, 30, 30, {
            skinId: localSkin,
            frame,
            scale: 2.2,
            onGround: true,
            run: Math.floor(frame / 6) % 4,
          });
        }
      }
      opponents.forEach((opp) => {
        const cv = oppCanvasesRef.current.get(opp.peerId);
        if (cv) {
          const ctx = cv.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, 60, 60);
            ctx.imageSmoothingEnabled = false;
            drawPlayerSprite(ctx, 30, 30, {
              skinId: opp.skinId,
              frame,
              scale: 2.2,
              onGround: true,
              run: Math.floor(frame / 6) % 4,
            });
          }
        }
      });
      animId = requestAnimationFrame(render);
    };
    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [localSkin, opponents]);

  const handleTogglePrivacy = () => {
    const next = !isPublicRoom;
    setIsPublicRoom(next);
    p2p.setRoomVisibility(next);
  };

  const handleJoinCode = async (codeToJoin?: string) => {
    const code = codeToJoin || inputCode;
    if (!code) {
      setStatusMsg('ENTER ROOM CODE');
      return;
    }
    setStatusMsg(`CONNECTING TO ${code.toUpperCase()}...`);
    const ok = await p2p.join(code, localName, localSkin);
    if (ok) {
      setRoomCode(code.toUpperCase());
    }
  };

  const handleCopyLink = async () => {
    const code = roomCode || p2p.roomId;
    if (!code) return;
    const base = window.location.origin + window.location.pathname;
    const url = `${base}#battle=${code}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      }
      setCopied(true);
      sfx.play('ui');
      setTimeout(() => setCopied(false), 2200);
    } catch {}
  };

  const handleStartRun = () => {
    if (opponents.length === 0) {
      setStatusMsg('AT LEAST 2 PLAYERS REQUIRED');
      sfx.play('death');
      return;
    }
    sfx.play('start');
    p2p.startMatch();
  };

  const handleRematch = () => {
    onClearMatchResult();
    p2p.requestRematch();
  };

  const handleExit = () => {
    p2p.leave();
    onClearMatchResult();
    onClose();
  };

  const totalPlayers = opponents.length + 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#000000]/80 p-3 font-pixel">
      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col items-center border-2 border-[#ff4d6d]/70 bg-[#0e061a] p-4 text-[#ffffff] shadow-[4px_4px_0_#06020c]">
        {/* Top Header */}
        <div className="flex w-full items-center justify-between border-b border-[#ff4d6d]/30 pb-2.5">
          <h2 className="text-xs font-bold tracking-wider text-[#ff4d6d] tablet:text-sm">
            PARTY BATTLES (2-5 PLAYERS)
          </h2>
          <button
            type="button"
            onClick={handleExit}
            aria-label="Close Battles"
            className="flex h-6 w-6 items-center justify-center border border-[#ff4d6d]/40 bg-[#ff4d6d]/10 text-[9px] text-[#ff4d6d] transition-colors hover:bg-[#ff4d6d]/30"
          >
            ✕
          </button>
        </div>

        {/* 1. MATCH RESULTS OVERLAY */}
        {matchResult ? (
          <div className="flex w-full flex-col items-center py-4 text-center">
            <h3
              className={`text-sm font-bold tablet:text-base ${
                matchResult.localRank === 1 ? 'text-[#ffd166]' : 'text-[#ff4d6d]'
              }`}
            >
              {matchResult.localRank === 1 ? 'VICTORY - 1ST PLACE' : `${matchResult.localRank}TH PLACE`}
            </h3>
            <p className="mt-1 text-[8px] text-[#a090c0]">
              {matchResult.reason === 'forfeit' ? 'OPPONENT FORFEITED' : 'RUN COMPLETE'}
            </p>

            {/* Leaderboard Table */}
            <div className="my-3 flex w-full max-w-sm flex-col gap-1 border border-[#ff4d6d]/30 bg-[#080312] p-2">
              <div className="grid grid-cols-5 text-[7px] text-[#a090c0] pb-1 border-b border-[#ff4d6d]/20">
                <span>RANK</span>
                <span className="col-span-2 text-left">PLAYER</span>
                <span>SCORE</span>
                <span>METERS</span>
              </div>
              {matchResult.rankings.map((entry) => (
                <div
                  key={entry.peerId}
                  className={`grid grid-cols-5 items-center py-1 text-[8px] ${
                    entry.isLocal
                      ? 'bg-[#3ef2c8]/10 border border-[#3ef2c8]/40 font-bold text-[#3ef2c8]'
                      : 'text-[#ffffff]'
                  }`}
                >
                  <span className="font-bold">
                    {entry.rank === 1 ? '1ST' : entry.rank === 2 ? '2ND' : entry.rank === 3 ? '3RD' : `#${entry.rank}`}
                  </span>
                  <span className="col-span-2 truncate text-left">{entry.name}</span>
                  <span className="text-[#ffd166]">{entry.score}</span>
                  <span>{entry.meters}M</span>
                </div>
              ))}
            </div>

            <div className="mt-2 flex w-full max-w-xs gap-3">
              <PixelButton
                variant="primary"
                onClick={handleRematch}
                className="flex-1 !bg-[#ff4d6d] !text-[#100424] hover:!bg-[#ff708a]"
              >
                REMATCH
              </PixelButton>
              <PixelButton variant="secondary" onClick={handleExit} className="flex-1">
                MENU
              </PixelButton>
            </div>
          </div>
        ) : countdown !== null ? (
          /* 2. SYNCHRONIZED COUNTDOWN OVERLAY */
          <div className="flex flex-col items-center justify-center py-10">
            <span className="text-[9px] text-[#7ef7ff] tracking-widest uppercase">
              STARTING IN
            </span>
            <div className="my-3 text-5xl font-black text-[#ffd166]">
              {countdown === 0 ? 'GO' : countdown}
            </div>
            <span className="text-[7px] text-[#a090c0]">PREPARE TO RUN</span>
          </div>
        ) : (
          /* 3. LOBBY & HOST/JOIN TABS */
          <div className="flex w-full flex-col items-center overflow-y-auto py-2.5">
            {/* Primary Mode Tabs */}
            <div className="mb-3 flex w-full max-w-xs border border-[#ff4d6d]/40 bg-[#080312]">
              <button
                type="button"
                onClick={() => {
                  setTab('host');
                  if (!roomCode) initHost(isPublicRoom);
                }}
                className={`flex-1 py-1.5 text-[8px] transition-colors ${
                  tab === 'host'
                    ? 'bg-[#ff4d6d] text-[#100424] font-bold'
                    : 'text-[#a090c0] hover:text-[#ffffff]'
                }`}
              >
                HOST ROOM
              </button>
              <button
                type="button"
                onClick={() => setTab('join')}
                className={`flex-1 py-1.5 text-[8px] transition-colors ${
                  tab === 'join'
                    ? 'bg-[#ff4d6d] text-[#100424] font-bold'
                    : 'text-[#a090c0] hover:text-[#ffffff]'
                }`}
              >
                JOIN ROOM
              </button>
            </div>

            {/* Host Section */}
            {tab === 'host' ? (
              <div className="flex flex-col items-center gap-2 mb-3 w-full">
                <div className="flex items-center gap-2">
                  <span className="text-[7px] text-[#a090c0]">ROOM CODE:</span>
                  <div className="border border-[#ffd166] bg-[#160a2c] px-3 py-1 text-sm font-bold tracking-widest text-[#ffd166]">
                    {roomCode || 'CREATING...'}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="border border-[#3ef2c8] bg-[#3ef2c8]/10 px-2 py-1 text-[7px] text-[#3ef2c8] hover:bg-[#3ef2c8]/30 active:scale-95"
                  >
                    {copied ? 'COPIED' : 'COPY LINK'}
                  </button>
                </div>

                {/* Privacy Mode Selector (Private default) */}
                <button
                  type="button"
                  onClick={handleTogglePrivacy}
                  className={`border px-2.5 py-0.5 text-[7px] transition-colors ${
                    isPublicRoom
                      ? 'border-[#ffd166] bg-[#ffd166]/10 text-[#ffd166]'
                      : 'border-[#3ef2c8]/60 bg-[#3ef2c8]/10 text-[#3ef2c8]'
                  }`}
                >
                  {isPublicRoom ? 'PUBLIC ROOM (DISCOVERABLE)' : 'PRIVATE ROOM (CODE ONLY)'}
                </button>
              </div>
            ) : (
              /* Join Section */
              <div className="flex flex-col items-center gap-2 mb-3 w-full max-w-xs">
                {/* Join Sub-tabs */}
                <div className="flex w-full border border-[#ff4d6d]/30 bg-[#080312]">
                  <button
                    type="button"
                    onClick={() => setJoinSubTab('code')}
                    className={`flex-1 py-1 text-[7px] ${
                      joinSubTab === 'code' ? 'bg-[#ff4d6d]/30 text-[#ff4d6d] font-bold' : 'text-[#a090c0]'
                    }`}
                  >
                    ENTER CODE
                  </button>
                  <button
                    type="button"
                    onClick={() => setJoinSubTab('public')}
                    className={`flex-1 py-1 text-[7px] ${
                      joinSubTab === 'public' ? 'bg-[#ff4d6d]/30 text-[#ff4d6d] font-bold' : 'text-[#a090c0]'
                    }`}
                  >
                    PUBLIC ROOMS ({publicLobbies.length})
                  </button>
                </div>

                {joinSubTab === 'code' ? (
                  <div className="flex w-full gap-2">
                    <input
                      type="text"
                      value={inputCode}
                      onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                      placeholder="CODE (E.G. R9K2)"
                      maxLength={8}
                      className="flex-1 border border-[#ff4d6d]/60 bg-[#080312] px-2.5 py-1 text-center font-pixel text-[10px] text-[#ffffff] uppercase focus:border-[#3ef2c8] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleJoinCode()}
                      className="border border-[#3ef2c8] bg-[#3ef2c8] px-3 py-1 text-[8px] font-bold text-[#08040f] hover:bg-[#6ef5d6]"
                    >
                      JOIN
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col w-full max-h-28 overflow-y-auto gap-1 border border-[#ff4d6d]/20 bg-[#080312] p-1">
                    {publicLobbies.length === 0 ? (
                      <div className="py-3 text-center text-[7px] text-[#6b5880]">
                        NO PUBLIC ROOMS ACTIVE
                      </div>
                    ) : (
                      publicLobbies.map((lobby) => (
                        <div
                          key={lobby.roomId}
                          className="flex items-center justify-between border border-[#3ef2c8]/30 bg-[#0c1824] px-2 py-1"
                        >
                          <div className="flex flex-col text-left">
                            <span className="text-[7px] font-bold text-[#3ef2c8]">{lobby.hostName}</span>
                            <span className="text-[6px] text-[#ffd166]">
                              CODE: {lobby.roomId} ({lobby.playerCount}/{lobby.maxPlayers})
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleJoinCode(lobby.roomId)}
                            className="border border-[#3ef2c8] bg-[#3ef2c8]/20 px-2 py-0.5 text-[7px] text-[#3ef2c8] hover:bg-[#3ef2c8]/40"
                          >
                            JOIN
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Status Line */}
            {statusMsg && (
              <div className="mb-2 text-center text-[7px] text-[#ffd166]">
                {statusMsg}
              </div>
            )}

            {/* Compact 5-Player Party Strip */}
            <div className="w-full max-w-md border border-[#2c1f4d] bg-[#080312] p-2 mb-3">
              <div className="text-[7px] text-[#a090c0] mb-1.5 text-center">
                ROSTER ({totalPlayers}/{MAX_PLAYERS})
              </div>
              <div className="flex items-center justify-center gap-2">
                {/* Slot 1: You */}
                <div className="flex flex-col items-center border border-[#3ef2c8] bg-[#0c1824] p-1 w-16 h-20 justify-between">
                  <canvas ref={localCanvasRef} width={60} height={60} className="w-9 h-9 pixelated" />
                  <span className="truncate text-[6px] font-bold text-[#3ef2c8] max-w-[58px]">
                    YOU
                  </span>
                  <span className="border border-[#3ef2c8] bg-[#3ef2c8]/20 px-1 text-[5px] text-[#3ef2c8]">
                    {p2p.role === 'host' ? 'HOST' : 'READY'}
                  </span>
                </div>

                {/* Connected Opponents */}
                {opponents.map((opp, i) => (
                  <div
                    key={opp.peerId}
                    className="flex flex-col items-center border p-1 w-16 h-20 justify-between"
                    style={{ borderColor: opp.color, backgroundColor: '#0d061e' }}
                  >
                    <canvas
                      ref={(el) => {
                        if (el) oppCanvasesRef.current.set(opp.peerId, el);
                        else oppCanvasesRef.current.delete(opp.peerId);
                      }}
                      width={60}
                      height={60}
                      className="w-9 h-9 pixelated"
                    />
                    <span
                      className="truncate text-[6px] font-bold max-w-[58px]"
                      style={{ color: opp.color }}
                    >
                      {opp.name}
                    </span>
                    <span
                      className="border px-1 text-[5px]"
                      style={{ borderColor: opp.color, color: opp.color }}
                    >
                      P{i + 2} {opp.pingMs > 0 ? `${opp.pingMs}MS` : ''}
                    </span>
                  </div>
                ))}

                {/* Empty Waiting Slots */}
                {Array.from({ length: Math.max(0, MAX_PLAYERS - totalPlayers) }).map((_, i) => (
                  <div
                    key={`empty-${i}`}
                    className="flex flex-col items-center justify-center border border-dashed border-[#ff4d6d]/20 bg-[#080312]/40 w-16 h-20"
                  >
                    <span className="text-[6px] text-[#4a3b5c]">SLOT {totalPlayers + i + 1}</span>
                    <span className="text-[5px] text-[#4a3b5c]">EMPTY</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Launch / Status Button */}
            <div className="flex w-full max-w-xs justify-center">
              {p2p.role === 'host' ? (
                <button
                  type="button"
                  onClick={handleStartRun}
                  disabled={opponents.length === 0}
                  className="w-full border-2 border-[#ffd166] bg-[#ffd166] py-2 text-[9px] font-bold text-[#120726] transition-colors hover:bg-[#ffe082] disabled:opacity-40 disabled:hover:bg-[#ffd166]"
                >
                  {opponents.length === 0
                    ? 'WAITING FOR PLAYERS...'
                    : `START BATTLE (${totalPlayers} PLAYERS)`}
                </button>
              ) : (
                <div className="w-full border border-[#3ef2c8]/50 bg-[#0a1820] py-2 text-center text-[7px] text-[#3ef2c8]">
                  CONNECTED - WAITING FOR HOST TO START
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
