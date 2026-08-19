/**
 * Cross-tab coin-collection sync for local multiplayer rooms. One
 * BroadcastChannel per room relays "coin collected" events between tabs;
 * every tab keeps the same Set of collected coin ids and marks matching
 * coins dead in its own world, so a coin collected in one tab vanishes for
 * all of them. Coin ids are the coin's rounded world-x + ':' + rounded
 * world-y: the world is generated deterministically from the shared match
 * seed, so every tab derives the same id for the same coin (and tabs whose
 * worlds diverge slightly never dedupe two different coins that share a
 * rounded world-x). If BroadcastChannel is unavailable the module is a safe
 * no-op.
 */

type CoinMsg = { type: 'coin'; id: string };

class CoinSync {
  private bc: BroadcastChannel | null = null;
  private roomKey = '';
  private collected = new Set<string>();
  private listeners = new Set<(id: string) => void>();

  /** Point the channel at a room (null for solo). Re-arms only on change. */
  setRoom(roomId: string | null) {
    const key = roomId ? `pixelrun_coins_${roomId.toLowerCase()}` : '';
    if (key === this.roomKey) return;
    this.roomKey = key;
    this.collected.clear();
    if (this.bc) {
      this.bc.onmessage = null;
      this.bc.close();
      this.bc = null;
    }
    if (!key || typeof BroadcastChannel === 'undefined') return;
    try {
      this.bc = new BroadcastChannel(key);
      this.bc.onmessage = (e: MessageEvent) => {
        const m = e.data as CoinMsg | null;
        if (m && m.type === 'coin' && typeof m.id === 'string') this.accept(m.id);
      };
    } catch {
      this.bc = null;
    }
  }

  isCollected(id: string) {
    return this.collected.has(id);
  }

  /** Record a local collection and tell the other tabs. */
  report(id: string) {
    if (!this.bc || this.collected.has(id)) return;
    this.collected.add(id);
    try {
      this.bc.postMessage({ type: 'coin', id } satisfies CoinMsg);
    } catch {
      // Channel gone — the local record already prevents double collection.
    }
  }

  private accept(id: string) {
    if (this.collected.has(id)) return;
    this.collected.add(id);
    for (const fn of this.listeners) fn(id);
  }

  subscribe(fn: (id: string) => void) {
    this.listeners.add(fn);
  }

  unsubscribe(fn: (id: string) => void) {
    this.listeners.delete(fn);
  }
}

export const coinSync = new CoinSync();