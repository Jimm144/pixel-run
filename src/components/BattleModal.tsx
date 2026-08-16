import { useEffect, useRef, useState, useCallback } from 'react';
import { p2p } from '../game/multiplayer/p2pManager';
import type { MatchResult, OpponentInfo } from '../game/multiplayer/types';
import { SKINS, type SkinId } from '../game/skins';
import { drawPlayerSprite } from '../game/playerSprite';
import { PixelButton, Panel } from './ui';
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
  const [roomCode, setRoomCode] = useState<string>('');
  const [inputCode, setInputCode] = useState<string>('');
  const [opponent, setOpponent] = useState<OpponentInfo | null>(p2p.opponent);
  const [statusMsg, setStatusMsg] = useState<string>('SELECT HOST OR JOIN');
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  const localCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const oppCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Initialize Host Room
  const initHost = useCallback(() => {
    const code = p2p.host(localName, localSkin);
    setRoomCode(code);
    setStatusMsg('WAITING FOR OPPONENT TO JOIN...');
  }, [localName, localSkin]);

  useEffect(() => {
    if (!matchResult && tab === 'host' && !roomCode) {
      initHost();
    }
  }, [tab, roomCode, matchResult, initHost]);

  // Check URL hash for auto-join (#battle=CODE)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash.startsWith('#battle=')) {
      const codeFromUrl = window.location.hash.replace('#battle=', '').trim();
      if (codeFromUrl) {
        setTab('join');
        setInputCode(codeFromUrl);
        handleJoinCode(codeFromUrl);
      }
    }
  }, []);

  // Listen to P2P manager events
  useEffect(() => {
    p2p.onOpponentUpdate = (opp) => {
      setOpponent(opp);
      if (opp) {
        sfx.play('gem');
        setStatusMsg(`OPPONENT CONNECTED: ${opp.name}`);
      } else {
        setStatusMsg('OPPONENT DISCONNECTED');
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
      p2p.onOpponentUpdate = null;
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
      // 1. Local Player Sprite
      if (localCanvasRef.current) {
        const ctx = localCanvasRef.current.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, 80, 80);
          ctx.imageSmoothingEnabled = false;
          drawPlayerSprite(ctx, 40, 40, {
            skinId: localSkin,
            frame,
            scale: 3,
            onGround: true,
            run: Math.floor(frame / 6) % 4,
          });
        }
      }
      // 2. Opponent Sprite
      if (oppCanvasRef.current && opponent) {
        const ctx = oppCanvasRef.current.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, 80, 80);
          ctx.imageSmoothingEnabled = false;
          drawPlayerSprite(ctx, 40, 40, {
            skinId: opponent.skinId,
            frame,
            scale: 3,
            onGround: true,
            run: Math.floor(frame / 6) % 4,
          });
        }
      }
      animId = requestAnimationFrame(render);
    };
    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [localSkin, opponent]);

  const handleJoinCode = (codeToJoin?: string) => {
    const code = codeToJoin || inputCode;
    if (!code) {
      setStatusMsg('ENTER A VALID 4-CHARACTER CODE');
      return;
    }
    const ok = p2p.join(code, localName, localSkin);
    if (ok) {
      setStatusMsg('CONNECTING TO PEER...');
      sfx.play('ui');
    }
  };

  const getInviteUrl = () => {
    if (typeof window === 'undefined') return '';
    const base = window.location.origin + window.location.pathname;
    return `${base}#battle=${roomCode}`;
  };

  const handleCopyInvite = async () => {
    const url = getInviteUrl();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        sfx.play('ui');
        setTimeout(() => setCopied(false), 2500);
        return;
      }
    } catch {}
    // Share API fallback
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({
          title: 'Battle me in Pixel Run!',
          text: `Join my Pixel Run battle with room code: ${roomCode}`,
          url,
        });
        return;
      } catch {}
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          const clean = text.includes('#battle=') ? text.split('#battle=')[1] : text;
          setInputCode(clean.trim().toUpperCase());
          sfx.play('ui');
        }
      }
    } catch {}
  };

  const handleStartMatch = () => {
    sfx.play('ui');
    p2p.startMatch();
  };

  const handleRematch = () => {
    sfx.play('ui');
    onClearMatchResult();
    p2p.requestRematch();
  };

  const handleExit = () => {
    sfx.play('ui');
    p2p.leave();
    onClearMatchResult();
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-[#08040f]/90 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleExit();
      }}
    >
      <div className="relative flex w-full max-w-[440px] flex-col items-center border-4 border-[#ff4d6d] bg-[#0d0619] p-4 text-center font-pixel text-white shadow-[0_0_0_4px_#08040f,0_0_35px_rgba(255,77,109,0.25)] sm:p-5">
        {/* Header */}
        <div className="mb-3 flex w-full items-center justify-between border-b-2 border-[#251842] pb-2">
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-[#ff4d6d]">⚔️</span>
            <h2 className="text-[11px] uppercase tracking-wider text-[#ff4d6d] sm:text-[13px]">
              1V1 MULTIPLAYER BATTLES
            </h2>
          </div>
          <button
            type="button"
            onClick={handleExit}
            className="flex h-7 w-7 items-center justify-center border border-[#ff4d6d] bg-[#ff4d6d]/20 text-[10px] text-[#ff4d6d] hover:bg-[#ff4d6d]/40 active:translate-x-[1px] active:translate-y-[1px]"
          >
            ✕
          </button>
        </div>

        {/* Match Result Overlay View */}
        {matchResult ? (
          <div className="flex w-full flex-col items-center gap-3">
            <div
              className={`w-full border-2 p-3 text-center ${
                matchResult.winner === 'local'
                  ? 'border-[#ffd166] bg-[#ffd166]/15 text-[#ffd166]'
                  : matchResult.winner === 'opponent'
                  ? 'border-[#ff4d6d] bg-[#ff4d6d]/15 text-[#ff4d6d]'
                  : 'border-[#3ef2c8] bg-[#3ef2c8]/15 text-[#3ef2c8]'
              }`}
            >
              <h3 className="text-[14px] sm:text-[18px]">
                {matchResult.winner === 'local'
                  ? '👑 VICTORY!'
                  : matchResult.winner === 'opponent'
                  ? '💀 DEFEAT'
                  : '🤝 DRAW'}
              </h3>
              <p className="mt-1 text-[7px] text-[#c4b8e8] sm:text-[8px]">
                {matchResult.reason === 'forfeit'
                  ? 'OPPONENT FORFEITED'
                  : matchResult.winner === 'local'
                  ? 'YOU OUTSURVIVED YOUR OPPONENT!'
                  : 'OPPONENT SET A HIGHER RUN!'}
              </p>
            </div>

            {/* Scoreboard Comparison */}
            <div className="grid w-full grid-cols-2 gap-2 border-2 border-[#251842] bg-[#120722] p-3 text-left">
              <div>
                <span className="text-[7.5px] text-[#3ef2c8]">YOU ({localName})</span>
                <p className="mt-1 text-[9px] text-white">SCORE: {matchResult.localScore}</p>
                <p className="text-[7.5px] text-[#9d8fd6]">DISTANCE: {matchResult.localMeters}M</p>
              </div>
              <div className="border-l-2 border-[#251842] pl-3">
                <span className="text-[7.5px] text-[#ff70a6]">{matchResult.opponentName}</span>
                <p className="mt-1 text-[9px] text-white">SCORE: {matchResult.opponentScore}</p>
                <p className="text-[7.5px] text-[#9d8fd6]">DISTANCE: {matchResult.opponentMeters}M</p>
              </div>
            </div>

            <div className="mt-2 flex w-full gap-2">
              <PixelButton onClick={handleRematch} className="flex-1 py-3 text-[10px]">
                REMATCH ⚔️
              </PixelButton>
              <PixelButton variant="ghost" onClick={handleExit} className="flex-1 py-3 text-[10px]">
                LEAVE
              </PixelButton>
            </div>
          </div>
        ) : countdown !== null ? (
          /* Active Countdown Sync View */
          <div className="flex w-full flex-col items-center justify-center py-8">
            <span className="font-pixel text-[36px] text-[#ffd166] drop-shadow-[0_4px_0_#08040f]">
              {countdown > 0 ? countdown : 'GO!'}
            </span>
            <p className="mt-2 font-pixel text-[8px] text-[#3ef2c8]">
              SYNCHRONIZING START CLOCKS...
            </p>
          </div>
        ) : opponent ? (
          /* 2-Player Lobby View */
          <div className="flex w-full flex-col items-center gap-3">
            <div className="flex w-full items-center justify-between border-2 border-[#251842] bg-[#120722] p-3">
              {/* Local Player Card */}
              <div className="flex flex-1 flex-col items-center text-center">
                <div className="border-2 border-[#3ef2c8] bg-[#1a0e2e] p-1">
                  <canvas ref={localCanvasRef} width={80} height={80} style={{ imageRendering: 'pixelated' }} className="h-16 w-16" />
                </div>
                <span className="mt-1 text-[8px] text-[#3ef2c8]">{localName}</span>
                <span className="text-[6.5px] text-[#6f5fa8]">{SKINS[localSkin]?.name}</span>
              </div>

              {/* VS Center Badge */}
              <div className="flex flex-col items-center px-2">
                <span className="font-pixel text-[14px] text-[#ffd166]">VS</span>
                {opponent.pingMs > 0 && (
                  <span className="mt-1 font-pixel text-[6.5px] text-[#3ef2c8]">
                    ⚡ {opponent.pingMs}ms
                  </span>
                )}
              </div>

              {/* Opponent Card */}
              <div className="flex flex-1 flex-col items-center text-center">
                <div className="border-2 border-[#ff70a6] bg-[#1a0e2e] p-1">
                  <canvas ref={oppCanvasRef} width={80} height={80} style={{ imageRendering: 'pixelated' }} className="h-16 w-16" />
                </div>
                <span className="mt-1 text-[8px] text-[#ff70a6]">{opponent.name}</span>
                <span className="text-[6.5px] text-[#6f5fa8]">{SKINS[opponent.skinId]?.name}</span>
              </div>
            </div>

            {p2p.role === 'host' ? (
              <PixelButton onClick={handleStartMatch} className="w-full py-3.5 text-[11px]">
                START BATTLE ⚔️
              </PixelButton>
            ) : (
              <div className="w-full border-2 border-[#ffd166] bg-[#ffd166]/10 py-3 text-center text-[8.5px] text-[#ffd166]">
                WAITING FOR HOST TO START...
              </div>
            )}
          </div>
        ) : (
          /* Host / Join Tabs View */
          <div className="flex w-full flex-col gap-3">
            {/* Tab Selector */}
            <div className="flex w-full border-2 border-[#251842]">
              <button
                type="button"
                onClick={() => { setTab('host'); initHost(); }}
                className={`flex-1 py-2 font-pixel text-[8.5px] transition-colors ${
                  tab === 'host' ? 'bg-[#ff4d6d] text-[#08040f]' : 'bg-[#120722] text-[#9d8fd6]'
                }`}
              >
                HOST ROOM
              </button>
              <button
                type="button"
                onClick={() => setTab('join')}
                className={`flex-1 py-2 font-pixel text-[8.5px] transition-colors ${
                  tab === 'join' ? 'bg-[#3ef2c8] text-[#08040f]' : 'bg-[#120722] text-[#9d8fd6]'
                }`}
              >
                JOIN ROOM
              </button>
            </div>

            {tab === 'host' ? (
              <div className="flex flex-col gap-3">
                <p className="text-[7.5px] text-[#9d8fd6] sm:text-[8.5px]">
                  Share this 4-character Room Code or Invite Link with your friend:
                </p>

                <div className="flex items-center justify-center border-2 border-[#ff4d6d] bg-[#1a081a] py-3 text-center">
                  <span className="font-mono text-[18px] tracking-[0.2em] text-[#ffd166]">
                    {roomCode || 'GENERATING...'}
                  </span>
                </div>

                <PixelButton
                  onClick={handleCopyInvite}
                  className="w-full py-3 text-[9.5px] sm:text-[11px]"
                >
                  {copied ? '✓ INVITE LINK COPIED!' : 'COPY / SHARE INVITE LINK'}
                </PixelButton>

                <span className="text-[7px] text-[#6f5fa8] animate-pulse">
                  {statusMsg}
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-[7.5px] text-[#9d8fd6] sm:text-[8.5px]">
                  Enter your friend's Room Code or paste their invite link:
                </p>

                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                    placeholder="ENTER CODE (E.G. A4B9)"
                    maxLength={16}
                    className="flex-1 border-2 border-[#251842] bg-[#120722] p-2.5 font-mono text-[9px] text-[#ffd166] placeholder-[#6f5fa8] focus:border-[#3ef2c8] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handlePasteFromClipboard}
                    className="border border-[#3ef2c8]/40 bg-[#092922] px-2 text-[7px] text-[#3ef2c8] hover:bg-[#0d3b2d]"
                  >
                    PASTE
                  </button>
                </div>

                <PixelButton
                  onClick={() => handleJoinCode()}
                  className="w-full py-3 text-[9.5px] sm:text-[11px]"
                >
                  CONNECT TO ROOM ⚔️
                </PixelButton>

                <span className="text-[7px] text-[#6f5fa8]">
                  {statusMsg}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
