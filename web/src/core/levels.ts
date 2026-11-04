import { Board } from './board';
import { BOARD_W, COLS, EMPTY, STONE, isColor } from './constants';
import { LEVEL_CALIB } from './levelCalib';
import { Rng } from './rng';

export const LEVEL_COUNT = 60;
export const LEVELS_PER_WORLD = 20;
export const WORLDS = ['Candy Meadow', 'Coral Reef', 'Starlight'] as const;

export interface LevelDef {
  id: number;
  world: number;
  rows: string[];
  palette: number[];
  shots: number;
  /** Score needed for 2 and 3 stars (1 star = clearing the level). */
  stars: [number, number];
}

type Shape = (r: number, c: number, x: number, h: number) => boolean;
type Scheme = 'clusters' | 'bands' | 'stripes' | 'mirror' | 'rings' | 'diagonal';

const SHAPES: Record<string, Shape> = {
  block: (r, c, _x, h) => h <= 5 || r === 0 || (r * 3 + c * 7) % 11 !== 0,
  funnel: (r, _c, x, h) => Math.abs(x - 0.5) <= 0.52 - (r / h) * 0.32,
  tower: (r, _c, x, h) => Math.abs(x - 0.5) <= 0.16 + (r / h) * 0.36,
  diamond: (r, _c, x, h) => Math.abs(x - 0.5) / 0.52 + Math.abs(r - (h - 1) / 2) / (h / 2 + 0.5) <= 1.05 || r === 0,
  curtains: (r, _c, x) => r === 0 || Math.floor(x * 5) % 2 === 0,
  lattice: (r, c) => r === 0 || (r + c) % 3 !== 0,
  vee: (r, _c, x, h) => r === 0 || Math.abs(Math.abs(x - 0.5) - (0.42 - (r / h) * 0.38)) < 0.13,
  chandelier: (r, _c, x, h) => {
    if (r === 0) return true;
    const arms = [0.18, 0.5, 0.82];
    for (const a of arms) {
      const d = Math.abs(x - a);
      if (r < h * 0.45 ? d < 0.05 : d < 0.08 + (r / h) * 0.07) return true;
    }
    return false;
  },
  hourglass: (r, _c, x, h) => Math.abs(x - 0.5) <= 0.1 + Math.abs(r - (h - 1) / 2) / h * 0.85,
  wings: (r, _c, x, h) => r === 0 || Math.abs(x - 0.5) >= 0.08 + (r / h) * 0.2,
  heart: (r, _c, x, h) => {
    const nx = (x - 0.5) * 2.4;
    const ny = 1.25 - (r / Math.max(1, h - 1)) * 2.4;
    const q = nx * nx + ny * ny - 1;
    return q * q * q - nx * nx * ny * ny * ny <= 0.05 || r === 0;
  },
  zigzag: (r, _c, x) => r === 0 || Math.abs(((x * 4 + r * 0.5) % 2) - 1) < 0.62,
  rings: (r, _c, x, h) => {
    const d = Math.hypot((x - 0.5) * 2, (r - (h - 1) / 2) / (h / 2));
    return r === 0 || d < 0.35 || (d > 0.6 && d < 1.0);
  },
  bridges: (r, _c, x, h) => {
    if (r === 0) return true;
    if (r < h * 0.4) return Math.abs(x - 0.25) < 0.06 || Math.abs(x - 0.75) < 0.06;
    return Math.abs(x - 0.25) < 0.22 || Math.abs(x - 0.75) < 0.22;
  },
};

const SHAPE_ORDER = [
  'block', 'funnel', 'chandelier', 'curtains', 'diamond', 'tower', 'lattice', 'bridges', 'vee', 'heart',
  'hourglass', 'zigzag', 'wings', 'rings',
];
const SCHEME_ORDER: Scheme[] = ['clusters', 'bands', 'mirror', 'stripes', 'clusters', 'rings', 'diagonal', 'mirror'];

/** Colors used by a level, chosen so neighbouring levels look different. */
function paletteFor(id: number, n: number): number[] {
  const all = [1, 2, 3, 4, 5, 6];
  const rng = new Rng(id * 7919 + 13);
  for (let i = all.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, n).sort((a, b) => a - b);
}

export function levelParams(id: number) {
  const nColors = id <= 4 ? 3 : id <= 16 ? 4 : id <= 44 ? 5 : id % 4 === 0 && id < 60 ? 6 : 5;
  const height = Math.min(8, 4 + Math.floor((id + 2) / 8));
  const stones = id < 12 ? 0 : Math.min(9, Math.floor((id - 6) / 6));
  const special: Record<number, [string, Scheme]> = {
    1: ['block', 'bands'],
    2: ['funnel', 'bands'],
    3: ['chandelier', 'bands'],
    20: ['heart', 'mirror'],
    40: ['rings', 'rings'],
    60: ['heart', 'rings'],
  };
  const shape = special[id]?.[0] ?? SHAPE_ORDER[(id * 5) % SHAPE_ORDER.length];
  const scheme: Scheme = special[id]?.[1] ?? SCHEME_ORDER[(id * 3) % SCHEME_ORDER.length];
  return { nColors, height, stones, shape, scheme };
}

/** Deterministically builds the starting board for a level. */
export function buildLevelBoard(id: number): { board: Board; palette: number[] } {
  const p = levelParams(id);
  const palette = paletteFor(id, p.nColors);
  const rng = new Rng(id * 104729 + 7);
  const shape = SHAPES[p.shape];
  const b = new Board();
  const h = p.height;

  // Mask
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < b.rowLen(r); c++) {
      const x = b.cellX(r, c) / BOARD_W;
      if (shape(r, c, x, h)) b.set(r, c, 1);
    }
  }
  // Colors
  const mirrorOf = (r: number, c: number) => b.rowLen(r) - 1 - c;
  for (let r = 0; r < h; r++) {
    const len = b.rowLen(r);
    for (let c = 0; c < len; c++) {
      if (b.get(r, c) === EMPTY) continue;
      const x = b.cellX(r, c) / BOARD_W;
      let v: number;
      switch (p.scheme) {
        case 'bands':
          v = palette[Math.floor(r / 2) % palette.length];
          if (rng.chance(0.12)) v = rng.pick(palette);
          break;
        case 'stripes':
          v = palette[Math.floor(x * palette.length * 1.5) % palette.length];
          if (rng.chance(0.15)) v = rng.pick(palette);
          break;
        case 'rings': {
          const d = Math.hypot((x - 0.5) * 2, (r - (h - 1) / 2) / (h / 2));
          v = palette[Math.floor(d * 3.2) % palette.length];
          if (rng.chance(0.12)) v = rng.pick(palette);
          break;
        }
        case 'diagonal':
          v = palette[Math.floor((r + x * 10) / 2.2) % palette.length];
          if (rng.chance(0.12)) v = rng.pick(palette);
          break;
        case 'mirror':
        case 'clusters':
        default:
          if (p.scheme === 'mirror' && c > mirrorOf(r, c)) {
            v = b.get(r, mirrorOf(r, c));
            break;
          }
          v = rng.pick(palette);
          if (c > 0 && isColor(b.get(r, c - 1)) && rng.chance(0.45)) v = b.get(r, c - 1);
          else if (r > 0 && rng.chance(0.35)) {
            const up = b.get(r - 1, Math.min(c, b.rowLen(r - 1) - 1));
            if (isColor(up)) v = up;
          }
      }
      b.set(r, c, v);
    }
  }
  // Stones (never in the top row so the layout stays anchored by colors)
  let placed = 0;
  for (let tries = 0; placed < p.stones && tries < 400; tries++) {
    const r = 1 + rng.int(Math.max(1, h - 1));
    const c = rng.int(b.rowLen(r));
    if (!isColor(b.get(r, c))) continue;
    b.set(r, c, STONE);
    placed++;
    if (p.scheme === 'mirror' && placed < p.stones) {
      const m = mirrorOf(r, c);
      if (m !== c && isColor(b.get(r, m))) {
        b.set(r, m, STONE);
        placed++;
      }
    }
  }
  // Remove anything not attached to the ceiling.
  for (const i of b.findFloating()) b.cells[i] = EMPTY;
  breakBigGroups(b, palette, rng, id <= 6 ? 9 : 7);
  // Every palette color must still exist.
  const present = b.colorsPresent();
  const usable = palette.filter((col) => present.includes(col));
  return { board: b, palette: usable.length ? usable : palette };
}

/**
 * Recolors cells so no single shot can clear too much. Groups that touch the ceiling are kept
 * especially small, otherwise one pop would drop the whole level.
 */
function breakBigGroups(b: Board, palette: number[], rng: Rng, maxGroup: number): void {
  if (palette.length < 2) return;
  const nb: number[] = [];
  for (let pass = 0; pass < 200; pass++) {
    let changed = false;
    const seen = new Uint8Array(b.cells.length);
    for (let i = 0; i < b.cells.length; i++) {
      if (seen[i] || !isColor(b.cells[i])) continue;
      const group = b.findGroup(i);
      for (const j of group) seen[j] = 1;
      const anchors = group.filter((j) => j < COLS).length;
      const limit = anchors > 0 ? Math.min(maxGroup, 4) : maxGroup;
      if (group.length <= limit && anchors <= 3) continue;
      // Recolor a member, preferring ceiling cells when the group hugs the ceiling.
      const pool = anchors > 3 ? group.filter((j) => j < COLS) : group;
      const j = pool[1 + rng.int(Math.max(1, pool.length - 1))] ?? pool[0];
      const n = b.neighbors((j / COLS) | 0, j % COLS, nb);
      const around = new Set<number>([b.cells[j]]);
      for (let k = 0; k < n; k++) around.add(b.cells[nb[k]]);
      const fresh = palette.filter((col) => !around.has(col));
      const others = palette.filter((col) => col !== b.cells[j]);
      b.cells[j] = fresh.length ? rng.pick(fresh) : rng.pick(others);
      changed = true;
    }
    if (!changed) return;
  }
}

export function boardToRows(b: Board): string[] {
  const rows: string[] = [];
  const last = b.lowestRow();
  for (let r = 0; r <= last; r++) {
    let s = '';
    for (let c = 0; c < b.rowLen(r); c++) {
      const v = b.get(r, c);
      s += v === EMPTY ? '.' : v === STONE ? 'x' : String(v);
    }
    rows.push(s);
  }
  return rows;
}

const cache = new Map<number, LevelDef>();

export function getLevel(id: number): LevelDef {
  const hit = cache.get(id);
  if (hit) return hit;
  const { board, palette } = buildLevelBoard(id);
  const colored = board.countColored();
  const calib = LEVEL_CALIB[id];
  const shots = calib ? calib[0] : Math.ceil(colored / 2.2) + 6;
  const stars: [number, number] = calib ? [calib[1], calib[2]] : [colored * 14, colored * 20];
  const def: LevelDef = {
    id,
    world: Math.floor((id - 1) / LEVELS_PER_WORLD),
    rows: boardToRows(board),
    palette,
    shots,
    stars,
  };
  cache.set(id, def);
  return def;
}

export function levelBoard(def: LevelDef): Board {
  return Board.fromRows(def.rows);
}

/** Exposed for tests. */
export const _internals = { SHAPES, COLS };
