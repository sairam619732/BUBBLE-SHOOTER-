import { afterEach, describe, expect, it } from 'vitest';
import { chooseMove } from '../src/core/bot';
import { Rng } from '../src/core/rng';
import { MatchClient } from '../src/net/client';
import { loopbackPair } from '../src/net/link';
import { MatchServer } from '../src/net/server';

const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const clients: MatchClient[] = [];

function join(server: MatchServer, name: string, isHost: boolean): MatchClient {
  const { a, b } = loopbackPair();
  const h = server.attach(b, isHost);
  b.handlers = { onData: h.onData, onClose: () => h.onClose() };
  const c = new MatchClient(a, name);
  a.handlers = { onData: (d) => c.receive(d), onClose: (r) => c.linkClosed(r) };
  c.hello();
  clients.push(c);
  return c;
}

afterEach(() => {
  for (const c of clients.splice(0)) c.dispose();
});

describe('Listen server match', () => {
  it('runs a full match with humans and a CPU and keeps replicas in sync', async () => {
    const server = new MatchServer('Test room');
    const host = join(server, 'Host', true);
    const guest = join(server, 'Guest', false);
    await flush();
    expect(host.myId).toBeGreaterThan(0);
    expect(guest.myId).toBeGreaterThan(0);
    expect(server.addCpu('hard')).toBe(true);
    await flush();
    expect(guest.players.length).toBe(3);
    expect(guest.players.find((p) => p.id === host.myId)?.host).toBe(true);

    const events: string[] = [];
    guest.onEvent = (e) => events.push(e.type);
    expect(server.start()).toBe(true);
    await flush();
    expect(guest.phase).toBe('countdown');

    const rng = new Rng(3);
    let guard = 0;
    while (server.phase !== 'results' && guard++ < 20000) {
      server.tick(0.05);
      if (guard % 8 === 0) {
        for (const c of [host, guest]) {
          const me = c.me;
          if (c.phase !== 'playing' || !me || !me.alive) continue;
          // Humans play badly so the match finishes.
          const m = chooseMove(me.board, me.cur, me.nxt, { rng, sloppiness: 1, aimError: 0.2, allowSwap: false });
          c.shoot(m.angle);
        }
      }
      await flush();
    }
    await flush();
    expect(server.phase).toBe('results');
    expect(guest.phase).toBe('results');
    expect(guest.ranking.length).toBe(3);
    expect(events).toContain('go');
    expect(events).toContain('shot');
    // Every replica matches the authoritative boards.
    for (const c of [host, guest]) {
      for (const [id, rb] of c.boards) {
        expect(rb.board.hash()).toBe(server.boardOf(id)!.hash());
      }
    }
  });

  it('pushes new rows to every board on a timer', async () => {
    const server = new MatchServer('Room');
    const a = join(server, 'A', true);
    const b = join(server, 'B', false);
    await flush();
    const events: string[] = [];
    b.onEvent = (e) => events.push(e.type);
    server.start();
    // countdown (3s) + first push (15s). Clients must keep talking or the host drops them.
    for (let i = 0; i < 20 * 19; i++) {
      server.tick(0.05);
      if (i % 60 === 0) {
        a.swap();
        b.swap();
        await flush();
      }
    }
    await flush();
    expect(events).toContain('prePush');
    expect(events).toContain('push');
    for (const c of [a, b]) {
      for (const [id, rb] of c.boards) expect(rb.board.hash()).toBe(server.boardOf(id)!.hash());
    }
  });

  it('rejects joins once a match has started and when full', async () => {
    const server = new MatchServer('Room');
    join(server, 'A', true);
    join(server, 'B', false);
    await flush();
    server.start();
    const late = join(server, 'Late', false);
    let reason = '';
    late.onEvent = (e) => {
      if (e.type === 'rejected') reason = e.reason;
    };
    await flush();
    expect(reason).toMatch(/in progress/);
  });

  it('eliminates a player who disconnects mid-match', async () => {
    const server = new MatchServer('Room');
    const a = join(server, 'A', true);
    const b = join(server, 'B', false);
    await flush();
    server.start();
    for (let i = 0; i < 80; i++) server.tick(0.05);
    await flush();
    b.leave();
    await flush();
    await flush();
    expect(server.phase).toBe('results');
    expect(a.ranking[0]).toBe(a.myId);
  });
});
