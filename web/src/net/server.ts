import { Board } from '../core/board';
import { chooseMove } from '../core/bot';
import { traceShot } from '../core/physics';
import { PieceQueue } from '../core/queue';
import { Rng, randomSeed } from '../core/rng';
import { applyOutcome, computeOutcome, fillRandom, isHit, placeGarbage, randomRow } from '../core/rules';
import { attackFor, rewardFor, shotPoints } from '../core/scoring';
import type { Link } from './link';
import {
  BoardSnap,
  C2S,
  CpuLevel,
  DEFAULT_SETTINGS,
  MAX_PLAYERS,
  MatchSettings,
  PROTOCOL_VERSION,
  Phase,
  PlayerInfo,
  S2C,
  cleanName,
  decode,
  encode,
} from './protocol';

interface Slot {
  info: PlayerInfo;
  link: Link | null;
  board: Board;
  queue: PieceQueue;
  rng: Rng;
  score: number;
  combo: number;
  alive: boolean;
  rank: number;
  lastShotAt: number;
  cpuWait: number;
}

interface Conn {
  link: Link;
  slot: Slot | null;
  lastSeen: number;
  isHost: boolean;
}

const CPU_PROFILES: Record<CpuLevel, { think: [number, number]; sloppiness: number; aimError: number }> = {
  easy: { think: [1.7, 2.6], sloppiness: 0.85, aimError: 0.035 },
  normal: { think: [1.05, 1.6], sloppiness: 0.35, aimError: 0.012 },
  hard: { think: [0.55, 0.9], sloppiness: 0.06, aimError: 0.003 },
};

const COUNTDOWN = 3;
const MIN_SHOT_GAP = 0.1;
const LINK_TIMEOUT = 12;

/**
 * Authoritative versus-match server. Runs inside the host's app (a "listen server"):
 * the host plays through an in-memory link while other phones connect over the network.
 */
export class MatchServer {
  phase: Phase = 'lobby';
  settings: MatchSettings = { ...DEFAULT_SETTINGS };
  readonly room: string;
  private conns = new Set<Conn>();
  private slots: Slot[] = [];
  private nextId = 1;
  private time = 0;
  private countdown = 0;
  private pushTimer = 0;
  private matchTime = 0;
  private palette: number[] = [];
  private rng = new Rng(randomSeed());
  private finished: number[] = [];
  /** Called whenever the lobby changes (for the host UI and discovery replies). */
  onChange: (() => void) | null = null;

  constructor(room: string) {
    this.room = cleanName(room, 24);
  }

  // ---- connection plumbing ----

  /** Registers a new connection. Returns the receive/close callbacks for its transport. */
  attach(link: Link, isHost = false): { onData: (d: string) => void; onClose: () => void } {
    const conn: Conn = { link, slot: null, lastSeen: this.time, isHost };
    this.conns.add(conn);
    return {
      onData: (d) => this.receive(conn, d),
      onClose: () => this.detach(conn),
    };
  }

  private receive(conn: Conn, data: string): void {
    conn.lastSeen = this.time;
    const msg = decode<C2S>(data);
    if (!msg) return;
    switch (msg.t) {
      case 'hello':
        this.onHello(conn, msg.v, msg.name);
        break;
      case 'shoot':
        if (conn.slot && typeof msg.angle === 'number' && typeof msg.seq === 'number') this.shoot(conn.slot, msg.angle, msg.seq);
        break;
      case 'swap':
        if (conn.slot) this.swap(conn.slot);
        break;
      case 'ping':
        this.sendTo(conn, { t: 'pong', ts: msg.ts });
        break;
      case 'resync': {
        const target = this.slots.find((s) => s.info.id === msg.id);
        if (conn.slot && target) this.sendTo(conn, { t: 'snap', id: target.info.id, board: this.snap(target) });
        break;
      }
    }
  }

  private onHello(conn: Conn, v: number, name: string): void {
    if (conn.slot) return;
    if (v !== PROTOCOL_VERSION) return this.reject(conn, 'Different game version. Update the app on both phones.');
    if (this.phase !== 'lobby') return this.reject(conn, 'A match is already in progress.');
    if (this.slots.length >= MAX_PLAYERS) return this.reject(conn, 'The room is full.');
    const slot = this.makeSlot({ id: this.nextId++, name: cleanName(name), cpu: null, host: conn.isHost });
    slot.link = conn.link;
    conn.slot = slot;
    this.slots.push(slot);
    this.sendTo(conn, { t: 'welcome', id: slot.info.id, room: this.room });
    this.broadcastLobby();
  }

  private reject(conn: Conn, reason: string): void {
    this.sendTo(conn, { t: 'reject', reason });
    const link = conn.link;
    this.conns.delete(conn);
    setTimeout(() => link.close(), 300);
  }

  private detach(conn: Conn): void {
    if (!this.conns.delete(conn)) return;
    const slot = conn.slot;
    if (!slot) return;
    slot.link = null;
    if (this.phase === 'lobby' || this.phase === 'results') {
      this.slots = this.slots.filter((s) => s !== slot);
      this.broadcastLobby();
    } else {
      slot.info.left = true;
      if (slot.alive) this.eliminate(slot);
      else this.broadcastLobby();
    }
  }

  private makeSlot(info: PlayerInfo): Slot {
    const board = new Board();
    const rng = new Rng(1);
    return {
      info,
      link: null,
      board,
      rng,
      queue: new PieceQueue(rng, [1, 2, 3, 4], board),
      score: 0,
      combo: 0,
      alive: false,
      rank: 0,
      lastShotAt: -1,
      cpuWait: 0,
    };
  }

  // ---- host controls (called directly by the host UI) ----

  get players(): PlayerInfo[] {
    return this.slots.map((s) => ({ ...s.info }));
  }

  addCpu(level: CpuLevel): boolean {
    if (this.phase !== 'lobby' && this.phase !== 'results') return false;
    if (this.slots.length >= MAX_PLAYERS) return false;
    const n = this.slots.filter((s) => s.info.cpu).length + 1;
    const label = level === 'easy' ? 'Easy' : level === 'hard' ? 'Hard' : 'Normal';
    this.slots.push(this.makeSlot({ id: this.nextId++, name: `CPU ${n} (${label})`, cpu: level, host: false }));
    this.broadcastLobby();
    return true;
  }

  kick(id: number): void {
    const slot = this.slots.find((s) => s.info.id === id);
    if (!slot || slot.info.host) return;
    if (slot.link) {
      const conn = [...this.conns].find((c) => c.slot === slot);
      if (conn) {
        this.sendTo(conn, { t: 'closed', reason: 'The host removed you from the room.' });
        this.conns.delete(conn);
        const link = slot.link;
        setTimeout(() => link.close(), 300);
      }
    }
    this.slots = this.slots.filter((s) => s !== slot);
    this.broadcastLobby();
  }

  setColors(n: number): void {
    if (this.phase === 'playing' || this.phase === 'countdown') return;
    this.settings.colors = Math.max(4, Math.min(6, Math.round(n)));
    this.broadcastLobby();
  }

  canStart(): boolean {
    return (this.phase === 'lobby' || this.phase === 'results') && this.slots.length >= 2;
  }

  start(): boolean {
    if (!this.canStart()) return false;
    // Players who left during the last match are gone for good.
    this.slots = this.slots.filter((s) => !s.info.left);
    if (this.slots.length < 2) return false;
    const seed = randomSeed();
    this.palette = [1, 2, 3, 4, 5, 6].slice(0, this.settings.colors);
    const layout = new Board();
    fillRandom(layout, this.settings.startRows, this.palette, new Rng(seed));
    for (const s of this.slots) {
      s.board.copyFrom(layout);
      s.rng = new Rng(seed ^ 0x5bd1e995);
      s.queue = new PieceQueue(s.rng, this.palette, s.board);
      // Give each player their own stream after the identical opening pieces.
      s.rng.state = (seed + s.info.id * 7919) >>> 0;
      s.score = 0;
      s.combo = 0;
      s.alive = true;
      s.rank = 0;
      s.lastShotAt = -1;
      s.cpuWait = COUNTDOWN + this.cpuThink(s);
    }
    this.finished = [];
    this.phase = 'countdown';
    this.countdown = COUNTDOWN;
    this.matchTime = 0;
    this.pushTimer = this.pushInterval();
    const boards: Record<number, BoardSnap> = {};
    for (const s of this.slots) boards[s.info.id] = this.snap(s);
    this.broadcast({ t: 'start', players: this.players, boards, palette: this.palette, countdown: COUNTDOWN });
    this.onChange?.();
    return true;
  }

  backToLobby(): void {
    if (this.phase !== 'results') return;
    this.slots = this.slots.filter((s) => !s.info.left);
    this.phase = 'lobby';
    this.broadcastLobby();
  }

  /** Ends the room and disconnects everyone. */
  shutdown(reason = 'The host closed the room.'): void {
    for (const c of this.conns) {
      this.sendTo(c, { t: 'closed', reason });
      const link = c.link;
      setTimeout(() => link.close(), 200);
    }
    this.conns.clear();
    this.slots = [];
    this.phase = 'lobby';
  }

  // ---- gameplay ----

  private pushInterval(): number {
    return Math.max(6.5, 15 - this.matchTime / 18);
  }

  private shoot(s: Slot, angle: number, seq: number): void {
    if (this.phase !== 'playing' || !s.alive || this.time - s.lastShotAt < MIN_SHOT_GAP) {
      if (s.link) this.sendSlot(s, { t: 'nack', seq });
      return;
    }
    s.lastShotAt = this.time;
    const piece = s.queue.cur;
    const tr = traceShot(s.board, angle);
    const o = computeOutcome(s.board, tr.r, tr.c, piece);
    applyOutcome(s.board, o);
    s.combo = isHit(o) ? s.combo + 1 : 0;
    s.score += shotPoints(o, s.combo);
    const reward = rewardFor(o, s.rng.next());
    if (reward) s.queue.grant(reward);
    s.queue.advance(s.board);

    let atk: { to: number; n: number } | null = null;
    let target: Slot | null = null;
    const n = attackFor(o);
    if (n > 0) {
      target = this.pickTarget(s);
      if (target) atk = { to: target.info.id, n };
    }
    this.broadcast({
      t: 'shot',
      id: s.info.id,
      seq,
      angle,
      piece,
      o,
      cur: s.queue.cur,
      nxt: s.queue.nxt,
      score: s.score,
      combo: s.combo,
      reward,
      atk,
      h: s.board.hash(),
    });
    if (s.board.crossedDeadline()) this.eliminate(s);
    if (target && atk && this.phase === 'playing') {
      const cells = placeGarbage(target.board, atk.n, this.palette, this.rng);
      target.queue.refresh(target.board);
      this.broadcast({ t: 'garbage', id: target.info.id, from: s.info.id, cells, h: target.board.hash() });
      if (target.board.crossedDeadline()) this.eliminate(target);
    }
  }

  /** Attacks go to the opponent with the most free space, which keeps matches close. */
  private pickTarget(from: Slot): Slot | null {
    const alive = this.slots.filter((x) => x.alive && x !== from);
    if (!alive.length) return null;
    alive.sort((a, b) => a.board.lowestRow() - b.board.lowestRow() || this.rng.next() - 0.5);
    return alive[0];
  }

  private swap(s: Slot): void {
    if (this.phase !== 'playing' || !s.alive) return;
    s.queue.swap();
    this.broadcast({ t: 'swap', id: s.info.id, cur: s.queue.cur, nxt: s.queue.nxt });
  }

  private eliminate(s: Slot): void {
    if (!s.alive) return;
    s.alive = false;
    const aliveCount = this.slots.filter((x) => x.alive).length;
    s.rank = aliveCount + 1;
    this.finished.unshift(s.info.id);
    this.broadcast({ t: 'out', id: s.info.id, rank: s.rank });
    if (aliveCount <= 1) {
      const winner = this.slots.find((x) => x.alive);
      if (winner) {
        winner.alive = false;
        winner.rank = 1;
        this.finished.unshift(winner.info.id);
      }
      this.phase = 'results';
      this.broadcast({ t: 'end', ranking: this.finished.slice() });
      this.onChange?.();
    }
  }

  private cpuThink(s: Slot): number {
    const p = CPU_PROFILES[s.info.cpu ?? 'normal'];
    return p.think[0] + (p.think[1] - p.think[0]) * this.rng.next();
  }

  /** Advances timers. Call regularly (e.g. 20x per second) with elapsed seconds. */
  tick(dt: number): void {
    dt = Math.min(Math.max(dt, 0), 0.5);
    this.time += dt;

    for (const c of [...this.conns]) {
      if (!c.isHost && this.time - c.lastSeen > LINK_TIMEOUT) {
        c.link.close();
        this.detach(c);
      }
    }

    if (this.phase === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.phase = 'playing';
        this.broadcast({ t: 'go', pushIn: this.pushTimer });
      }
      return;
    }
    if (this.phase !== 'playing') return;

    this.matchTime += dt;
    this.pushTimer -= dt;
    if (this.pushTimer <= 0) {
      this.pushTimer = this.pushInterval();
      const rows: Record<number, number[]> = {};
      const alive = this.slots.filter((s) => s.alive);
      for (const s of alive) {
        const row = randomRow(s.board, this.palette, s.rng);
        s.board.pushRow(row);
        s.queue.refresh(s.board);
        rows[s.info.id] = row;
      }
      this.broadcast({ t: 'push', rows, pushIn: this.pushTimer });
      for (const s of alive) if (s.board.crossedDeadline()) this.eliminate(s);
      if (this.phase !== 'playing') return;
    }

    for (const s of this.slots) {
      if (!s.info.cpu || !s.alive) continue;
      s.cpuWait -= dt;
      if (s.cpuWait > 0) continue;
      const p = CPU_PROFILES[s.info.cpu];
      const move = chooseMove(s.board, s.queue.cur, s.queue.nxt, {
        rng: s.rng,
        sloppiness: p.sloppiness,
        aimError: p.aimError,
        samples: s.info.cpu === 'easy' ? 61 : 121,
      });
      if (move.swap) this.swap(s);
      this.shoot(s, move.angle, 0);
      s.cpuWait = this.cpuThink(s);
      if (this.phase !== 'playing') return;
    }
  }

  // ---- messaging ----

  private snap(s: Slot): BoardSnap {
    return { cells: s.board.serialize(), cur: s.queue.cur, nxt: s.queue.nxt, score: s.score, alive: s.alive, rank: s.rank };
  }

  private broadcastLobby(): void {
    this.broadcast({ t: 'lobby', players: this.players, settings: { ...this.settings }, phase: this.phase });
    this.onChange?.();
  }

  private broadcast(msg: S2C): void {
    const data = encode(msg);
    for (const c of this.conns) if (c.slot) c.link.send(data);
  }

  private sendTo(conn: Conn, msg: S2C): void {
    conn.link.send(encode(msg));
  }

  private sendSlot(s: Slot, msg: S2C): void {
    s.link?.send(encode(msg));
  }

  /** Test helper: the authoritative board of a player. */
  boardOf(id: number): Board | null {
    return this.slots.find((s) => s.info.id === id)?.board ?? null;
  }
}
