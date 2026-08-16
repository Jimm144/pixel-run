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

const RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.snort.social',
  'wss://relay.primal.net',
];

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
      const { joinRoom, selfId } = await import('trystero/nostr');
      this.localPeerId = selfId;

      this.room = joinRoom(
        {
          appId: APP_ID,
          relayUrls: RELAYS,
        } as any,
        this.roomId,
      );

      // 1. Unreliable coordinates channel
      const [sendTick, getTick] = this.room.makeAction('tick');
      this.sendTickAction = sendTick;
      getTick((data: any, peerId: string) => {
        this.handleIncomingTick(data as PlayerTickPayload, peerId);
      });

      // 2. Reliable guaranteed events channel
      const [sendEvent, getEvent] = this.room.makeAction('event');
      this.sendEventAction = sendEvent;
      getEvent((data: any, peerId: string) => {
        this.handleIncomingEvent(data as NetEventPacket, peerId);
      });

      this.room.onPeerJoin((peerId: string) => {
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
          });
        }
      });

      this.room.onPeerLeave((peerId: string) => {
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
            this.onError('WAITING FOR PLAYERS... SHARE ROOM CODE');
          }
        }
      }, 6000);

    } catch (err: any) {
      if (this.onError) this.onError(err?.message || 'CONNECTION FAILED');
      this.setState('idle');
    }
  }

  // Public Lobby Discovery Subsystem
  public async startBrowsingPublicLobbies() {
    this.stopBrowsingPublicLobbies();
    try {
      const { joinRoom } = await import('trystero/nostr');
      this.discoveryRoom = joinRoom(
        {
          appId: APP_ID,
          relayUrls: RELAYS,
        } as any,
        DISCOVERY_ROOM,
      );

      const [, getLobby] = this.discoveryRoom.makeAction('public_lobby');
      getLobby((data: PublicLobbyInfo) => {
        if (data && data.roomId && Date.now() - data.ts < 15000) {
          this.publicLobbies.set(data.roomId, data);
          this.prunePublicLobbies();
          if (this.onPublicLobbiesUpdate) {
            this.onPublicLobbiesUpdate(Array.from(this.publicLobbies.values()));
          }
        }
      });
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
      if (now - info.ts > 16000) {
        this.publicLobbies.delete(roomId);
      }
    }
  }

  private async startPublicAnnounce() {
    this.stopPublicAnnounce();
    try {
      const { joinRoom } = await import('trystero/nostr');
      this.discoveryRoom = joinRoom(
        {
          appId: APP_ID,
          relayUrls: RELAYS,
        } as any,
        DISCOVERY_ROOM,
      );

      const [sendLobby] = this.discoveryRoom.makeAction('public_lobby');
      const announce = () => {
        if (!this.isPublic || this.state === 'playing' || !this.roomId) return;
        sendLobby({
          roomId: this.roomId,
          hostName: this.localName,
          hostSkin: this.localSkin,
          playerCount: this.opponents.size + 1,
          maxPlayers: MAX_PLAYERS,
          ts: Date.now(),
        });
      };
      announce();
      this.discoveryAnnounceTimer = window.setInterval(announce, 4500);
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

        if (this.role !== 'host') {
          if (this.sendEventAction) {
            this.sendEventAction({
              type: 'HANDSHAKE',
              name: this.localName,
              skinId: this.localSkin,
              protocolVersion: PROTOCOL_VERSION,
            }, peerId);
          }
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
