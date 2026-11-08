import type { Link } from './link';
import { GAME_PORT, RoomAd } from './protocol';
import { CODE_ALPHABET, CODE_LENGTH } from './roomCode';
import type { MatchServer } from './server';
import { native, onNative } from '../platform/native';

export interface ConnectHandlers {
  onOpen(): void;
  onData(data: string): void;
  onClose(reason: string): void;
}

/** Accepts remote players for a MatchServer. */
export interface HostNet {
  readonly label: string;
  start(server: MatchServer, ad: Omit<RoomAd, 'address' | 'port'>): Promise<{ addresses: string[]; port: number }>;
  updateAd(ad: Omit<RoomAd, 'address' | 'port'>): void;
  stop(): void;
}

export interface JoinNet {
  readonly label: string;
  connect(address: string, port: number, h: ConnectHandlers): Link;
  scan(onFound: (ad: RoomAd) => void): () => void;
}

// ---------------------------------------------------------------------------------------
// Android: real TCP sockets + UDP discovery implemented in Java (NetBridge.java).

class NativeHost implements HostNet {
  readonly label = 'Wi-Fi';
  private links = new Map<number, { onData: (d: string) => void; onClose: () => void }>();
  private off: (() => void) | null = null;

  async start(server: MatchServer, ad: Omit<RoomAd, 'address' | 'port'>) {
    const bridge = native!;
    this.off = onNative((e) => {
      if (e.type === 'host:open') {
        const conn = e.conn;
        const link: Link = {
          send: (d) => bridge.hostSend(conn, d),
          close: () => bridge.hostClose(conn),
        };
        this.links.set(conn, server.attach(link));
      } else if (e.type === 'host:data') {
        this.links.get(e.conn)?.onData(e.data);
      } else if (e.type === 'host:close') {
        const h = this.links.get(e.conn);
        this.links.delete(e.conn);
        h?.onClose();
      }
    });
    const res = JSON.parse(bridge.hostStart(GAME_PORT, JSON.stringify(ad))) as {
      ok: boolean;
      port: number;
      addresses: string[];
      error?: string;
    };
    if (!res.ok) {
      this.stop();
      throw new Error(res.error || 'Could not open a network port.');
    }
    return { addresses: res.addresses, port: res.port };
  }

  updateAd(ad: Omit<RoomAd, 'address' | 'port'>): void {
    native?.hostUpdateInfo(JSON.stringify(ad));
  }

  stop(): void {
    this.off?.();
    this.off = null;
    native?.hostStop();
    for (const h of this.links.values()) h.onClose();
    this.links.clear();
  }
}

class NativeJoin implements JoinNet {
  readonly label = 'Wi-Fi';
  private off: (() => void) | null = null;

  connect(address: string, port: number, h: ConnectHandlers): Link {
    const bridge = native!;
    this.off?.();
    let open = true;
    const off = onNative((e) => {
      if (!open) return;
      if (e.type === 'client:open') h.onOpen();
      else if (e.type === 'client:data') h.onData(e.data);
      else if (e.type === 'client:close') {
        open = false;
        off();
        h.onClose(e.reason);
      }
    });
    this.off = off;
    bridge.clientConnect(address, port);
    return {
      send: (d) => open && bridge.clientSend(d),
      close: () => {
        if (!open) return;
        open = false;
        off();
        bridge.clientClose();
      },
    };
  }

  scan(onFound: (ad: RoomAd) => void): () => void {
    const bridge = native!;
    const off = onNative((e) => {
      if (e.type !== 'disc:found') return;
      try {
        const info = JSON.parse(e.info);
        onFound({ ...info, address: e.address });
      } catch {
        /* ignore malformed replies */
      }
    });
    bridge.discoverStart();
    return () => {
      off();
      bridge.discoverStop();
    };
  }
}

// ---------------------------------------------------------------------------------------
// Browser test mode: tabs of the same browser talk over a BroadcastChannel. Lets the
// multiplayer flow be developed and tested without phones.

type ChanMsg =
  | { k: 'disc'; from: string }
  | { k: 'ad'; to: string; ad: RoomAd }
  | { k: 'conn'; from: string; to: string }
  | { k: 'acc'; from: string; to: string }
  | { k: 'data'; from: string; to: string; data: string }
  | { k: 'close'; from: string; to: string };

const CHANNEL = 'bsa-lan';
/** Each tab's id is also its room code in browser test mode. */
const tabId = () => Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');

class BrowserHost implements HostNet {
  readonly label = 'Browser tabs';
  private ch: BroadcastChannel | null = null;
  private id = tabId();
  private links = new Map<string, { onData: (d: string) => void; onClose: () => void }>();
  private ad: Omit<RoomAd, 'address' | 'port'> | null = null;

  async start(server: MatchServer, ad: Omit<RoomAd, 'address' | 'port'>) {
    this.ad = ad;
    const ch = new BroadcastChannel(CHANNEL);
    this.ch = ch;
    ch.onmessage = (ev: MessageEvent<ChanMsg>) => {
      const m = ev.data;
      if (m.k === 'disc' && this.ad) {
        ch.postMessage({ k: 'ad', to: m.from, ad: { ...this.ad, address: this.id, port: 0 } } satisfies ChanMsg);
      } else if (m.k === 'conn' && m.to === this.id) {
        const peer = m.from;
        const link: Link = {
          send: (d) => ch.postMessage({ k: 'data', from: this.id, to: peer, data: d } satisfies ChanMsg),
          close: () => {
            ch.postMessage({ k: 'close', from: this.id, to: peer } satisfies ChanMsg);
            const h = this.links.get(peer);
            this.links.delete(peer);
            h?.onClose();
          },
        };
        this.links.set(peer, server.attach(link));
        ch.postMessage({ k: 'acc', from: this.id, to: peer } satisfies ChanMsg);
      } else if (m.k === 'data' && m.to === this.id) {
        this.links.get(m.from)?.onData(m.data);
      } else if (m.k === 'close' && m.to === this.id) {
        const h = this.links.get(m.from);
        this.links.delete(m.from);
        h?.onClose();
      }
    };
    return { addresses: [this.id], port: 0 };
  }

  updateAd(ad: Omit<RoomAd, 'address' | 'port'>): void {
    this.ad = ad;
  }

  stop(): void {
    for (const [peer, h] of this.links) {
      this.ch?.postMessage({ k: 'close', from: this.id, to: peer } satisfies ChanMsg);
      h.onClose();
    }
    this.links.clear();
    this.ch?.close();
    this.ch = null;
    this.ad = null;
  }
}

class BrowserJoin implements JoinNet {
  readonly label = 'Browser tabs';

  connect(address: string, _port: number, h: ConnectHandlers): Link {
    const ch = new BroadcastChannel(CHANNEL);
    const id = tabId();
    let state: 'connecting' | 'open' | 'closed' = 'connecting';
    const finish = (reason: string) => {
      if (state === 'closed') return;
      state = 'closed';
      ch.close();
      h.onClose(reason);
    };
    const timer = setTimeout(() => state === 'connecting' && finish('Could not reach the host.'), 4000);
    ch.onmessage = (ev: MessageEvent<ChanMsg>) => {
      const m = ev.data;
      if (m.k === 'disc' || m.k === 'ad' || m.to !== id || m.from !== address) return;
      if (m.k === 'acc' && state === 'connecting') {
        state = 'open';
        clearTimeout(timer);
        h.onOpen();
      } else if (m.k === 'data' && state === 'open') h.onData(m.data);
      else if (m.k === 'close') finish('The host closed the connection.');
    };
    ch.postMessage({ k: 'conn', from: id, to: address } satisfies ChanMsg);
    return {
      send: (d) => state === 'open' && ch.postMessage({ k: 'data', from: id, to: address, data: d } satisfies ChanMsg),
      close: () => {
        if (state === 'closed') return;
        try {
          ch.postMessage({ k: 'close', from: id, to: address } satisfies ChanMsg);
        } catch {
          /* channel already closed */
        }
        state = 'closed';
        clearTimeout(timer);
        ch.close();
      },
    };
  }

  scan(onFound: (ad: RoomAd) => void): () => void {
    const ch = new BroadcastChannel(CHANNEL);
    const id = tabId();
    ch.onmessage = (ev: MessageEvent<ChanMsg>) => {
      const m = ev.data;
      if (m.k === 'ad' && m.to === id) onFound(m.ad);
    };
    const ping = () => ch.postMessage({ k: 'disc', from: id } satisfies ChanMsg);
    ping();
    const timer = setInterval(ping, 1500);
    return () => {
      clearInterval(timer);
      ch.close();
    };
  }
}

export function createHostNet(): HostNet {
  return native ? new NativeHost() : new BrowserHost();
}

export function createJoinNet(): JoinNet {
  return native ? new NativeJoin() : new BrowserJoin();
}
