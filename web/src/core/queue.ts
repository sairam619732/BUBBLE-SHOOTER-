import { Board } from './board';
import { COLS, EMPTY, GRID_ROWS, isColor } from './constants';
import { Rng } from './rng';

/**
 * The launcher's current + next bubble. New colors are only drawn from colors still on the
 * board, so the player is never handed a bubble that can't match anything.
 */
export class PieceQueue {
  cur: number;
  nxt: number;
  private specials: number[] = [];
  /**
   * Arcade help: chance that a new color is taken from bubbles the player can actually hit
   * (weighted by how many there are), instead of from every color left on the board.
   */
  helpChance = 0;

  constructor(
    private rng: Rng,
    private palette: number[],
    board: Board,
  ) {
    this.cur = this.pickColor(board);
    this.nxt = this.pickColor(board);
  }

  setPalette(palette: number[]): void {
    this.palette = palette.slice();
  }

  pickColor(board: Board): number {
    if (this.helpChance > 0 && this.rng.chance(this.helpChance)) {
      const reachable = hittableColors(board).filter((c) => this.palette.includes(c));
      if (reachable.length) return this.rng.pick(reachable);
    }
    const present = board.colorsPresent().filter((c) => this.palette.includes(c));
    const pool = present.length ? present : this.palette;
    return this.rng.pick(pool);
  }

  /** Call after the current piece was fired. */
  advance(board: Board): void {
    this.cur = this.nxt;
    this.nxt = this.specials.length ? this.specials.shift()! : this.pickColor(board);
    this.refresh(board);
  }

  /** Replaces queued colors that no longer exist on the board. */
  refresh(board: Board): void {
    const present = board.colorsPresent();
    if (!present.length) return;
    if (isColor(this.cur) && !present.includes(this.cur)) this.cur = this.pickColor(board);
    if (isColor(this.nxt) && !present.includes(this.nxt)) this.nxt = this.pickColor(board);
  }

  swap(): void {
    const t = this.cur;
    this.cur = this.nxt;
    this.nxt = t;
  }

  /** Queues a special piece (bomb / rainbow) to appear as the next bubble. */
  grant(piece: number): void {
    if (this.specials.length < 3) this.specials.push(piece);
  }
}

/**
 * Colors the player can actually hit: one entry per colored bubble touching open space that
 * connects to the launcher (the bottom of the board). Bubbles that already sit in a group of
 * 2+ of their color count 4 times, since one more bubble of that color pops the group.
 */
export function hittableColors(board: Board): number[] {
  const cells = board.cells;
  const open = new Uint8Array(cells.length);
  const stack: number[] = [];
  const last = GRID_ROWS - 1;
  for (let c = 0; c < board.rowLen(last); c++) {
    const i = last * COLS + c;
    if (cells[i] === EMPTY) {
      open[i] = 1;
      stack.push(i);
    }
  }
  const nb: number[] = [];
  const nb2: number[] = [];
  const out: number[] = [];
  const counted = new Uint8Array(cells.length);
  while (stack.length) {
    const i = stack.pop()!;
    const n = board.neighbors((i / COLS) | 0, i % COLS, nb);
    for (let k = 0; k < n; k++) {
      const j = nb[k];
      const v = cells[j];
      if (v === EMPTY) {
        if (!open[j]) {
          open[j] = 1;
          stack.push(j);
        }
      } else if (isColor(v) && !counted[j]) {
        counted[j] = 1;
        // Does this bubble already touch another of its color?
        let paired = false;
        const m = board.neighbors((j / COLS) | 0, j % COLS, nb2);
        for (let q = 0; q < m && !paired; q++) paired = cells[nb2[q]] === v;
        out.push(v);
        if (paired) out.push(v, v, v);
      }
    }
  }
  return out;
}
