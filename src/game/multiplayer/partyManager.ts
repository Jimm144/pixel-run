import type Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import { MqttRelay, LOBBY_TOPIC_PREFIX, LOBBY_TOPIC_WILDCARD, ROOM_TOPIC_PREFIX, lobbyTopic } from './mqttRelay';
import type { SkinId } from '../skins';
import type {
  MatchResult,
  MatchResultEntry,
  OpponentInfo,
  PlayerTickPayload,
  PublicLobbyInfo,
} from './types';

// PeerJS is an ~87 kB UMD build. It's shipped as a same-origin vendor file
// (public/vendor/peerjs.min.js) and loaded only when a room is actually
// used, keeping the single-file bundle small and the page load fast. The
// CDN URLs are a fallback for hosts that can't serve the vendor file (e.g.
// itch.io single-file embeds). The type-only import above is erased at
// build time.
const PEERJS_CDN_URLS = ['vendor/peerjs.min.js', 'https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js', 'https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js'];

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

function generateRoomCode(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  return code;
}

export class PartyManager {
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
  pingMs = 0;

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
   *  even when the relay is down. */
  private localReady = false;
  private syncTimer: number | null = null;
  private lobbyTimer: number | null = null;
  private lastMqttLobbyPublish = 0;
  private storageListener: ((e: StorageEvent) => void) | null = null;
  private lobbyVisibilityListener: (() => void) | null = null;
  /** Wall-clock deadline (ms) for the current online match, enforced by the
   *  host: when it passes, the match ends and players are ranked by score.
   *  Prevents a single AFK player from holding a lobby hostage forever. */
  private matchDeadlineAt: number | null = null;
  /** Host-side match watchdog: ends the match at the deadline even if nobody
   *  dies (an AFK player never sends ticks/deaths), and broadcasts bc_timer
   *  so every client can render the countdown. */
  private matchTimer: number | null = null;
  private lastMatchTimerSec = -1;
  // Storage-fallback tick coalescing (bc_tick is ~30x/s; cap storage writes).
  private lastTickStorageWrite = 0;
  private pendingTickStorage: (Record<string, unknown> & { ts: number; roomId?: string | null }) | null = null;
  /** True until the first room_state after join() — used to detect a dead
   *  room (host gone) so the joiner can bail out gracefully. */
  private awaitingFirstRoomState = false;
  /** Wall-clock time join() started — the baseline for the search watchdog
   *  until the host proves the room exists. */
  private joinStartedAt = 0;
  /** Last time the host proved the room is alive (bc_room_state / bc_start).
   *  The host rebroadcasts room_state every 300ms while the lobby is up, so
   *  sustained silence here means the host is gone or unreachable. */
  private lastRoomProofAt = 0;
  /** Next "STILL SEARCHING..." nudge threshold (silence seconds). */
  private lastNudgeAt = 0;
  /** Throttle for the lobby refresh in handleLobbyMessage. */
  private lastLobbyRefresh = 0;

  // Callbacks
  onRoomStateChange?: (opponents: OpponentInfo[]) => void;
  onPublicLobbiesChange?: (lobbies: PublicLobbyInfo[]) => void;
  onMatchStart?: (seed: number, startAt: number) => void;
  onMatchEnd?: (result: MatchResult) => void;
  onStatusMsg?: (msg: string) => void;
  /** Remaining match time (ms) as broadcast by the host (bc_timer). The UI
   *  uses this to render the online battle countdown. */
  onMatchTimer?: (remainingMs: number) => void;

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

    return code;
  }

  async join(code: string, name: string, skin: SkinId): Promise<boolean> {
    const cleanCode = code.trim().toUpperCase();
    // Hard validation BEFORE leave()/channel setup: the code feeds MQTT topic
    // segments (pixelrun/room/<code>) and the BroadcastChannel name, so an
    // unvalidated value like "a/#" would subscribe to EVERY room on the
    // public broker. Only 4 uppercase alphanumerics are ever valid.
    if (!/^[A-Z0-9]{4}$/.test(cleanCode)) {
      this.onStatusMsg?.('INVALID ROOM CODE');
      return false;
    }

    this.leave();

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

    // Cross-network join watchdog, checked by the join ping loop (no extra
    // timer to leak): if the room never proves it exists — or the host stops
    // broadcasting room_state for a long stretch — the room is gone (host
    // device offline/crashed) and we back out instead of pinging an empty
    // room forever. The window is deliberately generous: a host whose MQTT
    // session dropped (tab throttling, network blip) needs one full
    // keepalive-grace + reconnect cycle to come back, and its queued pings
    // land on recovery. Until then the joiner keeps pinging and the user
    // sees "STILL SEARCHING..." nudges, so a room whose host recovers
    // seconds later is never abandoned.
    this.joinStartedAt = Date.now();
    this.lastRoomProofAt = 0;
    this.lastNudgeAt = 0;

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
   * Public rooms announced over the MQTT lobby topic (cross-device) merged
   * with the same-browser localStorage fallback. The dead PartyKit /lobby
   * endpoint was removed — the MQTT announcements are the cross-device source.
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
      // A previous room's channel must be closed first — rapid host/join
      // cycles (tab switching, double-clicked JOIN) would otherwise leak one
      // channel (with its live onmessage) per call.
      if (this.bc) {
        try {
          this.bc.close();
        } catch {
          // Ignore
        }
        this.bc = null;
      }
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
      // Remove any listener from a previous room first — window-level
      // listeners are not scoped to a channel and would leak forever.
      if (this.storageListener) {
        window.removeEventListener('storage', this.storageListener);
        this.storageListener = null;
      }
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
            // Defensive type/size guard: only accept string payloads within
            // the relay's size cap. A hostile broker (or a buggy client)
            // must not feed garbage into the JSON handlers.
            if (typeof payload !== 'string' || payload.length > 64 * 1024) return;
            if (topic.startsWith(LOBBY_TOPIC_PREFIX)) {
              this.handleLobbyMessage(payload, topic);
            } else if (topic.startsWith(ROOM_TOPIC_PREFIX)) {
              // Tag with the topic so handleSyncMessage can drop deliveries
              // from a room we already left (in-flight packets outlive the
              // leave() that re-targeted the subscriptions).
              this.handleSyncMessage({ ...JSON.parse(payload), _topic: topic });
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

  private handleLobbyMessage(raw: string, topic?: string) {
    let entry: { code?: string; hostName?: string; playerCount?: number; maxPlayers?: number; isPublic?: boolean; ts?: number } | null = null;
    try {
      entry = raw ? JSON.parse(raw) : null;
    } catch {
      entry = null;
    }
    // Empty retained payload = a host clearing its room from the shared
    // lobby. The code rides in the topic segment (pixelrun/lobby/<code>),
    // not the body, so derive it from the topic.
    if (!raw && topic) {
      const seg = topic.slice(LOBBY_TOPIC_PREFIX.length);
      if (seg) this.mqttLobbies.delete(seg.toUpperCase());
      return;
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
    // Throttle: every active room republishes its lobby entry every ~4s, so
    // without this the refresh fires continuously.
    const now = Date.now();
    if (now - this.lastLobbyRefresh > 4000) {
      this.lastLobbyRefresh = now;
      this.refreshPublicLobbies();
    }
  }

  private broadcast(data: Record<string, unknown>) {
    const out = {
      ...data,
      ts: (typeof data.ts === 'number' ? data.ts : Date.now()),
      ...(data.type === 'bc_tick' ? {} : { roomId: this.roomId }),
    };

    // 1. BroadcastChannel
    if (this.bc) {
      try {
        this.bc.postMessage(out);
      } catch {
        // Ignore
      }
    }

    // 2. Storage Event fallback (only needed when BroadcastChannel is
    // unavailable — sendTick broadcasts ~30x/s, so skip the writes otherwise)
    if (!this.bc && typeof window !== 'undefined' && this.roomId) {
      let outStore = out;
      if (data.type === 'bc_tick') {
        // Coalesce the tick stream to at most ~10 writes/s (latest wins).
        // Ticks self-supersede, so dropping intermediate ones is safe, and
        // the next non-tick message (bc_death etc.) always writes fresh.
        this.pendingTickStorage = out;
        const now = Date.now();
        if (now - this.lastTickStorageWrite < 100) return;
        outStore = this.pendingTickStorage;
        this.pendingTickStorage = null;
        this.lastTickStorageWrite = now;
      }
      const key = `pixelrun_sync_${this.roomId.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      try {
        const payload = JSON.stringify({ ...outStore, _ts: Date.now(), _nonce: Math.random() });
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
          conn.send(out);
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
        this.mqtt.publish(`${ROOM_TOPIC_PREFIX}${this.roomId.toLowerCase()}`, { ...out, transport: 'mqtt' }, data.type === 'bc_tick' ? 0 : 1);
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
        // joiners ping bc_join every 300ms, so 12s of silence means gone.
        // Generous enough that a joiner's MQTT blip (3s reconnect period +
        // broker keepalive grace) does not flap it out of the roster; the
        // queued QoS1 pings land on reconnect and refresh the entry.
        // Only runs in_room — joiners stop pinging during a match, and
        // killing their entries mid-match would wipe live meters/score.
        const now = Date.now();
        let changed = false;
        for (const [id, entry] of Array.from(this.localTabPlayers.entries())) {
          if (id !== this.peerId && now - (entry.ts || now) > 12000) {
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

        // Room liveness watchdog (see join()): the host rebroadcasts
        // bc_room_state every 300ms while the lobby is up, so time since the
        // last proof-of-life is a reliable "room dead" signal. While the
        // room is merely quiet (host MQTT blip) keep pinging and nudge the
        // user; only back out once the room has been silent for ~105s.
        const now = Date.now();
        const silentFor = this.awaitingFirstRoomState
          ? now - this.joinStartedAt
          : now - this.lastRoomProofAt;
        if (silentFor > 105000) {
          this.leave();
          this.onStatusMsg?.('ROOM NOT FOUND - IT MAY HAVE CLOSED');
          return;
        }
        if (silentFor > 20000 && silentFor > this.lastNudgeAt) {
          this.lastNudgeAt = silentFor + 25000;
          this.onStatusMsg?.(`STILL SEARCHING FOR ROOM ${this.roomId}...`);
        }
      }
    };
    sendPing();
    this.syncTimer = window.setInterval(sendPing, 300);
  }

  private handleSyncMessage(data: Record<string, unknown>) {
    if (!data || typeof data !== 'object') return;
    // Stale-room hygiene: MQTT/BC/WebRTC can deliver a message from a room
    // we already left (or switched away from) — in-flight packets outlive
    // the leave() that re-targeted the channels. Drop everything while we
    // are not in any room, and anything that names a different room.
    if (this.roomId === null) return;
    const type = data.type as string;
    const dataRoom = (data.roomId as string | undefined) ?? (data._topic as string | undefined)?.split('/').pop();
    if (typeof dataRoom === 'string' && dataRoom.toLowerCase() !== this.roomId.toLowerCase()) return;

    if (typeof data.ts === 'number') {
      const rtt = Date.now() - data.ts;
      if (rtt >= 0 && rtt < 1000) {
        this.pingMs = Math.round(this.pingMs > 0 ? this.pingMs * 0.75 + rtt * 0.25 : rtt);
      }
    }

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
        } else {
          const leaver = this.opponents.get(leaverId);
          if (this.opponents.delete(leaverId)) {
            this.onRoomStateChange?.(Array.from(this.opponents.values()));
          }
          // The host owns the room: when the host leaves, the room is gone.
          // Back out of the dead lobby instead of pinging its topic forever
          // (the liveness watchdog would eventually, but this is instant).
          if (leaver?.isHost === true && this.state === 'in_room') {
            this.leave();
            this.onStatusMsg?.('ROOM CLOSED - HOST LEFT');
          }
        }
      }
    } else if (type === 'bc_room_state') {
      const players = data.players as Array<{ peerId: string; name: string; skinId: SkinId; isHost: boolean; ready?: boolean }>;
      if (Array.isArray(players)) {
        // Any room state proves the room exists — clears the join watchdog.
        this.awaitingFirstRoomState = false;
        this.lastRoomProofAt = Date.now();
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
      const seed = typeof data.seed === 'number' ? data.seed : Math.floor(Math.random() * 1000000);
      const startAt = typeof data.startAt === 'number' ? data.startAt : Date.now() + 3000;
      // Only a lobby (or the results screen awaiting a rematch) is a
      // legitimate start trigger. This guard drops two dangerous stale
      // deliveries: a bc_start that arrives after leave() (state 'idle' —
      // the old `state !== 'in_game'` check PASSED it and silently started a
      // ghost battle with a fresh random seed), and the host's own MQTT echo
      // of the start it just broadcast (state 'in_game').
      if (this.state === 'in_room' || this.state === 'ended') {
        this.state = 'in_game';
        this.matchResult = null;
        this.localAlive = true;
        this.localTick = null;
        this.localReady = false;
        this.lastRoomProofAt = Date.now();
        this.onMatchStart?.(seed, startAt);
      }
    } else if (type === 'bc_tick' && this.state === 'in_game') {
      const senderId = data.peerId as string;
      const payload = data.payload as PlayerTickPayload;
      // Type-guard the telemetry: NaN/Infinity or garbage payloads must never
      // corrupt an opponent's live board (leaderboard sorting, alive checks).
      if (
        senderId &&
        senderId !== this.peerId &&
        payload &&
        typeof payload === 'object' &&
        typeof payload.px === 'number' &&
        Number.isFinite(payload.px) &&
        typeof payload.py === 'number' &&
        Number.isFinite(payload.py) &&
        typeof payload.meters === 'number' &&
        Number.isFinite(payload.meters) &&
        typeof payload.score === 'number' &&
        Number.isFinite(payload.score)
      ) {
        const opp = this.opponents.get(senderId);
        if (opp) {
          opp.px = payload.px;
          opp.py = payload.py;
          opp.vx = payload.vx;
          opp.vy = payload.vy;
          opp.frame = payload.frame;
          opp.run = payload.run;
          opp.diving = payload.diving;
          // Death is terminal until the next match: a tick must never
          // resurrect, and once the opponent is dead, later ticks (an
          // R-restart replay of the same seed sends fresh ones) must not
          // overwrite the death meters/score that bc_death recorded — the
          // host builds the leaderboard from those values.
          if (opp.isAlive) {
            opp.meters = payload.meters;
            opp.score = payload.score;
          }
          opp.isAlive = payload.alive === false ? false : opp.isAlive;
          opp.ts = Date.now();
        }
      }
    } else if (type === 'bc_death' && this.state === 'in_game') {
      const senderId = data.peerId as string;
      if (senderId && senderId !== this.peerId) {
        const opp = this.opponents.get(senderId);
        if (opp) {
          opp.isAlive = false;
          // Corrupt/garbage payloads must not NaN the leaderboard.
          if (typeof data.meters === 'number' && Number.isFinite(data.meters)) opp.meters = data.meters;
          if (typeof data.score === 'number' && Number.isFinite(data.score)) opp.score = data.score;
        }
      }

      // The host owns BC-only match ending, and must run the check for EVERY
      // death — including its own (senderId === this.peerId is skipped
      // above), or a match where the host dies last would never finish.
      // The match ends once all opponents are dead (host alive or not); the
      // host-side match watchdog is the backstop for AFK players.
      if (this.role === 'host' && this.state === 'in_game') {
        const allOpponents = Array.from(this.opponents.values());
        if (allOpponents.length > 0 && allOpponents.every((o) => !o.isAlive)) {
          this.finishBcMatch();
        }
      }
    } else if (type === 'bc_timer' && this.state === 'in_game') {
      // Host broadcasts remaining match time (ms). Joiners use it to render
      // the battle countdown; nothing else needs it locally.
      const remaining = typeof data.remainingMs === 'number' && Number.isFinite(data.remainingMs) ? data.remainingMs : undefined;
      if (remaining !== undefined) this.onMatchTimer?.(Math.max(0, remaining));
    } else if (type === 'bc_match_end') {
      const result = data.result as MatchResult;
      // Guard against double end and against results that arrive after we
      // left the room (handleExit during the countdown) — the results modal
      // must not pop over the menu.
      if (result && this.state === 'in_game' && !this.matchResult) {
        this.stopMatchTimer();
        this.state = 'ended';
        const localEntry = result.leaderboard.find((e) => e.peerId === this.peerId);
        result.isWinner = localEntry ? localEntry.rank === 1 : false;
        result.rank = localEntry ? localEntry.rank : result.totalPlayers;
        // The leaderboard was built by the HOST with its own peerId, so
        // joiner entries are never flagged — without this the "(YOU)"
        // highlight is missing for joiners.
        if (localEntry) localEntry.isLocal = true;
        this.matchResult = result;
        this.onMatchEnd?.(result);
      }
    } else if (type === 'bc_rematch') {
      // Only meaningful in or after a match: a stale rematch delivered after
      // leave() (state 'idle') must not resurrect a ghost lobby on the menu.
      if (this.state !== 'in_game' && this.state !== 'ended') return;
      this.stopMatchTimer();
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
   * 'in_game' with no results modal. The host-side match watchdog (startMatch
   * timer) is the backstop for AFK players who never die.
   */
  private checkBcMatchEnd() {
    if (this.role !== 'host' || this.state !== 'in_game') return;
    const allOpponents = Array.from(this.opponents.values());
    const allDead = allOpponents.every((o) => !o.isAlive) && !this.localAlive;
    if (allDead) this.finishBcMatch();
  }

  /** Online match time limit (ms) from bc_start: without it one AFK player
   *  could hold the lobby hostage forever. */
  private static MATCH_TIME_LIMIT_MS = 180000;

  /**
   * Host-side match watchdog: ends the match at the deadline (rank by score)
   * even if nobody dies, and broadcasts bc_timer so every client can render
   * the countdown. Runs on a plain interval so a dead host — whose ticks have
   * stopped — still ends the match on time.
   */
  private startMatchTimer(deadlineAt: number) {
    this.stopMatchTimer();
    this.matchDeadlineAt = deadlineAt;
    if (this.role !== 'host') return;
    this.lastMatchTimerSec = -1;
    let lastBroadcastAt = 0;
    this.matchTimer = window.setInterval(() => {
      if (this.role !== 'host' || this.state !== 'in_game') return;
      const deadline = this.matchDeadlineAt;
      if (!deadline) return;
      const now = Date.now();
      if (now >= deadline) {
        this.stopMatchTimer();
        this.finishBcMatch();
        return;
      }
      const remaining = deadline - now;
      const sec = Math.ceil(remaining / 1000);
      // Whole-second updates for the final 10s, every ~5s before that.
      if (sec !== this.lastMatchTimerSec && (sec <= 10 || now - lastBroadcastAt >= 5000)) {
        this.lastMatchTimerSec = sec;
        lastBroadcastAt = now;
        this.broadcast({ type: 'bc_timer', remainingMs: remaining, deadlineAt: deadline });
      }
    }, 1000);
  }

  private stopMatchTimer() {
    if (this.matchTimer !== null) {
      window.clearInterval(this.matchTimer);
      this.matchTimer = null;
    }
    this.matchDeadlineAt = null;
    this.lastMatchTimerSec = -1;
  }

  private finishBcMatch() {
    this.stopMatchTimer();
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

  setReady(ready: boolean) {
    this.localReady = ready;
    this.broadcast({ type: 'bc_ready', peerId: this.peerId, ready });
  }

  setRoomVisibility(isPublic: boolean) {
    this.isPublic = isPublic;
    this.publishLobbyHeartbeat();
  }

  startMatch() {
    if (this.state === 'in_game') return;
    const seed = Math.floor(Math.random() * 1000000);
    const startAt = Date.now() + 3000;
    this.localAlive = true;
    this.localTick = null;

    if (this.role === 'host') {
      this.startMatchTimer(Date.now() + PartyManager.MATCH_TIME_LIMIT_MS);
    }

    // BroadcastChannel, WebRTC & MQTT Relay sync
    this.broadcast({
      type: 'bc_start',
      seed,
      startAt,
    });

    this.state = 'in_game';
    this.matchResult = null;
    this.onMatchStart?.(seed, startAt);
  }

  sendTick(payload: PlayerTickPayload) {
    if (this.state === 'in_game') {
      if (this.localAlive) this.localTick = payload;
      this.broadcast({
        type: 'bc_tick',
        peerId: this.peerId,
        payload,
      });
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
      // Host dies last: no foreign bc_death will arrive to end the match.
      this.checkBcMatchEnd();
    }
  }

  rematch() {
    this.broadcast({ type: 'bc_rematch' });
    if (this.role === 'host') {
      this.startMatch();
    }
  }

  leave() {
    this.stopMatchTimer();
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    if (this.lobbyTimer) {
      clearInterval(this.lobbyTimer);
      this.lobbyTimer = null;
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
      try {
        this.mqtt.setTopics([LOBBY_TOPIC_WILDCARD]);
      } catch {
        // Ignore
      }
      try {
        if (this.role === 'host' && this.roomId) {
          this.mqtt.publish(lobbyTopic(this.roomId), '', 1, true);
        }
      } catch {
        // Ignore
      }
      this.lastMqttLobbyPublish = 0;
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
    if (this.role === 'host') this.publishLobbyHeartbeat();
  }
}

export const party = new PartyManager();
