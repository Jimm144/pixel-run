import type MqttApi from 'mqtt';
import type { MqttClient } from 'mqtt';

// Public MQTT brokers with WebSocket+TLS, free and open: no account, no
// server, no money. The relay simply mirrors BroadcastChannel semantics —
// every client publishes to the room topic and receives everyone else's
// messages (self-messages never echo back, which the message handlers
// already guard against with peerId checks).
const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'];

// Stable per page load (not per connection attempt): mqtt.js reconnects
// with the same options, and with clean:false the broker keeps the session
// keyed by this id — regenerating it would orphan the session and the
// QoS1 messages queued in it on every reconnect.
const CLIENT_ID = `pxrun_${Math.random().toString(36).substring(2, 10)}`;

// mqtt.js is a ~370 kB UMD build. It's shipped as a same-origin vendor file
// (public/vendor/mqtt.min.js) and loaded only when a room is actually used,
// keeping the single-file bundle small and the page load fast. The CDN URLs
// are a fallback for hosts that can't serve the vendor file (e.g. itch.io
// single-file embeds). The type-only import above is erased at build time.
const MQTT_CDN_URLS = ['vendor/mqtt.min.js', 'https://unpkg.com/mqtt@5.15.2/dist/mqtt.min.js', 'https://cdn.jsdelivr.net/npm/mqtt@5.15.2/dist/mqtt.min.js'];

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

let mqttLib: typeof MqttApi | null = null;
let mqttLoading: Promise<typeof MqttApi> | null = null;

async function loadMqtt(): Promise<typeof MqttApi> {
  if (mqttLib) return mqttLib;
  if (!mqttLoading) {
    mqttLoading = (async () => {
      for (const url of MQTT_CDN_URLS) {
        try {
          await loadScript(url);
          const g = (window as unknown as { mqtt?: typeof MqttApi }).mqtt;
          if (g) {
            mqttLib = g;
            return g;
          }
        } catch {
          // Try the next CDN.
        }
      }
      throw new Error('mqtt failed to load from CDN');
    })();
  }
  return mqttLoading;
}

export const ROOM_TOPIC_PREFIX = 'pixelrun/room/';
// One retained message per room: clearing our own entry must never wipe
// other rooms' announcements off the shared lobby.
export const LOBBY_TOPIC_PREFIX = 'pixelrun/lobby/';
export const LOBBY_TOPIC_WILDCARD = 'pixelrun/lobby/+';
export const lobbyTopic = (code: string) => `${LOBBY_TOPIC_PREFIX}${code.toLowerCase()}`;

// One relay per page load, reused across rooms: browsers (and mqtt.js'
// browser build) handle a single persistent connection far more reliably
// than churn of connect/close cycles. Rooms are switched by re-targeting
// the topic subscriptions.
export class MqttRelay {
  private client: MqttClient | null = null;
  private brokerIndex = 0;
  private topics: string[] = [];
  private connectedOnce = false;
  private failoverTimer: number | null = null;
  private closed = false;
  /** Reentrancy guard: openClient is async (loads mqtt.js first); without
   *  this, a failover firing while a connect attempt is still loading could
   *  spawn two clients. */
  private opening = false;

  connected = false;

  onConnect?: () => void;
  onDisconnect?: () => void;
  onMessage?: (topic: string, payload: string) => void;

  ensureStarted() {
    if (this.closed) this.closed = false;
    if (!this.client) void this.openClient();
  }

  setTopics(topics: string[]) {
    const oldTopics = this.topics.filter((t) => !topics.includes(t));
    this.topics = topics;
    if (!this.client || !this.client.connected) return;
    try {
      if (oldTopics.length > 0) {
        this.client.unsubscribe(oldTopics);
      }
      this.client.subscribe(topics, { qos: 1 });
    } catch {
      // Ignore
    }
  }

  publish(topic: string, payload: unknown, qos: 0 | 1 = 1, retain = false) {
    if (!this.client) return;
    // QoS 0 ticks are latest-wins telemetry: while the socket is down they
    // would be stale by the time they arrive (and queueing ~15/s would flood
    // the outgoing store), so drop them.
    // QoS 1 control messages are queued by mqtt.js' outgoing store and
    // delivered on reconnect — this is what keeps a joiner alive across a
    // blip: its bc_join pings buffer up and land the moment the broker
    // connection is back. With clean:false the broker-side session queues
    // them too, so they survive even the *host's* outage. (The old guard
    // dropped them before mqtt.js could buffer them, silently defeating the
    // persistent-session design.)
    if (qos === 0 && !this.client.connected) return;
    try {
      this.client.publish(topic, typeof payload === 'string' ? payload : JSON.stringify(payload), { qos, retain });
    } catch {
      // Ignore
    }
  }

  close() {
    this.closed = true;
    if (this.failoverTimer !== null) {
      window.clearTimeout(this.failoverTimer);
      this.failoverTimer = null;
    }
    this.topics = [];
    if (this.client) {
      try {
        this.client.end(true);
      } catch {
        // Ignore
      }
      this.client = null;
    }
    this.connected = false;
  }

  private async openClient() {
    if (this.closed || this.opening) return;
    this.opening = true;
    try {
      await this.openClientInner();
    } finally {
      this.opening = false;
    }
  }

  private async openClientInner() {
    const url = BROKERS[this.brokerIndex % BROKERS.length];
    this.connectedOnce = false;

    let lib: typeof MqttApi;
    try {
      lib = await loadMqtt();
    } catch {
      this.connected = false;
      this.onDisconnect?.();
      return;
    }
    if (this.closed) return;

    const client = lib.connect(url, {
      clientId: CLIENT_ID,
      keepalive: 30,
      connectTimeout: 8000,
      reconnectPeriod: 3000,
      // Persistent session: short drops (tab throttling, network blips) keep
      // the broker-side subscriptions alive within the keepalive grace window,
      // and QoS1 messages sent during the drop (e.g. a joiner's bc_join) are
      // queued and delivered on reconnect instead of being lost.
      clean: false,
    });
    this.client = client;

    client.on('connect', () => {
      if (this.client !== client) return;
      this.connected = true;
      this.connectedOnce = true;
      this.onConnect?.();
      if (this.topics.length > 0) {
        try {
          client.subscribe(this.topics, { qos: 1 });
        } catch {
          // Ignore
        }
      }
    });

    client.on('message', (topic, message) => {
      if (this.client !== client) return;
      this.onMessage?.(topic, message.toString());
    });

    client.on('close', () => {
      if (this.client !== client) return;
      this.connected = false;
      this.onDisconnect?.();
      // Never connected to this broker: give mqtt.js one reconnect attempt,
      // then fail over to the next broker. Connected sessions are left to
      // mqtt.js' own reconnect loop.
      if (!this.connectedOnce && this.failoverTimer === null) {
        this.failoverTimer = window.setTimeout(() => {
          this.failoverTimer = null;
          if (this.client !== client || this.closed) return;
          try {
            client.end(true);
          } catch {
            // Ignore
          }
          this.brokerIndex++;
          this.openClient();
        }, 6000);
      }
    });

    client.on('error', () => {
      // Errors precede close; failover is handled there.
    });
  }
}
