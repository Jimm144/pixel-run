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

const APP_ID = 'pixel-run-pvp-v1';
const DISCOVERY_ROOM = 'pixel-run-discovery-v1';
const PROTOCOL_VERSION = 1;
export const MAX_PLAYERS = 5;

const PLAYER_COLORS = ['#7ef7ff', '#ff70a6', '#ffd166', '#a78bfa'];

const TRACKERS = [
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.webtorrent.dev',
  'wss://tracker.btorrent.xyz',
  'wss://tracker.files.fm:7073/announce',
  'wss://open.ftorrent.com',
];

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

const ROOM_CONFIG = {
  appId: APP_ID,
  rtcConfig: {
    iceServers: ICE_SERVERS,
  },
  relayConfig: {
    urls: TRACKERS,
  },
};

function registerMessageAction<T>(
  room: any,
  namespace: string,
  onMessage?: (data: T, peerId: string) => void
): (data: T, targetPeerId?: string) => Promise<void> {
  const action = room.makeAction(namespace);
  if (Array.isArray(action)) {
    const [send, get] = action;
    if (onMessage) get((data: T, peerId: string) => onMessage(data, peerId));
    return async (data: T, targetPeerId?: string) => {
      send(data, targetPeerId);
    };
  }
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

function bindPeerEvent(room: any, eventName: 'onPeerJoin' | 'onPeerLeave', handler: (peerId: string) => void) {
  if (typeof room[eventName] === 'function') {
    room[eventName](handler);
  } else {
    room[eventName] = handler;
  }
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

  // Discovery state
  private discoveryRoom: any = null;
  private discoveryAnnounceTimer: number | null = null;
  public publicLobbies: Map<string, PublicLobbyInfo> = new Map();

  private room: any = null;
  private sendTickAction: ((data: PlayerTickPayload, targetPeerId?: string) => void) | null = null;
  private sendEventAction: ((data: NetEventPacket, targetPeerId?: string) => void) | null = null;

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

  private visibilityTimeout: number | null = null;

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

  private async initRoom() {
    this.setState('connecting');
    this.localOutgoingSeq = 0;
    this.peerSeqs.clear();
    this.opponents.clear();
    this.opponentTicks.clear();
    this.opponentDeaths.clear();
    this.localFinalStats = null;

    try {
      const { joinRoom, selfId } = await import('@trystero-p2p/torrent');
      this.localPeerId = selfId;

      this.room = joinRoom(ROOM_CONFIG as any, this.roomId);

      // 1. Unreliable coordinates channel
      this.sendTickAction = registerMessageAction<PlayerTickPayload>(this.room, 'tick', (data, peerId) => {
        this.handleIncomingTick(data, peerId);
      });

      // 2. Reliable guaranteed events channel
      this.sendEventAction = registerMessageAction<NetEventPacket>(this.room, 'event', (data, peerId) => {
        this.handleIncomingEvent(data, peerId);
      });

      bindPeerEvent(this.room, 'onPeerJoin', (peerId: string) => {
        if (this.opponents.size >= MAX_PLAYERS - 1) {
          if (this.sendEventAction) {
            this.sendEventAction({ type: 'ROOM_FULL' }, peerId);
          }
          return;
        }

        if (this.sendEventAction) {
          this.sendEventAction({
            type: 'HANDSHAKE',
            name: this.localName,
            skinId: this.localSkin,
            protocolVersion: PROTOCOL_VERSION,
          }, peerId);
        }
      });

      bindPeerEvent(this.room, 'onPeerLeave', (peerId: string) => {
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

      if (this.role === 'host' && this.isPublic) {
        this.startPublicAnnounce();
      }

      setTimeout(() => {
        if (this.state === 'connecting' && this.opponents.size === 0) {
          if (this.onError) {
            if (this.role === 'host') {
              this.onError(`ROOM ${this.roomId} READY — WAITING FOR PLAYERS`);
            } else {
              this.onError(`SEARCHING FOR ROOM ${this.roomId}...`);
            }
          }
        }
      }, 5000);

    } catch (err: any) {
      if (this.onError) this.onError(err?.message || 'CONNECTION FAILED');
      this.setState('idle');
    }
  }

  // Public Lobby Discovery Subsystem
  public async startBrowsingPublicLobbies() {
    this.stopBrowsingPublicLobbies();
    try {
      const { joinRoom } = await import('@trystero-p2p/torrent');
      this.discoveryRoom = joinRoom(ROOM_CONFIG as any, DISCOVERY_ROOM);

      const sendRequest = registerMessageAction<{ ts: number }>(this.discoveryRoom, 'req_lobbies');
      registerMessageAction<PublicLobbyInfo>(this.discoveryRoom, 'public_lobby', (data) => {
        if (data && data.roomId && Date.now() - data.ts < 20000) {
          this.publicLobbies.set(data.roomId, data);
          this.prunePublicLobbies();
          if (this.onPublicLobbiesUpdate) {
            this.onPublicLobbiesUpdate(Array.from(this.publicLobbies.values()));
          }
        }
      });

      // Request immediate announcements from existing hosts
      bindPeerEvent(this.discoveryRoom, 'onPeerJoin', () => {
        sendRequest({ ts: Date.now() });
      });
      sendRequest({ ts: Date.now() });
    } catch {}
  }

  public stopBrowsingPublicLobbies() {
    if (this.discoveryRoom) {
      try {
        this.discoveryRoom.leave();
      } catch {}
      this.discoveryRoom = null;
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
    try {
      const { joinRoom } = await import('@trystero-p2p/torrent');
      this.discoveryRoom = joinRoom(ROOM_CONFIG as any, DISCOVERY_ROOM);

      const sendLobby = registerMessageAction<PublicLobbyInfo>(this.discoveryRoom, 'public_lobby');

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
      registerMessageAction<{ ts: number }>(this.discoveryRoom, 'req_lobbies', (_, peerId) => {
        broadcast(peerId);
      });
      bindPeerEvent(this.discoveryRoom, 'onPeerJoin', (peerId: string) => {
        broadcast(peerId);
      });

      broadcast();
      this.discoveryAnnounceTimer = window.setInterval(() => broadcast(), 3500);
    } catch {}
  }

  private stopPublicAnnounce() {
    if (this.discoveryAnnounceTimer) {
      clearInterval(this.discoveryAnnounceTimer);
      this.discoveryAnnounceTimer = null;
    }
    if (this.discoveryRoom) {
      try {
        this.discoveryRoom.leave();
      } catch {}
      this.discoveryRoom = null;
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
        };

        this.opponents.set(peerId, oppInfo);
        if (this.onOpponentsUpdate) {
          this.onOpponentsUpdate(Array.from(this.opponents.values()));
        }
        this.setState('lobby');

        // Mutual handshake reply: ensure both host and joiner always know each other
        if (isNewPeer && this.sendEventAction) {
          this.sendEventAction({
            type: 'HANDSHAKE',
            name: this.localName,
            skinId: this.localSkin,
            protocolVersion: PROTOCOL_VERSION,
          }, peerId);
        }

        if (this.sendEventAction) {
          this.sendEventAction({
            type: 'PING',
            id: 1,
            sentAt: performance.now(),
          }, peerId);
        }
        break;
      }

      case 'PING': {
        if (this.sendEventAction) {
          this.sendEventAction({
            type: 'PONG',
            id: packet.id,
            sentAt: packet.sentAt,
            receivedAt: performance.now(),
          }, peerId);
        }
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
    if (this.role !== 'host' || this.opponents.size === 0 || !this.sendEventAction) return false;
    this.matchSeed = (Math.random() * 0x7fffffff) >>> 0;
    this.localFinalStats = null;
    this.opponentDeaths.clear();
    this.opponentTicks.clear();
    this.peerLastTickTs.clear();
    this.localOutgoingSeq = 0;
    this.peerSeqs.clear();
    this.stopPublicAnnounce();

    const targetStartTime = performance.now() + 3000;

    this.sendEventAction({
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
      const now = performance.now();
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
            // Peer disconnected / tab closed mid-game
            const lastTick = this.opponentTicks.get(peerId);
            this.opponentDeaths.set(peerId, {
              score: lastTick?.score ?? 0,
              meters: lastTick?.meters ?? 0,
              kills: lastTick?.kills ?? 0,
            });
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
    if (!this.sendTickAction || this.state !== 'playing') return;
    this.localOutgoingSeq++;
    const payload: PlayerTickPayload = {
      ...tickPayload,
      peerId: this.localPeerId,
      seq: this.localOutgoingSeq,
    };
    this.sendTickAction(payload);
  }

  public sendDeath(collisionTick: number, finalScore: number, finalMeters: number, kills: number) {
    this.localFinalStats = { score: finalScore, meters: finalMeters, kills };

    if (this.sendEventAction) {
      this.sendEventAction({
        type: 'PLAYER_DEATH',
        collisionTick,
        finalScore,
        finalMeters,
        kills,
      });
    }

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
    } else if (this.sendEventAction) {
      this.sendEventAction({ type: 'REMATCH_REQUEST' });
    }
  }

  private handleVisibilityChange() {
    if (document.hidden && this.state === 'playing') {
      this.visibilityTimeout = window.setTimeout(() => {
        if (document.hidden && this.state === 'playing') {
          if (this.sendEventAction) {
            this.sendEventAction({ type: 'FORFEIT', reason: 'PLAYER TABBED OUT' });
          }
          this.localFinalStats = { score: 0, meters: 0, kills: 0 };
          this.resolveMultiplayerLeaderboard();
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

  public leave() {
    this.releaseWakeLock();
    this.stopMatchWatchdog();
    this.stopPublicAnnounce();
    this.stopBrowsingPublicLobbies();
    if (this.visibilityTimeout) clearTimeout(this.visibilityTimeout);

    if (this.room) {
      try {
        this.room.leave();
      } catch {}
      this.room = null;
    }
    this.opponents.clear();
    this.opponentTicks.clear();
    this.opponentDeaths.clear();
    this.peerSeqs.clear();
    this.localFinalStats = null;
    this.localOutgoingSeq = 0;
    this.sendTickAction = null;
    this.sendEventAction = null;
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
