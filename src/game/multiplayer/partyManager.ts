import PartySocket from 'partysocket';
import type { SkinId } from '../skins';
import type {
  MatchResult,
  OpponentInfo,
  PartyClientMessage,
  PartyServerMessage,
  PlayerTickPayload,
  PublicLobbyInfo,
} from './types';

export const MAX_PLAYERS = 8;

const PARTYKIT_HOST =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_PARTYKIT_HOST) ||
  (typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'localhost:1999'
    : 'pixelrun-party.jimm144.partykit.dev');

function generateRoomCode(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  return code;
}

export class PartyManager {
  socket: PartySocket | null = null;
  roomId: string | null = null;
  peerId: string | null = null;
  role: 'host' | 'joiner' | null = null;
  state: 'idle' | 'connecting' | 'hosting' | 'joining' | 'in_room' | 'in_game' | 'ended' = 'idle';
  isPublic = false;
  localName = 'Runner';
  localSkin: SkinId = 'bob';
  opponents = new Map<string, OpponentInfo>();
  matchResult: MatchResult | null = null;

  // Callbacks
  onRoomStateChange?: (opponents: OpponentInfo[]) => void;
  onMatchStart?: (seed: number, startAt: number) => void;
  onMatchEnd?: (result: MatchResult) => void;
  onStatusMsg?: (msg: string) => void;

  get isMultiplayer(): boolean {
    return this.state === 'in_game' && this.roomId !== null;
  }

  async host(name: string, skin: SkinId, isPublic = false): Promise<string> {
    this.leave();
    this.localName = name;
    this.localSkin = skin;
    this.isPublic = isPublic;
    this.role = 'host';
    this.state = 'hosting';

    const code = generateRoomCode();
    this.roomId = code;

    await this.connectToRoom(code);
    return code;
  }

  async join(code: string, name: string, skin: SkinId): Promise<boolean> {
    this.leave();
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) return false;

    this.localName = name;
    this.localSkin = skin;
    this.role = 'joiner';
    this.state = 'joining';
    this.roomId = cleanCode;

    return this.connectToRoom(cleanCode);
  }

  async joinPublic(name: string, skin: SkinId): Promise<boolean> {
    return this.join('PUBLIC', name, skin);
  }

  private connectToRoom(roomId: string): Promise<boolean> {
    return new Promise((resolve) => {
      let resolved = false;

      try {
        this.socket = new PartySocket({
          host: PARTYKIT_HOST,
          room: roomId.toLowerCase(),
        });

        this.socket.onopen = () => {
          this.peerId = this.socket?.id ?? `p_${Math.random().toString(36).substring(2, 8)}`;
          this.state = 'in_room';

          // Send join payload
          this.send({
            type: 'join',
            name: this.localName,
            skinId: this.localSkin,
          });

          if (this.role === 'host' && this.isPublic) {
            this.send({ type: 'visibility', isPublic: true });
          }

          if (!resolved) {
            resolved = true;
            resolve(true);
          }
        };

        this.socket.onmessage = (event) => {
          this.handleServerMessage(event.data);
        };

        this.socket.onerror = () => {
          if (!resolved) {
            resolved = true;
            resolve(false);
          }
        };

        this.socket.onclose = () => {
          if (this.state !== 'idle') {
            this.state = 'idle';
            this.opponents.clear();
            this.onRoomStateChange?.([]);
          }
        };
      } catch {
        resolve(false);
      }
    });
  }

  private handleServerMessage(raw: string) {
    try {
      const msg: PartyServerMessage = JSON.parse(raw);

      switch (msg.type) {
        case 'room_state': {
          this.isPublic = msg.isPublic;
          this.opponents.clear();

          const myId = this.socket?.id;
          for (const p of msg.players) {
            if (p.peerId === myId) {
              this.role = p.isHost ? 'host' : 'joiner';
            } else {
              this.opponents.set(p.peerId, p);
            }
          }

          this.onRoomStateChange?.(Array.from(this.opponents.values()));
          break;
        }

        case 'match_start': {
          this.state = 'in_game';
          this.matchResult = null;
          this.onMatchStart?.(msg.seed, msg.startAt);
          break;
        }

        case 'ticks': {
          if (this.state === 'in_game') {
            const myId = this.socket?.id;
            for (const [peerId, payload] of Object.entries(msg.ticks)) {
              if (peerId !== myId) {
                const opp = this.opponents.get(peerId);
                if (opp) {
                  opp.px = payload.px;
                  opp.py = payload.py;
                  opp.vx = payload.vx;
                  opp.vy = payload.vy;
                  opp.meters = payload.meters;
                  opp.score = payload.score;
                  opp.frame = payload.frame;
                  opp.run = payload.run;
                  opp.diving = payload.diving;
                  opp.isAlive = payload.alive;
                  opp.ts = Date.now();
                }
              }
            }
          }
          break;
        }

        case 'player_death': {
          const opp = this.opponents.get(msg.peerId);
          if (opp) {
            opp.isAlive = false;
            opp.meters = msg.meters;
            opp.score = msg.score;
          }
          break;
        }

        case 'match_end': {
          this.state = 'ended';
          const myId = this.socket?.id;
          const result = msg.result;

          // Annotate isLocal on leaderboard
          result.leaderboard.forEach((entry) => {
            entry.isLocal = entry.peerId === myId;
          });

          const localEntry = result.leaderboard.find((e) => e.isLocal);
          result.isWinner = localEntry ? localEntry.rank === 1 : false;
          result.rank = localEntry ? localEntry.rank : result.totalPlayers;

          this.matchResult = result;
          this.onMatchEnd?.(result);
          break;
        }
      }
    } catch {
      // Ignore JSON parse errors
    }
  }

  setReady(ready: boolean) {
    this.send({ type: 'ready', ready });
  }

  setRoomVisibility(isPublic: boolean) {
    this.isPublic = isPublic;
    this.send({ type: 'visibility', isPublic });
  }

  startMatch() {
    if (this.role === 'host') {
      this.send({ type: 'start' });
    }
  }

  sendTick(payload: PlayerTickPayload) {
    if (this.state === 'in_game' && this.socket) {
      this.send({ type: 'tick', payload });
    }
  }

  sendDeath(meters: number, score: number) {
    if (this.state === 'in_game' && this.socket) {
      this.send({ type: 'death', meters, score });
    }
  }

  rematch() {
    this.send({ type: 'rematch' });
  }

  leave() {
    if (this.socket) {
      try {
        this.send({ type: 'leave' });
        this.socket.close();
      } catch {
        // Ignore
      }
      this.socket = null;
    }
    this.roomId = null;
    this.role = null;
    this.state = 'idle';
    this.opponents.clear();
    this.matchResult = null;
    this.onRoomStateChange?.([]);
  }

  private send(msg: PartyClientMessage) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }

  async fetchPublicLobbies(): Promise<PublicLobbyInfo[]> {
    return [
      {
        code: 'PUBLIC',
        hostName: 'Public Quick Match',
        playerCount: this.opponents.size + 1,
        maxPlayers: 8,
      },
    ];
  }
}

export const party = new PartyManager();
