import Peer, { type DataConnection } from 'peerjs';
import type { SkinId } from '../skins';
import type {
  MatchResult,
  MatchResultEntry,
  OpponentInfo,
  PartyClientMessage,
  PartyServerMessage,
  PlayerTickPayload,
  PublicLobbyInfo,
} from './types';

export const MAX_PLAYERS = 8;

function getPartyWebSocketUrl(room: string): string {
  const base = getPartyHttpBase();
  const scheme = base.startsWith('https') ? 'wss' : 'ws';
  return `${scheme}://${base.replace(/^https?:\/\//, '')}/parties/main/${room.toLowerCase()}`;
}

function getPartyHttpBase(): string {
  const isLocal =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.port === '5173');

  if (isLocal) {
    return 'http://localhost:1999';
  }
  return 'https://pixelrun.partykit.dev';
}

function generateRoomCode(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  return code;
}

export class PartyManager {
  socket: WebSocket | null = null;
  bc: BroadcastChannel | null = null;
  globalLobbiesBc: BroadcastChannel | null = null;
  peer: Peer | null = null;
  peerConnections = new Map<string, DataConnection>();
  roomId: string | null = null;
  peerId: string | null = null;
  role: 'host' | 'joiner' | null = null;
  state: 'idle' | 'connecting' | 'hosting' | 'joining' | 'in_room' | 'in_game' | 'ended' = 'idle';
  isPublic = false;
  localName = 'Runner';
  localSkin: SkinId = 'bob';
  opponents = new Map<string, OpponentInfo>();
  matchResult: MatchResult | null = null;
  serverOnline = true;

  // Local tab party tracking for zero-latency multi-tab testing
  private localTabPlayers = new Map<string, { peerId: string; name: string; skinId: SkinId; isHost: boolean; meters: number; score: number; isAlive: boolean }>();
  // WebRTC conn.peer -> joiner's self-generated peerId (host side), so a
  // dropped DataConnection can remove the right localTabPlayers entry.
  private peerConnToSelfId = new Map<string, string>();
  // Mirror of the local player's live state for the BC-only match-end path.
  private localTick: PlayerTickPayload | null = null;
  private localAlive = true;
  private syncTimer: number | null = null;
  private lobbyTimer: number | null = null;
  private storageListener: ((e: StorageEvent) => void) | null = null;
  /** True until the first room_state after join() — used to detect a dead
   *  room (host gone) so the joiner can bail out gracefully. */
  private awaitingFirstRoomState = false;

  // Callbacks
  onRoomStateChange?: (opponents: OpponentInfo[]) => void;
  onPublicLobbiesChange?: (lobbies: PublicLobbyInfo[]) => void;
  onMatchStart?: (seed: number, startAt: number) => void;
  onMatchEnd?: (result: MatchResult) => void;
  onStatusMsg?: (msg: string) => void;

  constructor() {
    this.initGlobalLobbies();
  }

  get isMultiplayer(): boolean {
    return this.state === 'in_game' && this.roomId !== null;
  }

  async host(name: string, skin: SkinId, isPublic = true): Promise<string> {
    this.leave();
    this.localName = name;
    this.localSkin = skin;
    this.isPublic = isPublic;
    this.role = 'host';
    this.state = 'in_room';
    this.peerId = `p_host_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const code = generateRoomCode();
    this.roomId = code;

    // Register local host
    this.localTabPlayers.clear();
    this.localTabPlayers.set(this.peerId, {
      peerId: this.peerId,
      name: this.localName,
      skinId: this.localSkin,
      isHost: true,
      meters: 0,
      score: 0,
      isAlive: true,
    });
    this.localAlive = true;
    this.localTick = null;

    // Initialize Sync Channels
    this.initSyncChannels(code, 'host');

    // Periodic host broadcast so joiners instantly receive room state
    this.startHostSyncLoop();

    // Publish lobby if public
    this.publishLobbyHeartbeat();

    // Also attempt WebSocket in background
    this.connectWebSocket(code);

    return code;
  }

  async join(code: string, name: string, skin: SkinId): Promise<boolean> {
    this.leave();
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) return false;

    this.localName = name;
    this.localSkin = skin;
    this.role = 'joiner';
    this.state = 'in_room';
    this.roomId = cleanCode;
    this.peerId = `p_join_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    this.localAlive = true;
    this.localTick = null;
    this.awaitingFirstRoomState = true;

    // Initialize Sync Channels
    this.initSyncChannels(cleanCode, 'joiner');

    // Periodic join ping until connected
    this.startJoinPingLoop();

    // Also attempt WebSocket in background
    this.connectWebSocket(cleanCode);

    return true;
  }

  async joinPublic(name: string, skin: SkinId): Promise<{ joinedRoom?: string; hostedNew?: string }> {
    const serverLobbies = await this.refreshPublicLobbies();
    if (serverLobbies.length > 0) {
      const target = serverLobbies[0];
      await this.join(target.code, name, skin);
      return { joinedRoom: target.code };
    }
    const lobbies = this.getActivePublicLobbies();
    if (lobbies.length > 0) {
      const target = lobbies[0];
      await this.join(target.code, name, skin);
      return { joinedRoom: target.code };
    } else {
      // Auto host a public room
      const code = await this.host(name, skin, true);
      return { hostedNew: code };
    }
  }

  /**
   * Fetch public rooms from the PartyKit server (/lobby endpoint, works
   * cross-device) merged with the same-browser localStorage fallback.
   * Never throws: if the server is unreachable we degrade to local rooms.
   */
  async refreshPublicLobbies(): Promise<PublicLobbyInfo[]> {
    const merged = new Map<string, PublicLobbyInfo>();
    for (const local of this.getActivePublicLobbies()) {
      merged.set(local.code, local);
    }
    try {
      const res = await fetch(`${getPartyHttpBase()}/parties/main/lobby`, {
        headers: { accept: 'application/json' },
      });
      if (res.ok) {
        const serverList = (await res.json()) as Array<{
          code: string;
          hostName: string;
          playerCount: number;
          maxPlayers: number;
          isPublic?: boolean;
        }>;
        for (const item of serverList) {
          if (item && item.code && item.isPublic !== false) {
            merged.set(item.code.toUpperCase(), {
              code: item.code.toUpperCase(),
              hostName: item.hostName || 'Runner',
              playerCount: item.playerCount || 1,
              maxPlayers: item.maxPlayers || MAX_PLAYERS,
            });
          }
        }
        this.serverOnline = true;
      } else {
        this.serverOnline = false;
      }
    } catch {
      this.serverOnline = false;
    }
    const ownCode = (this.roomId ?? '').toUpperCase();
    const result = Array.from(merged.values()).filter((l) => l.code !== ownCode);
    this.onPublicLobbiesChange?.(result);
    return result;
  }

  getActivePublicLobbies(): PublicLobbyInfo[] {
    const results: PublicLobbyInfo[] = [];
    if (typeof localStorage === 'undefined') return results;

    try {
      const raw = localStorage.getItem('pixelrun_active_lobbies_v2');
      if (raw) {
        const map = JSON.parse(raw);
        const now = Date.now();

        for (const item of Object.values(map) as Array<{ code: string; hostName: string; playerCount: number; maxPlayers: number; isPublic: boolean; ts: number }>) {
          // Keep rooms with reasonable liveness threshold (< 120s)
          if (item && item.code && item.isPublic && (!item.ts || now - item.ts < 120000)) {
            // Exclude our own room if currently hosting
            if (item.code !== this.roomId) {
              results.push({
                code: item.code,
                hostName: item.hostName || 'Runner',
                playerCount: item.playerCount || 1,
                maxPlayers: item.maxPlayers || MAX_PLAYERS,
              });
            }
          }
        }
      }
    } catch {
      // Ignore
    }
    return results;
  }

  private initGlobalLobbies() {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.globalLobbiesBc = new BroadcastChannel('pixelrun_global_lobbies');
        this.globalLobbiesBc.onmessage = () => {
          this.onPublicLobbiesChange?.(this.getActivePublicLobbies());
        };
      } catch {
        // Ignore
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e: StorageEvent) => {
        if (e.key === 'pixelrun_active_lobbies_v2') {
          this.onPublicLobbiesChange?.(this.getActivePublicLobbies());
        }
      });

      window.addEventListener('beforeunload', () => {
        if (this.role === 'host' && this.roomId) {
          try {
            const raw = localStorage.getItem('pixelrun_active_lobbies_v2');
            if (raw) {
              const map = JSON.parse(raw);
              delete map[this.roomId];
              localStorage.setItem('pixelrun_active_lobbies_v2', JSON.stringify(map));
            }
          } catch {}
        }
      });
    }
  }

  private publishLobbyHeartbeat() {
    if (this.lobbyTimer) clearInterval(this.lobbyTimer);
    const update = () => {
      if (this.role === 'host' && this.state === 'in_room' && this.roomId) {
        try {
          const raw = localStorage.getItem('pixelrun_active_lobbies_v2');
          const map = raw ? JSON.parse(raw) : {};
          map[this.roomId] = {
            code: this.roomId,
            hostName: this.localName,
            playerCount: this.opponents.size + 1,
            maxPlayers: MAX_PLAYERS,
            isPublic: this.isPublic,
            ts: Date.now(),
          };
          localStorage.setItem('pixelrun_active_lobbies_v2', JSON.stringify(map));
          this.globalLobbiesBc?.postMessage({ type: 'lobbies_update' });
        } catch {
          // Ignore
        }
      }
    };
    update();
    this.lobbyTimer = window.setInterval(update, 500);

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', update);
    }
  }

  private initSyncChannels(roomId: string, role: 'host' | 'joiner') {
    const channelName = `pixelrun_room_${roomId.toLowerCase()}`;

    // 1. BroadcastChannel (0ms local tabs)
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.bc = new BroadcastChannel(channelName);
        this.bc.onmessage = (event) => {
          this.handleSyncMessage(event.data);
        };
      } catch {
        // Ignore
      }
    }

    // 2. Storage event fallback
    if (typeof window !== 'undefined') {
      this.storageListener = (e: StorageEvent) => {
        if (e.key && e.key.startsWith(`pixelrun_sync_${roomId.toLowerCase()}`) && e.newValue) {
          try {
            const data = JSON.parse(e.newValue);
            this.handleSyncMessage(data);
          } catch {
            // Ignore
          }
        }
      };
      window.addEventListener('storage', this.storageListener);
    }

    // 3. WebRTC PeerJS P2P Mesh (Multi-Device / Cross-Browser)
    try {
      if (this.peer) {
        this.peer.destroy();
        this.peer = null;
      }
      this.peerConnections.clear();
      this.peerConnToSelfId.clear();

      if (role === 'host') {
        const hostPeerId = `pxrun-host-${roomId.toLowerCase()}`;
        this.peer = new Peer(hostPeerId, {
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:global.stun.twilio.com:3478' },
            ],
          },
        });

        this.peer.on('error', (err) => {
          console.warn('PeerJS host notice:', err.type, err.message);
        });

        this.peer.on('connection', (conn) => {
          conn.on('open', () => {
            this.peerConnections.set(conn.peer, conn);
            // Send current room state to newly connected peer
            const playersList = Array.from(this.localTabPlayers.values());
            conn.send({
              type: 'bc_room_state',
              players: playersList,
            });
          });

          conn.on('data', (data: any) => {
            if (data && data.type === 'bc_join' && typeof data.peerId === 'string') {
              this.peerConnToSelfId.set(conn.peer, data.peerId);
            }
            this.handleSyncMessage(data);
          });

          conn.on('close', () => {
            this.peerConnections.delete(conn.peer);
            // localTabPlayers is keyed by the joiner's self-generated peerId,
            // NOT conn.peer (the PeerJS id) — resolve through the mapping.
            const selfId = this.peerConnToSelfId.get(conn.peer);
            this.peerConnToSelfId.delete(conn.peer);
            if (selfId) this.localTabPlayers.delete(selfId);
            else this.localTabPlayers.delete(conn.peer);
            const playersList = Array.from(this.localTabPlayers.values());
            this.broadcast({ type: 'bc_room_state', players: playersList });
            this.updateOpponentsFromList(playersList);
          });
        });
      } else {
        const joinerPeerId = `pxrun-join-${roomId.toLowerCase()}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
        this.peer = new Peer(joinerPeerId, {
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:global.stun.twilio.com:3478' },
            ],
          },
        });

        this.peer.on('error', (err) => {
          console.warn('PeerJS joiner notice:', err.type, err.message);
        });

        this.peer.on('open', () => {
          const hostPeerId = `pxrun-host-${roomId.toLowerCase()}`;
          const conn = this.peer!.connect(hostPeerId, { reliable: true });

          conn.on('open', () => {
            this.peerConnections.set(hostPeerId, conn);
            conn.send({
              type: 'bc_join',
              peerId: this.peerId,
              name: this.localName,
              skinId: this.localSkin,
            });
          });

          conn.on('data', (data: any) => {
            this.handleSyncMessage(data);
          });

          conn.on('close', () => {
            this.peerConnections.delete(hostPeerId);
          });
        });
      }
    } catch {
      // Ignore
    }
  }

  private broadcast(data: Record<string, unknown>) {
    // 1. BroadcastChannel
    if (this.bc) {
      try {
        this.bc.postMessage(data);
      } catch {
        // Ignore
      }
    }

    // 2. Storage Event fallback (only needed when BroadcastChannel is
    // unavailable — sendTick broadcasts ~30x/s, so skip the writes otherwise)
    if (!this.bc && typeof window !== 'undefined' && this.roomId) {
      try {
        const key = `pixelrun_sync_${this.roomId.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const payload = JSON.stringify({ ...data, _ts: Date.now(), _nonce: Math.random() });
        localStorage.setItem(key, payload);
        setTimeout(() => {
          try {
            localStorage.removeItem(key);
          } catch {}
        }, 1500);
      } catch {
        // Ignore
      }
    }

    // 3. WebRTC DataConnections
    for (const conn of this.peerConnections.values()) {
      if (conn.open) {
        try {
          conn.send(data);
        } catch {
          // Ignore
        }
      }
    }
  }

  private startHostSyncLoop() {
    if (this.syncTimer) clearInterval(this.syncTimer);
    const sendState = () => {
      if (this.role === 'host' && this.state === 'in_room') {
        const playersList = Array.from(this.localTabPlayers.values());
        this.broadcast({
          type: 'bc_room_state',
          players: playersList,
        });
      }
    };
    sendState();
    this.syncTimer = window.setInterval(sendState, 300);
  }

  private startJoinPingLoop() {
    if (this.syncTimer) clearInterval(this.syncTimer);
    const sendPing = () => {
      if (this.role === 'joiner' && this.state === 'in_room') {
        this.broadcast({
          type: 'bc_join',
          peerId: this.peerId,
          name: this.localName,
          skinId: this.localSkin,
        });
      }
    };
    sendPing();
    this.syncTimer = window.setInterval(sendPing, 300);
  }

  private handleSyncMessage(data: Record<string, unknown>) {
    if (!data || typeof data !== 'object') return;
    const type = data.type as string;

    if (type === 'bc_join' && this.role === 'host') {
      const joinerId = data.peerId as string;
      const joinerName = (data.name as string) || 'Runner';
      const joinerSkin = (data.skinId as SkinId) || 'bob';

      if (joinerId && joinerId !== this.peerId) {
        this.localTabPlayers.set(joinerId, {
          peerId: joinerId,
          name: joinerName,
          skinId: joinerSkin,
          isHost: false,
          meters: 0,
          score: 0,
          isAlive: true,
        });

        // Broadcast updated room state immediately
        const playersList = Array.from(this.localTabPlayers.values());
        this.broadcast({
          type: 'bc_room_state',
          players: playersList,
        });

        this.updateOpponentsFromList(playersList);
      }
    } else if (type === 'bc_leave') {
      const leaverId = data.peerId as string;
      if (leaverId && leaverId !== this.peerId) {
        if (this.role === 'host' && this.localTabPlayers.has(leaverId)) {
          this.localTabPlayers.delete(leaverId);
          const playersList = Array.from(this.localTabPlayers.values());
          this.broadcast({ type: 'bc_room_state', players: playersList });
          this.updateOpponentsFromList(playersList);
        } else {
          this.opponents.delete(leaverId);
          this.onRoomStateChange?.(Array.from(this.opponents.values()));
        }
      }
    } else if (type === 'bc_room_state') {
      const players = data.players as Array<{ peerId: string; name: string; skinId: SkinId; isHost: boolean }>;
      if (Array.isArray(players)) {
        this.updateOpponentsFromList(players);
      }
    } else if (type === 'bc_start') {
      const seed = (data.seed as number) || Math.floor(Math.random() * 1000000);
      const startAt = (data.startAt as number) || (Date.now() + 3000);
      if (this.state !== 'in_game') {
        this.state = 'in_game';
        this.matchResult = null;
        this.localAlive = true;
        this.localTick = null;
        this.onMatchStart?.(seed, startAt);
      }
    } else if (type === 'bc_tick' && this.state === 'in_game') {
      const senderId = data.peerId as string;
      const payload = data.payload as PlayerTickPayload;
      if (senderId && senderId !== this.peerId && payload) {
        const opp = this.opponents.get(senderId);
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
          // Same rule as the WS path: death is terminal until the next match.
          opp.isAlive = payload.alive === false ? false : opp.isAlive;
          opp.ts = Date.now();
        }
      }
    } else if (type === 'bc_death' && this.state === 'in_game') {
      const senderId = data.peerId as string;
      const meters = data.meters as number;
      const score = data.score as number;
      if (senderId && senderId !== this.peerId) {
        const opp = this.opponents.get(senderId);
        if (opp) {
          opp.isAlive = false;
          opp.meters = meters;
          opp.score = score;
        }

        // Check if all players dead in host tab (host's own death included)
        if (this.role === 'host') {
          const allOpponents = Array.from(this.opponents.values());
          const allDead = allOpponents.every((o) => !o.isAlive) && !this.localAlive;
          if (allDead) {
            this.finishBcMatch();
          }
        }
      }
    } else if (type === 'bc_match_end') {
      const result = data.result as MatchResult;
      // Guard against double end (BC and WebSocket both deliver match_end).
      if (result && !this.matchResult) {
        this.state = 'ended';
        const localEntry = result.leaderboard.find((e) => e.peerId === this.peerId);
        result.isWinner = localEntry ? localEntry.rank === 1 : false;
        result.rank = localEntry ? localEntry.rank : result.totalPlayers;
        this.matchResult = result;
        this.onMatchEnd?.(result);
      }
    } else if (type === 'bc_rematch') {
      if (this.role === 'host') {
        // The host also receives its OWN broadcast (async, after rematch()
        // already ran startMatch() and set 'in_game') — skip so the match is
        // not started twice with two different seeds.
        if (this.state === 'in_game') return;
        this.state = 'in_room';
        this.matchResult = null;
        this.startMatch();
      } else {
        this.state = 'in_room';
        this.matchResult = null;
        this.localAlive = true;
        this.localTick = null;
      }
    }
  }

  private updateOpponentsFromList(players: Array<{ peerId: string; name: string; skinId: SkinId; isHost: boolean }>) {
    this.opponents.clear();
    for (const p of players) {
      if (p.peerId !== this.peerId) {
        this.opponents.set(p.peerId, {
          peerId: p.peerId,
          name: p.name,
          skinId: p.skinId,
          isHost: p.isHost,
          ready: false,
          meters: 0,
          score: 0,
          isAlive: true,
          ts: Date.now(),
        });
      }
    }
    this.onRoomStateChange?.(Array.from(this.opponents.values()));
  }

  private finishBcMatch() {
    const list: Array<{ peerId: string; name: string; skinId: SkinId; meters: number; score: number }> = [];

    // Local player (live values mirrored from sendTick/sendDeath)
    list.push({
      peerId: this.peerId || 'host',
      name: this.localName,
      skinId: this.localSkin,
      meters: this.localTick?.meters ?? 0,
      score: this.localTick?.score ?? 0,
    });

    // Opponents
    for (const opp of this.opponents.values()) {
      list.push({
        peerId: opp.peerId,
        name: opp.name,
        skinId: opp.skinId,
        meters: opp.meters,
        score: opp.score,
      });
    }

    list.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.meters - a.meters;
    });

    const leaderboard: MatchResultEntry[] = list.map((entry, idx) => ({
      peerId: entry.peerId,
      name: entry.name,
      skinId: entry.skinId,
      meters: entry.meters,
      score: entry.score,
      rank: idx + 1,
      isLocal: entry.peerId === this.peerId,
    }));

    const winner = leaderboard[0];
    const hostRank = leaderboard.find((e) => e.peerId === this.peerId)?.rank ?? leaderboard.length;

    const result: MatchResult = {
      winnerName: winner ? winner.name : 'Runner',
      isWinner: winner ? winner.peerId === this.peerId : false,
      finalMeters: winner ? winner.meters : 0,
      finalScore: winner ? winner.score : 0,
      rank: hostRank,
      totalPlayers: leaderboard.length,
      mode: 'online',
      leaderboard,
    };

    this.broadcast({
      type: 'bc_match_end',
      result,
    });

    this.state = 'ended';
    this.matchResult = result;
    this.onMatchEnd?.(result);
  }

  private connectWebSocket(roomId: string) {
    try {
      const wsUrl = getPartyWebSocketUrl(roomId);
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        this.serverOnline = true;
        this.send({
          type: 'join',
          clientId: this.peerId ?? '',
          name: this.localName,
          skinId: this.localSkin,
        });

        if (this.role === 'host' && this.isPublic) {
          this.send({ type: 'visibility', isPublic: true });
        }
      };

      this.socket.onmessage = (event) => {
        this.handleServerMessage(event.data);
      };

      this.socket.onerror = () => {
        this.serverOnline = false;
      };

      this.socket.onclose = () => {
        // Handled gracefully by BroadcastChannel fallback
      };
    } catch {
      this.serverOnline = false;
    }
  }

  private handleServerMessage(raw: string) {
    try {
      const msg: PartyServerMessage = JSON.parse(raw);

      switch (msg.type) {
        case 'room_state': {
          if (this.awaitingFirstRoomState) {
            this.awaitingFirstRoomState = false;
            // We tried to join a room that no longer exists (host left): the
            // server silently promoted us to host of an empty room. Back out
            // gracefully instead of stranding the user in a dead lobby.
            if (
              this.role === 'joiner' &&
              msg.selfId !== null &&
              msg.selfId === msg.hostId &&
              msg.players.length === 1
            ) {
              this.leave();
              this.onStatusMsg?.('ROOM NOT FOUND - IT MAY HAVE CLOSED');
              return;
            }
          }
          this.isPublic = msg.isPublic;
          this.opponents.clear();

          // The server echoes back OUR identity per connection (selfId);
          // everything else in the list is an opponent.
          const selfId = msg.selfId ?? this.peerId ?? '';
          for (const p of msg.players) {
            if (p.peerId !== selfId) {
              this.opponents.set(p.peerId, p);
            }
          }

          this.onRoomStateChange?.(Array.from(this.opponents.values()));
          break;
        }

        case 'match_start': {
          // Host already triggered the countdown locally with the same seed
          // (passed through the 'start' message) - ignore the server echo.
          if (this.state !== 'in_game') {
            this.state = 'in_game';
            this.matchResult = null;
            this.localAlive = true;
            this.localTick = null;
            this.onMatchStart?.(msg.seed, msg.startAt);
          }
          break;
        }

        case 'ticks': {
          if (this.state === 'in_game') {
            for (const [peerId, payload] of Object.entries(msg.ticks)) {
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
                // Death is terminal until the next match (which resets
                // opponents via room_state) — a tick must never resurrect.
                opp.isAlive = payload.alive === false ? false : opp.isAlive;
                opp.ts = Date.now();
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
          // Guard against double end (BC and WebSocket both deliver match_end).
          if (this.matchResult) break;
          this.state = 'ended';
          const result = msg.result;
          result.mode = 'online';

          const localEntry =
            result.leaderboard.find((e) => e.peerId === this.peerId) ??
            result.leaderboard.find((e) => e.name === this.localName);
          result.isWinner = localEntry ? localEntry.rank === 1 : false;
          result.rank = localEntry ? localEntry.rank : result.totalPlayers;
          if (localEntry) localEntry.isLocal = true;

          this.matchResult = result;
          this.onMatchEnd?.(result);
          break;
        }
      }
    } catch {
      // Ignore
    }
  }

  setReady(ready: boolean) {
    this.send({ type: 'ready', ready });
  }

  setRoomVisibility(isPublic: boolean) {
    this.isPublic = isPublic;
    this.publishLobbyHeartbeat();
    this.send({ type: 'visibility', isPublic });
  }

  startMatch() {
    // Guard against double-starts (rapid double-click on START, or a rematch
    // echoed back while the match is already live): a second start would
    // restart the local countdown with a NEW seed while the joiners already
    // count down the first one — desynced worlds.
    if (this.state === 'in_game') return;
    const seed = Math.floor(Math.random() * 1000000);
    const startAt = Date.now() + 3000;
    this.localAlive = true;
    this.localTick = null;

    // BroadcastChannel sync (same seed so local tabs match)
    this.broadcast({
      type: 'bc_start',
      seed,
      startAt,
    });

    // WebSocket sync: the host's seed is authoritative, so every client
    // (including the host) simulates the SAME world.
    this.send({ type: 'start', seed });

    // Local host trigger (server echoes match_start which we ignore because
    // state is already 'in_game').
    this.state = 'in_game';
    this.matchResult = null;
    this.onMatchStart?.(seed, startAt);
  }

  sendTick(payload: PlayerTickPayload) {
    if (this.state === 'in_game') {
      this.localTick = payload;
      this.broadcast({
        type: 'bc_tick',
        peerId: this.peerId,
        payload,
      });
      this.send({ type: 'tick', payload });
    }
  }

  sendDeath(meters: number, score: number) {
    if (this.state === 'in_game') {
      this.localAlive = false;
      this.broadcast({
        type: 'bc_death',
        peerId: this.peerId,
        meters,
        score,
      });
      this.send({ type: 'death', meters, score });
    }
  }

  rematch() {
    this.broadcast({ type: 'bc_rematch' });
    this.send({ type: 'rematch' });
    if (this.role === 'host') {
      this.startMatch();
    }
  }

  leave() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    if (this.lobbyTimer) {
      clearInterval(this.lobbyTimer);
      this.lobbyTimer = null;
    }
    if (this.storageListener && typeof window !== 'undefined') {
      window.removeEventListener('storage', this.storageListener);
      this.storageListener = null;
    }
    // Tell the room we are gone BEFORE tearing down the channels, so the
    // host removes us from localTabPlayers and rebroadcasts the room state.
    if (this.roomId && this.peerId) {
      this.broadcast({ type: 'bc_leave', peerId: this.peerId });
    }
    if (this.bc) {
      try {
        this.bc.close();
      } catch {
        // Ignore
      }
      this.bc = null;
    }
    if (this.socket) {
      try {
        this.send({ type: 'leave' });
        this.socket.close();
      } catch {
        // Ignore
      }
      this.socket = null;
    }
    for (const conn of this.peerConnections.values()) {
      try {
        conn.close();
      } catch {}
    }
    this.peerConnections.clear();
    this.peerConnToSelfId.clear();
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {}
      this.peer = null;
    }
    if (this.role === 'host' && this.roomId) {
      try {
        const raw = localStorage.getItem('pixelrun_active_lobbies_v2');
        if (raw) {
          const map = JSON.parse(raw);
          delete map[this.roomId];
          localStorage.setItem('pixelrun_active_lobbies_v2', JSON.stringify(map));
          this.globalLobbiesBc?.postMessage({ type: 'lobbies_update' });
          this.onPublicLobbiesChange?.(this.getActivePublicLobbies());
        }
      } catch {
        // Ignore
      }
    }
    this.roomId = null;
    this.role = null;
    this.state = 'idle';
    this.awaitingFirstRoomState = false;
    this.opponents.clear();
    this.localTabPlayers.clear();
    this.matchResult = null;
    this.onRoomStateChange?.([]);
  }

  private send(msg: PartyClientMessage) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(JSON.stringify(msg));
      } catch {
        // Ignore
      }
    }
  }
}

export const party = new PartyManager();
