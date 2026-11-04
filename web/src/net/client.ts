import { Board } from '../core/board';
import { traceShot } from '../core/physics';
import { applyOutcome } from '../core/rules';
import type { ShotEvent } from '../core/solo';
import type { Link } from './link';
import {
  BoardSnap,
  C2S,
  DEFAULT_SETTINGS,
  MatchSettings,
  PROTOCOL_VERSION,
  Phase,
  PlayerInfo,
  S2C,
  decode,
  encode,
} from './protocol';

export interface RemoteBoard {
  board: Board;
  cur: number;
  nxt: number;
  score: number;
  alive: boolean;
  rank: number;
}

export type ClientEvent =
  | { type: 'welcome' }
  | { type: 'lobby' }
  | { type: 'start'; countdown: number }
  | { type: 'go'; pushIn: number }
  | { type: 'shot'; id: number; seq: number; shot: ShotEvent; atk: { to: number; n: number } | null }
  | { type: 'nack'; seq: number }
  | { type: 'swap'; id: number }
  | { type: 'garbage'; id: number; from: number; cells: [number, number][] }
  | { type: 'prePush' }
  | { type: 'push'; pushIn: number }
  | { type: 'out'; id: number; rank: number }
  | { type: 'end'; ranking: number[] }
  | { type: 'resynced'; id: number }
  | { type: 'rejected'; reason: string }
  | { type: 'closed'; reason: string };

/** A player's view of a match: mirrors every board from the server's event stream. */
export class MatchClient {
  myId = -1;
  room = '';
  phase: Phase = 'lobby';
  players: PlayerInfo[] = [];
  settings: MatchSettings = { ...DEFAULT_SETTINGS };
  palette: number[] = [];
  boards = new Map<number, RemoteBoard>();
  ranking: number[] = [];
  /** Round-trip time in ms (from pings). */
  rtt = 0;
  private seq = 0;
  private closed = false;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastHeard = Date.now();
  private resyncing = new Set<number>();
  onEvent: ((e: ClientEvent) => void) | null = null;

  constructor(
    private link: Link,
    readonly name: string,
  ) {}

  /** Call once the link is open. */
  hello(): void {
    this.send({ t: 'hello', v: PROTOCOL_VERSION, name: this.name });
    this.pingTimer = setInterval(() => {
      this.ping();
      if (Date.now() - this.lastHeard > 12000) this.fail('Lost connection to the host.');
    }, 2000);
  }

  /** Keep-alive (also measures round-trip time). Sent automatically every 2 seconds. */
  ping(): void {
    this.send({ t: 'ping', ts: Date.now() });
  }

  get me(): RemoteBoard | undefined {
    return this.boards.get(this.myId);
  }

  playerName(id: number): string {
    return this.players.find((p) => p.id === id)?.name ?? `Player ${id}`;
  }

  shoot(angle: number): number {
    const seq = ++this.seq;
    this.send({ t: 'shoot', seq, angle });
    return seq;
  }

  swap(): void {
    // Swap locally right away; the server's reply is authoritative.
    const me = this.me;
    if (me) [me.cur, me.nxt] = [me.nxt, me.cur];
    this.send({ t: 'swap' });
  }

  leave(): void {
    this.dispose();
    this.link.close();
  }

  dispose(): void {
    this.closed = true;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  /** Transport callback. */
  receive(data: string): void {
    if (this.closed) return;
    this.lastHeard = Date.now();
    const m = decode<S2C>(data);
    if (m) this.handle(m);
  }

  /** Transport callback. */
  linkClosed(reason: string): void {
    if (this.closed) return;
    this.fail(reason || 'Disconnected from the host.');
  }

  private fail(reason: string): void {
    if (this.closed) return;
    this.dispose();
    this.link.close();
    this.emit({ type: 'closed', reason });
  }

  private send(msg: C2S): void {
    if (!this.closed) this.link.send(encode(msg));
  }

  private emit(e: ClientEvent): void {
    this.onEvent?.(e);
  }

  private loadSnap(id: number, s: BoardSnap): void {
    this.boards.set(id, {
      board: Board.deserialize(s.cells),
      cur: s.cur,
      nxt: s.nxt,
      score: s.score,
      alive: s.alive,
      rank: s.rank,
    });
  }

  private checkHash(id: number, b: Board, h: number): void {
    if (b.hash() !== h && !this.resyncing.has(id)) {
      // Our copy drifted (should not happen); ask the server for the real board.
      this.resyncing.add(id);
      this.send({ t: 'resync', id });
    }
  }

  private handle(m: S2C): void {
    switch (m.t) {
      case 'welcome':
        this.myId = m.id;
        this.room = m.room;
        this.emit({ type: 'welcome' });
        break;
      case 'reject':
        this.dispose();
        this.emit({ type: 'rejected', reason: m.reason });
        this.link.close();
        break;
      case 'closed':
        this.fail(m.reason);
        break;
      case 'lobby':
        this.players = m.players;
        this.settings = m.settings;
        this.phase = m.phase;
        this.emit({ type: 'lobby' });
        break;
      case 'start':
        this.players = m.players;
        this.palette = m.palette;
        this.phase = 'countdown';
        this.ranking = [];
        this.boards.clear();
        for (const [id, s] of Object.entries(m.boards)) this.loadSnap(Number(id), s);
        this.emit({ type: 'start', countdown: m.countdown });
        break;
      case 'go':
        this.phase = 'playing';
        this.emit({ type: 'go', pushIn: m.pushIn });
        break;
      case 'shot': {
        const rb = this.boards.get(m.id);
        if (!rb) break;
        const trace = traceShot(rb.board, m.angle);
        const { poppedColors, droppedColors } = applyOutcome(rb.board, m.o);
        rb.cur = m.cur;
        rb.nxt = m.nxt;
        const points = m.score - rb.score;
        rb.score = m.score;
        this.checkHash(m.id, rb.board, m.h);
        const shot: ShotEvent = {
          trace,
          piece: m.piece,
          outcome: m.o,
          poppedColors,
          droppedColors,
          points,
          combo: m.combo,
          reward: m.reward,
        };
        this.emit({ type: 'shot', id: m.id, seq: m.seq, shot, atk: m.atk });
        break;
      }
      case 'nack':
        this.emit({ type: 'nack', seq: m.seq });
        break;
      case 'swap': {
        const rb = this.boards.get(m.id);
        if (!rb) break;
        rb.cur = m.cur;
        rb.nxt = m.nxt;
        this.emit({ type: 'swap', id: m.id });
        break;
      }
      case 'garbage': {
        const rb = this.boards.get(m.id);
        if (!rb) break;
        for (const [i, color] of m.cells) rb.board.cells[i] = color;
        this.checkHash(m.id, rb.board, m.h);
        this.emit({ type: 'garbage', id: m.id, from: m.from, cells: m.cells });
        break;
      }
      case 'push':
        this.emit({ type: 'prePush' });
        for (const [id, row] of Object.entries(m.rows)) this.boards.get(Number(id))?.board.pushRow(row);
        this.emit({ type: 'push', pushIn: m.pushIn });
        break;
      case 'out': {
        const rb = this.boards.get(m.id);
        if (rb) {
          rb.alive = false;
          rb.rank = m.rank;
        }
        this.emit({ type: 'out', id: m.id, rank: m.rank });
        break;
      }
      case 'end':
        this.phase = 'results';
        this.ranking = m.ranking;
        for (const [id, rb] of this.boards) rb.rank = m.ranking.indexOf(id) + 1;
        this.emit({ type: 'end', ranking: m.ranking });
        break;
      case 'snap':
        this.loadSnap(m.id, m.board);
        this.resyncing.delete(m.id);
        this.emit({ type: 'resynced', id: m.id });
        break;
      case 'pong':
        this.rtt = Date.now() - m.ts;
        break;
    }
  }
}
