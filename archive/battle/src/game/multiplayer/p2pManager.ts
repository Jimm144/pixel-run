import type { SkinId } from '../skins';
import type {
  MatchRole,
  MatchState,
  OpponentInfo,
  PlayerTickPayload,
  NetEventPacket,
  MatchResult,
  LeaderboardEntry,
  PublicLobbyInfo,
} from './types';
import { ManualRoom } from './manualRoom';

const APP_ID = 'pixel-run-pvp-v1';
const DISCOVERY_ROOM = 'pixel-run-discovery-v1';
// v2: MATCH_START.targetStartTime is wall-clock (Date.now()+delay, epoch ms)
// instead of performance.now()+delay, which is per-tab and skews joiners'
// countdowns by the difference in page-load times. Version-gates countdown
// math: v1 peers using the old perf-relative payload are not mixed with v2.
const PROTOCOL_VERSION = 2;
export const MAX_PLAYERS = 5;

const PLAYER_COLORS = ['#7ef7ff', '#ff70a6', '#ffd166', '#a78bfa'];

// Only trackers verified reachable are kept. trystero slices relayConfig.urls to
// `redundancy ?? 3`, so the first N entries are the only ones ever used — dead
// trackers must not occupy those slots.
const TRACKERS = [
  'wss://tracker.openwebtorrent.com',
  'wss://open.ftorrent.com',
  'wss://tracker.webtorrent.dev',
];

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

// Public MQTT brokers over WSS (from @trystero-p2p/mqtt defaults). Used only as
// a fallback signaling path when the WebTorrent trackers are unreachable —
// some ISPs/corporate networks block torrent trackers while MQTT stays open.
// ORDER MATTERS: trystero connects to brokers in order until one answers, and
// captive networks usually only pass 443. Verified reachable endpoints come
// first; mosquitto is dead on most networks and stays last.
const MQTT_BROKERS = [
  'wss://public:public@public.cloud.shiftr.io',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker-cn.emqx.io:8084/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
];

const TORRENT_CONFIG = {
  appId: APP_ID,
  // Joiners must announce promptly so hosts find them; never let a room go dormant.
  passive: false,
  rtcConfig: {
    iceServers: ICE_SERVERS,
  },
  relayConfig: {
    urls: TRACKERS,
    redundancy: TRACKERS.length,
  },
};

// MQTT brokers are completely separate infrastructure from torrent trackers,
// so the MQTT config must NOT reuse relayConfig.urls (torrent WSS URLs would
// be handed to mqtt.js as if they were brokers).
const MQTT_CONFIG = {
  appId: APP_ID,
  passive: false,
  rtcConfig: {
    iceServers: ICE_SERVERS,
  },
  relayConfig: {
    urls: MQTT_BROKERS,
    redundancy: MQTT_BROKERS.length,
  },
};

type SignalStrategy = 'torrent' | 'mqtt' | 'manual';

function roomConfigFor(strategy: SignalStrategy) {
  return strategy === 'mqtt' ? MQTT_CONFIG : TORRENT_CONFIG;
}

// Literal specifiers so viteSingleFile can statically inline both strategies
// into the single-file bundle; a runtime `import(dynamicString)` would dangle.
async function loadStrategyModule(strategy: SignalStrategy) {
  if (strategy === 'mqtt') {
    return import('@trystero-p2p/mqtt');
  }
  return import('@trystero-p2p/torrent');
}

function registerMessageAction<T>(
  room: any,
  namespace: string,
  onMessage?: (data: T, peerId: string) => void
): (data: T, targetPeerId?: string) => Promise<void> {
  // trystero 0.25.3 makeAction returns { send, onMessage, onReceiveProgress }.
  const action = room.makeAction(namespace);
  if (onMessage) {
    action.onMessage = (data: T, context: any) => {
      const peerId = typeof context === 'string' ? context : (context?.peerId || '');
      onMessage(data, peerId);
    };
  }
  return async (data: T, targetPeerId?: string) => {
    try {
      if (targetPeerId) {
        await action.send(data, { target: targetPeerId });
      } else {
        await action.send(data);
      }
    } catch {}
  };
}

// In trystero 0.25.3 these are accessor properties (getter/setter). Calling
// `room.onPeerJoin(handler)` when a handler is already set invokes the OLD
// handler with the new handler as its peerId argument, which sends handshakes
// to a function id. Always assign through the setter instead.
function bindPeerEvent(room: any, eventName: 'onPeerJoin' | 'onPeerLeave', handler: (peerId: string) => void) {
  room[eventName] = handler;
}

export class P2PManager {
  public role: MatchRole = 'host';
  public roomId: string = '';
  public isPublic: boolean = false; // Private by default as requested
  public state: MatchState = 'idle';
  public opponents: Map<string, OpponentInfo> = new Map();
  public localName: string = 'PLAYER 1';
  public localSkin: SkinId = 'bob';
  public matchSeed: number = 0;
  public rttMs: number = 0;
  public localPeerId: string = '';

  public localFinalStats: { score: number; meters: number; kills: number } | null = null;
  public opponentDeaths: Map<string, { score: number; meters: number; kills: number }> = new Map();
  public opponentTicks: Map<string, PlayerTickPayload> = new Map();

  // Discovery state. The host's announce room and a joiner's browse room are
  // kept SEPARATE so browsing public lobbies can never tear down a host's
  // announce (they share the same DISCOVERY_ROOM namespace in trystero).
  private announceRoom: any = null;
  private browseRoom: any = null;
  private discoveryAnnounceTimer: number | null = null;
  public publicLobbies: Map<string, PublicLobbyInfo> = new Map();

  private room: any = null;
  // Signal rooms the manager actively sends/receives on. Normally one room;
  // a host that mirrored onto the backup strategy after a 10s silent wait
  // carries TWO rooms (torrent + mqtt) so peers converging on either strategy
  // still find it. Each entry carries the room's own action senders, because a
  // peer connected via torrent only exists inside the torrent room.
  private signalRooms: { room: any; label: SignalStrategy; sendTick: (data: PlayerTickPayload, targetPeerId?: string) => void; sendEvent: (data: NetEventPacket, targetPeerId?: string) => void }[] = [];
  // The mirrored (kept-alive) first room after a host fallback. Not replaced by
  // initRoom's cleanup; torn down only in leave().
  private mirrorRoom: any = null;
  private mirrorLabel: SignalStrategy = 'torrent';
  private mirrorActions: { sendTick: (data: PlayerTickPayload, targetPeerId?: string) => void; sendEvent: (data: NetEventPacket, targetPeerId?: string) => void } | null = null;
  // Guards against overlapping init/leave calls (React StrictMode double
  // effects, rapid re-join of the same code). trystero caches rooms per
  // appId+roomId until leave() fully settles (~100ms), so a re-join must wait
  // for the previous leave before creating a fresh room.
  private initSeq = 0;
  private pendingRoomLeave: Promise<void> | null = null;
  private announceSeq = 0;
  private browseSeq = 0;
  private announceLeavePromise: Promise<void> | null = null;
  private browseLeavePromise: Promise<void> | null = null;
  private initTimeout: number | null = null;
  private hostFallbackTimeout: number | null = null;
  private hostWatchdog: number | null = null;
  // Once a fallback actually fired, keep preferring the backup strategy for the
  // rest of the session (retries go straight to MQTT instead of re-waiting 5s).
  private fallbackUsed = false;
  // Primary signaling path is WebTorrent. `#mqtt` (or `#battle=...&mqtt`)
  // forces MQTT first when a user's ISP blocks the torrent trackers
  // (auto-fallback still applies).
  private readonly preferredStrategy: SignalStrategy =
    typeof window !== 'undefined' && window.location.hash.includes('mqtt')
      ? 'mqtt'
      : 'torrent';
  private strategy: SignalStrategy = this.preferredStrategy;

  // Stream state & packet ordering
  private localOutgoingSeq = 0;
  private peerSeqs: Map<string, number> = new Map();
  private wakeLock: any = null;

  // Event callbacks
  public onStateChange: ((state: MatchState) => void) | null = null;
  public onOpponentsUpdate: ((opps: OpponentInfo[]) => void) | null = null;
  public onCountdown: ((seconds: number) => void) | null = null;
  public onMatchStart: ((seed: number) => void) | null = null;
  public onOpponentTicks: ((ticks: PlayerTickPayload[]) => void) | null = null;
  public onOpponentDeath: ((data: { peerId: string; name: string; finalScore: number }) => void) | null = null;
  public onMatchResult: ((result: MatchResult) => void) | null = null;
  public onPublicLobbiesUpdate: ((lobbies: PublicLobbyInfo[]) => void) | null = null;
  public onError: ((err: string) => void) | null = null;
  // Diagnostic feed for the lobby: which signaling strategy is active and what
  // the peer connection is doing (signaling found the host vs data channel
  // blocked). Lets users report exactly where a join fails.
  public onDiag: ((diag: string) => void) | null = null;
  private diagInterval: number | null = null;
  private visibilityTimeout: number | null = null;
  private pendingResolveTimer: number | null = null;

  constructor() {
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  public generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  public parseRoomCode(raw: string): { valid: boolean; code: string; error?: string } {
    let clean = raw.trim().toUpperCase();
    if (!clean) return { valid: false, code: '', error: 'ENTER ROOM CODE' };

    if (clean.includes('#BATTLE=')) {
      clean = clean.split('#BATTLE=')[1];
    }
    // Strip trailing link params (e.g. #battle=ABCD&mqtt) so they never leak
    // into the room code.
    clean = clean.split('&')[0];
    if (clean.includes('-')) {
      clean = clean.split('-')[0];
    }
    clean = clean.replace(/[^A-Z0-9]/g, '');

    if (clean.length < 3) {
      return { valid: false, code: '', error: 'ROOM CODE TOO SHORT' };
    }
    return { valid: true, code: clean };
  }

  public async host(name: string, skinId: SkinId, isPublic: boolean = false): Promise<string> {
    this.leave();
    this.role = 'host';
    this.localName = name || 'PLAYER 1';
    this.localSkin = skinId;
    this.isPublic = isPublic;
    this.roomId = this.generateRoomCode();
    await this.initRoom();
    return this.roomId;
  }

  public setRoomVisibility(isPublic: boolean) {
    this.isPublic = isPublic;
    if (isPublic && this.state !== 'idle' && this.role === 'host') {
      this.startPublicAnnounce();
    } else {
      this.stopPublicAnnounce();
    }
  }

  public async join(roomCode: string, name: string, skinId: SkinId): Promise<boolean> {
    const parsed = this.parseRoomCode(roomCode);
    if (!parsed.valid) {
      if (this.onError) this.onError(parsed.error || 'INVALID ROOM CODE');
      return false;
    }
    this.leave();
    this.role = 'joiner';
    this.localName = name || 'PLAYER 2';
    this.localSkin = skinId;
    this.roomId = parsed.code;
    await this.initRoom();
    return true;
  }

  // ---- Zero-middleman (OFFLINE) mode ----
  // Raw WebRTC with no ICE servers, no trackers, no brokers. The host and each
  // joiner exchange compressed connection codes by hand. Only works on a shared
  // local network (same Wi-Fi / LAN), but requires NOTHING else to exist.

  public async hostOffline(name: string, skinId: SkinId): Promise<string> {
    this.leave();
    this.role = 'host';
    this.localName = name || 'PLAYER 1';
    this.localSkin = skinId;
    this.isPublic = false;
    this.roomId = 'OFFLINE';
    this.strategy = 'manual';
    await this.initRoom();
    const room = this.room as ManualRoom | null;
    if (!room) throw new Error('OFFLINE CONNECTION FAILED');
    return room.createOfferCode();
  }

  public async joinOffline(code: string, name: string, skinId: SkinId): Promise<string> {
    this.leave();
    this.role = 'joiner';
    this.localName = name || 'PLAYER 2';
    this.localSkin = skinId;
    this.roomId = 'OFFLINE';
    this.strategy = 'manual';
    await this.initRoom();
    const room = this.room as ManualRoom | null;
    if (!room) throw new Error('OFFLINE CONNECTION FAILED');
    return room.applyOfferCode(code);
  }

  public async acceptOfflineAnswer(code: string): Promise<boolean> {
    const room = this.room as ManualRoom | null;
    if (!room || this.role !== 'host') return false;
    await room.applyAnswerCode(code);
    return true;
  }

  // Registers the tick/event action channels and peer lifecycle handlers on
  // whatever room implementation is active (trystero or ManualRoom). Handlers
  // are bound to THIS room's actions so a peer that joined via the mirror room
  // gets its HANDSHAKE/ROOM_FULL replies through the same room it exists in.
  private attachRoomActions(room: any): { sendTick: (data: PlayerTickPayload, targetPeerId?: string) => void; sendEvent: (data: NetEventPacket, targetPeerId?: string) => void } {
    // 1. Unreliable coordinates channel
    const sendTick = registerMessageAction<PlayerTickPayload>(room, 'tick', (data, peerId) => {
      this.handleIncomingTick(data, peerId);
    });

    // 2. Reliable guaranteed events channel
    const sendEvent = registerMessageAction<NetEventPacket>(room, 'event', (data, peerId) => {
      this.handleIncomingEvent(data, peerId);
    });

    bindPeerEvent(room, 'onPeerJoin', (peerId: string) => {
      if (this.opponents.size >= MAX_PLAYERS - 1) {
        sendEvent({ type: 'ROOM_FULL' }, peerId);
        return;
      }

      sendEvent({
        type: 'HANDSHAKE',
        name: this.localName,
        skinId: this.localSkin,
        protocolVersion: PROTOCOL_VERSION,
        role: this.role,
      }, peerId);
    });

    bindPeerEvent(room, 'onPeerLeave', (peerId: string) => {
      if (this.opponents.has(peerId)) {
        this.opponents.delete(peerId);
        this.opponentTicks.delete(peerId);
        if (this.onOpponentsUpdate) {
          this.onOpponentsUpdate(Array.from(this.opponents.values()));
        }

        if (this.state === 'playing') {
          this.checkAllPlayersFinished();
        } else if (this.opponents.size === 0) {
          this.setState('lobby');
        }
      }
    });

    return { sendTick, sendEvent };
  }

  // Broadcast to every live signal room (primary + mirror after a host
  // fallback). Targetted sends are routed to the ONE room that actually holds
  // that peer, so the other room never warns about an unknown peer id.
  private emitTick(data: PlayerTickPayload) {
    for (const s of this.signalRooms) {
      try {
        s.sendTick(data);
      } catch {}
    }
  }

  private emitEvent(data: NetEventPacket, targetPeerId?: string) {
    if (!targetPeerId) {
      for (const s of this.signalRooms) {
        try {
          s.sendEvent(data);
        } catch {}
      }
      return;
    }
    for (const s of this.signalRooms) {
      try {
        if (s.room.getPeers && s.room.getPeers().has(targetPeerId)) {
          s.sendEvent(data, targetPeerId);
          return;
        }
      } catch {}
    }
    // No room holds the target peer anymore (it just left mid-session): drop
    // the packet silently. Force-sending to the first room made trystero log
    // "no peer with id" warnings and could throw for a peer that left while a
    // PING/PONG round-trip was in flight. ManualRoom's sendEvent validates the
    // target itself, so it also never needs the forced fallback.
    if (this.signalRooms.length > 0 && this.signalRooms.every((s) => !s.room.getPeers)) {
      try {
        this.signalRooms[0].sendEvent(data, targetPeerId);
      } catch {}
    }
  }

  private async initRoom() {
    const seq = ++this.initSeq;
    if (this.initTimeout !== null) {
      clearTimeout(this.initTimeout);
      this.initTimeout = null;
    }
    if (this.hostFallbackTimeout !== null) {
      clearTimeout(this.hostFallbackTimeout);
      this.hostFallbackTimeout = null;
    }
    if (this.hostWatchdog !== null) {
      clearTimeout(this.hostWatchdog);
      this.hostWatchdog = null;
    }
    this.setState('connecting');
    this.localOutgoingSeq = 0;
    this.peerSeqs.clear();
    this.opponents.clear();
    this.opponentTicks.clear();
    this.opponentDeaths.clear();
    this.localFinalStats = null;

    const roomId = this.roomId;
    const isHost = this.role === 'host';

    try {
      await this.createRoom(seq);

      // Non-terminal status hint after 5s of no peer. Captures the seq, roomId
      // and role at schedule time so a superseded init can never fire into the
      // next join's connect window, and leave() cancels it outright.
      this.initTimeout = window.setTimeout(() => {
        this.initTimeout = null;
        if (seq !== this.initSeq || this.state !== 'connecting' || this.opponents.size > 0) return;

        // A JOINER that can't reach its host has a genuine failure signal: the
        // host exists (it has the room code) but no peer ever appeared, so the
        // current signaling path is dead (blocked trackers / MQTT brokers).
        // Fall back to the other strategy. The HOST does not switch here — a
        // waiting host with no players is NORMAL; only a host that has waited a
        // very long time (see the 10s mirror timer below) concludes its
        // announce is unreachable and mirrors onto the backup strategy.
        if (!isHost && this.strategy === 'torrent') {
          this.switchToMqtt();
          return;
        }

        if (this.onError) {
          if (isHost) {
            this.onError(`ROOM ${roomId} READY — WAITING FOR PLAYERS`);
          } else {
            this.onError(`CAN'T REACH ROOM ${roomId} — CHECK CODE / HOST ONLINE`);
          }
        }
      }, 5000);

      // Host-only backup: if a host has been waiting 10s (connecting, or in the
      // lobby with at least one peer — including a peer that connected while a
      // second joiner stayed deadlocked), its trackers are likely unreachable
      // from some joiners' networks. MIRROR the room onto the backup strategy
      // instead of switching: the torrent room stays alive so joiners still
      // converging there (their fallback timers are slower, or a slow-but-good
      // torrent path) keep finding the host, while blocked joiners (who switch
      // at 5s) find the mirror on MQTT. 10s keeps both-blocked peers converging
      // before the modal's 15s TRY AGAIN.
      if (isHost) {
        this.hostFallbackTimeout = window.setTimeout(() => {
          this.hostFallbackTimeout = null;
          if (seq !== this.initSeq) return;
          if (this.state !== 'connecting' && this.state !== 'lobby') return;
          if (this.strategy === 'torrent' && !this.mirrorRoom) {
            if (this.signalRooms.length > 0) {
              this.mirrorRoom = this.room;
              this.mirrorLabel = 'torrent';
              this.mirrorActions = {
                sendTick: this.signalRooms[0].sendTick,
                sendEvent: this.signalRooms[0].sendEvent,
              };
            }
            this.strategy = 'mqtt';
            this.fallbackUsed = true;
            // Non-destructive: joins the MQTT room and rebinds the registry
            // with BOTH rooms; opponents/state are preserved.
            this.createRoom(seq);
          }
        }, 10000);
      }

      // Joiner-only watchdog: connected to peers, but none of them is the host
      // — the glare-election deadlock signature (smallest selfId bails on all
      // incoming offers while its own offers go unanswered). The host's own
      // offers may never have reached this joiner at all (torrent relay
      // asymmetry), so it will never join the host's torrent room. Switch to
      // MQTT, where a mirroring host is reachable. Kept at 12s so it can only
      // fire once the 5s zero-peer switch already proved the torrent path works
      // (we HAVE peers — just not the host).
      if (!isHost) {
        this.hostWatchdog = window.setTimeout(() => {
          this.hostWatchdog = null;
          if (seq !== this.initSeq) return;
          if (this.state === 'playing' || this.state === 'countdown' || this.state === 'idle') return;
          const hostPresent = Array.from(this.opponents.values()).some((o) => o.isHost);
          if (this.strategy === 'torrent' && this.opponents.size > 0 && !hostPresent) {
            this.switchToMqtt();
          }
        }, 12000);
      }

    } catch (err: any) {
      if (seq !== this.initSeq) return;
      if (this.onError) this.onError(err?.message || 'CONNECTION FAILED');
      this.setState('idle');
    }
  }

  // Creates (or re-creates) the primary signal room for this.strategy and binds
  // its actions. Non-destructive: keeps opponents and state intact — only
  // initRoom() clears those, so the host's mirror path can attach a second room
  // mid-session without losing connected peers.
  private async createRoom(seq: number) {
    if (this.strategy === 'manual') {
      this.room = new ManualRoom();
      this.localPeerId = this.room.selfId;
      this.room.onConnectionFailed = () => {
        if (seq !== this.initSeq) return;
        this.room = null;
        this.signalRooms = [];
        if (this.onError) {
          this.onError(
            this.role === 'host'
              ? "CAN'T REACH THE JOINER — BOTH DEVICES MUST BE ON THE SAME NETWORK (WIFI/AP ISOLATION BLOCKS DIRECT CONNECTION)"
              : "CAN'T REACH THE HOST — BOTH DEVICES MUST BE ON THE SAME NETWORK (WIFI/AP ISOLATION BLOCKS DIRECT CONNECTION)",
          );
        }
        this.setState('idle');
      };
      this.bindRoom(this.room, 'manual');
      this.startDiag();
      return;
    }
    const { joinRoom, selfId } = await loadStrategyModule(this.strategy);
    if (seq !== this.initSeq) return; // superseded by a newer init
    if (this.pendingRoomLeave) {
      await this.pendingRoomLeave;
      this.pendingRoomLeave = null;
      if (seq !== this.initSeq) return;
    }
    this.localPeerId = selfId;

    this.room = joinRoom(roomConfigFor(this.strategy) as any, this.roomId);
    this.bindRoom(this.room, this.strategy);
    this.startDiag();

    if (this.role === 'host' && this.isPublic) {
      this.startPublicAnnounce();
    }
  }

  // (Re)binds the signal-room registry around `room`. When a mirror room is
  // kept alive, both rooms stay registered: broadcasts go to both, and
  // targetted sends are routed to whichever room holds the peer.
  private bindRoom(room: any, label: SignalStrategy) {
    const actions = this.attachRoomActions(room);
    const bindings = [{ room, label, sendTick: actions.sendTick, sendEvent: actions.sendEvent }];
    if (this.mirrorRoom && this.mirrorRoom !== room && this.mirrorActions) {
      bindings.push({ room: this.mirrorRoom, label: this.mirrorLabel, sendTick: this.mirrorActions.sendTick, sendEvent: this.mirrorActions.sendEvent });
    }
    this.signalRooms = bindings;
  }

  // Drops the current room and restarts the whole flow on MQTT. Used by
  // joiners whose torrent path is dead (zero peers) or deadlocked (peers but
  // no host).
  private switchToMqtt() {
    if (this.room) {
      try {
        this.pendingRoomLeave = Promise.resolve(this.room.leave()).catch(() => {});
      } catch {}
      this.room = null;
    }
    this.signalRooms = [];
    this.strategy = 'mqtt';
    this.fallbackUsed = true;
    this.initRoom();
  }

  // Public Lobby Discovery Subsystem
  public async startBrowsingPublicLobbies() {
    this.stopBrowsingPublicLobbies();
    const seq = ++this.browseSeq;
    try {
      const { joinRoom } = await import('@trystero-p2p/torrent');
      if (this.browseLeavePromise) {
        await this.browseLeavePromise;
        this.browseLeavePromise = null;
        if (seq !== this.browseSeq) return;
      }
      this.browseRoom = joinRoom(TORRENT_CONFIG as any, DISCOVERY_ROOM);

      const sendRequest = registerMessageAction<{ ts: number }>(this.browseRoom, 'req_lobbies');
      registerMessageAction<PublicLobbyInfo>(this.browseRoom, 'public_lobby', (data) => {
        if (data && data.roomId && Date.now() - data.ts < 20000) {
          this.publicLobbies.set(data.roomId, data);
          this.prunePublicLobbies();
          if (this.onPublicLobbiesUpdate) {
            this.onPublicLobbiesUpdate(Array.from(this.publicLobbies.values()));
          }
        }
      });

      // Request immediate announcements from existing hosts
      bindPeerEvent(this.browseRoom, 'onPeerJoin', () => {
        sendRequest({ ts: Date.now() });
      });
      sendRequest({ ts: Date.now() });
    } catch {}
  }

  public stopBrowsingPublicLobbies() {
    this.browseSeq++; // invalidate any in-flight browse
    if (this.browseRoom) {
      try {
        this.browseLeavePromise = Promise.resolve(this.browseRoom.leave()).catch(() => {});
      } catch {}
      this.browseRoom = null;
    }
    this.publicLobbies.clear();
  }

  private prunePublicLobbies() {
    const now = Date.now();
    for (const [roomId, info] of this.publicLobbies.entries()) {
      if (now - info.ts > 20000) {
        this.publicLobbies.delete(roomId);
      }
    }
  }

  private async startPublicAnnounce() {
    this.stopPublicAnnounce();
    const seq = ++this.announceSeq;
    try {
      const { joinRoom } = await import('@trystero-p2p/torrent');
      if (this.announceLeavePromise) {
        await this.announceLeavePromise;
        this.announceLeavePromise = null;
        if (seq !== this.announceSeq) return;
      }
      this.announceRoom = joinRoom(TORRENT_CONFIG as any, DISCOVERY_ROOM);

      const sendLobby = registerMessageAction<PublicLobbyInfo>(this.announceRoom, 'public_lobby');

      const broadcast = (targetPeerId?: string) => {
        if (!this.isPublic || this.state === 'playing' || !this.roomId) return;
        const payload: PublicLobbyInfo = {
          roomId: this.roomId,
          hostName: this.localName,
          hostSkin: this.localSkin,
          playerCount: this.opponents.size + 1,
          maxPlayers: MAX_PLAYERS,
          ts: Date.now(),
        };
        sendLobby(payload, targetPeerId);
      };

      // Respond immediately when a browser joins discovery or requests lobbies
      registerMessageAction<{ ts: number }>(this.announceRoom, 'req_lobbies', (_, peerId) => {
        broadcast(peerId);
      });
      bindPeerEvent(this.announceRoom, 'onPeerJoin', (peerId: string) => {
        broadcast(peerId);
      });

      broadcast();
      this.discoveryAnnounceTimer = window.setInterval(() => broadcast(), 3500);
    } catch {}
  }

  private stopPublicAnnounce() {
    this.announceSeq++; // invalidate any in-flight announce
    if (this.discoveryAnnounceTimer) {
      clearInterval(this.discoveryAnnounceTimer);
      this.discoveryAnnounceTimer = null;
    }
    if (this.announceRoom) {
      try {
        this.announceLeavePromise = Promise.resolve(this.announceRoom.leave()).catch(() => {});
      } catch {}
      this.announceRoom = null;
    }
  }

  private handleIncomingEvent(packet: NetEventPacket, peerId: string) {
    if (!packet || typeof packet !== 'object') return;

    switch (packet.type) {
      case 'HANDSHAKE': {
        if (this.opponents.size >= MAX_PLAYERS - 1 && !this.opponents.has(peerId)) {
          return;
        }

        const isNewPeer = !this.opponents.has(peerId);
        const playerIdx = this.opponents.size + 2;
        const color = PLAYER_COLORS[(playerIdx - 2) % PLAYER_COLORS.length];

        const oppInfo: OpponentInfo = {
          peerId,
          name: packet.name || `PLAYER ${playerIdx}`,
          skinId: packet.skinId || 'bob',
          pingMs: 0,
          ready: true,
          color,
          playerIndex: playerIdx,
          isHost: packet.role === 'host',
        };

        this.opponents.set(peerId, oppInfo);
        if (this.onOpponentsUpdate) {
          this.onOpponentsUpdate(Array.from(this.opponents.values()));
        }
        this.setState('lobby');

        // Mutual handshake reply: ensure both host and joiner always know each other
        if (isNewPeer) {
          this.emitEvent({
            type: 'HANDSHAKE',
            name: this.localName,
            skinId: this.localSkin,
            protocolVersion: PROTOCOL_VERSION,
            role: this.role,
          }, peerId);
        }

        this.emitEvent({
          type: 'PING',
          id: 1,
          sentAt: performance.now(),
        }, peerId);
        break;
      }

      case 'PING': {
        this.emitEvent({
          type: 'PONG',
          id: packet.id,
          sentAt: packet.sentAt,
          receivedAt: performance.now(),
        }, peerId);
        break;
      }

      case 'PONG': {
        const now = performance.now();
        const rtt = Math.max(1, Math.round(now - packet.sentAt));
        this.rttMs = rtt;
        const opp = this.opponents.get(peerId);
        if (opp) {
          opp.pingMs = rtt;
          if (this.onOpponentsUpdate) {
            this.onOpponentsUpdate(Array.from(this.opponents.values()));
          }
        }
        break;
      }

      case 'ROOM_FULL': {
        if (this.onError) this.onError('ROOM IS FULL (MAX 5 PLAYERS)');
        this.leave();
        break;
      }

      case 'MATCH_START': {
        this.matchSeed = packet.seed;
        this.localFinalStats = null;
        this.opponentDeaths.clear();
        this.opponentTicks.clear();
        this.localOutgoingSeq = 0;
        this.peerSeqs.clear();
        this.stopPublicAnnounce();
        this.startSynchronizedCountdown(packet.targetStartTime);
        break;
      }

      case 'PLAYER_DEATH': {
        this.opponentDeaths.set(peerId, {
          score: packet.finalScore,
          meters: packet.finalMeters,
          kills: packet.kills,
        });

        const opp = this.opponents.get(peerId);
        if (this.onOpponentDeath) {
          this.onOpponentDeath({
            peerId,
            name: opp?.name || 'OPPONENT',
            finalScore: packet.finalScore,
          });
        }

        this.checkAllPlayersFinished();
        break;
      }

      case 'FORFEIT': {
        this.opponentDeaths.set(peerId, { score: 0, meters: 0, kills: 0 });
        this.checkAllPlayersFinished();
        break;
      }

      case 'REMATCH_REQUEST': {
        if (this.role === 'host') {
          this.startMatch();
        }
        break;
      }
    }
  }

  private peerLastTickTs: Map<string, number> = new Map();
  private matchWatchdogInterval: number | null = null;

  private handleIncomingTick(data: PlayerTickPayload, peerId: string) {
    if (!data || typeof data.seq !== 'number') return;
    const lastSeq = this.peerSeqs.get(peerId) ?? -1;
    if (data.seq <= lastSeq) return;
    this.peerSeqs.set(peerId, data.seq);
    this.peerLastTickTs.set(peerId, performance.now());

    const payload: PlayerTickPayload = {
      ...data,
      peerId,
    };
    this.opponentTicks.set(peerId, payload);

    if (this.onOpponentTicks) {
      this.onOpponentTicks(Array.from(this.opponentTicks.values()));
    }
  }

  public startMatch(): boolean {
    if (this.role !== 'host' || this.opponents.size === 0 || this.signalRooms.length === 0) return false;
    this.matchSeed = (Math.random() * 0x7fffffff) >>> 0;
    this.localFinalStats = null;
    this.opponentDeaths.clear();
    this.opponentTicks.clear();
    this.peerLastTickTs.clear();
    this.localOutgoingSeq = 0;
    this.peerSeqs.clear();
    this.stopPublicAnnounce();

    // WALL-CLOCK time: Date.now() is shared across tabs/devices, whereas
    // performance.now() is per-tab (each tab has its own page-load time
    // origin), so a perf-relative target made joiners' countdowns skew by
    // their tab's load-time offset from the host.
    const targetStartTime = Date.now() + 3000;

    this.emitEvent({
      type: 'MATCH_START',
      seed: this.matchSeed,
      targetStartTime,
      startDelayMs: 3000,
    });

    this.startSynchronizedCountdown(targetStartTime);
    return true;
  }

  private startSynchronizedCountdown(targetStartTime: number) {
    this.setState('countdown');
    this.acquireWakeLock();
    this.startMatchWatchdog();

    const checkCountdown = () => {
      // Wall-clock: targetStartTime was sent as Date.now()+delay (epoch ms).
      const now = Date.now();
      const remainingMs = targetStartTime - now;

      if (remainingMs <= 0) {
        if (this.onCountdown) this.onCountdown(0);
        this.setState('playing');
        if (this.onMatchStart) this.onMatchStart(this.matchSeed);
      } else {
        const sec = Math.ceil(remainingMs / 1000);
        if (this.onCountdown) this.onCountdown(sec);
        requestAnimationFrame(checkCountdown);
      }
    };
    requestAnimationFrame(checkCountdown);
  }

  private startMatchWatchdog() {
    this.stopMatchWatchdog();
    this.matchWatchdogInterval = window.setInterval(() => {
      if (this.state !== 'playing') return;
      const now = performance.now();
      for (const [peerId] of this.opponents.entries()) {
        if (!this.opponentDeaths.has(peerId)) {
          const lastTs = this.peerLastTickTs.get(peerId);
          if (lastTs && now - lastTs > 7000) {
            // Peer stopped ticking with no death/forfeit: its connection is
            // gone — an abruptly closed tab is only detected late by ICE, so
            // onPeerLeave can lag far beyond this window. Remove the peer from
            // the roster entirely instead of recording a "death": a ghost
            // entry with frozen stats pollutes the final leaderboard, and the
            // late onPeerLeave would then have nothing left to clean up.
            this.opponents.delete(peerId);
            this.opponentTicks.delete(peerId);
            this.peerLastTickTs.delete(peerId);
            if (this.onOpponentsUpdate) {
              this.onOpponentsUpdate(Array.from(this.opponents.values()));
            }
            this.checkAllPlayersFinished();
          }
        }
      }
    }, 2000);
  }

  private stopMatchWatchdog() {
    if (this.matchWatchdogInterval) {
      clearInterval(this.matchWatchdogInterval);
      this.matchWatchdogInterval = null;
    }
  }

  public sendTick(tickPayload: Omit<PlayerTickPayload, 'seq'>) {
    if (this.signalRooms.length === 0 || this.state !== 'playing') return;
    this.localOutgoingSeq++;
    const payload: PlayerTickPayload = {
      ...tickPayload,
      peerId: this.localPeerId,
      seq: this.localOutgoingSeq,
    };
    this.emitTick(payload);
  }

  public sendDeath(collisionTick: number, finalScore: number, finalMeters: number, kills: number) {
    this.localFinalStats = { score: finalScore, meters: finalMeters, kills };

    this.emitEvent({
      type: 'PLAYER_DEATH',
      collisionTick,
      finalScore,
      finalMeters,
      kills,
    });

    this.checkAllPlayersFinished();
  }

  private checkAllPlayersFinished() {
    if (!this.localFinalStats) return;

    const allDone = Array.from(this.opponents.keys()).every((peerId) =>
      this.opponentDeaths.has(peerId),
    );

    if (allDone || this.opponents.size === 0) {
      this.resolveMultiplayerLeaderboard();
    }
  }

  private resolveMultiplayerLeaderboard() {
    const entries: LeaderboardEntry[] = [];

    entries.push({
      peerId: 'local',
      name: `YOU (${this.localName})`,
      skinId: this.localSkin,
      score: this.localFinalStats?.score ?? 0,
      meters: this.localFinalStats?.meters ?? 0,
      kills: this.localFinalStats?.kills ?? 0,
      dead: true,
      rank: 1,
      isLocal: true,
      color: '#3ef2c8',
    });

    this.opponents.forEach((opp, peerId) => {
      const death = this.opponentDeaths.get(peerId);
      entries.push({
        peerId,
        name: opp.name,
        skinId: opp.skinId,
        score: death?.score ?? 0,
        meters: death?.meters ?? 0,
        kills: death?.kills ?? 0,
        dead: true,
        rank: 1,
        isLocal: false,
        color: opp.color,
      });
    });

    entries.sort((a, b) => b.score - a.score || b.meters - a.meters);

    entries.forEach((e, idx) => {
      e.rank = idx + 1;
    });

    const localEntry = entries.find((e) => e.isLocal);
    const localRank = localEntry ? localEntry.rank : 1;

    const result: MatchResult = {
      rankings: entries,
      localRank,
      totalPlayers: entries.length,
      reason: 'death',
    };

    if (this.onMatchResult) {
      this.onMatchResult(result);
    }
    this.setState('ended');
  }

  public requestRematch() {
    if (this.role === 'host') {
      this.startMatch();
    } else if (this.signalRooms.length > 0) {
      this.emitEvent({ type: 'REMATCH_REQUEST' });
    }
  }

  private handleVisibilityChange() {
    // Arm the forfeit during the countdown too: a player who tabs out between
    // START and GO (or whose countdown stalls on a frozen background tab) must
    // still forfeit, otherwise their match never resolves and peers wait on a
    // ghost.
    if (document.hidden && (this.state === 'playing' || this.state === 'countdown')) {
      this.visibilityTimeout = window.setTimeout(() => {
        this.visibilityTimeout = null;
        if (document.hidden && (this.state === 'playing' || this.state === 'countdown')) {
          this.emitEvent({ type: 'FORFEIT', reason: 'PLAYER TABBED OUT' });
          this.localFinalStats = { score: 0, meters: 0, kills: 0 };
          // Resolve AFTER the match watchdog's window (7s): peers whose tabs
          // died abruptly are only detected late by ICE, and the watchdog
          // removes them from the roster first. Resolving immediately could
          // snapshot a ghost entry for a peer that actually left.
          this.pendingResolveTimer = window.setTimeout(() => {
            this.pendingResolveTimer = null;
            // This player is OUT (forfeited) — don't wait for opponents to
            // finish (checkAllPlayersFinished would never resolve if they keep
            // playing). Resolve the leaderboard snapshot directly.
            this.resolveMultiplayerLeaderboard();
          }, 7000);
        }
      }, 4000);
    } else if (!document.hidden && this.visibilityTimeout) {
      clearTimeout(this.visibilityTimeout);
      this.visibilityTimeout = null;
    }
  }

  private async acquireWakeLock() {
    try {
      if ('wakeLock' in navigator && (navigator as any).wakeLock) {
        this.wakeLock = await (navigator as any).wakeLock.request('screen');
      }
    } catch {}
  }

  private releaseWakeLock() {
    try {
      if (this.wakeLock) {
        this.wakeLock.release();
        this.wakeLock = null;
      }
    } catch {}
  }

  private setState(next: MatchState) {
    this.state = next;
    if (this.onStateChange) this.onStateChange(next);
  }

  private startDiag() {
    this.stopDiag();
    this.diagInterval = window.setInterval(() => {
      if (!this.onDiag) return;
      try {
        const parts = this.signalRooms.map((s) => {
          const peers = s.room && typeof s.room.getPeers === 'function' ? s.room.getPeers() : null;
          let info = 'NO PEERS FOUND';
          if (peers && peers.size > 0) {
            info = [...peers.values()]
              .map((pc: any) => pc?.connectionState || pc?.iceConnectionState || 'PENDING')
              .join(',');
          }
          return `${s.label.toUpperCase()}·${info}`;
        });
        this.onDiag(parts.length > 0 ? parts.join(' | ') : `${this.strategy.toUpperCase()} · NO PEERS FOUND`);
      } catch {}
    }, 2000);
  }

  private stopDiag() {
    if (this.diagInterval !== null) {
      clearInterval(this.diagInterval);
      this.diagInterval = null;
    }
  }

  public leave() {
    this.initSeq++; // invalidate any in-flight initRoom
    this.strategy = this.fallbackUsed ? 'mqtt' : this.preferredStrategy;
    if (this.initTimeout !== null) {
      clearTimeout(this.initTimeout);
      this.initTimeout = null;
    }
    if (this.hostFallbackTimeout !== null) {
      clearTimeout(this.hostFallbackTimeout);
      this.hostFallbackTimeout = null;
    }
    if (this.hostWatchdog !== null) {
      clearTimeout(this.hostWatchdog);
      this.hostWatchdog = null;
    }
    this.releaseWakeLock();
    this.stopMatchWatchdog();
    this.stopPublicAnnounce();
    this.stopDiag();
    this.stopBrowsingPublicLobbies();
    if (this.visibilityTimeout) clearTimeout(this.visibilityTimeout);
    if (this.pendingResolveTimer) {
      clearTimeout(this.pendingResolveTimer);
      this.pendingResolveTimer = null;
    }

    if (this.room) {
      try {
        this.pendingRoomLeave = Promise.resolve(this.room.leave()).catch(() => {});
      } catch {}
      this.room = null;
    }
    if (this.mirrorRoom) {
      try {
        this.pendingRoomLeave = Promise.resolve(this.mirrorRoom.leave()).catch(() => {});
      } catch {}
      this.mirrorRoom = null;
      this.mirrorActions = null;
    }
    this.signalRooms = [];
    this.opponents.clear();
    this.opponentTicks.clear();
    this.opponentDeaths.clear();
    this.peerSeqs.clear();
    this.localFinalStats = null;
    this.localOutgoingSeq = 0;
    this.setState('idle');
  }

  public destroy() {
    this.leave();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }
}

export const p2p = new P2PManager();
