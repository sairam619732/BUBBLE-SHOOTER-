import { Board } from './board';
import { BOARD_W, COLLIDE_DIST, COLS, EMPTY, GRID_ROWS, MAX_ANGLE, MIN_ANGLE, R, ROW_H, SHOOTER_X, SHOOTER_Y } from './constants';

export interface Trace {
  /** Flattened polyline x0,y0,x1,y1,... : start, wall bounces, contact point. */
  points: number[];
  /** Landing cell. */
  r: number;
  c: number;
  /** Path length up to the contact point. */
  length: number;
  bounces: number;
}

export function clampAngle(a: number): number {
  if (!Number.isFinite(a)) return Math.PI / 2;
  return Math.max(MIN_ANGLE, Math.min(MAX_ANGLE, a));
}

/** Angle (radians, 0 = right, PI/2 = straight up) from the shooter toward a world point. */
export function angleTo(x: number, y: number): number {
  return Math.atan2(SHOOTER_Y - y, x - SHOOTER_X);
}

const STEP = R / 3;
const CD2 = COLLIDE_DIST * COLLIDE_DIST;
const scratch: number[] = [];

/**
 * Simulates a shot from the shooter at `angle` and returns where it lands.
 * Pure: never mutates the board.
 */
export function traceShot(board: Board, angle: number, sx = SHOOTER_X, sy = SHOOTER_Y): Trace {
  const a = clampAngle(angle);
  let dx = Math.cos(a);
  const dy = -Math.sin(a);
  let x = sx;
  let y = sy;
  const points = [x, y];
  let length = 0;
  let bounces = 0;
  const minX = R;
  const maxX = BOARD_W - R;

  for (let iter = 0; iter < 5000; iter++) {
    const px = x;
    const py = y;
    x += dx * STEP;
    y += dy * STEP;
    length += STEP;

    if (x < minX || x > maxX) {
      const wall = x < minX ? minX : maxX;
      const t = (wall - px) / (x - px);
      points.push(wall, py + (y - py) * t);
      x = 2 * wall - x;
      dx = -dx;
      bounces++;
    }

    if (y <= R) {
      // Reached the ceiling.
      const t = (R - py) / (y - py);
      const cx = px + (x - px) * t;
      points.push(cx, R);
      const cell = snapCeiling(board, cx);
      return { points, r: cell.r, c: cell.c, length, bounces };
    }

    const hit = findHit(board, x, y);
    if (hit >= 0) {
      points.push(x, y);
      const cell = snapNear(board, hit, x, y);
      return { points, r: cell.r, c: cell.c, length, bounces };
    }
  }
  // Should be unreachable; fall back to the ceiling.
  points.push(x, y);
  const cell = snapCeiling(board, x);
  return { points, r: cell.r, c: cell.c, length, bounces };
}

function findHit(board: Board, x: number, y: number): number {
  const rApprox = Math.round((y - R) / ROW_H);
  for (let r = rApprox - 1; r <= rApprox + 1; r++) {
    if (r < 0 || r >= GRID_ROWS) continue;
    const off = board.isShifted(r) ? R : 0;
    const cApprox = Math.round((x - R - off) / (2 * R));
    const len = board.rowLen(r);
    const cy = board.cellY(r);
    for (let c = cApprox - 1; c <= cApprox + 1; c++) {
      if (c < 0 || c >= len) continue;
      const i = r * COLS + c;
      if (board.cells[i] === EMPTY) continue;
      const ex = R + c * 2 * R + off - x;
      const ey = cy - y;
      if (ex * ex + ey * ey < CD2) return i;
    }
  }
  return -1;
}

function snapCeiling(board: Board, x: number): { r: number; c: number } {
  const len = board.rowLen(0);
  let best = -1;
  let bestD = Infinity;
  for (let c = 0; c < len; c++) {
    if (board.get(0, c) !== EMPTY) continue;
    const d = Math.abs(board.cellX(0, c) - x);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  if (best >= 0) return { r: 0, c: best };
  return fallbackSnap(board, x, R);
}

function snapNear(board: Board, hit: number, x: number, y: number): { r: number; c: number } {
  const hr = (hit / COLS) | 0;
  const hc = hit % COLS;
  let bestR = -1;
  let bestC = -1;
  let bestD = Infinity;
  const consider = (r: number, c: number) => {
    if (!board.inBounds(r, c) || board.get(r, c) !== EMPTY) return;
    if (!board.isSupported(r, c)) return;
    const ex = board.cellX(r, c) - x;
    const ey = board.cellY(r) - y;
    const d = ex * ex + ey * ey;
    if (d < bestD) {
      bestD = d;
      bestR = r;
      bestC = c;
    }
  };
  const n = board.neighbors(hr, hc, scratch);
  for (let k = 0; k < n; k++) consider((scratch[k] / COLS) | 0, scratch[k] % COLS);
  const near = board.nearestCell(x, y);
  consider(near.r, near.c);
  if (bestR >= 0) return { r: bestR, c: bestC };
  return fallbackSnap(board, x, y);
}

/** Nearest empty, supported cell to (x, y) anywhere on the board. */
function fallbackSnap(board: Board, x: number, y: number): { r: number; c: number } {
  let bestR = 0;
  let bestC = 0;
  let bestD = Infinity;
  for (let r = 0; r < GRID_ROWS; r++) {
    const len = board.rowLen(r);
    for (let c = 0; c < len; c++) {
      if (board.get(r, c) !== EMPTY || !board.isSupported(r, c)) continue;
      const ex = board.cellX(r, c) - x;
      const ey = board.cellY(r) - y;
      const d = ex * ex + ey * ey;
      if (d < bestD) {
        bestD = d;
        bestR = r;
        bestC = c;
      }
    }
  }
  return { r: bestR, c: bestC };
}

/** Total polyline length of a trace's points. */
export function polylineLength(points: number[]): number {
  let len = 0;
  for (let i = 2; i < points.length; i += 2) {
    len += Math.hypot(points[i] - points[i - 2], points[i + 1] - points[i - 1]);
  }
  return len;
}

/** Position at distance `d` along a polyline. */
export function pointAlong(points: number[], d: number, out: { x: number; y: number }): void {
  let rem = d;
  for (let i = 2; i < points.length; i += 2) {
    const x0 = points[i - 2];
    const y0 = points[i - 1];
    const seg = Math.hypot(points[i] - x0, points[i + 1] - y0);
    if (rem <= seg || i === points.length - 2) {
      const t = seg > 0 ? Math.min(1, rem / seg) : 1;
      out.x = x0 + (points[i] - x0) * t;
      out.y = y0 + (points[i + 1] - y0) * t;
      return;
    }
    rem -= seg;
  }
  out.x = points[points.length - 2];
  out.y = points[points.length - 1];
}
