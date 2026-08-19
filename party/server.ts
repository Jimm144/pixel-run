import type * as Party from 'partykit/server';

interface PlayerState {
  peerId: string;
  name: string;
  skinId: string;
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

interface PublicLobbyEntry {
  code: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  isPublic: boolean;
  ts: number;
}

const MAX_PLAYERS = 8;
const LOBBY_TTL_MS = 120_000;

// Coerce only well-formed numbers; anything else falls back so garbage from a
// buggy or malicious client never propagates through the relay.
function asNum(v: unknown, fallback: number | undefined): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

// All rooms of one party run in the same process (both `partykit dev` and a
// real deploy), so a module-level registry lets any room answer GET /lobby
// with every public room on the server.
const globalLobbies = new Map<string, PublicLobbyEntry>();

export default class PixelRunPartyServer implements Party.Server {
  players = new Map<string, PlayerState>();
  connToPeer = new Map<string, string>();
  status: 'lobby' | 'countdown' | 'in_game' | 'ended' = 'lobby';
  seed = 12345;
  isPublic = false;
  hostPeerId: string | null = null;
  pendingTicks: Record<string, any> = {};
  tickInterval: ReturnType<typeof setInterval> | null = null;
  lobbyHeartbeat: ReturnType<typeof setInterval> | null = null;

  constructor(readonly room: Party.Room) {}

  private peerIdFor(conn: Party.Connection): string | undefined {
    return this.connToPeer.get(conn.id);
  }

  onConnect(_conn: Party.Connection) {}

  onClose(conn: Party.Connection) {
    const peerId = this.peerIdFor(conn);
    this.connToPeer.delete(conn.id);
    if (peerId) {
      this.players.delete(peerId);
      delete this.pendingTicks[peerId];
    }

    if (this.players.size === 0) {
      this.status = 'lobby';
      this.hostPeerId = null;
      if (this.tickInterval) {
        clearInterval(this.tickInterval);
        this.tickInterval = null;
      }
      this.syncLobby();
      return;
    }

    if (peerId === this.hostPeerId) {
      const firstRemaining = this.players.keys().next().value;
      if (firstRemaining) {
        this.hostPeerId = firstRemaining;
        const hostPlayer = this.players.get(firstRemaining);
        if (hostPlayer) hostPlayer.isHost = true;
      }
    }

    this.broadcastRoomState();

    if (this.status === 'in_game') {
      this.checkMatchEnd();
    }
  }

  onMessage(message: string, sender: Party.Connection) {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'join': {
          // The client's own generated id (peerId) is the identity the whole
          // system keys on — NOT the connection id.
          const clientId =
            typeof data.clientId === 'string' && data.clientId.length > 0
              ? data.clientId
              : sender.id;
          const existing = this.players.get(clientId);

          // Hard cap: a reconnect with a known peerId is always allowed, but
          // new players must not overflow the advertised MAX_PLAYERS.
          if (!existing && this.players.size >= MAX_PLAYERS) {
            sender.send(
              JSON.stringify({
                type: 'error',
                message: 'ROOM IS FULL',
              })
            );
            break;
          }

          const isFirst = this.players.size === 0 && !existing;
          const isHost = existing ? existing.isHost : isFirst;
          if (isHost) this.hostPeerId = clientId;

          // Joining a room that is already past the lobby (countdown, match or
          // ended) makes the player a spectator: they missed match_start so
          // they cannot run, and an alive 0/0 player would falsely end the
          // match (and "win" it) once the real racers die. The next rematch
          // resets everyone back to alive.
          const spectator = !existing && this.status !== 'lobby';

          const player: PlayerState = {
            peerId: clientId,
            name: (data.name || 'Runner').slice(0, 12),
            skinId: data.skinId || 'bob',
            ready: existing ? existing.ready : isFirst,
            isHost,
            isAlive: !spectator,
            meters: 0,
            score: 0,
            ts: Date.now(),
          };

          this.players.set(clientId, player);
          this.connToPeer.set(sender.id, clientId);
          this.broadcastRoomState();
          break;
        }

        case 'ready': {
          const peerId = this.peerIdFor(sender);
          const p = peerId ? this.players.get(peerId) : undefined;
          if (p) {
            p.ready = Boolean(data.ready);
            this.broadcastRoomState();
          }
          break;
        }

        case 'visibility': {
          if (this.peerIdFor(sender) === this.hostPeerId) {
            this.isPublic = Boolean(data.isPublic);
            this.broadcastRoomState();
          }
          break;
        }

        case 'start': {
          const peerId = this.peerIdFor(sender);
          if (peerId === this.hostPeerId && this.status === 'lobby') {
            this.status = 'in_game';
            this.pendingTicks = {};
            this.seed =
              typeof data.seed === 'number'
                ? data.seed
                : (Math.random() * 0x7fffffff) >>> 0;

            for (const p of this.players.values()) {
              p.isAlive = true;
              p.meters = 0;
              p.score = 0;
              p.rank = undefined;
            }

            const startAt = Date.now() + 3000;
            this.room.broadcast(
              JSON.stringify({
                type: 'match_start',
                seed: this.seed,
                startAt,
              })
            );

            if (!this.tickInterval) {
              this.tickInterval = setInterval(() => this.flushTicks(), 33);
            }
            this.syncLobby();
          }
          break;
        }

        case 'tick': {
          if (this.status === 'in_game') {
            const peerId = this.peerIdFor(sender);
            if (!peerId) break;
            const p = this.players.get(peerId);
            // Dead is final: a post-death restart (R replays the seed as a
            // practice run) keeps sending ticks, but they must never
            // overwrite the death meters/score the leaderboard is built from.
            if (!p || !p.isAlive) break;
            const pay = data.payload;
            if (p && pay && typeof pay === 'object') {
              p.meters = asNum(pay.meters, p.meters) ?? p.meters;
              p.score = asNum(pay.score, p.score) ?? p.score;
              p.px = asNum(pay.px, p.px);
              p.py = asNum(pay.py, p.py);
              p.vx = asNum(pay.vx, p.vx);
              p.vy = asNum(pay.vy, p.vy);
              p.frame = asNum(pay.frame, p.frame);
              p.run = asNum(pay.run, p.run);
              p.diving = typeof pay.diving === 'boolean' ? pay.diving : p.diving;
              p.ts = Date.now();

              // Relay only server-sanitized numbers. The client-controlled
              // `alive` field is deliberately dropped: death is terminal and
              // is reported exclusively via the 'death' message, so a tick can
              // never resurrect anyone.
              this.pendingTicks[peerId] = {
                px: p.px,
                py: p.py,
                vx: p.vx,
                vy: p.vy,
                meters: p.meters,
                score: p.score,
                diving: p.diving,
                frame: p.frame,
                run: p.run,
              };
            }
          }
          break;
        }

        case 'death': {
          if (this.status === 'in_game') {
            const peerId = this.peerIdFor(sender);
            const p = peerId ? this.players.get(peerId) : undefined;
            if (p && p.isAlive) {
              p.isAlive = false;
              const meters = asNum(data.meters, undefined);
              const score = asNum(data.score, undefined);
              if (meters !== undefined) p.meters = meters;
              if (score !== undefined) p.score = score;

              this.room.broadcast(
                JSON.stringify({
                  type: 'player_death',
                  peerId,
                  meters: p.meters,
                  score: p.score,
                })
              );

              this.checkMatchEnd();
            }
          }
          break;
        }

        case 'rematch': {
          // Only the host may reset the room; a stray rematch from a joiner
          // must not yank everyone back to the lobby mid-match.
          if (this.peerIdFor(sender) !== this.hostPeerId) break;
          this.status = 'lobby';
          this.pendingTicks = {};
          if (this.tickInterval) {
            clearInterval(this.tickInterval);
            this.tickInterval = null;
          }
          for (const p of this.players.values()) {
            p.ready = p.isHost;
            p.isAlive = true;
            p.meters = 0;
            p.score = 0;
            p.rank = undefined;
          }
          this.broadcastRoomState();
          break;
        }

        case 'rename': {
          const peerId = this.peerIdFor(sender);
          if (!peerId) break;
          const p = this.players.get(peerId);
          if (p && typeof data.name === 'string') {
            const name = data.name.trim().slice(0, 16);
            if (name) {
              p.name = name;
              this.broadcastRoomState();
            }
          }
          break;
        }

        case 'leave': {
          this.onClose(sender);
          break;
        }
      }
    } catch {
      // Ignore
    }
  }

  flushTicks() {
    if (Object.keys(this.pendingTicks).length > 0) {
      this.room.broadcast(
        JSON.stringify({
          type: 'ticks',
          ticks: this.pendingTicks,
        })
      );
      this.pendingTicks = {};
    }
  }

  broadcastRoomState() {
    const list = Array.from(this.players.values());
    for (const conn of this.room.getConnections()) {
      conn.send(
        JSON.stringify({
          type: 'room_state',
          roomId: this.room.id,
          isPublic: this.isPublic,
          hostId: this.hostPeerId,
          selfId: this.connToPeer.get(conn.id) ?? null,
          players: list,
        })
      );
    }
    this.syncLobby();
  }

  private syncLobby() {
    // Public rooms stay discoverable even mid-match: joiners land as
    // spectators, so hiding a room while a match is running made public
    // lobbies "randomly disappear" for minutes at a time.
    if (this.isPublic && this.hostPeerId) {
      const host = this.players.get(this.hostPeerId);
      globalLobbies.set(this.room.id, {
        code: this.room.id,
        hostName: host ? host.name : 'Unknown',
        playerCount: this.players.size,
        maxPlayers: MAX_PLAYERS,
        isPublic: true,
        ts: Date.now(),
      });
      // Idle lobbies must stay discoverable: refresh the entry even when
      // nobody joins, so GET /lobby never silently drops an open room after
      // LOBBY_TTL_MS of silence.
      if (!this.lobbyHeartbeat) {
        this.lobbyHeartbeat = setInterval(() => this.syncLobby(), 30_000);
      }
    } else {
      globalLobbies.delete(this.room.id);
      if (this.lobbyHeartbeat) {
        clearInterval(this.lobbyHeartbeat);
        this.lobbyHeartbeat = null;
      }
    }
  }

  checkMatchEnd() {
    const players = Array.from(this.players.values());
    if (players.length === 0) return;

    const aliveCount = players.filter((p) => p.isAlive).length;

    if (aliveCount === 0 || (aliveCount === 1 && players.length > 1)) {
      this.status = 'ended';

      // Stop the tick relay: no new ticks will arrive while ended, and the
      // stale ones must not keep being rebroadcast (or leak into the next
      // match after a rematch).
      this.pendingTicks = {};
      if (this.tickInterval) {
        clearInterval(this.tickInterval);
        this.tickInterval = null;
      }

      const sorted = [...players].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.meters - a.meters;
      });

      const leaderboard = sorted.map((p, idx) => ({
        peerId: p.peerId,
        name: p.name,
        skinId: p.skinId,
        meters: p.meters,
        score: p.score,
        rank: idx + 1,
        isLocal: false,
      }));

      const winner = leaderboard[0];

      this.room.broadcast(
        JSON.stringify({
          type: 'match_end',
          result: {
            winnerName: winner ? winner.name : 'Nobody',
            isWinner: false,
            finalMeters: winner ? winner.meters : 0,
            finalScore: winner ? winner.score : 0,
            rank: 1,
            totalPlayers: leaderboard.length,
            leaderboard,
          },
        })
      );

      this.syncLobby();
    }
  }

  async onRequest(req: Party.Request) {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, OPTIONS',
        },
      });
    }

    if (
      req.method === 'GET' &&
      (url.pathname.endsWith('/lobby') || url.pathname.endsWith('/lobbies'))
    ) {
      const now = Date.now();
      const lobbies: PublicLobbyEntry[] = [];
      for (const entry of globalLobbies.values()) {
        if (now - entry.ts > LOBBY_TTL_MS) continue;
        lobbies.push(entry);
      }
      return new Response(JSON.stringify(lobbies), {
        headers: {
          'content-type': 'application/json',
          'access-control-allow-origin': '*',
        },
      });
    }

    if (req.method === 'GET') {
      const host = this.hostPeerId ? this.players.get(this.hostPeerId) : null;
      return Response.json({
        roomId: this.room.id,
        isPublic: this.isPublic,
        playerCount: this.players.size,
        maxPlayers: MAX_PLAYERS,
        hostName: host ? host.name : 'Unknown',
        status: this.status,
      });
    }
    return new Response('Not found', { status: 404 });
  }
}
