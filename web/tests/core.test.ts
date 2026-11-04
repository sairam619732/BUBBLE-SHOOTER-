import { describe, expect, it } from 'vitest';
import { Board } from '../src/core/board';
import { BOMB, COLS, DEADLINE_ROW, EMPTY, GRID_ROWS, MAX_ANGLE, MIN_ANGLE, RAINBOW, STONE } from '../src/core/constants';
import { traceShot } from '../src/core/physics';
import { applyOutcome, computeOutcome, placeGarbage } from '../src/core/rules';
import { PieceQueue } from '../src/core/queue';
import { Rng } from '../src/core/rng';
import { chooseMove } from '../src/core/bot';
import { SoloGame } from '../src/core/solo';

describe('Board geometry', () => {
  it('alternates row lengths and flips them on push', () => {
    const b = new Board();
    expect(b.rowLen(0)).toBe(COLS);
    expect(b.rowLen(1)).toBe(COLS - 1);
    b.set(0, COLS - 1, 1);
    b.pushRow(new Array(COLS).fill(2));
    // New top row is shifted (short); the old row 0 keeps its full length at row 1.
    expect(b.rowLen(0)).toBe(COLS - 1);
    expect(b.rowLen(1)).toBe(COLS);
    expect(b.get(1, COLS - 1)).toBe(1);
    expect(b.get(0, COLS - 1)).toBe(EMPTY);
  });

  it('neighbors are symmetric and adjacent', () => {
    for (const parity of [0, 1]) {
      const b = new Board(undefined, parity);
      const nb: number[] = [];
      const nb2: number[] = [];
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < b.rowLen(r); c++) {
          const n = b.neighbors(r, c, nb);
          for (let k = 0; k < n; k++) {
            const j = nb[k];
            const rr = (j / COLS) | 0;
            const cc = j % COLS;
            const dist = Math.hypot(b.cellX(r, c) - b.cellX(rr, cc), b.cellY(r) - b.cellY(rr));
            expect(dist).toBeCloseTo(36, 3);
            const m = b.neighbors(rr, cc, nb2);
            expect(nb2.slice(0, m)).toContain(r * COLS + c);
          }
        }
      }
    }
  });

  it('serializes round trip', () => {
    const b = Board.fromRows(['1234561234', '.x.x.x.x.', '33']);
    b.parity = 1;
    const s = Board.deserialize(b.serialize());
    expect(s.serialize()).toBe(b.serialize());
    expect(s.hash()).toBe(b.hash());
  });
});

describe('Shots', () => {
  it('straight up into an empty board sticks to the ceiling', () => {
    const b = new Board();
    const t = traceShot(b, Math.PI / 2);
    expect(t.r).toBe(0);
    expect([4, 5]).toContain(t.c);
    expect(t.bounces).toBe(0);
  });

  it('shallow angles bounce off walls', () => {
    const b = new Board();
    const t = traceShot(b, MIN_ANGLE);
    expect(t.bounces).toBeGreaterThan(0);
    expect(t.r).toBe(0);
  });

  it('always lands on an empty, supported cell', () => {
    const rng = new Rng(42);
    for (let trial = 0; trial < 40; trial++) {
      const b = new Board();
      const rows = 1 + rng.int(8);
      for (let r = 0; r < rows; r++) for (let c = 0; c < b.rowLen(r); c++) if (rng.chance(0.7)) b.set(r, c, 1 + rng.int(5));
      for (const i of b.findFloating()) b.cells[i] = EMPTY;
      for (let s = 0; s < 30; s++) {
        const a = MIN_ANGLE + (MAX_ANGLE - MIN_ANGLE) * rng.next();
        const t = traceShot(b, a);
        expect(b.get(t.r, t.c)).toBe(EMPTY);
        expect(b.isSupported(t.r, t.c)).toBe(true);
      }
    }
  });

  it('matching three pops and cuts loose hanging bubbles', () => {
    // Row 0: two reds; row 1 hangs a blue under them.
    const b = Board.fromRows(['11........', '4........']);
    // Land a red at row 0, col 2 to make three.
    const o = computeOutcome(b, 0, 2, 1);
    expect(o.popped.sort()).toEqual([0, 1, 2]);
    expect(o.dropped).toEqual([COLS]);
    applyOutcome(b, o);
    expect(b.countOccupied()).toBe(0);
  });

  it('two of a kind does not pop', () => {
    const b = Board.fromRows(['1.........']);
    const o = computeOutcome(b, 0, 1, 1);
    expect(o.popped).toEqual([]);
    expect(o.placed).toBe(1);
  });

  it('stones only fall when disconnected', () => {
    const b = Board.fromRows(['22........', 'x........']);
    const o = computeOutcome(b, 0, 2, 2);
    expect(o.dropped).toEqual([COLS]);
  });

  it('bomb clears a radius including stones', () => {
    const b = Board.fromRows(['1x2x3x4x5x', '123451234', '123x512345']);
    const o = computeOutcome(b, 3, 4, BOMB);
    expect(o.placed).toBe(EMPTY);
    expect(o.popped.length).toBeGreaterThanOrEqual(7);
    expect(o.popped.some((i) => b.cells[i] === STONE)).toBe(true);
  });

  it('rainbow joins the biggest neighboring group', () => {
    const b = Board.fromRows(['3311......', '.........']);
    // (1,1) touches (0,1)=3, (0,2)=1 ... choose based on group size; both are size 2 -> pops 3.
    const o = computeOutcome(b, 1, 1, RAINBOW);
    expect([1, 3]).toContain(o.placed);
    expect(o.popped.length).toBe(3);
  });

  it('garbage lands on legal cells', () => {
    const b = Board.fromRows(['1234123412', '123412341']);
    const placed = placeGarbage(b, 10, [1, 2, 3], new Rng(5));
    expect(placed.length).toBe(10);
    expect(b.findFloating()).toEqual([]);
  });
});

describe('Queue', () => {
  it('only deals colors that are on the board', () => {
    const b = Board.fromRows(['2222222222']);
    const q = new PieceQueue(new Rng(1), [1, 2, 3, 4], b);
    for (let i = 0; i < 20; i++) {
      expect(q.cur).toBe(2);
      q.advance(b);
    }
  });
});

describe('Solo game', () => {
  it('arcade pushes rows and eventually ends', () => {
    const g = new SoloGame('arcade', null, 7);
    let pushes = 0;
    for (let i = 0; i < 2000 && g.state === 'playing'; i++) if (g.update(1, true)) pushes++;
    expect(pushes).toBeGreaterThan(5);
    expect(g.state).toBe('lost');
    expect(g.board.lowestRow()).toBeGreaterThanOrEqual(DEADLINE_ROW);
  });

  it('bot clears level 1', async () => {
    const { getLevel } = await import('../src/core/levels');
    const g = new SoloGame('level', getLevel(1), 1);
    const rng = new Rng(9);
    while (g.state === 'playing') {
      const m = chooseMove(g.board, g.queue.cur, g.queue.nxt, { rng });
      if (m.swap) g.swap();
      g.fire(m.angle);
    }
    expect(g.state).toBe('won');
    expect(g.stars()).toBeGreaterThanOrEqual(1);
  });
});

describe('Bot', () => {
  it('finds the obvious match', () => {
    const b = Board.fromRows(['11.3333333']);
    const m = chooseMove(b, 1, 1, { allowSwap: false });
    const t = traceShot(b, m.angle);
    const o = computeOutcome(b, t.r, t.c, 1);
    expect(o.popped.length).toBeGreaterThanOrEqual(3);
  });

  it('never leaves stones in the queue', () => {
    const b = Board.fromRows(['x1x1x1x1x1']);
    const q = new PieceQueue(new Rng(3), [1, 2], b);
    expect(q.cur).not.toBe(STONE);
  });
});
