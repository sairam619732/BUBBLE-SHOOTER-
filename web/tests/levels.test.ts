import { describe, expect, it } from 'vitest';
import { Board } from '../src/core/board';
import { chooseMove } from '../src/core/bot';
import { BOMB, DEADLINE_ROW, WALL } from '../src/core/constants';
import { FIRST_PRESS_LEVEL, LEVEL_COUNT, WORLDS, getLevel, levelParams } from '../src/core/levels';
import { LEVEL_CALIB } from '../src/core/levelCalib';
import { Rng } from '../src/core/rng';
import { computeOutcome, wallRow } from '../src/core/rules';
import { SoloGame } from '../src/core/solo';

describe('Level set', () => {
  it('has 200 levels in 10 worlds, all calibrated', () => {
    expect(LEVEL_COUNT).toBe(200);
    expect(WORLDS.length * 20).toBe(LEVEL_COUNT);
    for (let id = 1; id <= LEVEL_COUNT; id++) expect(LEVEL_CALIB[id], `level ${id}`).toBeDefined();
  });

  it('every level is a valid, attached, playable board', () => {
    for (let id = 1; id <= LEVEL_COUNT; id++) {
      const l = getLevel(id);
      const b = Board.fromRows(l.rows);
      expect(b.findFloating(), `level ${id}`).toEqual([]);
      expect(b.countColored(), `level ${id}`).toBeGreaterThanOrEqual(14);
      expect(l.palette.length, `level ${id}`).toBeGreaterThanOrEqual(3);
      expect(b.lowestRow(), `level ${id}`).toBeLessThan(DEADLINE_ROW - 4);
      expect(l.shots, `level ${id}`).toBeGreaterThan(5);
      expect(l.stars[1], `level ${id}`).toBeGreaterThan(l.stars[0]);
    }
  });

  it('ceiling drops start in world 4', () => {
    for (let id = 1; id < FIRST_PRESS_LEVEL; id++) expect(levelParams(id).press).toBe(0);
    const withPress = [...Array(LEVEL_COUNT - FIRST_PRESS_LEVEL + 1)].filter((_, k) => levelParams(FIRST_PRESS_LEVEL + k).press > 0);
    expect(withPress.length).toBeGreaterThan(80);
  });
});

describe('Ceiling drop', () => {
  it('pushes a steel row in after every N shots and keeps bubbles attached', () => {
    const id = [...Array(LEVEL_COUNT)].map((_, k) => k + 1).find((i) => levelParams(i).press > 0)!;
    const level = getLevel(id);
    const g = new SoloGame('level', { ...level, shots: 999 }, 5);
    const rng = new Rng(2);
    let presses = 0;
    while (g.state === 'playing' && g.shotsUsed < level.press * 2) {
      const m = chooseMove(g.board, g.queue.cur, g.queue.nxt, { rng });
      if (m.swap) g.swap();
      g.fire(m.angle);
      // The drop waits until the shot animation is done.
      if (g.shotsUsed % level.press === 0 && g.state === 'playing') expect(g.update(0, false)).toBeNull();
      if (g.update(0, true)) presses++;
    }
    if (g.state === 'playing') {
      expect(presses).toBe(2);
      expect(g.board.wallRows()).toBe(2);
      expect(g.board.findFloating()).toEqual([]);
    }
  });

  it('bombs do not destroy the steel ceiling', () => {
    const b = Board.fromRows(['1212121212', '121212121']);
    b.pushRow(wallRow(b));
    const o = computeOutcome(b, 2, 4, BOMB);
    for (const i of o.popped) expect(b.cells[i]).not.toBe(WALL);
    expect(b.wallRows()).toBe(1);
  });
});
