// Zero-middleman room: raw WebRTC with NO ICE servers, NO trackers, NO brokers.
// Two peers exchange the connection offer/answer as compressed codes pasted by
// a human (or any out-of-band channel). Works on any local network even with
// the internet completely gone.
//
// The class mimics the trystero room surface used by P2PManager (makeAction /
// onPeerJoin / onPeerLeave / leave / getPeers / selfId) so the rest of the game
// is unchanged. One channel carries JSON envelopes { ns, d } multiplexing the
// same action namespaces trystero uses ('tick', 'event').

const ROOM_TAG = 'pixel-run-offline-v1';
const PEER_ID = 'peer';
const SELF_ID = 'local';
// After the answer is applied, the channel should open within a few seconds
// on a healthy local network (mDNS/host candidates are instant; slow mobile
// CPUs add a couple of seconds). 25s generously covers that, and if it
// doesn't open the peers are NOT on the same network (AP isolation, phone on
// cellular) — fail loudly instead of hanging.
const CONNECT_TIMEOUT = 25000;

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64url(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Feature flag: both CompressionStream AND DecompressionStream are required —
// Safari only ships them since 16.4, older Android webviews lack them. Checked
// lazily at pack/unpack time so a runtime-detected absence degrades to MR1.
function hasCompression(): boolean {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
}

// 'MZ1' = deflate-raw compressed v1, 'MR1' = raw v1 (browsers without
// CompressionStream — Safari < 16.4). forceRaw lets a peer that received an
// MR1 code answer with MR1 too, so a compression-less host can decode it.
async function pack(obj: unknown, forceRaw = false): Promise<string> {
  const json = JSON.stringify(obj);
  try {
    if (!forceRaw && hasCompression()) {
      const cs = new CompressionStream('deflate-raw');
      const stream = new Blob([enc.encode(json).buffer as ArrayBuffer]).stream().pipeThrough(cs);
      const out = new Uint8Array(await new Response(stream).arrayBuffer());
      return 'MZ1' + b64url(out);
    }
  } catch {}
  return 'MR1' + b64url(enc.encode(json));
}

async function unpack(code: string): Promise<any> {
  const trimmed = code.trim();
  if (trimmed.startsWith('MZ1')) {
    if (!hasCompression()) {
      // Never touch the stream API here: report a controlled error instead of
      // letting `new DecompressionStream` throw a raw TypeError.
      throw new Error('OFFLINE CODE IS COMPRESSED (MZ1) — NOT SUPPORTED ON THIS BROWSER');
    }
    try {
      const ds = new DecompressionStream('deflate-raw');
      const stream = new Blob([b64urlToBytes(trimmed.slice(3)).buffer as ArrayBuffer]).stream().pipeThrough(ds);
      const out = new Uint8Array(await new Response(stream).arrayBuffer());
      return JSON.parse(dec.decode(out));
    } catch {
      throw new Error('OFFLINE CODE CORRUPTED OR WRONG CODEC');
    }
  }
  if (trimmed.startsWith('MR1')) {
    return JSON.parse(dec.decode(b64urlToBytes(trimmed.slice(3))));
  }
  throw new Error('NOT AN OFFLINE CODE');
}

export class ManualRoom {
  public onPeerJoin: ((peerId: string) => void) | null = null;
  public onPeerLeave: ((peerId: string) => void) | null = null;
  // Fired when the connection to the peer can never be established (ICE
  // failure, or no channel open within CONNECT_TIMEOUT of the answer being
  // applied). Lets the UI say WHY a phone-to-laptop join failed instead of
  // hanging on "WAITING FOR HOST..." forever.
  public onConnectionFailed: (() => void) | null = null;
  public selfId = SELF_ID;

  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private actions = new Map<string, { onMessage?: (data: any, peerId: string) => void }>();
  private joined = false;
  private connectTimeout: number | null = null;
  private failureReported = false;
  // Whether the incoming offer arrived as MZ1. The reply code is packed with
  // the SAME format as the offer: a peer that sent MR1 cannot decompress, so a
  // compression-capable joiner answers MR1 to stay interoperable.
  private peerCompressed = false;

  makeAction(namespace: string) {
    const entry: { onMessage?: (data: any, peerId: string) => void } = {};
    this.actions.set(namespace, entry);
    return {
      send: async (data: any) => {
        const ch = this.channel;
        if (!ch || ch.readyState !== 'open') return;
        ch.send(JSON.stringify({ ns: namespace, d: data }));
      },
      set onMessage(h: ((data: any, peerId: string) => void) | undefined) {
        entry.onMessage = h;
      },
      get onMessage() {
        return entry.onMessage;
      },
    };
  }

  getPeers(): Map<string, any> {
    const m = new Map<string, any>();
    if (this.pc) m.set(PEER_ID, this.pc);
    return m;
  }

  // ---- Signaling: host creates the offer, joiner answers, host accepts ----

  async createOfferCode(): Promise<string> {
    this.initPc();
    const ch = this.pc!.createDataChannel(ROOM_TAG, { ordered: true });
    this.wireChannel(ch);
    const offer = await this.pc!.createOffer();
    await this.pc!.setLocalDescription(offer);
    await this.waitIceGathering();
    return pack({ v: 1, sdp: this.pc!.localDescription!.sdp });
  }

  async applyOfferCode(code: string): Promise<string> {
    const { sdp } = await unpack(code);
    this.peerCompressed = code.trim().startsWith('MZ1');
    this.initPc();
    this.pc!.ondatachannel = (ev) => this.wireChannel(ev.channel);
    await this.pc!.setRemoteDescription({ type: 'offer', sdp });
    const answer = await this.pc!.createAnswer();
    await this.pc!.setLocalDescription(answer);
    await this.waitIceGathering();
    return pack({ v: 1, sdp: this.pc!.localDescription!.sdp }, !this.peerCompressed);
  }

  async applyAnswerCode(code: string): Promise<void> {
    const { sdp } = await unpack(code);
    if (!this.pc) throw new Error('NO PENDING CONNECTION');
    await this.pc.setRemoteDescription({ type: 'answer', sdp });
    // The answer is in: the channel must open shortly, or the peers can't
    // reach each other at all. Arm the failure timer.
    this.armConnectTimeout();
  }

  leave() {
    if (this.joined) {
      this.joined = false;
      if (this.onPeerLeave) this.onPeerLeave(PEER_ID);
    }
    this.teardown();
  }

  // ---- Internals ----

  private reportConnectionFailed() {
    if (this.failureReported) return;
    this.failureReported = true;
    this.onConnectionFailed?.();
  }

  private initPc() {
    this.pc = new RTCPeerConnection({ iceServers: [] });
    this.pc.onconnectionstatechange = () => {
      if (this.pc?.connectionState === 'failed') {
        this.reportConnectionFailed();
        this.teardown();
      }
    };
  }

  private wireChannel(ch: RTCDataChannel) {
    this.channel = ch;
    ch.onopen = () => {
      this.clearConnectTimeout();
      if (!this.joined) {
        this.joined = true;
        if (this.onPeerJoin) this.onPeerJoin(PEER_ID);
      }
    };
    ch.onclose = () => {
      if (this.joined) {
        this.joined = false;
        if (this.onPeerLeave) this.onPeerLeave(PEER_ID);
      }
    };
    ch.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        const entry = this.actions.get(msg.ns);
        if (entry?.onMessage) entry.onMessage(msg.d, PEER_ID);
      } catch {}
    };
  }

  private waitIceGathering(): Promise<void> {
    return new Promise((resolve) => {
      const pc = this.pc;
      if (!pc || pc.iceGatheringState === 'complete') {
        resolve();
        return;
      }
      // 4s timeout: mDNS/host-candidate gathering on slow mobile CPUs can take
      // well over 2s; codes stay valid because the SDP still carries the
      // gathered candidates (trickle is not used).
      const t = window.setTimeout(resolve, 4000);
      pc.addEventListener('icegatheringstatechange', () => {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(t);
          resolve();
        }
      });
    });
  }

  private armConnectTimeout() {
    this.clearConnectTimeout();
    this.connectTimeout = window.setTimeout(() => {
      this.connectTimeout = null;
      if (!this.joined && this.pc) {
        this.reportConnectionFailed();
        this.teardown();
      }
    }, CONNECT_TIMEOUT);
  }

  private clearConnectTimeout() {
    if (this.connectTimeout !== null) {
      clearTimeout(this.connectTimeout);
      this.connectTimeout = null;
    }
  }

  private teardown() {
    try {
      this.channel?.close();
    } catch {}
    try {
      this.pc?.close();
    } catch {}
    this.channel = null;
    this.pc = null;
    this.joined = false;
    this.clearConnectTimeout();    this.peerCompressed = false;
  }
}