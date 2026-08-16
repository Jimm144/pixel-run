import { joinRoom } from 'trystero/nostr';
import type { SkinId } from '../skins';
import type {
  MatchRole,
  MatchState,
  OpponentInfo,
  PlayerTickPayload,
  NetEventPacket,
  MatchResult,
} from './types';

const APP_ID = 'pixel-run-pvp-v1';
const PROTOCOL_VERSION = 1;

// Fast decentralized Nostr relays for zero-latency WebRTC pairing
const RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.snort.social',
  'wss://relay.primal.net',
];

export class P2PManager {
  public role: MatchRole = 'host';
  public roomId: string = '';
  public state: MatchState = 'idle';
  public opponent: OpponentInfo | null = null;
  public localName: string = 'PLAYER 1';
  public localSkin: SkinId = 'bob';
  public matchSeed: number = 0;
  public rttMs: number = 0;

  public localFinalStats: { score: number; meters: number; kills: number } | null = null;
  public opponentFinalStats: { score: number; meters: number; kills: number } | null = null;

  private room: ReturnType<typeof joinRoom> | null = null;
  private sendTickAction: ((data: PlayerTickPayload, targetPeerId?: string) => void) | null = null;
  private sendEventAction: ((data: NetEventPacket, targetPeerId?: string) => void) | null = null;

  // Ping calibration state
  private pingCount = 0;
  private pingTimes: number[] = [];
  private pingTimer: number | null = null;

  // Stream state & packet ordering
  private localOutgoingSeq = 0;
  private lastReceivedSeq = -1;
  public latestOpponentTick: PlayerTickPayload | null = null;
  private wakeLock: any = null;

  // Event callbacks
  public onStateChange: ((state: MatchState) => void) | null = null;
  public onOpponentUpdate: ((opp: OpponentInfo | null) => void) | null = null;
  public onCountdown: ((seconds: number) => void) | null = null;
  public onMatchStart: ((seed: number) => void) | null = null;
  public onOpponentTick: ((tick: PlayerTickPayload) => void) | null = null;
  public onOpponentDeath: ((data: { finalScore: number; finalMeters: number; kills: number }) => void) | null = null;
  public onMatchResult: ((result: MatchResult) => void) | null = null;
  public onError: ((err: string) => void) | null = null;

  // Visibility listener for anti-desync forfeit
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

  public host(name: string, skinId: SkinId): string {
    this.leave();
    this.role = 'host';
    this.localName = name || 'PLAYER 1';
    this.localSkin = skinId;
    this.roomId = this.generateRoomCode();
    this.initRoom();
    return this.roomId;
  }

  public join(roomCode: string, name: string, skinId: SkinId): boolean {
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
    this.initRoom();
    return true;
  }

  private initRoom() {
    this.setState('connecting');
    this.localOutgoingSeq = 0;
    this.lastReceivedSeq = -1;
    this.localFinalStats = null;
    this.opponentFinalStats = null;

    try {
      this.room = joinRoom(
        {
          appId: APP_ID,
          relayUrls: RELAYS,
        } as any,
        this.roomId,
      );

      // Split Channels:
      // 1. Fast, unreliable coordinate streaming ('tick')
      const [sendTick, getTick] = this.room.makeAction('tick');
      this.sendTickAction = sendTick;
      getTick((data: any, peerId: string) => {
        this.handleIncomingTick(data as PlayerTickPayload, peerId);
      });

      // 2. Reliable guaranteed events ('event')
      const [sendEvent, getEvent] = this.room.makeAction('event');
      this.sendEventAction = sendEvent;
      getEvent((data: any, peerId: string) => {
        this.handleIncomingEvent(data as NetEventPacket, peerId);
      });

      // Connection Lifecycle: onPeerJoin
      this.room.onPeerJoin((peerId: string) => {
        if (this.sendEventAction) {
          this.sendEventAction({
            type: 'HANDSHAKE',
            name: this.localName,
            skinId: this.localSkin,
            protocolVersion: PROTOCOL_VERSION,
          });
        }
      });

      // Connection Lifecycle: onPeerLeave
      this.room.onPeerLeave((peerId: string) => {
        if (this.opponent && this.opponent.peerId === peerId) {
          if (this.state === 'playing') {
            this.handleForfeitWin('OPPONENT DISCONNECTED');
          } else {
            this.opponent = null;
            if (this.onOpponentUpdate) this.onOpponentUpdate(null);
            this.setState('lobby');
          }
        }
      });

      // 8-second handshake timeout with alert
      setTimeout(() => {
        if (this.state === 'connecting' && !this.opponent) {
          if (this.onError) {
            this.onError('WAITING FOR PEER... SHARE ROOM LINK!');
          }
        }
      }, 8000);

    } catch (err: any) {
      if (this.onError) this.onError(err?.message || 'CONNECTION FAILED');
      this.setState('idle');
    }
  }

  private handleIncomingEvent(packet: NetEventPacket, peerId: string) {
    if (!packet || typeof packet !== 'object') return;

    switch (packet.type) {
      case 'HANDSHAKE': {
        this.opponent = {
          peerId,
          name: packet.name || 'OPPONENT',
          skinId: packet.skinId || 'bob',
          pingMs: 0,
          ready: true,
        };
        if (this.onOpponentUpdate) this.onOpponentUpdate(this.opponent);
        this.setState('lobby');

        if (this.role === 'host') {
          this.startPingCalibration();
        } else {
          if (this.sendEventAction) {
            this.sendEventAction({
              type: 'HANDSHAKE',
              name: this.localName,
              skinId: this.localSkin,
              protocolVersion: PROTOCOL_VERSION,
            });
          }
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
        this.pingTimes.push(rtt);
        if (this.pingTimes.length >= 3) {
          const sum = this.pingTimes.reduce((a, b) => a + b, 0);
          this.rttMs = Math.round(sum / this.pingTimes.length);
          if (this.opponent) {
            this.opponent.pingMs = this.rttMs;
            if (this.onOpponentUpdate) this.onOpponentUpdate({ ...this.opponent });
          }
        }
        break;
      }

      case 'MATCH_START': {
        this.matchSeed = packet.seed;
        this.localFinalStats = null;
        this.opponentFinalStats = null;
        this.localOutgoingSeq = 0;
        this.lastReceivedSeq = -1;
        this.startSynchronizedCountdown(packet.targetStartTime);
        break;
      }

      case 'PLAYER_DEATH': {
        this.opponentFinalStats = {
          score: packet.finalScore,
          meters: packet.finalMeters,
          kills: packet.kills,
        };
        if (this.onOpponentDeath) {
          this.onOpponentDeath({
            finalScore: packet.finalScore,
            finalMeters: packet.finalMeters,
            kills: packet.kills,
          });
        }
        // If local is also dead, resolve match result!
        if (this.localFinalStats) {
          this.resolveMatchResult();
        }
        break;
      }

      case 'FORFEIT': {
        this.handleForfeitWin(packet.reason || 'OPPONENT FORFEITED');
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

  private handleIncomingTick(data: PlayerTickPayload, peerId: string) {
    if (!data || typeof data.seq !== 'number') return;
    // Packet ordering: discard stale or out-of-order ticks
    if (data.seq <= this.lastReceivedSeq) return;
    this.lastReceivedSeq = data.seq;

    this.latestOpponentTick = data;

    if (this.onOpponentTick) {
      this.onOpponentTick(data);
    }
  }

  private startPingCalibration() {
    this.pingTimes = [];
    this.pingCount = 0;
    const sendNext = () => {
      if (this.pingCount >= 3 || !this.sendEventAction || !this.opponent) return;
      this.pingCount++;
      this.sendEventAction({
        type: 'PING',
        id: this.pingCount,
        sentAt: performance.now(),
      }, this.opponent.peerId);
      this.pingTimer = window.setTimeout(sendNext, 120);
    };
    sendNext();
  }

  public startMatch(): boolean {
    if (this.role !== 'host' || !this.opponent || !this.sendEventAction) return false;
    this.matchSeed = (Math.random() * 0x7fffffff) >>> 0;
    this.localFinalStats = null;
    this.opponentFinalStats = null;
    this.localOutgoingSeq = 0;
    this.lastReceivedSeq = -1;

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

  public sendTick(tickPayload: Omit<PlayerTickPayload, 'seq'>) {
    if (!this.sendTickAction || this.state !== 'playing') return;
    this.localOutgoingSeq++;
    const payload: PlayerTickPayload = {
      ...tickPayload,
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

    // If opponent is already dead, resolve match result now!
    if (this.opponentFinalStats) {
      this.resolveMatchResult();
    }
  }

  private resolveMatchResult() {
    if (!this.localFinalStats || !this.opponentFinalStats) return;

    const l = this.localFinalStats;
    const o = this.opponentFinalStats;

    const won = l.score > o.score || (l.score === o.score && l.meters > o.meters);
    const isDraw = l.score === o.score && l.meters === o.meters;

    const result: MatchResult = {
      winner: isDraw ? 'draw' : won ? 'local' : 'opponent',
      reason: 'death',
      localScore: l.score,
      localMeters: l.meters,
      opponentScore: o.score,
      opponentMeters: o.meters,
      opponentName: this.opponent?.name || 'OPPONENT',
      opponentSkin: this.opponent?.skinId || 'bob',
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

  private handleForfeitWin(reason: string) {
    if (this.state !== 'playing') return;
    if (this.onMatchResult) {
      this.onMatchResult({
        winner: 'local',
        reason: 'forfeit',
        localScore: this.localFinalStats?.score ?? 0,
        localMeters: this.localFinalStats?.meters ?? 0,
        opponentScore: this.opponentFinalStats?.score ?? 0,
        opponentMeters: this.opponentFinalStats?.meters ?? 0,
        opponentName: this.opponent?.name || 'OPPONENT',
        opponentSkin: this.opponent?.skinId || 'bob',
      });
    }
    this.setState('ended');
  }

  private handleVisibilityChange() {
    if (document.hidden && this.state === 'playing') {
      this.visibilityTimeout = window.setTimeout(() => {
        if (document.hidden && this.state === 'playing') {
          if (this.sendEventAction) {
            this.sendEventAction({ type: 'FORFEIT', reason: 'PLAYER TABBED OUT' });
          }
          if (this.onMatchResult) {
            this.onMatchResult({
              winner: 'opponent',
              reason: 'forfeit',
              localScore: this.localFinalStats?.score ?? 0,
              localMeters: this.localFinalStats?.meters ?? 0,
              opponentScore: this.opponentFinalStats?.score ?? 0,
              opponentMeters: this.opponentFinalStats?.meters ?? 0,
              opponentName: this.opponent?.name || 'OPPONENT',
              opponentSkin: this.opponent?.skinId || 'bob',
            });
          }
          this.setState('ended');
        }
      }, 3000);
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
    if (this.pingTimer) clearTimeout(this.pingTimer);
    if (this.visibilityTimeout) clearTimeout(this.visibilityTimeout);

    if (this.room) {
      try {
        this.room.leave();
      } catch {}
      this.room = null;
    }
    this.opponent = null;
    this.sendTickAction = null;
    this.sendEventAction = null;
    this.latestOpponentTick = null;
    this.localFinalStats = null;
    this.opponentFinalStats = null;
    this.localOutgoingSeq = 0;
    this.lastReceivedSeq = -1;
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
