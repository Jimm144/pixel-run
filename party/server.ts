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

export default class PixelRunPartyServer implements Party.Server {
  players = new Map<string, PlayerState>();
  status: 'lobby' | 'countdown' | 'in_game' | 'ended' = 'lobby';
  seed = 12345;
  isPublic = false;
  hostId: string | null = null;
  pendingTicks: Record<string, any> = {};
  tickInterval: any = null;

  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection) {
    // New connection connected to room
  }

  onClose(conn: Party.Connection) {
    const wasHost = this.hostId === conn.id;
    this.players.delete(conn.id);
    delete this.pendingTicks[conn.id];

    if (this.players.size === 0) {
      this.status = 'lobby';
      this.hostId = null;
      if (this.tickInterval) {
        clearInterval(this.tickInterval);
        this.tickInterval = null;
      }
      return;
    }

    // Reassign host if the host disconnected
    if (wasHost) {
      const firstRemaining = this.players.keys().next().value;
      if (firstRemaining) {
        this.hostId = firstRemaining;
        const hostPlayer = this.players.get(firstRemaining);
        if (hostPlayer) hostPlayer.isHost = true;
      }
    }

    this.broadcastRoomState();

    // If game in progress, check if all remaining are dead
    if (this.status === 'in_game') {
      this.checkMatchEnd();
    }
  }

  onMessage(message: string, sender: Party.Connection) {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'join': {
          const isFirst = this.players.size === 0;
          if (isFirst) this.hostId = sender.id;

          const player: PlayerState = {
            peerId: sender.id,
            name: (data.name || 'Runner').slice(0, 12),
            skinId: data.skinId || 'bob',
            ready: isFirst, // Host is ready by default
            isHost: isFirst,
            isAlive: true,
            meters: 0,
            score: 0,
            ts: Date.now(),
          };

          this.players.set(sender.id, player);
          this.broadcastRoomState();
          break;
        }

        case 'ready': {
          const p = this.players.get(sender.id);
          if (p) {
            p.ready = Boolean(data.ready);
            this.broadcastRoomState();
          }
          break;
        }

        case 'visibility': {
          if (sender.id === this.hostId) {
            this.isPublic = Boolean(data.isPublic);
            this.broadcastRoomState();
          }
          break;
        }

        case 'start': {
          if (sender.id === this.hostId && this.status === 'lobby') {
            this.status = 'in_game';
            this.seed = (Math.random() * 0x7fffffff) >>> 0;

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

            // Start tick batching relay if not already running
            if (!this.tickInterval) {
              this.tickInterval = setInterval(() => this.flushTicks(), 33); // ~30Hz
            }
          }
          break;
        }

        case 'tick': {
          if (this.status === 'in_game') {
            const p = this.players.get(sender.id);
            if (p && data.payload) {
              p.meters = data.payload.meters ?? p.meters;
              p.score = data.payload.score ?? p.score;
              p.isAlive = data.payload.alive ?? p.isAlive;
              p.px = data.payload.px;
              p.py = data.payload.py;
              p.vx = data.payload.vx;
              p.vy = data.payload.vy;
              p.frame = data.payload.frame;
              p.run = data.payload.run;
              p.diving = data.payload.diving;
              p.ts = Date.now();

              this.pendingTicks[sender.id] = data.payload;
            }
          }
          break;
        }

        case 'death': {
          if (this.status === 'in_game') {
            const p = this.players.get(sender.id);
            if (p && p.isAlive) {
              p.isAlive = false;
              p.meters = data.meters ?? p.meters;
              p.score = data.score ?? p.score;

              this.room.broadcast(
                JSON.stringify({
                  type: 'player_death',
                  peerId: sender.id,
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
          this.status = 'lobby';
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

        case 'leave': {
          this.onClose(sender);
          break;
        }
      }
    } catch {
      // Ignore invalid JSON
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
    this.room.broadcast(
      JSON.stringify({
        type: 'room_state',
        roomId: this.room.id,
        isPublic: this.isPublic,
        hostId: this.hostId,
        players: list,
      })
    );
  }

  checkMatchEnd() {
    const players = Array.from(this.players.values());
    if (players.length === 0) return;

    const aliveCount = players.filter((p) => p.isAlive).length;

    // Match ends when everyone is dead, or when 1 player is alive in a 2+ player match
    if (aliveCount === 0 || (aliveCount === 1 && players.length > 1)) {
      this.status = 'ended';

      // Sort by meters (descending), then score (descending)
      const sorted = [...players].sort((a, b) => {
        if (b.meters !== a.meters) return b.meters - a.meters;
        return b.score - a.score;
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
            isWinner: false, // Calculated on client
            finalMeters: winner ? winner.meters : 0,
            finalScore: winner ? winner.score : 0,
            rank: 1,
            totalPlayers: leaderboard.length,
            leaderboard,
          },
        })
      );
    }
  }

  // HTTP Endpoint for public lobby listings
  async onRequest(req: Party.Request) {
    if (req.method === 'GET') {
      const host = this.hostId ? this.players.get(this.hostId) : null;
      return Response.json({
        roomId: this.room.id,
        isPublic: this.isPublic,
        playerCount: this.players.size,
        maxPlayers: 8,
        hostName: host ? host.name : 'Unknown',
        status: this.status,
      });
    }
    return new Response('Not found', { status: 404 });
  }
}
