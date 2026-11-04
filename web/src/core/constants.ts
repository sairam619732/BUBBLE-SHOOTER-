// World geometry. All gameplay runs in "world units"; the renderer scales them to the screen.

/** Bubbles in a full (unshifted) row. Shifted rows hold COLS - 1. */
export const COLS = 10;
/** Bubble radius. */
export const R = 18;
/** Bubble diameter. */
export const D = R * 2;
/** Vertical distance between hex rows. */
export const ROW_H = R * Math.sqrt(3);
/** Inner board width (wall to wall). */
export const BOARD_W = COLS * D;
/** Rows of storage. Only rows < DEADLINE_ROW are safe. */
export const GRID_ROWS = 20;
/** A bubble resting on this row (or lower) ends the game. */
export const DEADLINE_ROW = 14;
/** Y of the line drawn at the bottom of the last safe row. */
export const DEADLINE_Y = R + (DEADLINE_ROW - 1) * ROW_H + R + 2;
export const SHOOTER_X = BOARD_W / 2;
export const SHOOTER_Y = DEADLINE_Y + 62;
/** Total world height the renderer must fit on screen. */
export const WORLD_H = SHOOTER_Y + 46;

export const MIN_ANGLE = (9 * Math.PI) / 180;
export const MAX_ANGLE = Math.PI - MIN_ANGLE;
/** Projectile speed in world units per second. */
export const SHOT_SPEED = 1450;
/** Center distance at which a flying bubble sticks. Slightly < D lets shots squeeze through gaps. */
export const COLLIDE_DIST = D * 0.86;

// Cell / piece values
export const EMPTY = 0;
/** Colors are 1..MAX_COLORS. */
export const MAX_COLORS = 6;
/** Unbreakable obstacle: only falls when cut loose from the ceiling. */
export const STONE = 9;
/** Shot-only pieces (never stored in the grid). */
export const BOMB = 10;
export const RAINBOW = 11;

export function isColor(v: number): boolean {
  return v >= 1 && v <= MAX_COLORS;
}
export function isSpecial(v: number): boolean {
  return v === BOMB || v === RAINBOW;
}
