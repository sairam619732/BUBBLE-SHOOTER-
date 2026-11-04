import { Board } from './board';
import { isColor } from './constants';
import { Rng } from './rng';

/**
 * The launcher's current + next bubble. New colors are only drawn from colors still on the
 * board, so the player is never handed a bubble that can't match anything.
 */
export class PieceQueue {
  cur: number;
  nxt: number;
  private specials: number[] = [];

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
