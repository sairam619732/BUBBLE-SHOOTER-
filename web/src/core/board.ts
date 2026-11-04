import { COLS, D, DEADLINE_ROW, EMPTY, GRID_ROWS, MAX_COLORS, R, ROW_H, STONE, WALL, isColor } from './constants';

/**
 * Hex bubble grid stored row-major. Rows alternate between COLS cells and COLS - 1 cells
 * (the short rows are shifted right by one radius). `parity` flips whenever a row is
 * pushed in from the top so existing rows keep their physical layout.
 */
export class Board {
  readonly cells: Uint8Array;
  parity = 0;

  constructor(cells?: Uint8Array, parity = 0) {
    this.cells = cells ? cells : new Uint8Array(GRID_ROWS * COLS);
    this.parity = parity;
  }

  clone(): Board {
    return new Board(this.cells.slice(), this.parity);
  }

  copyFrom(other: Board): void {
    this.cells.set(other.cells);
    this.parity = other.parity;
  }

  clear(): void {
    this.cells.fill(EMPTY);
    this.parity = 0;
  }

  isShifted(r: number): boolean {
    return ((r + this.parity) & 1) === 1;
  }

  rowLen(r: number): number {
    return this.isShifted(r) ? COLS - 1 : COLS;
  }

  inBounds(r: number, c: number): boolean {
    return r >= 0 && r < GRID_ROWS && c >= 0 && c < this.rowLen(r);
  }

  get(r: number, c: number): number {
    return this.cells[r * COLS + c];
  }

  set(r: number, c: number, v: number): void {
    this.cells[r * COLS + c] = v;
  }

  cellX(r: number, c: number): number {
    return R + c * D + (this.isShifted(r) ? R : 0);
  }

  cellY(r: number): number {
    return R + r * ROW_H;
  }

  idxX(i: number): number {
    return this.cellX((i / COLS) | 0, i % COLS);
  }

  idxY(i: number): number {
    return this.cellY((i / COLS) | 0);
  }

  /** Writes neighbor indices of (r, c) into `out` and returns how many were written. */
  neighbors(r: number, c: number, out: number[]): number {
    let n = 0;
    const shifted = this.isShifted(r);
    const push = (rr: number, cc: number) => {
      if (this.inBounds(rr, cc)) out[n++] = rr * COLS + cc;
    };
    push(r, c - 1);
    push(r, c + 1);
    const a = shifted ? c : c - 1;
    const b = shifted ? c + 1 : c;
    push(r - 1, a);
    push(r - 1, b);
    push(r + 1, a);
    push(r + 1, b);
    return n;
  }

  /** Nearest in-bounds cell to a world position (ignores occupancy). */
  nearestCell(x: number, y: number): { r: number; c: number } {
    let r = Math.round((y - R) / ROW_H);
    r = Math.max(0, Math.min(GRID_ROWS - 1, r));
    const off = this.isShifted(r) ? R : 0;
    let c = Math.round((x - R - off) / D);
    c = Math.max(0, Math.min(this.rowLen(r) - 1, c));
    return { r, c };
  }

  /** True if (r, c) touches the ceiling or an occupied neighbor. */
  isSupported(r: number, c: number): boolean {
    if (r === 0) return true;
    const nb: number[] = [];
    const n = this.neighbors(r, c, nb);
    for (let k = 0; k < n; k++) if (this.cells[nb[k]] !== EMPTY) return true;
    return false;
  }

  countOccupied(): number {
    let n = 0;
    for (let i = 0; i < this.cells.length; i++) if (this.cells[i] !== EMPTY) n++;
    return n;
  }

  countColored(): number {
    let n = 0;
    for (let i = 0; i < this.cells.length; i++) if (isColor(this.cells[i])) n++;
    return n;
  }

  /** Sorted list of colors currently on the board. */
  colorsPresent(): number[] {
    const seen = new Array<boolean>(MAX_COLORS + 1).fill(false);
    for (let i = 0; i < this.cells.length; i++) {
      const v = this.cells[i];
      if (isColor(v)) seen[v] = true;
    }
    const out: number[] = [];
    for (let k = 1; k <= MAX_COLORS; k++) if (seen[k]) out.push(k);
    return out;
  }

  /** Count of each color (index = color). */
  colorCounts(): number[] {
    const counts = new Array<number>(MAX_COLORS + 1).fill(0);
    for (let i = 0; i < this.cells.length; i++) {
      const v = this.cells[i];
      if (isColor(v)) counts[v]++;
    }
    return counts;
  }

  /** Deepest occupied row, or -1 if empty. */
  lowestRow(): number {
    for (let r = GRID_ROWS - 1; r >= 0; r--) {
      const base = r * COLS;
      for (let c = 0; c < COLS; c++) if (this.cells[base + c] !== EMPTY) return r;
    }
    return -1;
  }

  crossedDeadline(): boolean {
    return this.lowestRow() >= DEADLINE_ROW;
  }

  /** Number of steel ceiling rows at the top (from ceiling-drop levels). */
  wallRows(): number {
    let n = 0;
    while (n < GRID_ROWS && this.cells[n * COLS] === WALL) n++;
    return n;
  }

  /**
   * Inserts a new row at the top. Everything moves down one row; the bottom row is lost
   * (it would already be past the deadline). `row` supplies values for the new top row.
   */
  pushRow(row: ArrayLike<number>): void {
    this.cells.copyWithin(COLS, 0, (GRID_ROWS - 1) * COLS);
    this.parity ^= 1;
    const len = this.rowLen(0);
    for (let c = 0; c < COLS; c++) this.cells[c] = c < len && c < row.length ? row[c] : EMPTY;
  }

  /** Flood fill from the ceiling; returns indices of occupied cells NOT attached to it. */
  findFloating(): number[] {
    const attached = new Uint8Array(this.cells.length);
    const stack: number[] = [];
    for (let c = 0; c < COLS; c++) {
      if (this.cells[c] !== EMPTY && c < this.rowLen(0)) {
        attached[c] = 1;
        stack.push(c);
      }
    }
    const nb: number[] = [];
    while (stack.length) {
      const i = stack.pop()!;
      const r = (i / COLS) | 0;
      const n = this.neighbors(r, i % COLS, nb);
      for (let k = 0; k < n; k++) {
        const j = nb[k];
        if (!attached[j] && this.cells[j] !== EMPTY) {
          attached[j] = 1;
          stack.push(j);
        }
      }
    }
    const out: number[] = [];
    for (let i = 0; i < this.cells.length; i++) if (this.cells[i] !== EMPTY && !attached[i]) out.push(i);
    return out;
  }

  /** Connected same-color group containing index `start` (BFS order, start first). */
  findGroup(start: number): number[] {
    const color = this.cells[start];
    if (!isColor(color)) return [];
    const seen = new Uint8Array(this.cells.length);
    const out: number[] = [start];
    seen[start] = 1;
    const nb: number[] = [];
    for (let h = 0; h < out.length; h++) {
      const i = out[h];
      const n = this.neighbors((i / COLS) | 0, i % COLS, nb);
      for (let k = 0; k < n; k++) {
        const j = nb[k];
        if (!seen[j] && this.cells[j] === color) {
          seen[j] = 1;
          out.push(j);
        }
      }
    }
    return out;
  }

  /** Compact text form: parity digit + one char per cell. */
  serialize(): string {
    let s = String(this.parity);
    for (let i = 0; i < this.cells.length; i++) s += cellChar(this.cells[i]);
    return s;
  }

  static deserialize(s: string): Board {
    const b = new Board();
    b.parity = s.charCodeAt(0) === 49 ? 1 : 0;
    for (let i = 0; i < b.cells.length && i + 1 < s.length; i++) b.cells[i] = charCell(s[i + 1]);
    return b;
  }

  /** Cheap checksum used to detect replica drift in multiplayer. */
  hash(): number {
    let h = 0x811c9dc5 ^ this.parity;
    for (let i = 0; i < this.cells.length; i++) {
      h ^= this.cells[i];
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  /**
   * Builds a board from text rows. Each row lists its cells left to right:
   * '.' empty, '1'-'6' colors, 'x' stone, 'w' steel ceiling. Spaces are ignored.
   */
  static fromRows(rows: string[], parity = 0): Board {
    const b = new Board(undefined, parity);
    rows.forEach((line, r) => {
      const chars = line.replace(/\s+/g, '');
      const len = b.rowLen(r);
      for (let c = 0; c < len && c < chars.length; c++) b.set(r, c, charCell(chars[c]));
    });
    return b;
  }
}

function cellChar(v: number): string {
  if (v === EMPTY) return '.';
  if (v === STONE) return 'x';
  if (v === WALL) return 'w';
  return String(v);
}

function charCell(ch: string): number {
  if (ch === 'x') return STONE;
  if (ch === 'w') return WALL;
  const n = ch.charCodeAt(0) - 48;
  return n >= 1 && n <= MAX_COLORS ? n : EMPTY;
}
