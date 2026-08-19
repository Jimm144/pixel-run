import type Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import { MqttRelay, LOBBY_TOPIC_PREFIX, LOBBY_TOPIC_WILDCARD, ROOM_TOPIC_PREFIX, lobbyTopic } from './mqttRelay';
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

// PeerJS is a ~60 kB UMD build. Loading it from a CDN only when a room is
// actually used keeps the single-file bundle small and the page load fast —
// multiplayer needs a network connection anyway, so the CDN dependency is
// not a new constraint. The type-only import above is erased at build time.
const PEERJS_CDN_URLS = [
  'https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js',
  'https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js',
];

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
}

let peerLib: typeof Peer | null = null;
let peerLoading: Promise<typeof Peer> | null = null;

async function loadPeerJs(): Promise<typeof Peer> {
  if (peerLib) return peerLib;
  if (!peerLoading) {
    peerLoading = (async () => {
      for (const url of PEERJS_CDN_URLS) {
        try {
          await loadScript(url);
          const g = (window as unknown as { Peer?: typeof Peer }).Peer;
          if (g) {
            peerLib = g;
            return g;
          }
        } catch {
          // Try the next CDN.
        }
      }
      throw new Error('PeerJS failed to load from CDN');
    })();
  }
  return peerLoading;
}

export const MAX_PLAYERS = 8;

function getPartyWebSocketUrl(room: string): string {
  const base = getPartyHttpBase();
  const scheme = base.startsWith('https') ? 'wss' : 'ws';
  return `${scheme}://${base.replace(/^https?:\/\//, '')}/parties/main/${room.toLowerCase()}`;
}

function getPartyHttpBase(): string {
  // Any HTTP-served instance (localhost OR a LAN IP) talks to the party
  // server on the same host — so a second device can join rooms against
  // this machine's local PartyKit dev server. HTTPS pages (the deployed
  // site) always use the hosted PartyKit backend.
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  if (hostname && window.location.protocol === 'http:') {
    return `http://${hostname}:1999`;
  }
  return 'https://pixel-run.jimm144.partykit.dev';
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
  mqtt: MqttRelay | null = null;
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
  private localTabPlayers = new Map<string, { peerId: string; name: string; skinId: SkinId; isHost: boolean; meters: number; score: number; isAlive: boolean; ready: boolean; ts: number; transport?: string }>();
  // Public rooms announced over the MQTT lobby topic (cross-device, unlike
  // the same-browser localStorage list).
  private mqttLobbies = new Map<string, { code: string; hostName: string; playerCount: number; maxPlayers: number; ts: number }>();
  // WebRTC conn.peer -> joiner's self-generated peerId (host side), so a
  // dropped DataConnection can remove the right localTabPlayers entry.
  private peerConnToSelfId = new Map<string, string>();
  // Mirror of the local player's live state for the BC-only match-end path.
  private localTick: PlayerTickPayload | null = null;
  private localAlive = true;
  /** Local player's ready flag, mirrored over BC so same-browser tabs see it
   *  even when the WebSocket is down (the server remains authoritative). */
  private localReady = false;
  private syncTimer: number | null = null;
  private lobbyTimer: number | null = null;
  private lastMqttLobbyPublish = 0;
  private storageListener: ((e: StorageEvent) => void) | null = null;
  private lobbyVisibilityListener: (() => void) | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;
  // Storage-fallback tick coalescing (bc_tick is ~30x/s; cap storage writes).
  private lastTickStorageWrite = 0;
  private pendingTickStorage: Record<string, unknown> | null = null;
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
    this.localReady = true;

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
      ready: true,
      ts: Date.now(),
    });
    this.localAlive = true;
    this.localTick = null;

    // Initialize Sync Channels
    await this.initSyncChannels(code, 'host');

    // Periodic host broadcast so joiners instantly receive room state
    this.startHostSyncLoop();

    // Publish lobby if public
    this.publishLobbyHeartbeat();

    // NOTE: the legacy PartyKit WebSocket backend is abandoned; the MQTT
    // relay (plus BroadcastChannel for same-browser tabs) is the transport.

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
    this.localReady = false;
    this.localTick = null;
    this.awaitingFirstRoomState = true;

    // Initialize Sync Channels
    await this.initSyncChannels(cleanCode, 'joiner');

    // Periodic join ping until connected
    this.startJoinPingLoop();

    // NOTE: the legacy PartyKit WebSocket backend is abandoned; the MQTT
    // relay (plus BroadcastChannel for same-browser tabs) is the transport.

    // Cross-network join watchdog: if no room state arrives in time the room
    // is gone (host device offline) — back out instead of pinging an empty
    // room forever. Any room_state (ws or bc/MQTT) clears the flag.
    window.setTimeout(() => {
      if (this.awaitingFirstRoomState && this.state === 'in_room' && this.roomId === cleanCode) {
        this.leave();
        this.onStatusMsg?.('ROOM NOT FOUND - IT MAY HAVE CLOSED');
      }
    }, 12000);

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
    const now = Date.now();
    for (const [code, item] of this.mqttLobbies) {
      if (now - item.ts < 120000) {
        merged.set(code, {
          code,
          hostName: item.hostName || 'Runner',
          playerCount: item.playerCount || 1,
          maxPlayers: item.maxPlayers || MAX_PLAYERS,
        });
      }
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
      }
    } catch {
      // Ignore — transport liveness owns serverOnline, not this fetch.
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
      if (this.role === 'host' && (this.state === 'in_room' || this.state === 'in_game') && this.roomId) {
        try {
          const raw = localStorage.getItem('pixelrun_active_lobbies_v2');
          const map = raw ? JSON.parse(raw) : {};
          if (!this.isPublic) {
            // A room flipped to private must not linger in the local lobby.
            delete map[this.roomId];
          } else {
            map[this.roomId] = {
              code: this.roomId,
              hostName: this.localName,
              playerCount: this.opponents.size + 1,
              maxPlayers: MAX_PLAYERS,
              isPublic: this.isPublic,
              ts: Date.now(),
            };
          }
          localStorage.setItem('pixelrun_active_lobbies_v2', JSON.stringify(map));
          this.globalLobbiesBc?.postMessage({ type: 'lobbies_update' });
        } catch {
          // Ignore
        }
        // MQTT lobby announcement: retained message so late subscribers see
        // the room instantly, republished every ~4s to refresh the TTL.
        const now = Date.now();
        if (this.mqtt && now - this.lastMqttLobbyPublish > 4000) {
          this.lastMqttLobbyPublish = now;
          try {
            if (this.isPublic) {
              this.mqtt.publish(
                lobbyTopic(this.roomId),
                {
                  code: this.roomId,
                  hostName: this.localName,
                  playerCount: this.opponents.size + 1,
                  maxPlayers: MAX_PLAYERS,
                  isPublic: true,
                  ts: now,
                },
                1,
                true
              );
            } else {
              // A room flipped to private must vanish from the shared lobby.
              this.mqtt.publish(lobbyTopic(this.roomId), '', 1, true);
            }
          } catch {
            // Ignore
          }
        }
      }
    };
    update();
    this.lobbyTimer = window.setInterval(update, 500);

    if (typeof document !== 'undefined') {
      // Replace, never stack: publishLobbyHeartbeat runs again on every
      // visibility toggle and would otherwise leak one listener per call.
      if (this.lobbyVisibilityListener) {
        document.removeEventListener('visibilitychange', this.lobbyVisibilityListener);
      }
      this.lobbyVisibilityListener = () => update();
      document.addEventListener('visibilitychange', this.lobbyVisibilityListener);
    }
  }

  private async initSyncChannels(roomId: string, role: 'host' | 'joiner') {
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

      const PeerClass = await loadPeerJs();

      if (role === 'host') {
        const hostPeerId = `pxrun-host-${roomId.toLowerCase()}`;
        this.peer = new PeerClass(hostPeerId, {
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
        this.peer = new PeerClass(joinerPeerId, {
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
              ready: this.localReady,
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

    // 4. Public MQTT relay (cross-network rooms with zero infrastructure).
    //    The broker is a dumb pipe: the host is the coordinator, and the
    //    same bc_* messages flow through BroadcastChannel, WebRTC and MQTT
    //    alike. Ticks ride QoS 0 (latest-wins, no reliability guarantee);
    //    everything else is QoS 1. ONE relay per page load — switching rooms
    //    re-targets the subscriptions instead of churning connections.
    if (typeof window !== 'undefined') {
      if (!this.mqtt) {
        this.mqtt = new MqttRelay();
        this.mqtt.onConnect = () => {
          this.serverOnline = true;
        };
        this.mqtt.onDisconnect = () => {
          this.serverOnline = false;
        };
        this.mqtt.onMessage = (topic, payload) => {
          try {
            if (topic.startsWith(LOBBY_TOPIC_PREFIX)) {
              this.handleLobbyMessage(payload);
            } else if (topic.startsWith(ROOM_TOPIC_PREFIX)) {
              this.handleSyncMessage(JSON.parse(payload));
            }
          } catch {
            // Ignore
          }
        };
      }
      this.mqtt.ensureStarted();
      this.mqtt.setTopics([`${ROOM_TOPIC_PREFIX}${roomId.toLowerCase()}`, LOBBY_TOPIC_WILDCARD]);
    }
  }

  private handleLobbyMessage(raw: string) {
    let entry: { code?: string; hostName?: string; playerCount?: number; maxPlayers?: number; isPublic?: boolean; ts?: number } | null = null;
    try {
      entry = raw ? JSON.parse(raw) : null;
    } catch {
      entry = null;
    }
    if (!entry || !entry.code || entry.isPublic === false) {
      if (entry && entry.code) this.mqttLobbies.delete(String(entry.code).toUpperCase());
      return;
    }
    this.mqttLobbies.set(String(entry.code).toUpperCase(), {
      code: String(entry.code).toUpperCase(),
      hostName: entry.hostName || 'Runner',
      playerCount: entry.playerCount || 1,
      maxPlayers: entry.maxPlayers || MAX_PLAYERS,
      ts: entry.ts || Date.now(),
    });
    this.refreshPublicLobbies();
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
      let out = data;
      if (data.type === 'bc_tick') {
        // Coalesce the tick stream to at most ~10 writes/s (latest wins).
        // Ticks self-supersede, so dropping intermediate ones is safe, and
        // the next non-tick message (bc_death etc.) always writes fresh.
        this.pendingTickStorage = data;
        const now = Date.now();
        if (now - this.lastTickStorageWrite < 100) return;
        out = this.pendingTickStorage;
        this.pendingTickStorage = null;
        this.lastTickStorageWrite = now;
      }
      const key = `pixelrun_sync_${this.roomId.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      try {
        const payload = JSON.stringify({ ...out, _ts: Date.now(), _nonce: Math.random() });
        localStorage.setItem(key, payload);
      } catch {
        // Ignore
      }
      setTimeout(() => {
        try {
          localStorage.removeItem(key);
        } catch {}
      }, 1500);
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

    // 4. MQTT relay (cross-network): mirrors the BroadcastChannel — every
    //    client sees every message. Ticks are QoS 0 (best-effort, latest
    //    wins); identity/control messages are QoS 1. Messages are tagged with
    //    their transport so the host never reconciles MQTT joiners against
    //    the WebSocket room membership (they live outside it).
    if (this.mqtt && this.roomId) {
      try {
        this.mqtt.publish(`${ROOM_TOPIC_PREFIX}${this.roomId.toLowerCase()}`, { ...data, transport: 'mqtt' }, data.type === 'bc_tick' ? 0 : 1);
      } catch {
        // Ignore
      }
    }
  }

  private startHostSyncLoop() {
    if (this.syncTimer) clearInterval(this.syncTimer);
    const sendState = () => {
      if (this.role === 'host' && this.state === 'in_room') {
        // Sweep ghost joiners (crashed tabs/devices, dead WebRTC links):
        // joiners ping bc_join every 300ms, so 8s of silence means gone.
        // Only runs in_room — joiners stop pinging during a match, and
        // killing their entries mid-match would wipe live meters/score.
        const now = Date.now();
        let changed = false;
        for (const [id, entry] of Array.from(this.localTabPlayers.entries())) {
          if (id !== this.peerId && now - (entry.ts || now) > 8000) {
            this.localTabPlayers.delete(id);
            changed = true;
          }
        }
        if (changed) {
          const playersList = Array.from(this.localTabPlayers.values());
          this.broadcast({ type: 'bc_room_state', players: playersList });
          this.updateOpponentsFromList(playersList);
        }
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
          ready: this.localReady,
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
      const joinerReady = data.ready === true;

      if (joinerId && joinerId !== this.peerId) {
        const existing = this.localTabPlayers.get(joinerId);
        if (existing) {
          // Re-ping of an already-known tab: refresh identity only, keep
          // live meters/score/alive state (pings repeat every 300ms).
          existing.name = joinerName;
          existing.skinId = joinerSkin;
          existing.ready = joinerReady;
          existing.ts = Date.now();
          if (!existing.transport) existing.transport = data.transport as string | undefined;
        } else {
          this.localTabPlayers.set(joinerId, {
            peerId: joinerId,
            name: joinerName,
            skinId: joinerSkin,
            isHost: false,
            meters: 0,
            score: 0,
            isAlive: true,
            ready: joinerReady,
            ts: Date.now(),
            transport: data.transport as string | undefined,
          });
        }

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
        if (this.role === 'host') {
          if (this.localTabPlayers.delete(leaverId)) {
            const playersList = Array.from(this.localTabPlayers.values());
            this.broadcast({ type: 'bc_room_state', players: playersList });
            this.updateOpponentsFromList(playersList);
          }
        } else if (this.opponents.delete(leaverId)) {
          this.onRoomStateChange?.(Array.from(this.opponents.values()));
        }
      }
    } else if (type === 'bc_room_state') {
      const players = data.players as Array<{ peerId: string; name: string; skinId: SkinId; isHost: boolean; ready?: boolean }>;
      if (Array.isArray(players)) {
        // Any room state proves the room exists — clears the join watchdog.
        this.awaitingFirstRoomState = false;
        this.updateOpponentsFromList(players);
      }
    } else if (type === 'bc_ready') {
      const senderId = data.peerId as string;
      const ready = Boolean(data.ready);
      if (senderId && senderId !== this.peerId) {
        if (this.role === 'host') {
          const entry = this.localTabPlayers.get(senderId);
          if (entry) entry.ready = ready;
          const playersList = Array.from(this.localTabPlayers.values());
          this.broadcast({ type: 'bc_room_state', players: playersList });
          this.updateOpponentsFromList(playersList);
        } else {
          const opp = this.opponents.get(senderId);
          if (opp && opp.ready !== ready) {
            opp.ready = ready;
            this.onRoomStateChange?.(Array.from(this.opponents.values()));
          }
        }
      }
    } else if (type === 'bc_start') {
      const seed = (data.seed as number) || Math.floor(Math.random() * 1000000);
      const startAt = (data.startAt as number) || (Date.now() + 3000);
      if (this.state !== 'in_game') {
        this.state = 'in_game';
        this.matchResult = null;
        this.localAlive = true;
        this.localTick = null;
        this.localReady = false;
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
      }

      // The host owns BC-only match ending, and must run the check for EVERY
      // death — including its own (senderId === this.peerId is skipped
      // above), or a match where the host dies last would never finish.
      // Mirrors the server rule: the match ends once all opponents are dead
      // (host alive or not).
      if (this.role === 'host' && this.state === 'in_game') {
        const allOpponents = Array.from(this.opponents.values());
        if (allOpponents.length > 0 && allOpponents.every((o) => !o.isAlive)) {
          this.finishBcMatch();
        }
      }
    } else if (type === 'bc_match_end') {
      const result = data.result as MatchResult;
      // Guard against double end (BC and WebSocket both deliver match_end),
      // and against results that arrive after we left the room (handleExit
      // during the countdown) — the results modal must not pop over the menu.
      if (result && this.state === 'in_game' && !this.matchResult) {
        this.state = 'ended';
        const localEntry = result.leaderboard.find((e) => e.peerId === this.peerId);
        result.isWinner = localEntry ? localEntry.rank === 1 : false;
        result.rank = localEntry ? localEntry.rank : result.totalPlayers;
        // Mirror the WS handler: the leaderboard was built by the HOST with
        // its own peerId, so joiner entries are never flagged — without this
        // the "(YOU)" highlight is missing for BC-only joiners.
        if (localEntry) localEntry.isLocal = true;
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
        this.localReady = false;
      }
    }
  }

  private updateOpponentsFromList(players: Array<{ peerId: string; name: string; skinId: SkinId; isHost: boolean; ready?: boolean }>) {
    const next = new Map<string, OpponentInfo>();
    for (const p of players) {
      if (p.peerId === this.peerId) continue;
      const existing = this.opponents.get(p.peerId);
      next.set(
        p.peerId,
        existing
          ? { ...existing, name: p.name, skinId: p.skinId, isHost: p.isHost, ready: p.ready ?? existing.ready }
          : {
              peerId: p.peerId,
              name: p.name,
              skinId: p.skinId,
              isHost: p.isHost,
              ready: p.ready ?? false,
              meters: 0,
              score: 0,
              isAlive: true,
              ts: Date.now(),
            }
      );
    }

    // Only notify when the roster actually changed (player joined/left, name,
    // skin, host flag or ready). The host rebroadcasts bc_room_state every
    // 300ms (and on every bc_join ping), so without this check the modal
    // would re-fire its join sound/status message ~3x/s. Keeping known
    // entries intact also stops the rebuild from wiping live meters/score/
    // alive/ready state mid-match (dead players would resurrect, ready
    // indicators would reset to NOT READY on every broadcast).
    let changed = next.size !== this.opponents.size;
    if (!changed) {
      for (const [id, opp] of next) {
        const cur = this.opponents.get(id);
        if (!cur || cur.name !== opp.name || cur.skinId !== opp.skinId || cur.isHost !== opp.isHost || cur.ready !== opp.ready) {
          changed = true;
          break;
        }
      }
    }
    if (!changed) return;

    this.opponents.clear();
    for (const [id, opp] of next) this.opponents.set(id, opp);
    this.onRoomStateChange?.(Array.from(this.opponents.values()));
  }

  /**
   * BC-only match end: fire when every player on the board is dead. Runs on
   * the host tab for foreign bc_death messages AND for the host's own death —
   * the host's own bc_death never comes back (self messages are skipped), so
   * without this a host who dies last would leave every tab hanging in
   * 'in_game' with no results modal.
   */
  private checkBcMatchEnd() {
    if (this.role !== 'host' || this.state !== 'in_game') return;
    const allOpponents = Array.from(this.opponents.values());
    const allDead = allOpponents.every((o) => !o.isAlive) && !this.localAlive;
    if (allDead) this.finishBcMatch();
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
      const socket = new WebSocket(wsUrl);
      this.socket = socket;

      socket.onopen = () => {
        this.serverOnline = true;
        this.reconnectAttempts = 0;
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

      socket.onmessage = (event) => {
        this.handleServerMessage(event.data);
      };

      socket.onerror = () => {
        this.serverOnline = false;
      };

      socket.onclose = () => {
        this.serverOnline = false;
        // Survive a dev-server restart / network blip: reconnect with
        // backoff as long as we are still in this room. leave() nulls the
        // socket and sets state 'idle', so a deliberate exit never
        // reconnects (guarded by socket identity + roomId below).
        if (this.socket === socket && this.roomId === roomId && this.state !== 'idle') {
          this.scheduleReconnect(roomId, socket);
        }
      };
    } catch {
      this.serverOnline = false;
    }
  }

  private scheduleReconnect(roomId: string, socket: WebSocket) {
    // A WebSocket that NEVER opened won't start working by retrying forever
    // (dead hosted backend). Cap at 5 attempts (~31s of backoff) — dev-server
    // restarts still recover; a dead remote URL stops hammering.
    if (this.reconnectAttempts >= 5) {
      this.reconnectAttempts = 0;
      return;
    }
    if (this.reconnectTimer !== null) return;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 15000);
    this.reconnectAttempts++;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      // Still in the same room with the same (dead) socket? A leave() or a
      // re-host creates a new socket and/or roomId — a stale reconnect must
      // never spawn a second socket.
      if (this.socket === socket && this.roomId === roomId && this.state !== 'idle') {
        this.connectWebSocket(roomId);
      }
    }, delay);
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

          // The server is the source of truth for room membership. The host
          // reconciles its BC/WebRTC player list against it so a joiner whose
          // tab died without a bc_leave (or whose WS dropped) stops haunting
          // the lobby — otherwise the ghost keeps being rebroadcast forever.
          if (this.role === 'host') {
            const serverIds = new Set<string>();
            for (const p of msg.players) {
              if (p.peerId === this.peerId) continue;
              serverIds.add(p.peerId);
              const existing = this.localTabPlayers.get(p.peerId);
              this.localTabPlayers.set(
                p.peerId,
                existing
                  ? { ...existing, name: p.name, skinId: p.skinId, isHost: p.isHost, meters: p.meters, score: p.score, isAlive: p.isAlive }
                  : {
                      peerId: p.peerId,
                      name: p.name,
                      skinId: p.skinId,
                      isHost: p.isHost,
                      meters: p.meters,
                      score: p.score,
                      isAlive: p.isAlive,
                      ready: false,
                      ts: Date.now(),
                    }
              );
            }
            for (const id of Array.from(this.localTabPlayers.keys())) {
              // MQTT joiners live outside the WebSocket room — the server
              // must never reconcile them away. Their ghosts are swept by
              // the bc_join silence timer instead.
              if (id !== this.peerId && !serverIds.has(id) && this.localTabPlayers.get(id)?.transport !== 'mqtt') {
                this.localTabPlayers.delete(id);
              }
            }
          }

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
            this.localReady = false;
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
          // Also ignore results that arrive after we left the room (handleExit
          // during the countdown) — the results modal must not pop over the menu.
          if (this.state !== 'in_game' || this.matchResult) break;
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

        case 'error': {
          // Server rejected us (e.g. ROOM IS FULL): back out cleanly instead
          // of waiting forever for a room_state that will never arrive.
          this.leave();
          this.onStatusMsg?.(msg.message || 'SERVER ERROR');
          break;
        }
      }
    } catch {
      // Ignore
    }
  }

  setReady(ready: boolean) {
    this.localReady = ready;
    // BC mirror so same-browser tabs see the ready flip even if the
    // WebSocket is down (the server room_state stays authoritative).
    this.broadcast({ type: 'bc_ready', peerId: this.peerId, ready });
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
      // Freeze the local board entry at the death values: a post-death
      // restart (R replays the seed as a practice run) sends fresh ticks,
      // but they must never overwrite the death meters/score used by
      // finishBcMatch to build the leaderboard.
      if (this.localAlive) this.localTick = payload;
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
      const tick = this.localTick ?? {
        px: 0,
        py: 0,
        vx: 0,
        vy: 0,
        diving: false,
        frame: 0,
        run: -1,
        skinId: this.localSkin,
        alive: false,
        meters: 0,
        score: 0,
      };
      tick.meters = meters;
      tick.score = score;
      tick.alive = false;
      this.localTick = tick;
      this.broadcast({
        type: 'bc_death',
        peerId: this.peerId,
        meters,
        score,
      });
      this.send({ type: 'death', meters, score });
      // Host dies last: no foreign bc_death will arrive to end the match.
      this.checkBcMatchEnd();
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
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.lobbyVisibilityListener && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.lobbyVisibilityListener);
      this.lobbyVisibilityListener = null;
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
    if (this.mqtt) {
      // Drop OUR room from the shared lobby before leaving — per-room
      // retained topic, so other rooms' announcements survive. Joiners
      // never published an entry, so only hosts clear one.
      try {
        if (this.role === 'host' && this.roomId) {
          this.mqtt.publish(lobbyTopic(this.roomId), '', 1, true);
        }
      } catch {
        // Ignore
      }
      // The relay itself lives for the whole page (one persistent broker
      // connection); the next host()/join() re-targets its subscriptions.
      this.lastMqttLobbyPublish = 0;
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
    this.localReady = false;
    this.opponents.clear();
    this.localTabPlayers.clear();
    this.matchResult = null;
    this.onRoomStateChange?.([]);
  }

  rename(name: string) {
    const trimmed = name.trim().slice(0, 16);
    if (!trimmed) return;
    if (trimmed === this.localName) return;
    this.localName = trimmed;
    if (this.role) {
      this.send({ type: 'rename', name: trimmed });
      if (this.role === 'host') this.publishLobbyHeartbeat();
    }
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
