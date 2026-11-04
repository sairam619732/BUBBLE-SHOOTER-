import { MatchClient } from '../net/client';
import { loopbackPair } from '../net/link';
import { MAX_PLAYERS, PROTOCOL_VERSION, RoomAd } from '../net/protocol';
import { MatchServer } from '../net/server';
import { HostNet, createHostNet, createJoinNet } from '../net/transports';

export type Role = 'host' | 'client' | 'offline';

/**
 * One multiplayer session. For a host this owns the listen server (ticking in the
 * background) plus the host's own client; for a guest it owns the network client.
 */
export class MpSession {
  server: MatchServer | null = null;
  hostNet: HostNet | null = null;
  addresses: string[] = [];
  port = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private closed = false;

  private constructor(
    readonly role: Role,
    readonly client: MatchClient,
  ) {}

  get isHost(): boolean {
    return this.role !== 'client';
  }

  /** Starts a listen server on this phone. `offline` skips networking (practice vs CPU). */
  static async host(name: string, offline: boolean): Promise<MpSession> {
    const server = new MatchServer(offline ? 'Practice' : `${name}'s room`);
    const { a, b } = loopbackPair();
    const h = server.attach(b, true);
    b.handlers = { onData: h.onData, onClose: () => h.onClose() };
    const client = new MatchClient(a, name);
    a.handlers = { onData: (d) => client.receive(d), onClose: (r) => client.linkClosed(r) };
    const s = new MpSession(offline ? 'offline' : 'host', client);
    s.server = server;
    if (!offline) {
      const net = createHostNet();
      const res = await net.start(server, s.ad());
      s.hostNet = net;
      s.addresses = res.addresses;
      s.port = res.port;
      server.onChange = () => net.updateAd(s.ad());
    }
    let last = performance.now();
    s.timer = setInterval(() => {
      const now = performance.now();
      server.tick((now - last) / 1000);
      last = now;
    }, 50);
    await welcome(client, () => client.hello());
    return s;
  }

  /** Connects to a host. Resolves once the host accepted us. */
  static async join(address: string, port: number, name: string): Promise<MpSession> {
    const net = createJoinNet();
    let client: MatchClient | null = null;
    let opened = false;
    let earlyClose: string | null = null;
    const link = net.connect(address, port, {
      onOpen: () => {
        opened = true;
        client?.hello();
      },
      onData: (d) => client?.receive(d),
      onClose: (r) => {
        if (client) client.linkClosed(r);
        else earlyClose = r;
      },
    });
    client = new MatchClient(link, name);
    const c = client;
    const s = new MpSession('client', c);
    await welcome(c, () => {
      if (earlyClose) throw new Error(earlyClose);
      if (opened) c.hello();
    });
    return s;
  }

  private ad(): Omit<RoomAd, 'address' | 'port'> {
    const srv = this.server!;
    return { room: srv.room, players: srv.players.length, max: MAX_PLAYERS, phase: srv.phase, v: PROTOCOL_VERSION };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.server) {
      this.server.shutdown();
      this.hostNet?.stop();
    }
    this.client.leave();
  }
}

/** Waits for the server's welcome (or a rejection). */
function welcome(client: MatchClient, kick: () => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.onEvent = null;
      client.leave();
      reject(new Error('The host did not answer. Check that both phones are on the same Wi-Fi.'));
    }, 7000);
    client.onEvent = (e) => {
      if (e.type === 'welcome') {
        clearTimeout(timer);
        resolve();
      } else if (e.type === 'rejected' || e.type === 'closed') {
        clearTimeout(timer);
        client.onEvent = null;
        reject(new Error(e.reason));
      }
    };
    try {
      kick();
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });
}

/** The active session (survives moving between lobby and match screens). */
let active: MpSession | null = null;

export function setSession(s: MpSession | null): void {
  if (active && active !== s) active.close();
  active = s;
}

export function getSession(): MpSession | null {
  return active;
}
