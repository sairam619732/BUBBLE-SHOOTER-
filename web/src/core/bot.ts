import { Board } from './board';
import { BOMB, COLS, DEADLINE_ROW, EMPTY, MAX_ANGLE, MIN_ANGLE, STONE, isColor } from './constants';
import { traceShot } from './physics';
import { computeOutcome } from './rules';
import { Rng } from './rng';

export interface BotOptions {
  /** Number of angles sampled across the full arc. */
  samples?: number;
  allowSwap?: boolean;
  /** 0 = always pick the best move; 1 = pick fairly randomly among good moves. */
  sloppiness?: number;
  /** Standard deviation of aim error in radians. */
  aimError?: number;
  rng?: Rng;
}

export interface BotMove {
  angle: number;
  swap: boolean;
  value: number;
}

interface Candidate {
  at: number;
  piece: number;
  swap: boolean;
  angles: number[];
}

/**
 * Picks a shot by sampling angles, grouping them by landing cell, and scoring each landing.
 * Aims at the middle of each run of angles that reach the same cell, so small aim errors
 * still land where intended.
 */
export function chooseMove(board: Board, cur: number, nxt: number, opts: BotOptions = {}): BotMove {
  const samples = opts.samples ?? 121;
  const rng = opts.rng ?? new Rng(1);
  const pieces: { piece: number; swap: boolean }[] = [{ piece: cur, swap: false }];
  if (opts.allowSwap !== false && nxt !== cur) pieces.push({ piece: nxt, swap: true });

  const scored: { move: BotMove; value: number }[] = [];
  for (const p of pieces) {
    const runs: Candidate[] = [];
    let last: Candidate | null = null;
    for (let s = 0; s < samples; s++) {
      const a = MIN_ANGLE + ((MAX_ANGLE - MIN_ANGLE) * s) / (samples - 1);
      const t = traceShot(board, a);
      const at = t.r * COLS + t.c;
      if (last && last.at === at) last.angles.push(a);
      else {
        last = { at, piece: p.piece, swap: p.swap, angles: [a] };
        runs.push(last);
      }
    }
    // Merge runs that land on the same cell; keep the widest run for that cell.
    const best = new Map<number, Candidate>();
    for (const run of runs) {
      const prev = best.get(run.at);
      if (!prev || run.angles.length > prev.angles.length) best.set(run.at, run);
    }
    for (const cand of best.values()) {
      const value = evaluate(board, cand.at, cand.piece) + Math.min(cand.angles.length, 6) * 0.04;
      const angle = cand.angles[(cand.angles.length - 1) >> 1];
      scored.push({ move: { angle, swap: cand.swap, value }, value });
    }
  }

  scored.sort((a, b) => b.value - a.value);
  let pick = scored[0];
  const slop = opts.sloppiness ?? 0;
  if (slop > 0 && scored.length > 1) {
    const k = Math.min(scored.length, 1 + Math.round(slop * 6));
    pick = scored[Math.min(scored.length - 1, Math.floor(Math.pow(rng.next(), 1.6) * k))];
  }
  const move = { ...pick.move };
  if (opts.aimError) {
    move.angle = Math.max(MIN_ANGLE, Math.min(MAX_ANGLE, move.angle + rng.gauss() * opts.aimError));
  }
  return move;
}

function evaluate(board: Board, at: number, piece: number): number {
  const r = (at / COLS) | 0;
  const c = at % COLS;
  const o = computeOutcome(board, r, c, piece);
  let v = 0;
  if (piece === BOMB) {
    v += o.popped.length * 1.2 + o.dropped.length * 1.6;
    for (const i of o.popped) if (board.cells[i] === STONE) v += 0.8;
  } else if (o.popped.length) {
    v += 3 + o.popped.length * 1.0 + o.dropped.length * 1.6;
  } else {
    // No pop: reward building pairs, punish burying other colors.
    const nb: number[] = [];
    const n = board.neighbors(r, c, nb);
    let same = 0;
    let other = 0;
    for (let k = 0; k < n; k++) {
      const v2 = board.cells[nb[k]];
      if (v2 === EMPTY) continue;
      if (v2 === o.placed) same++;
      else if (isColor(v2)) other++;
    }
    v += same * 0.9 - other * 0.15 - 0.5;
  }
  // Stay away from the deadline.
  const after = r + 1;
  if (!o.popped.length && after >= DEADLINE_ROW) v -= 50;
  else if (!o.popped.length) v -= Math.max(0, r - (DEADLINE_ROW - 5)) * 0.6;
  // Clearing the board is the best possible result.
  if (o.popped.length && board.countColored() + (o.placed ? 1 : 0) === o.popped.length + countColoredIn(board, o.dropped)) v += 25;
  return v;
}

function countColoredIn(board: Board, idx: number[]): number {
  let n = 0;
  for (const i of idx) if (isColor(board.cells[i])) n++;
  return n;
}
