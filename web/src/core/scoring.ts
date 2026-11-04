import { BOMB, RAINBOW } from './constants';
import { Outcome } from './rules';

export const POP_POINTS = 10;
export const DROP_POINTS = 20;
export const SHOT_LEFT_BONUS = 60;

/** Points for one shot. `combo` is the number of consecutive hits including this one. */
export function shotPoints(o: Outcome, combo: number): number {
  const pops = o.popped.length;
  const drops = o.dropped.length;
  if (!pops && !drops) return 0;
  // Drops grow faster than linearly so cutting big chunks loose feels rewarding.
  const base = pops * POP_POINTS + drops * DROP_POINTS + Math.max(0, drops - 1) * drops * 5;
  const mult = 1 + 0.25 * (Math.min(Math.max(combo, 1), 5) - 1);
  return Math.round(base * mult);
}

/** Special pieces awarded for a big shot (used by every mode). */
export function rewardFor(o: Outcome, rand: number): number {
  const total = o.popped.length + o.dropped.length;
  if (o.dropped.length >= 6 || total >= 11) return rand < 0.5 ? BOMB : RAINBOW;
  return 0;
}

/** Garbage bubbles a versus shot sends to an opponent. */
export function attackFor(o: Outcome): number {
  const n = o.dropped.length + Math.max(0, o.popped.length - 4);
  return Math.min(n, 14);
}
