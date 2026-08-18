import { useEffect, useRef, useState, useCallback } from 'react';
import { party, MAX_PLAYERS } from '../game/multiplayer/partyManager';
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
}

export function BattleModal({
  onClose,
  onStartBattle,
  localName,
  localSkin,
  matchResult,
  onClearMatchResult,
}: BattleModalProps) {
  const [tab, setTab] = useState<'host' | 'join'>('host');
  const [joinSubTab, setJoinSubTab] = useState<'code' | 'public'>('code');
  const [roomCode, setRoomCode] = useState<string>('');
  const [inputCode, setInputCode] = useState<string>('');
  const [isPublicRoom, setIsPublicRoom] = useState<boolean>(false);
  const [opponents, setOpponents] = useState<OpponentInfo[]>(() => Array.from(party.opponents.values()));
  const [publicLobbies, setPublicLobbies] = useState<PublicLobbyInfo[]>([]);
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [joined, setJoined] = useState(false);
  const [joinFailed, setJoinFailed] = useState(false);

  const localCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const oppCanvasesRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const hostInitInFlightRef = useRef(false);
  const isPublicRoomRef = useRef(isPublicRoom);

  const hasAutoJoinHash = () =>
    typeof window !== 'undefined' && window.location.hash.startsWith('#battle=');

  // Initialize Host Room
  const initHost = useCallback(async () => {
    const isPub = isPublicRoomRef.current;
    const code = await party.host(localName, localSkin, isPub);
    if (party.isPublic !== isPublicRoomRef.current) {
      party.setRoomVisibility(isPublicRoomRef.current);
    }
    setRoomCode(code);
    setStatusMsg(`ROOM ${code} READY`);
  }, [localName, localSkin]);

  // Restore lobby state when modal mounts
  useEffect(() => {
    if (party.state !== 'idle' && party.roomId) {
      setRoomCode(party.roomId);
      setOpponents(Array.from(party.opponents.values()));
      if (party.role === 'joiner') {
        setTab('join');
        setJoined(true);
      } else {
        setTab('host');
      }
    }
  }, []);

  useEffect(() => {
    isPublicRoomRef.current = isPublicRoom;
  }, [isPublicRoom]);

  // Initialize Host Room when on host tab
  useEffect(() => {
    if (
      !matchResult &&
      tab === 'host' &&
      !roomCode &&
      !hasAutoJoinHash() &&
      party.state === 'idle' &&
      !hostInitInFlightRef.current
    ) {
      hostInitInFlightRef.current = true;
      initHost().finally(() => {
        hostInitInFlightRef.current = false;
      });
    }
  }, [tab, roomCode, initHost, matchResult]);

  // Handle URL hash auto-join: #battle=CODE
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (hash.startsWith('#battle=')) {
      const code = hash.replace('#battle=', '').trim().toUpperCase();
      if (code && code.length === 4) {
        setTab('join');
        setJoinSubTab('code');
        setInputCode(code);
        setStatusMsg(`CONNECTING TO ${code}...`);
        party.join(code, localName, localSkin).then((ok) => {
          if (ok) {
            setRoomCode(code);
            setJoined(true);
            setStatusMsg(`JOINED ROOM ${code}`);
          } else {
            setJoinFailed(true);
            setStatusMsg('FAILED TO JOIN');
          }
        });
      }
    }
  }, [localName, localSkin]);

  // Wire party callbacks
  useEffect(() => {
    party.onRoomStateChange = (oppList) => {
      setOpponents([...oppList]);
    };

    party.onMatchStart = (seed, startAt) => {
      sfx.play('gem');
      const startMs = startAt;
      const updateCd = () => {
        const remaining = Math.max(0, Math.ceil((startMs - Date.now()) / 1000));
        setCountdown(remaining);
        if (remaining <= 0) {
          onStartBattle(seed);
        } else {
          setTimeout(updateCd, 200);
        }
      };
      updateCd();
    };

    party.onStatusMsg = (msg) => {
      setStatusMsg(msg);
    };

    return () => {
      party.onRoomStateChange = undefined;
      party.onMatchStart = undefined;
      party.onStatusMsg = undefined;
    };
  }, [onStartBattle]);

  // Draw local player sprite
  useEffect(() => {
    const canvas = localCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawPlayerSprite(ctx, canvas.width / 2, canvas.height / 2, {
      skinId: localSkin,
      frame: 0,
      onGround: true,
      scale: 3,
    });
  }, [localSkin]);

  // Draw opponent player sprites
  useEffect(() => {
    opponents.forEach((opp) => {
      const canvas = oppCanvasesRef.current.get(opp.peerId);
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawPlayerSprite(ctx, canvas.width / 2, canvas.height / 2, {
        skinId: opp.skinId,
        frame: 0,
        onGround: true,
        scale: 3,
      });
    });
  }, [opponents]);

  const handleCopyLink = () => {
    const url = `${window.location.origin}${window.location.pathname}#battle=${roomCode}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleJoinByCode = async () => {
    if (!inputCode.trim()) return;
    const code = inputCode.trim().toUpperCase();
    setStatusMsg(`CONNECTING TO ${code}...`);
    setJoinFailed(false);
    const ok = await party.join(code, localName, localSkin);
    if (ok) {
      setRoomCode(code);
      setJoined(true);
      setStatusMsg(`JOINED ROOM ${code}`);
    } else {
      setJoinFailed(true);
      setStatusMsg('ROOM NOT FOUND');
    }
  };

  const handleJoinPublic = async () => {
    setStatusMsg('SEARCHING FOR PUBLIC MATCH...');
    const ok = await party.joinPublic(localName, localSkin);
    if (ok) {
      setRoomCode('PUBLIC');
      setJoined(true);
      setStatusMsg('CONNECTED TO PUBLIC ROOM');
    } else {
      setStatusMsg('FAILED TO CONNECT');
    }
  };

  const handleStartMatch = () => {
    party.startMatch();
  };

  const handleLeave = () => {
    party.leave();
    setRoomCode('');
    setJoined(false);
    setOpponents([]);
    setStatusMsg('');
    if (typeof window !== 'undefined' && window.location.hash.startsWith('#battle=')) {
      window.history.replaceState(null, '', window.location.pathname);
    }
    if (tab === 'host') {
      initHost();
    }
  };

  const isHost = party.role === 'host' || tab === 'host';
  const totalPlayers = opponents.length + 1;
  const isFull = totalPlayers >= MAX_PLAYERS;

  // -------------------------------------------------------------
  // Match Result Screen (Podium)
  // -------------------------------------------------------------
  if (matchResult) {
    const isWinner = matchResult.isWinner;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-pixel">
        <div className="relative w-full max-w-lg rounded-xl border-4 border-[#ff4d6d] bg-[#0d0619] p-6 text-center text-white shadow-2xl">
          <h2
            className={`text-2xl tracking-wider mb-2 ${
              isWinner ? 'text-[#ffd166]' : 'text-[#ff4d6d]'
            }`}
          >
            {isWinner ? '👑 VICTORY!' : '💀 DEFEAT'}
          </h2>
          <p className="text-xs text-[#9d8fd6] mb-4">
            {isWinner
              ? 'YOU OUTLASTED ALL OPPONENTS!'
              : `WINNER: ${matchResult.winnerName}`}
          </p>

          <div className="my-4 space-y-2 max-h-56 overflow-y-auto pr-1">
            {matchResult.leaderboard.map((entry) => (
              <div
                key={entry.peerId}
                className={`flex items-center justify-between rounded-lg border-2 p-2 px-3 text-xs ${
                  entry.isLocal
                    ? 'border-[#3ef2c8] bg-[#092922]'
                    : entry.rank === 1
                    ? 'border-[#ffd166] bg-[#2a1c04]'
                    : 'border-[#2c1f4d] bg-[#140a26]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`font-bold ${
                      entry.rank === 1
                        ? 'text-[#ffd166]'
                        : entry.rank === 2
                        ? 'text-[#c0c0c0]'
                        : entry.rank === 3
                        ? 'text-[#cd7f32]'
                        : 'text-white/60'
                    }`}
                  >
                    #{entry.rank}
                  </span>
                  <span className={entry.isLocal ? 'text-[#3ef2c8]' : 'text-white'}>
                    {entry.name} {entry.isLocal && '(YOU)'}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="text-[#ffd166]">{entry.meters}M</span>
                  <span className="text-[#3ef2c8]">{entry.score} PTS</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex justify-center gap-3">
            <PixelButton
              onClick={() => {
                onClearMatchResult();
                party.rematch();
              }}
              color="#3ef2c8"
              className="px-6 py-2 text-xs"
            >
              PLAY AGAIN
            </PixelButton>
            <PixelButton
              onClick={() => {
                onClearMatchResult();
                handleLeave();
                onClose();
              }}
              color="#ff4d6d"
              className="px-6 py-2 text-xs"
            >
              EXIT LOBBY
            </PixelButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 font-pixel">
      <div className="relative w-full max-w-md rounded-xl border-4 border-[#3ef2c8] bg-[#0d0619] p-5 text-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-[#2c1f4d] pb-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-lg text-[#3ef2c8]">⚔️</span>
            <h2 className="text-sm tracking-wider text-[#3ef2c8]">MULTIPLAYER BATTLE</h2>
          </div>
          <button
            onClick={() => {
              handleLeave();
              onClose();
            }}
            className="text-white/60 hover:text-white text-base px-2"
          >
            ✕
          </button>
        </div>

        {/* Tab Selection */}
        {!joined && (
          <div className="grid grid-cols-2 gap-2 mb-4">
            <button
              onClick={() => {
                setTab('host');
                if (!roomCode) initHost();
              }}
              className={`py-2 text-xs rounded border-2 transition-colors ${
                tab === 'host'
                  ? 'border-[#3ef2c8] bg-[#092922] text-[#3ef2c8]'
                  : 'border-[#2c1f4d] bg-[#140a26] text-white/60 hover:text-white'
              }`}
            >
              👑 HOST ROOM
            </button>
            <button
              onClick={() => {
                setTab('join');
                party.leave();
                setRoomCode('');
              }}
              className={`py-2 text-xs rounded border-2 transition-colors ${
                tab === 'join'
                  ? 'border-[#3ef2c8] bg-[#092922] text-[#3ef2c8]'
                  : 'border-[#2c1f4d] bg-[#140a26] text-white/60 hover:text-white'
              }`}
            >
              🎮 JOIN ROOM
            </button>
          </div>
        )}

        {/* HOST TAB */}
        {tab === 'host' && (
          <div className="space-y-4">
            <div className="rounded-lg border-2 border-[#2c1f4d] bg-[#140a26] p-3 text-center">
              <p className="text-[10px] text-[#9d8fd6] mb-1">ROOM CODE</p>
              <div className="flex items-center justify-center gap-3">
                <span className="text-2xl font-bold tracking-widest text-[#ffd166]">
                  {roomCode || '....'}
                </span>
                <button
                  onClick={handleCopyCode}
                  className="rounded border border-[#ffd166] bg-[#3d2b05] px-2 py-1 text-[10px] text-[#ffd166] hover:bg-[#5a3f08]"
                >
                  {copied ? 'COPIED!' : 'COPY'}
                </button>
              </div>
              <button
                onClick={handleCopyLink}
                className="mt-2 text-[10px] text-[#3ef2c8] hover:underline"
              >
                📋 Copy Direct Invite Link
              </button>
            </div>

            {/* Privacy Toggle */}
            <div className="flex items-center justify-between px-2 text-xs">
              <span className="text-white/80 text-[10px]">PUBLIC MATCHMAKING:</span>
              <button
                onClick={() => {
                  const next = !isPublicRoom;
                  setIsPublicRoom(next);
                  party.setRoomVisibility(next);
                }}
                className={`rounded border px-2 py-1 text-[10px] ${
                  isPublicRoom
                    ? 'border-[#3ef2c8] bg-[#092922] text-[#3ef2c8]'
                    : 'border-[#ff4d6d] bg-[#33081e] text-[#ff4d6d]'
                }`}
              >
                {isPublicRoom ? 'PUBLIC' : 'PRIVATE'}
              </button>
            </div>

            {/* Player Cards */}
            <div className="space-y-2">
              <p className="text-[10px] text-[#9d8fd6]">
                PLAYERS ({totalPlayers}/{MAX_PLAYERS}):
              </p>
              <div className="grid grid-cols-2 gap-2">
                {/* Local Host Card */}
                <div className="flex items-center gap-2 rounded-lg border-2 border-[#3ef2c8] bg-[#092922] p-2">
                  <canvas ref={localCanvasRef} width={40} height={40} className="shrink-0" />
                  <div className="overflow-hidden">
                    <p className="text-xs text-[#3ef2c8] truncate">{localName}</p>
                    <span className="text-[9px] text-[#ffd166]">👑 HOST</span>
                  </div>
                </div>

                {/* Opponents */}
                {opponents.map((opp) => (
                  <div
                    key={opp.peerId}
                    className="flex items-center gap-2 rounded-lg border-2 border-[#2c1f4d] bg-[#140a26] p-2"
                  >
                    <canvas
                      ref={(el) => {
                        if (el) oppCanvasesRef.current.set(opp.peerId, el);
                      }}
                      width={40}
                      height={40}
                      className="shrink-0"
                    />
                    <div className="overflow-hidden">
                      <p className="text-xs text-white truncate">{opp.name}</p>
                      <span className="text-[9px] text-[#3ef2c8]">READY</span>
                    </div>
                  </div>
                ))}

                {/* Empty Slots */}
                {Array.from({ length: Math.max(0, MAX_PLAYERS - totalPlayers) }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-center rounded-lg border-2 border-dashed border-[#2c1f4d]/60 bg-[#140a26]/40 p-2 py-3 text-[10px] text-white/30"
                  >
                    WAITING...
                  </div>
                ))}
              </div>
            </div>

            {/* Countdown or Start Button */}
            {countdown !== null ? (
              <div className="text-center py-2 text-lg text-[#ffd166] animate-pulse">
                STARTING IN {countdown}...
              </div>
            ) : (
              <PixelButton
                onClick={handleStartMatch}
                disabled={opponents.length === 0}
                color="#3ef2c8"
                className="w-full py-3 text-xs"
              >
                {opponents.length === 0 ? 'WAITING FOR PLAYERS...' : 'START BATTLE ⚔️'}
              </PixelButton>
            )}
          </div>
        )}

        {/* JOIN TAB */}
        {tab === 'join' && !joined && (
          <div className="space-y-4">
            <div className="flex gap-2 border-b border-[#2c1f4d] pb-2">
              <button
                onClick={() => setJoinSubTab('code')}
                className={`text-[10px] pb-1 ${
                  joinSubTab === 'code'
                    ? 'text-[#3ef2c8] border-b-2 border-[#3ef2c8]'
                    : 'text-white/60'
                }`}
              >
                ENTER CODE
              </button>
              <button
                onClick={() => setJoinSubTab('public')}
                className={`text-[10px] pb-1 ${
                  joinSubTab === 'public'
                    ? 'text-[#3ef2c8] border-b-2 border-[#3ef2c8]'
                    : 'text-white/60'
                }`}
              >
                QUICK MATCH
              </button>
            </div>

            {joinSubTab === 'code' ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] text-[#9d8fd6] mb-1">ENTER 4-LETTER ROOM CODE:</label>
                  <input
                    type="text"
                    maxLength={4}
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                    placeholder="e.g. ABCD"
                    className="w-full rounded border-2 border-[#2c1f4d] bg-[#140a26] p-2 text-center text-lg font-bold tracking-widest text-[#ffd166] focus:border-[#3ef2c8] focus:outline-none"
                  />
                </div>
                <PixelButton
                  onClick={handleJoinByCode}
                  disabled={inputCode.length !== 4}
                  color="#3ef2c8"
                  className="w-full py-2.5 text-xs"
                >
                  CONNECT
                </PixelButton>
              </div>
            ) : (
              <div className="space-y-3 text-center">
                <p className="text-xs text-white/80">Join the next available public multiplayer room:</p>
                <PixelButton onClick={handleJoinPublic} color="#ffd166" className="w-full py-3 text-xs">
                  FIND PUBLIC MATCH 🎮
                </PixelButton>
              </div>
            )}
          </div>
        )}

        {/* JOINED LOBBY VIEW (For Joiners) */}
        {tab === 'join' && joined && (
          <div className="space-y-4">
            <div className="rounded-lg border-2 border-[#3ef2c8] bg-[#092922] p-3 text-center">
              <p className="text-[10px] text-[#3ef2c8]">CONNECTED TO ROOM</p>
              <p className="text-xl font-bold text-[#ffd166]">{roomCode}</p>
              <p className="text-[10px] text-white/60 mt-1">WAITING FOR HOST TO START...</p>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] text-[#9d8fd6]">PLAYERS ({totalPlayers}):</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2 rounded-lg border-2 border-[#3ef2c8] bg-[#092922] p-2">
                  <canvas ref={localCanvasRef} width={40} height={40} className="shrink-0" />
                  <div className="overflow-hidden">
                    <p className="text-xs text-[#3ef2c8] truncate">{localName} (YOU)</p>
                    <span className="text-[9px] text-[#3ef2c8]">READY</span>
                  </div>
                </div>

                {opponents.map((opp) => (
                  <div
                    key={opp.peerId}
                    className="flex items-center gap-2 rounded-lg border-2 border-[#2c1f4d] bg-[#140a26] p-2"
                  >
                    <canvas
                      ref={(el) => {
                        if (el) oppCanvasesRef.current.set(opp.peerId, el);
                      }}
                      width={40}
                      height={40}
                      className="shrink-0"
                    />
                    <div className="overflow-hidden">
                      <p className="text-xs text-white truncate">{opp.name}</p>
                      <span className="text-[9px] text-[#ffd166]">{opp.isHost ? '👑 HOST' : 'READY'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {countdown !== null ? (
              <div className="text-center py-2 text-lg text-[#ffd166] animate-pulse">
                STARTING IN {countdown}...
              </div>
            ) : (
              <PixelButton onClick={handleLeave} color="#ff4d6d" className="w-full py-2 text-xs">
                LEAVE ROOM
              </PixelButton>
            )}
          </div>
        )}

        {/* Status bar */}
        {statusMsg && <p className="mt-3 text-center text-[10px] text-[#9d8fd6]">{statusMsg}</p>}
      </div>
    </div>
  );
}
