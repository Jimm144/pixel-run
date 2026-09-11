import { useEffect, useRef, useState, useCallback } from 'react';
import { party, MAX_PLAYERS } from '../game/multiplayer/partyManager';
import type { MatchResult, OpponentInfo } from '../game/multiplayer/types';
import { SKINS, type SkinId } from '../game/skins';
import { drawPlayerSprite } from '../game/playerSprite';
import { PixelButton, PixelCloseIcon } from './ui';
import { sfx } from '../game/audio';

/* RULE: NEVER USE BLUR OR BACKDROP-BLUR ANYWHERE IN THE CODEBASE (PERF & RETRO PIXEL INTEGRITY) */

const LOCAL_CFG_KEY = 'pixeldash.local_battle_config.v1';
const ONLINE_NAME_KEY = 'pixeldash.online_name.v1';
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
  onStartOnlineBattle: (seed: number) => void;
  onStartLocalBattle: (skins: SkinId[], names?: string[], controls?: string[]) => void;
  localName: string;
  localSkin: SkinId;
  unlockedSkins: SkinId[];
  matchResult: MatchResult | null;
  onClearMatchResult: () => void;
}

export function BattleModal({
  onClose,
  onStartOnlineBattle,
  onStartLocalBattle,
  localName,
  localSkin,
  unlockedSkins,
  matchResult,
  onClearMatchResult,
}: BattleModalProps) {
  const [tab, setTab] = useState<'host' | 'join' | 'local'>('host');
  const [roomCode, setRoomCode] = useState<string>('');
  const [inputCode, setInputCode] = useState<string>('');
  const [opponents, setOpponents] = useState<OpponentInfo[]>(() => Array.from(party.opponents.values()));
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [joined, setJoined] = useState(false);
  const [myReady, setMyReady] = useState(false);
  const [onlineName, setOnlineName] = useState<string>(() => {
    const fallback = `RUNNER ${100 + Math.floor(Math.random() * 900)}`;
    try {
      const saved = localStorage.getItem(ONLINE_NAME_KEY);
      if (saved && saved.trim().toUpperCase() !== 'RUNNER') return saved;
      localStorage.setItem(ONLINE_NAME_KEY, fallback);
    } catch {}
    return fallback || localName;
  });

  const updateOnlineName = (v: string) => {
    setOnlineName(v);
    try {
      localStorage.setItem(ONLINE_NAME_KEY, v);
    } catch {}
    party.rename(v);
  };

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

  const localCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pCanvasesRef = useRef<(HTMLCanvasElement | null)[]>([null, null, null, null]);
  const oppCanvasesRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const hostInitInFlightRef = useRef(false);
  const autoJoinAttemptedRef = useRef(false);
  const joinAttemptRef = useRef(0);
  const roomCodeRef = useRef('');
  const rosterIdsRef = useRef(new Set<string>());
  /** Pending countdown tick — cleared on unmount so a closed modal never
   *  fires onStartOnlineBattle after the player left the room. */
  const countdownTimerRef = useRef(0);
  const countdownIntervalRef = useRef(0);

  roomCodeRef.current = roomCode;

  const hasAutoJoinHash = () =>
    typeof window !== 'undefined' && window.location.hash.startsWith('#battle=');

  // Initialize Host Room
  const initHost = useCallback(async () => {
    const code = await party.host(onlineName, localSkin, false);
    if (party.role !== 'host' || party.roomId !== code) return;
    setRoomCode(code);
    setStatusMsg('ROOM IS READY - WAITING FOR PLAYERS');
  }, [onlineName, localSkin]);

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

  // Initialize host room if in host tab
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
  }, [tab, roomCode, matchResult, initHost]);

  const clearRoster = () => {
    rosterIdsRef.current = new Set();
    setOpponents([]);
    setJoined(false);
    setMyReady(false);
  };

  // Party event subscriptions
  useEffect(() => {
    party.onRoomStateChange = (oppList) => {
      setOpponents([...oppList]);
      const nextIds = new Set(oppList.map((opp) => opp.peerId));
      const hasNewOpponent = oppList.some((opp) => !rosterIdsRef.current.has(opp.peerId));
      rosterIdsRef.current = nextIds;
      if (oppList.length > 0) {
        if (hasNewOpponent) sfx.play('gem');
        setIsJoining(false);
        setJoined(true);
        setStatusMsg(`${oppList.length + 1}/${MAX_PLAYERS} PLAYERS CONNECTED`);
      } else if (party.role === 'host') {
        setStatusMsg('ROOM IS READY - WAITING FOR PLAYERS');
      } else if (party.state === 'in_room') {
        setJoined(false);
        setStatusMsg(roomCodeRef.current ? `SEARCHING FOR ROOM ${roomCodeRef.current}...` : 'SELECT OR ENTER A ROOM TO JOIN');
      }
    };

    const handleMatchStart = (seed: number, startAt: number) => {
      onClearMatchResult();
      setMyReady(false);
      if (party.state === 'in_game') {
        const delay = Math.min(Math.max(startAt - Date.now(), 0), 3000);
        const begin = () => {
          window.clearInterval(countdownIntervalRef.current);
          window.clearTimeout(countdownTimerRef.current);
          setCountdown(null);
          onStartOnlineBattle(seed);
        };
        if (delay <= 250) {
          begin();
          return;
        }
        const steps = Math.max(1, Math.ceil(delay / 1000));
        setCountdown(steps);
        let cur = steps;
        countdownIntervalRef.current = window.setInterval(() => {
          cur--;
          setCountdown(Math.max(0, cur));
        }, delay / steps);
        countdownTimerRef.current = window.setTimeout(begin, delay);
      }
    };
    party.onMatchStart = handleMatchStart;
    const pendingStart = party.consumePendingMatchStart();
    if (pendingStart && party.state === 'in_game') {
      handleMatchStart(pendingStart.seed, pendingStart.startAt);
    }

    party.onStatusMsg = (msg) => {
      setStatusMsg(msg);
      // Watchdog/cancel outcomes from the party layer must release the join
      // button, or it would stay stuck on CANCEL forever.
      if (/^(ROOM NOT FOUND|ROOM CLOSED|INVALID ROOM CODE|ROOM FULL|MATCH ALREADY STARTED)/.test(msg)) {
        setIsJoining(false);
        setJoined(false);
        setMyReady(false);
        setOpponents([]);
        rosterIdsRef.current = new Set();
      }
    };

    return () => {
      window.clearTimeout(countdownTimerRef.current);
      window.clearInterval(countdownIntervalRef.current);
      party.onRoomStateChange = undefined;
      party.onMatchStart = undefined;
      party.onStatusMsg = undefined;
    };
  }, [onStartOnlineBattle, onClearMatchResult]);

  // Auto-join from URL hash (#battle=CODE)
  useEffect(() => {
    if (autoJoinAttemptedRef.current || party.state !== 'idle') return;
    if (hasAutoJoinHash()) {
      const codeFromUrl = window.location.hash.replace('#battle=', '').trim().toUpperCase();
      if (codeFromUrl && /^[A-Z0-9]{4,5}$/.test(codeFromUrl)) {
        autoJoinAttemptedRef.current = true;
        setTab('join');
        setInputCode(codeFromUrl);
        handleJoinCode(codeFromUrl);
        // Consume the deep link so reopening the lobby later (after
        // party.leave()) does not silently re-join a stale room.
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }
  }, []);

  // Render animated sprite previews in lobby
  useEffect(() => {
    let animId = 0;
    let frame = 0;
    const render = () => {
      frame++;

      if (tab === 'local') {
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
      } else {
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
      }
      animId = requestAnimationFrame(render);
    };
    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [tab, localSkin, opponents, localSkins, playerCount]);

  const [isJoining, setIsJoining] = useState(false);

  const handleCancelJoin = () => {
    joinAttemptRef.current++;
    setIsJoining(false);
    party.leave();
    setJoined(false);
    clearRoster();
    setStatusMsg('JOIN CANCELLED');
  };

  const handleJoinCode = async (codeToJoin?: string) => {
    const code = (codeToJoin || inputCode).trim().toUpperCase();
    if (!/^[A-Z0-9]{4,5}$/.test(code)) {
      setStatusMsg('ENTER VALID ROOM CODE');
      return;
    }
    const attempt = ++joinAttemptRef.current;
    setJoined(false);
    clearRoster();
    setIsJoining(true);
    setRoomCode(code);
    setStatusMsg(`SEARCHING FOR ROOM ${code}...`);

    // No UI-side timeout here: partyManager's own ~105s join watchdog bails
    // with 'ROOM NOT FOUND - IT MAY HAVE CLOSED' if the room never proves
    // it exists, and the onStatusMsg handler resets isJoining on it.
    const joinedRoom = await party.join(code, onlineName, localSkin);
    if (attempt !== joinAttemptRef.current) return;
    if (!joinedRoom) {
      setIsJoining(false);
      setJoined(false);
    }
  };

  const copyTextToClipboard = async (text: string): Promise<boolean> => {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {}
    }
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.top = '0';
      el.style.left = '0';
      el.style.width = '100px';
      el.style.height = '100px';
      el.style.opacity = '0.01';
      el.style.pointerEvents = 'none';
      document.body.appendChild(el);
      el.focus({ preventScroll: true });
      el.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  };

  const handleCopyLink = async () => {
    const code = roomCode || party.roomId;
    if (!code) return;
    const base = window.location.origin + window.location.pathname;
    const url = `${base}#battle=${code}`;
    const ok = await copyTextToClipboard(url);
    if (ok) {
      setCopied(true);
      sfx.play('ui');
      setTimeout(() => setCopied(false), 2200);
    }
  };

  const allOpponentsReady = opponents.length > 0 && opponents.every((o) => o.ready);
  const readyCount = opponents.filter((o) => o.ready).length;

  const handleStartRun = () => {
    if (opponents.length === 0) {
      setStatusMsg('AT LEAST 2 PLAYERS REQUIRED');
      sfx.play('death');
      return;
    }
    if (!allOpponentsReady) {
      setStatusMsg('WAITING FOR ALL PLAYERS TO READY UP');
      sfx.play('death');
      return;
    }
    sfx.play('start');
    party.startMatch();
  };

  const toggleReady = () => {
    const next = !myReady;
    setMyReady(next);
    party.setReady(next);
    sfx.play('ui');
  };

  const handleStartLocal = () => {
    onClose();
    const activeSkins = localSkins.slice(0, playerCount);
    const activeNames = playerNames.slice(0, playerCount);
    const activeControls = playerControlSchemes.slice(0, playerCount);
    onStartLocalBattle(activeSkins, activeNames, activeControls);
  };

  const handleRematch = () => {
    setCountdown(null);
    if (matchResult?.mode === 'local') {
      onClearMatchResult();
      const activeSkins = localSkins.slice(0, playerCount);
      const activeNames = playerNames.slice(0, playerCount);
      const activeControls = playerControlSchemes.slice(0, playerCount);
      onStartLocalBattle(activeSkins, activeNames, activeControls);
    } else {
      if (opponents.length === 0) {
        setStatusMsg('NO OPPONENTS TO REMATCH');
        sfx.play('death');
        return;
      }
      party.rematch();
    }
  };

  const handleExit = () => {
    party.leave();
    onClearMatchResult();
    onClose();
  };

  const totalPlayers = opponents.length + 1;
  const playerColors = ['var(--ui-accent)', 'var(--ui-gold)', '#ff70a6', 'var(--ui-accent-hi)'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ui-bg)]/80 p-3 sm:p-4 font-pixel">
      <div className="relative flex max-h-[92dvh] w-full max-w-[680px] flex-col items-center border-2 border-[var(--ui-accent)] bg-[var(--ui-panel)] p-4 sm:p-6 text-[#ffffff] shadow-[4px_4px_0_var(--ui-bg)]">
        {/* Top Header */}
        <div className="flex w-full items-center justify-between border-b-2 border-[var(--ui-border)] pb-2 mb-3">
          <div className="flex items-center gap-2">
            <h2 className="font-pixel text-[12px] uppercase leading-none tracking-wider text-[var(--ui-accent)]">
              {matchResult ? 'MATCH RESULTS' : tab === 'local' ? 'LOCAL BATTLE' : 'ONLINE BATTLE'}
            </h2>
            {!matchResult && tab !== 'local' && (
              <span className="inline-block border-2 border-[var(--ui-danger)] bg-[var(--ui-danger)]/20 px-1.5 py-0.5 text-[8px] leading-none text-[var(--ui-danger)]">
                BETA
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleExit}
            aria-label="Close"
            className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center border-2 border-[var(--ui-danger)] bg-[var(--ui-danger)]/20 font-pixel text-[10px] text-[var(--ui-danger)] shadow-[1px_1px_0_var(--ui-bg)] hover:bg-[var(--ui-danger)]/40 active:translate-x-[1px] active:translate-y-[1px]"
          >
            <PixelCloseIcon className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* 1. MATCH RESULTS OVERLAY */}
        {matchResult ? (
          <div className="flex w-full flex-col items-center py-3 text-center">
            <h3
              className={`text-[12px] ${
                matchResult.isWinner ? 'text-[var(--ui-gold)]' : 'text-[var(--ui-danger)]'
              }`}
            >
              {matchResult.isWinner
                ? 'VICTORY - 1ST PLACE'
                : `${matchResult.rank}${matchResult.rank === 2 ? 'ND' : matchResult.rank === 3 ? 'RD' : 'TH'} PLACE`}
            </h3>
            <p className="mt-2 max-w-full break-words text-[20px] leading-tight text-[var(--ui-gold)] drop-shadow-[0_3px_0_var(--ui-bg)] sm:text-[28px]">
              {matchResult.winnerName.toUpperCase()}
            </p>
            <p className="mt-1.5 text-[10px] text-[var(--ui-muted)]">
              {matchResult.mode === 'local'
                ? 'WINS THE BATTLE!'
                : matchResult.isWinner
                ? 'YOU OUTLASTED ALL OPPONENTS!'
                : 'MATCH WINNER'}
            </p>

            {/* Leaderboard Table */}
            <div className="my-3 flex w-full max-w-md flex-col gap-1 border border-[var(--ui-border2)] bg-[var(--ui-bg)] p-2.5">
              <div className="grid grid-cols-5 text-[8px] text-[var(--ui-muted)] pb-1 border-b border-[var(--ui-border2)]">
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
                      ? 'bg-[var(--ui-accent)]/10 border border-[var(--ui-accent)]/40 text-[var(--ui-accent)]'
                      : 'text-[#ffffff]'
                  }`}
                >
                  <span>
                    {entry.rank === 1 ? '1ST' : entry.rank === 2 ? '2ND' : entry.rank === 3 ? '3RD' : `#${entry.rank}`}
                  </span>
                  <span className="col-span-2 truncate text-left">
                    {entry.name} {entry.isLocal && matchResult.mode !== 'local' ? '(YOU)' : ''}
                  </span>
                  <span className="text-[var(--ui-gold)]">{entry.score}</span>
                  <span>{entry.meters}M</span>
                </div>
              ))}
            </div>

            <div className="mt-3 flex w-full max-w-xs gap-3">
              <PixelButton
                variant="primary"
                onClick={handleRematch}
                className="flex-1 !bg-[var(--ui-accent)] !text-[var(--ui-bg)] hover:!bg-[var(--ui-accent-hi)]"
              >
                REMATCH
              </PixelButton>
              <PixelButton variant="ghost" onClick={handleExit} className="flex-1">
                MENU
              </PixelButton>
            </div>
          </div>
        ) : countdown !== null ? (
          /* 2. SYNCHRONIZED COUNTDOWN OVERLAY */
          <div className="flex flex-col items-center justify-center py-8">
            <span className="text-[10px] text-[var(--ui-accent-hi)] tracking-widest uppercase">
              STARTING IN
            </span>
            <div className="my-3 text-[28px] text-[var(--ui-gold)] sm:text-[36px]">
              {countdown === 0 ? 'GO' : countdown}
            </div>
            <span className="text-[8px] text-[var(--ui-muted)]">PREPARE TO RUN</span>
          </div>
        ) : (
          /* 3. LOBBY & HOST/JOIN/LOCAL TABS */
          <div className="flex w-full flex-col items-center overflow-y-auto py-1.5">
            {/* Primary Mode Tabs */}
            <div className="mb-4 flex w-full max-w-md border border-[var(--ui-border2)] bg-[var(--ui-bg)]">
              <button
                type="button"
                onClick={() => {
                  joinAttemptRef.current++;
                  setTab('host');
                  setJoined(false);
                  if (party.role !== 'host' || !roomCode) {
                    party.leave();
                    setRoomCode('');
                    clearRoster();
                    initHost();
                  }
                }}
                className={`flex-1 min-h-[40px] py-2 text-[10px] transition-colors ${
                  tab === 'host'
                    ? 'bg-[var(--ui-accent)] text-[var(--ui-bg)]'
                    : 'text-[var(--ui-muted)] hover:text-[#ffffff]'
                }`}
              >
                HOST ROOM
              </button>
              <button
                type="button"
                onClick={() => {
                  joinAttemptRef.current++;
                  setTab('join');
                  setJoined(false);
                  party.leave();
                  setRoomCode('');
                  clearRoster();
                  setStatusMsg('ENTER ROOM CODE TO JOIN');
                }}
                className={`flex-1 min-h-[40px] py-2 text-[10px] transition-colors ${
                  tab === 'join'
                    ? 'bg-[var(--ui-gold)] text-[var(--ui-bg)]'
                    : 'text-[var(--ui-muted)] hover:text-[#ffffff]'
                }`}
              >
                JOIN ROOM
              </button>
              <button
                type="button"
                onClick={() => {
                  joinAttemptRef.current++;
                  setTab('local');
                  party.leave();
                  setRoomCode('');
                  clearRoster();
                  setStatusMsg('');
                }}
                className={`flex-1 min-h-[40px] py-2 text-[10px] transition-colors ${
                  tab === 'local'
                    ? 'bg-[var(--ui-danger)] text-[var(--ui-bg)]'
                    : 'text-[var(--ui-muted)] hover:text-[#ffffff]'
                }`}
              >
                LOCAL BATTLE
              </button>
            </div>

            {/* Beta notice for online (host/join) tabs */}
            {tab !== 'local' && (
              <div className="mb-4 w-full max-w-md border border-[var(--ui-danger)]/40 bg-[var(--ui-danger)]/10 px-2 py-1 text-center text-[8px] text-[var(--ui-danger)]">
                ONLINE BATTLES ARE IN BETA — CONNECTIONS MAY DROP. LOCAL BATTLE IS STABLE.
              </div>
            )}

            {/* Your online name — persisted and pushed live to the room */}
            {tab !== 'local' && (
              <div className="mb-4 flex w-full max-w-md items-center gap-2">
                <span className="shrink-0 text-[8px] text-[var(--ui-muted)]">YOUR NAME:</span>
                <input
                  type="text"
                  value={onlineName}
                  onChange={(e) => updateOnlineName(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.stopPropagation()}
                  maxLength={16}
                  placeholder="RUNNER"
                  className="min-h-[32px] flex-1 select-text border border-[var(--ui-accent)]/60 bg-[var(--ui-bg)] px-2 py-1 text-center font-pixel text-[9px] uppercase text-[var(--ui-accent)] focus:border-[var(--ui-accent)] focus:outline-none"
                />
              </div>
            )}

            {/* HOST SECTION */}
            {tab === 'host' && (
              <div className="flex flex-col items-center gap-3 mb-4 w-full px-2 sm:px-4">
                <div className="flex items-center gap-2">
                  <span className="text-[8px] text-[var(--ui-muted)]">ROOM CODE:</span>
                  <div className="border border-[var(--ui-gold)] bg-[var(--ui-gold-dim)] px-3 py-1 text-[12px] tracking-widest text-[var(--ui-gold)]">
                    {roomCode || 'CREATING...'}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="border-2 border-[var(--ui-accent)]/80 bg-[var(--ui-accent)]/15 px-2.5 py-1 text-[8px] text-[var(--ui-accent)] hover:bg-[var(--ui-accent)]/30 active:translate-x-[1px] active:translate-y-[1px]"
                  >
                    {copied ? 'COPIED!' : 'COPY LINK'}
                  </button>
                </div>
              </div>
            )}

            {/* JOIN SECTION */}
            {tab === 'join' && (
              <div className="flex flex-col items-center gap-2.5 mb-4 w-full max-w-md px-2 sm:px-4">
                <div className="flex w-full gap-2">
                  <input
                    type="text"
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleJoinCode();
                      }
                    }}
                    placeholder="CODE (E.G. ABCDE)"
                    maxLength={5}
                    autoFocus
                    className="flex-1 min-h-[44px] select-text border border-[var(--ui-accent)]/60 bg-[var(--ui-bg)] px-3 py-1 text-center font-pixel text-[10px] text-[var(--ui-gold)] uppercase focus:border-[var(--ui-accent)] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={isJoining ? handleCancelJoin : () => handleJoinCode()}
                    className={`border-2 min-h-[44px] px-4 py-1 text-[10px] active:translate-x-[1px] active:translate-y-[1px] ${
                      isJoining
                        ? 'border-[var(--ui-danger)] bg-[var(--ui-danger)]/20 text-[var(--ui-danger)] hover:bg-[var(--ui-danger)]/40'
                        : 'border-[var(--ui-accent)] bg-[var(--ui-accent)] text-[var(--ui-bg)] hover:bg-[var(--ui-accent-hi)]'
                    }`}
                  >
                    {isJoining ? 'CANCEL' : 'JOIN'}
                  </button>
                </div>
              </div>
            )}

            {/* LOCAL BATTLE (2 - 4 PLAYERS) */}
            {tab === 'local' && (
              <div className="flex flex-col items-center gap-4 mb-4 w-full px-3 py-1 sm:px-6">
                {/* Player count buttons */}
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[8px] text-[var(--ui-muted)]">PLAYERS:</span>
                  {([2, 3, 4] as const).map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => setPlayerCount(cnt)}
                      className={`min-h-[32px] px-3 py-1 text-[8px] border-2 transition-colors ${
                        playerCount === cnt
                          ? 'border-[var(--ui-gold)] bg-[var(--ui-gold)] text-[var(--ui-bg)]'
                          : 'border-[var(--ui-border2)] bg-[#0c081e] text-[var(--ui-muted)] hover:text-[#ffffff]'
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
                        className="flex flex-col items-center border-2 p-4 justify-between bg-[#0a0518] shadow-[2px_2px_0_var(--ui-bg)]"
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
                          className="mt-2 w-full border bg-[var(--ui-bg)] text-center text-[10px] py-1.5 uppercase focus:outline-none"
                          style={{ borderColor: col, color: col }}
                        />

                        {/* Skin Selector */}
                        <div className="w-full mt-2 flex flex-col items-start">
                          <span className="text-[8px] text-[var(--ui-muted)] uppercase mb-0.5">SKIN:</span>
                          <select
                            value={localSkins[idx] || 'bob'}
                            onChange={(e) => {
                              const next = [...localSkins];
                              next[idx] = e.target.value as SkinId;
                              setLocalSkins(next);
                            }}
                            className="w-full min-h-[40px] border bg-[var(--ui-bg)] text-[10px] px-2 py-1.5 focus:outline-none cursor-pointer"
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
                          <span className="text-[8px] text-[var(--ui-muted)] uppercase mb-0.5">CONTROLS:</span>
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
                            className="w-full min-h-[40px] border bg-[var(--ui-bg)] text-[10px] px-2 py-1.5 focus:outline-none cursor-pointer"
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
              </div>
            )}

            {/* Status Line */}
            {statusMsg && (
              <div className="mb-3 text-center break-words text-[8px] text-[var(--ui-gold)]">
                {statusMsg}
              </div>
            )}

            {/* Roster Section for Online Mode */}
            {tab !== 'local' && (
              <div className="w-full max-w-md border border-[var(--ui-border2)] bg-[var(--ui-bg)] p-2.5 mb-3">
                <div className="text-[8px] text-[var(--ui-muted)] mb-2 text-center">
                  ROSTER ({totalPlayers}/{MAX_PLAYERS})
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2.5">
                  {/* Slot 1: You */}
                  <div className="flex flex-col items-center border border-[var(--ui-accent)] bg-[#0c1824] p-1 w-[88px] h-22 justify-between">
                    <canvas ref={localCanvasRef} width={60} height={60} className="w-9 h-9 pixelated" />
                    <span className="truncate text-[8px] text-[var(--ui-accent)] max-w-[76px]">
                      YOU
                    </span>
                    <span className="border border-[var(--ui-accent)] bg-[var(--ui-accent)]/20 px-1 text-[8px] text-[var(--ui-accent)]">
                      {tab === 'host' ? 'HOST' : myReady ? 'READY' : 'NOT READY'}
                    </span>
                  </div>

                  {/* Connected Opponents */}
                  {opponents.map((opp, i) => (
                    <div
                      key={opp.peerId}
                      className="flex flex-col items-center border p-1 w-[88px] h-22 justify-between border-[var(--ui-gold)] bg-[#0d061e]"
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
                      <span className="truncate text-[8px] max-w-[76px] text-[var(--ui-gold)]">
                        {opp.name}
                      </span>
                      <span className="border px-1 text-[8px] border-[var(--ui-accent)] text-[var(--ui-accent)]">
                        {opp.ready ? `P${i + 2} READY` : 'NOT READY'}
                      </span>
                    </div>
                  ))}

                  {/* Empty Waiting Slots */}
                  {Array.from({ length: Math.max(0, MAX_PLAYERS - totalPlayers) }).map((_, i) => (
                    <div
                      key={`empty-${i}`}
                      className="flex flex-col items-center justify-center border border-dashed border-[var(--ui-border2)] bg-[var(--ui-bg)]/40 w-[88px] h-22"
                    >
                      <span className="text-[8px] text-[var(--ui-muted)]">SLOT {totalPlayers + i + 1}</span>
                      <span className="text-[8px] text-[var(--ui-muted)]">EMPTY</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Launch / Start Button */}
            <div className="flex w-full max-w-sm justify-center">
              {tab === 'local' ? (
                <button
                  type="button"
                  onClick={handleStartLocal}
                  className="w-full border-2 border-[var(--ui-gold)] bg-[var(--ui-gold)] min-h-[44px] px-6 py-2.5 text-[10px] text-[#120726] transition-colors hover:bg-[#ffe082] active:translate-x-[1px] active:translate-y-[1px] shadow-[2px_2px_0_var(--ui-bg)]"
                >
                  START RUN
                </button>
              ) : tab === 'host' ? (
                <button
                  type="button"
                  onClick={handleStartRun}
                  disabled={opponents.length === 0 || !allOpponentsReady}
                  className="w-full border-2 border-[var(--ui-gold)] bg-[var(--ui-gold)] min-h-[44px] px-6 py-2.5 text-[10px] text-[#120726] transition-colors hover:bg-[#ffe082] disabled:opacity-40 disabled:hover:bg-[var(--ui-gold)] active:translate-x-[1px] active:translate-y-[1px] shadow-[2px_2px_0_var(--ui-bg)]"
                >
                  {opponents.length === 0
                    ? 'WAITING FOR PLAYERS...'
                    : allOpponentsReady
                    ? 'START BATTLE'
                    : `WAITING FOR READY (${readyCount}/${opponents.length})...`}
                </button>
              ) : (
                <div className="flex w-full flex-col items-center gap-2.5">
                  <div className="w-full text-center text-[9px] leading-relaxed tracking-wider text-[var(--ui-muted)]">
                    {opponents.length > 0 ? (
                      <span className="font-bold text-[var(--ui-accent)]">CONNECTED - WAITING FOR HOST TO START</span>
                    ) : joined ? (
                      'SEARCHING FOR HOST...'
                    ) : roomCode ? (
                      `CONNECTING TO ${roomCode}...`
                    ) : (
                      'ENTER CODE TO JOIN HOST'
                    )}
                  </div>
                  {tab === 'join' && opponents.length > 0 && (
                    <button
                      type="button"
                      onClick={toggleReady}
                      className={`w-full border-2 min-h-[44px] px-6 py-2.5 text-[10px] tracking-wider shadow-[2px_2px_0_var(--ui-bg)] transition-colors active:translate-x-[1px] active:translate-y-[1px] ${
                        myReady
                          ? 'border-[var(--ui-accent)] bg-[var(--ui-accent)] text-[var(--ui-bg)] hover:bg-[var(--ui-accent-hi)]'
                          : 'border-[var(--ui-accent)] bg-[var(--ui-accent)]/15 text-[var(--ui-accent)] hover:bg-[var(--ui-accent)]/30'
                      }`}
                    >
                      {myReady ? 'CANCEL READY' : 'I AM READY'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
