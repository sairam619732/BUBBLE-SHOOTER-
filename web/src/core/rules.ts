import { Board } from './board';
import { BOMB, COLS, D, EMPTY, MAX_COLORS, RAINBOW, STONE, WALL, isColor } from './constants';
import { traceShot } from './physics';
import { Rng } from './rng';

/** Everything that happens when a shot lands. Small enough to send over the network. */
export interface Outcome {
  /** Landing cell index. */
  at: number;
  /** Value written to the landing cell (0 for a bomb, which never stays). */
  placed: number;
  /** Cells cleared by a match or explosion, in pop order (nearest first). */
  popped: number[];
  /** Cells that fell because they lost their link to the ceiling. */
  dropped: number[];
}

export const MIN_MATCH = 3;
const BOMB_RADIUS = D * 2.05;

/** Works out what a piece does when it lands on (r, c). Does not mutate `board`. */
export function computeOutcome(board: Board, r: number, c: number, piece: number): Outcome {
  const at = r * COLS + c;
  const b = board.clone();

  if (piece === BOMB) {
    const x0 = b.cellX(r, c);
    const y0 = b.cellY(r);
    const hits: { i: number; d: number }[] = [];
    for (let i = 0; i < b.cells.length; i++) {
      if (b.cells[i] === EMPTY || b.cells[i] === WALL) continue;
      const d = Math.hypot(b.idxX(i) - x0, b.idxY(i) - y0);
      if (d <= BOMB_RADIUS) hits.push({ i, d });
    }
    hits.sort((p, q) => p.d - q.d);
    const popped = hits.map((h) => h.i);
    for (const i of popped) b.cells[i] = EMPTY;
    return { at, placed: EMPTY, popped, dropped: b.findFloating() };
  }

  const color = piece === RAINBOW ? chooseRainbowColor(b, r, c) : piece;
  b.cells[at] = color;
  let popped: number[] = [];
  const group = b.findGroup(at);
  if (group.length >= MIN_MATCH) {
    popped = group;
    for (const i of popped) b.cells[i] = EMPTY;
  }
  const dropped = popped.length ? b.findFloating() : [];
  return { at, placed: color, popped, dropped };
}

/** The color a rainbow bubble becomes: whichever neighbor color forms the biggest group. */
export function chooseRainbowColor(board: Board, r: number, c: number): number {
  const at = r * COLS + c;
  const nb: number[] = [];
  const n = board.neighbors(r, c, nb);
  const prev = board.cells[at];
  let best = 0;
  let bestSize = -1;
  for (let k = 0; k < n; k++) {
    const col = board.cells[nb[k]];
    if (!isColor(col) || col === best) continue;
    board.cells[at] = col;
    const size = board.findGroup(at).length;
    if (size > bestSize) {
      bestSize = size;
      best = col;
    }
  }
  board.cells[at] = prev;
  if (best) return best;
  // Nothing to match: take the most common color on the board.
  const counts = board.colorCounts();
  let top = 1;
  for (let k = 2; k <= MAX_COLORS; k++) if (counts[k] > counts[top]) top = k;
  return top;
}

/** Applies an outcome to a board. Returns the values that were removed, for effects. */
export function applyOutcome(board: Board, o: Outcome): { poppedColors: number[]; droppedColors: number[] } {
  if (o.placed !== EMPTY) board.cells[o.at] = o.placed;
  const poppedColors = o.popped.map((i) => board.cells[i]);
  for (const i of o.popped) board.cells[i] = EMPTY;
  const droppedColors = o.dropped.map((i) => board.cells[i]);
  for (const i of o.dropped) board.cells[i] = EMPTY;
  return { poppedColors, droppedColors };
}

/** True if the shot cleared bubbles (a "hit" for combo purposes). */
export function isHit(o: Outcome): boolean {
  return o.popped.length > 0;
}

/** Builds a random top row with some clustering so new rows are playable. */
export function randomRow(board: Board, palette: readonly number[], rng: Rng, stoneChance = 0): number[] {
  // The row is generated for the layout row 0 will have AFTER the push (parity flips).
  const shiftedAfter = ((board.parity ^ 1) & 1) === 1;
  const len = shiftedAfter ? COLS - 1 : COLS;
  const row: number[] = [];
  for (let c = 0; c < len; c++) {
    if (stoneChance > 0 && rng.chance(stoneChance)) {
      row.push(STONE);
      continue;
    }
    // Neighbor below after the push is the current row 0.
    const below = board.get(0, Math.min(c, board.rowLen(0) - 1));
    if (c > 0 && isColor(row[c - 1]) && rng.chance(0.38)) row.push(row[c - 1]);
    else if (isColor(below) && palette.includes(below) && rng.chance(0.3)) row.push(below);
    else row.push(rng.pick(palette));
  }
  return row;
}

/**
 * Attacks a board with `n` garbage bubbles. Each is "fired" from the shooter at a random
 * angle and sticks where it lands (no matching). Returns [index, color] pairs.
 */
export function placeGarbage(board: Board, n: number, palette: readonly number[], rng: Rng): [number, number][] {
  const out: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    const angle = rng.range(0.35, Math.PI - 0.35);
    const t = traceShot(board, angle);
    const i = t.r * COLS + t.c;
    const color = rng.pick(palette);
    board.cells[i] = color;
    out.push([i, color]);
  }
  return out;
}

/** A full row of steel for a ceiling drop (sized for row 0 after the push). */
export function wallRow(board: Board): number[] {
  const len = ((board.parity ^ 1) & 1) === 1 ? COLS - 1 : COLS;
  return new Array<number>(len).fill(WALL);
}

/** Fills rows 0..rows-1 with random clustered colors. */
export function fillRandom(board: Board, rows: number, palette: readonly number[], rng: Rng): void {
  board.clear();
  for (let r = 0; r < rows; r++) {
    const len = board.rowLen(r);
    for (let c = 0; c < len; c++) {
      let v = rng.pick(palette);
      if (c > 0 && rng.chance(0.35)) v = board.get(r, c - 1);
      else if (r > 0 && rng.chance(0.3)) v = board.get(r - 1, Math.min(c, board.rowLen(r - 1) - 1)) || v;
      board.set(r, c, v);
    }
  }
}
