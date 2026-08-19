import type { SkinId } from '../skins';

export interface OpponentInfo {
  peerId: string;
  name: string;
  skinId: SkinId;
  ready: boolean;
  isHost: boolean;
  isAlive: boolean;
  meters: number;
  score: number;
  rank?: number;
  ts: number;
  px?: number;
  py?: number;
  vx?: number;
  vy?: number;
  diving?: boolean;
  frame?: number;
  run?: number;
}

export interface PlayerTickPayload {
  px: number;
  py: number;
  vx: number;
  vy: number;
  diving: boolean;
  frame: number;
  run: number;
  meters: number;
  score: number;
  skinId: SkinId;
  alive: boolean;
}

export interface MatchResultEntry {
  peerId: string;
  name: string;
  skinId: SkinId;
  meters: number;
  score: number;
  rank: number;
  isLocal: boolean;
}

export interface MatchResult {
  winnerName: string;
  isWinner: boolean;
  finalMeters: number;
  finalScore: number;
  rank: number;
  totalPlayers: number;
  leaderboard: MatchResultEntry[];
  mode?: 'local' | 'online';
}

export interface PublicLobbyInfo {
  code: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
}

export interface LocalPlayerState {
  px: number;
  py: number;
  vx: number;
  vy: number;
  skinId: SkinId;
  name: string;
  onGround: boolean;
  diving: boolean;
  jumps: number;
  coyote: number;
  jumpBuf: number;
  jumpHeld: boolean;
  diveHeld: boolean;
  moveDir: number;
  distance: number;
  score: number;
  isAlive: boolean;
  animT: number;
  padFlight: number;
  cut: boolean;
  shielded: boolean;
  invuln: number;
  spin: number;
  sx: number;
  sy: number;
  color: string;
}

export type PartyClientMessage =
  | { type: 'join'; clientId: string; name: string; skinId: SkinId }
  | { type: 'ready'; ready: boolean }
  | { type: 'start'; seed?: number }
  | { type: 'tick'; payload: PlayerTickPayload }
  | { type: 'death'; meters: number; score: number }
  | { type: 'visibility'; isPublic: boolean }
  | { type: 'rematch' }
  | { type: 'leave' };

export type PartyServerMessage =
  | { type: 'room_state'; roomId: string; isPublic: boolean; hostId: string; selfId: string | null; players: OpponentInfo[] }
  | { type: 'match_start'; seed: number; startAt: number }
  | { type: 'ticks'; ticks: Record<string, PlayerTickPayload> }
  | { type: 'player_death'; peerId: string; meters: number; score: number }
  | { type: 'match_end'; result: MatchResult }
  | { type: 'error'; message: string };
