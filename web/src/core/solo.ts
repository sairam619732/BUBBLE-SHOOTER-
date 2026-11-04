import { Board } from './board';
import { STONE } from './constants';
import { LevelDef, levelBoard } from './levels';
import { Trace, traceShot } from './physics';
import { PieceQueue } from './queue';
import { Rng } from './rng';
import { Outcome, applyOutcome, computeOutcome, fillRandom, isHit, randomRow } from './rules';
import { SHOT_LEFT_BONUS, rewardFor, shotPoints } from './scoring';

export type SoloMode = 'level' | 'arcade';
export type SoloState = 'playing' | 'won' | 'lost';

export interface ShotEvent {
  trace: Trace;
  piece: number;
  outcome: Outcome;
  poppedColors: number[];
  droppedColors: number[];
  points: number;
  combo: number;
  /** Special piece earned by this shot (0 = none). */
  reward: number;
}

export interface PushEvent {
  row: number[];
}

const ARCADE_START_ROWS = 6;
const ROWS_PER_ARCADE_LEVEL = 6;

/** Rules for one single-player game. Rendering-free so the calibration bot can use it. */
export class SoloGame {
  readonly board: Board;
  readonly queue: PieceQueue;
  readonly rng: Rng;
  palette: number[];
  state: SoloState = 'playing';
  score = 0;
  combo = 0;
  bestCombo = 0;
  shotsUsed = 0;
  /** Level mode: shots allowed. Arcade: Infinity. */
  readonly shotLimit: number;
  /** Level mode: bonus added for unused shots on a win. */
  endBonus = 0;
  /** Why the game was lost. */
  lostReason: 'deadline' | 'shots' | null = null;

  // Arcade pressure
  arcadeLevel = 1;
  rowsPushed = 0;
  pushProgress = 0;
  private pushPending = false;

  constructor(
    readonly mode: SoloMode,
    readonly level: LevelDef | null,
    seed: number,
  ) {
    this.rng = new Rng(seed);
    if (mode === 'level' && level) {
      this.board = levelBoard(level);
      this.palette = level.palette.slice();
      this.shotLimit = level.shots;
    } else {
      this.board = new Board();
      this.palette = arcadePalette(1);
      fillRandom(this.board, ARCADE_START_ROWS, this.palette, this.rng);
      this.shotLimit = Infinity;
    }
    this.queue = new PieceQueue(this.rng, this.palette, this.board);
  }

  get shotsLeft(): number {
    return Math.max(0, this.shotLimit - this.shotsUsed);
  }

  /** Seconds between rows in arcade mode. */
  get pushInterval(): number {
    return Math.max(5.5, 15 - (this.arcadeLevel - 1) * 1.1);
  }

  /** Fires the current piece. Returns null if the game is over. */
  fire(angle: number): ShotEvent | null {
    if (this.state !== 'playing') return null;
    const piece = this.queue.cur;
    const trace = traceShot(this.board, angle);
    const outcome = computeOutcome(this.board, trace.r, trace.c, piece);
    const { poppedColors, droppedColors } = applyOutcome(this.board, outcome);
    this.shotsUsed++;

    if (isHit(outcome)) this.combo++;
    else this.combo = 0;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const points = shotPoints(outcome, this.combo);
    this.score += points;

    const reward = rewardFor(outcome, this.rng.next());
    if (reward) this.queue.grant(reward);
    this.queue.advance(this.board);

    if (this.mode === 'arcade' && !isHit(outcome)) this.pushProgress += 0.12;
    this.checkEnd();
    return { trace, piece, outcome, poppedColors, droppedColors, points, combo: this.combo, reward };
  }

  swap(): void {
    if (this.state === 'playing') this.queue.swap();
  }

  /**
   * Arcade timer. `canPush` should be false while a shot is still animating; the row then
   * waits for the next call where it is true.
   */
  update(dt: number, canPush: boolean): PushEvent | null {
    if (this.mode !== 'arcade' || this.state !== 'playing') return null;
    this.pushProgress += dt / this.pushInterval;
    if (this.pushProgress >= 1) this.pushPending = true;
    if (this.pushPending && canPush) {
      this.pushPending = false;
      this.pushProgress = Math.max(0, this.pushProgress - 1);
      return this.pushRow();
    }
    return null;
  }

  /** Arcade: inserts a new row at the top. */
  pushRow(): PushEvent {
    const stoneChance = this.arcadeLevel >= 4 ? Math.min(0.06, 0.01 * (this.arcadeLevel - 3)) : 0;
    const row = randomRow(this.board, this.palette, this.rng, stoneChance);
    // Keep stones off the very top row edges so the row stays anchored by colors.
    if (!row.some((v) => v !== STONE)) row[0] = this.palette[0];
    this.board.pushRow(row);
    this.rowsPushed++;
    const lvl = 1 + Math.floor(this.rowsPushed / ROWS_PER_ARCADE_LEVEL);
    if (lvl !== this.arcadeLevel) {
      this.arcadeLevel = lvl;
      this.palette = arcadePalette(lvl);
      this.queue.setPalette(this.palette);
    }
    this.queue.refresh(this.board);
    this.checkEnd();
    return { row };
  }

  /** Arcade: refill after the board is cleared. */
  refillIfEmpty(): number {
    if (this.mode !== 'arcade' || this.state !== 'playing' || this.board.countColored() > 0) return 0;
    for (const i of this.board.findFloating()) this.board.cells[i] = 0;
    const bonus = 1000 + 250 * this.arcadeLevel;
    this.score += bonus;
    for (let k = 0; k < 4; k++) this.pushRow();
    this.pushProgress = 0;
    return bonus;
  }

  private checkEnd(): void {
    if (this.board.crossedDeadline()) {
      this.state = 'lost';
      this.lostReason = 'deadline';
      return;
    }
    if (this.mode === 'level') {
      if (this.board.countColored() === 0) {
        this.state = 'won';
        this.endBonus = this.shotsLeft * SHOT_LEFT_BONUS;
        this.score += this.endBonus;
      } else if (this.shotsUsed >= this.shotLimit) {
        this.state = 'lost';
        this.lostReason = 'shots';
      }
    }
  }

  /** Stars earned (0 if not won). */
  stars(): number {
    if (this.state !== 'won' || !this.level) return 0;
    if (this.score >= this.level.stars[1]) return 3;
    if (this.score >= this.level.stars[0]) return 2;
    return 1;
  }

  /** Remaining stones after a win (they fall away for show). */
  leftoverStones(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.board.cells.length; i++) if (this.board.cells[i] === STONE) out.push(i);
    return out;
  }
}

export function arcadePalette(level: number): number[] {
  if (level <= 2) return [1, 2, 3, 4];
  if (level <= 5) return [1, 2, 3, 4, 5];
  return [1, 2, 3, 4, 5, 6];
}

