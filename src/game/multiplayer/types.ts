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
  color: string;
  playerIndex: number; // 2..5
}

export interface PlayerTickPayload {
  peerId?: string;
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
      type: 'ROOM_FULL';
    }
  | {
      type: 'MATCH_START';
      seed: number;
      targetStartTime: number;
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
      type: 'FORFEIT';
      reason: string;
    };

export interface PublicLobbyInfo {
  roomId: string;
  hostName: string;
  hostSkin: SkinId;
  playerCount: number;
  maxPlayers: number;
  ts: number;
}

export interface LeaderboardEntry {
  peerId: string;
  name: string;
  skinId: SkinId;
  score: number;
  meters: number;
  kills: number;
  dead: boolean;
  rank: number;
  isLocal: boolean;
  color: string;
}

export interface MatchResult {
  rankings: LeaderboardEntry[];
  localRank: number;
  totalPlayers: number;
  reason: 'death' | 'forfeit';
}
