import type { SkinId } from '../skins';

export type MatchRole = 'host' | 'joiner';

export type MatchState =
  | 'idle'
  | 'connecting'
  | 'lobby'
  | 'calibrating'
  | 'countdown'
  | 'playing'
  | 'ended';

export interface OpponentInfo {
  peerId: string;
  name: string;
  skinId: SkinId;
  pingMs: number;
  ready: boolean;
}

export interface PlayerTickPayload {
  seq: number;
  tick: number;
  x: number;
  y: number;
  vy: number;
  run: number;
  air: boolean;
  diving: boolean;
  score: number;
  meters: number;
  dead: boolean;
  kills: number;
  combo: number;
  skinId: SkinId;
}

export type NetEventPacket =
  | {
      type: 'HANDSHAKE';
      name: string;
      skinId: SkinId;
      protocolVersion: number;
    }
  | {
      type: 'PING';
      id: number;
      sentAt: number;
    }
  | {
      type: 'PONG';
      id: number;
      sentAt: number;
      receivedAt: number;
    }
  | {
      type: 'READY_CHECK';
      ready: boolean;
    }
  | {
      type: 'MATCH_START';
      seed: number;
      targetStartTime: number; // physical timestamp when countdown finishes
      startDelayMs: number;
    }
  | {
      type: 'PLAYER_DEATH';
      collisionTick: number;
      finalScore: number;
      finalMeters: number;
      kills: number;
    }
  | {
      type: 'REMATCH_REQUEST';
    }
  | {
      type: 'REMATCH_ACCEPT';
      seed: number;
    }
  | {
      type: 'FORFEIT';
      reason: string;
    };

export interface MatchResult {
  winner: 'local' | 'opponent' | 'draw';
  reason: 'score' | 'death' | 'forfeit';
  localScore: number;
  localMeters: number;
  opponentScore: number;
  opponentMeters: number;
  opponentName: string;
  opponentSkin: SkinId;
}
