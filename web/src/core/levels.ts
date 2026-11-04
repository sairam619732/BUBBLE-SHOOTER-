import { Board } from './board';
import { BOARD_W, COLS, EMPTY, STONE, WALL, isColor } from './constants';
import { LEVEL_CALIB } from './levelCalib';
import { Rng } from './rng';

export const LEVEL_COUNT = 200;
export const LEVELS_PER_WORLD = 20;
export const WORLDS = [
  'Candy Meadow',
  'Coral Reef',
  'Starlight',
  'Lava Peaks',
  'Frost Valley',
  'Jungle Ruins',
  'Desert Mirage',
  'Neon City',
  'Crystal Caves',
  'Cosmic Core',
] as const;

/** First level that has ceiling drops. */
export const FIRST_PRESS_LEVEL = 61;

export interface LevelDef {
  id: number;
  world: number;
  rows: string[];
  palette: number[];
  shots: number;
  /** Score needed for 2 and 3 stars (1 star = clearing the level). */
  stars: [number, number];
  /** Ceiling drops one row every `press` shots (0 = never). */
  press: number;
}

/** Shape mask: (row, col, x 0..1, height, variation 0..1) -> filled? */
type Shape = (r: number, c: number, x: number, h: number, v: number) => boolean;
type Scheme =
  | 'clusters'
  | 'bands'
  | 'stripes'
  | 'mirror'
  | 'rings'
  | 'diagonal'
  | 'checker'
  | 'columns'
  | 'gradient'
  | 'confetti'
  | 'twin';

const frac = (n: number) => n - Math.floor(n);

const SHAPES: Record<string, Shape> = {
  // ---- worlds 1-3
  block: (r, c, _x, h) => h <= 5 || r === 0 || (r * 3 + c * 7) % 11 !== 0,
  funnel: (r, _c, x, h) => Math.abs(x - 0.5) <= 0.52 - (r / h) * 0.32,
  tower: (r, _c, x, h) => Math.abs(x - 0.5) <= 0.16 + (r / h) * 0.36,
  diamond: (r, _c, x, h) => Math.abs(x - 0.5) / 0.52 + Math.abs(r - (h - 1) / 2) / (h / 2 + 0.5) <= 1.05 || r === 0,
  curtains: (r, _c, x) => r === 0 || Math.floor(x * 5) % 2 === 0,
  lattice: (r, c) => r === 0 || (r + c) % 3 !== 0,
  vee: (r, _c, x, h) => r === 0 || Math.abs(Math.abs(x - 0.5) - (0.42 - (r / h) * 0.38)) < 0.13,
  chandelier: (r, _c, x, h) => {
    if (r === 0) return true;
    for (const a of [0.18, 0.5, 0.82]) {
      const d = Math.abs(x - a);
      if (r < h * 0.45 ? d < 0.05 : d < 0.08 + (r / h) * 0.07) return true;
    }
    return false;
  },
  hourglass: (r, _c, x, h) => Math.abs(x - 0.5) <= 0.1 + (Math.abs(r - (h - 1) / 2) / h) * 0.85,
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
  // ---- added for worlds 4-10 (each uses the variation `v`)
  arch: (r, _c, x, h, v) => r === 0 || Math.abs(x - 0.5) > 0.3 - v * 0.12 || r >= h - 2,
  crown: (r, _c, x, h, v) => {
    if (r <= 1) return true;
    for (let k = 0; k < 5; k++) {
      const len = h * (0.45 + 0.55 * frac(k * 0.37 + v));
      if (Math.abs(x - (0.1 + 0.2 * k)) < 0.075 && r < len) return true;
    }
    return false;
  },
  checker: (r, _c, x, _h, v) => r === 0 || (Math.floor(r / 2) + Math.floor(x * 5 + v)) % 2 === 0,
  pillars: (r, _c, x, _h, v) => {
    if (r === 0) return true;
    const n = 3 + Math.floor(v * 2);
    for (let k = 0; k < n; k++) if (Math.abs(x - (k + 0.5) / n) < 0.06 + v * 0.04) return true;
    return false;
  },
  cross: (r, _c, x, h, v) => r === 0 || Math.abs(x - 0.5) < 0.1 + v * 0.05 || Math.abs(r - h * (0.35 + v * 0.2)) < 1.1,
  stairs: (r, _c, x, h, v) => {
    const xx = v < 0.5 ? x : 1 - x;
    return r === 0 || xx < 0.15 + ((r + 1) / h) * 0.75;
  },
  waves: (r, _c, x, h, v) => r === 0 || r < h * (0.5 + 0.45 * Math.sin(x * Math.PI * 2 * (1.2 + v) + v * 6)),
  web: (r, _c, x, h, v) => {
    if (r === 0 || r === h - 1 || r === Math.floor(h / 2)) return true;
    const ang = Math.atan2(r + 1, (x - 0.5) * h * 1.7);
    return Math.abs(frac(ang / (Math.PI / 7) + v) - 0.5) > 0.3;
  },
  islands: (r, _c, x, h, v) => {
    if (r === 0) return true;
    const cs = [0.2, 0.5, 0.8];
    for (let k = 0; k < cs.length; k++) {
      const top = h * (0.3 + 0.25 * frac(v + k * 0.41));
      if (r < top) {
        if (Math.abs(x - cs[k]) < 0.05) return true;
      } else if (Math.hypot((x - cs[k]) * 7, (r - (top + h - 1) / 2) / 1.6) < 1.15) return true;
    }
    return false;
  },
  smile: (r, _c, x, h) => {
    if (r === 0) return true;
    const cy = (h - 1) / 2;
    const d = Math.hypot((x - 0.5) * 2.1, (r - cy) / (h / 2));
    if (d > 1.05) return false;
    const eye = (ex: number) => Math.abs(x - ex) < 0.07 && Math.abs(r - h * 0.32) < 0.8;
    const mouth = r >= Math.round(h * 0.66) && r <= Math.round(h * 0.66) && Math.abs(x - 0.5) < 0.22;
    return !(eye(0.34) || eye(0.66) || mouth);
  },
  star: (r, _c, x, h, v) => {
    if (r === 0) return true;
    const dx = (x - 0.5) * 2;
    const dy = (r - (h - 1) / 2) / (h / 2);
    const th = Math.atan2(dy, dx) + Math.PI / 2 + v * 0.3;
    return Math.hypot(dx, dy) < 0.5 + 0.42 * Math.max(0, Math.cos(5 * th));
  },
  droplets: (r, _c, x, h, v) => {
    if (r === 0) return true;
    for (let k = 0; k < 4; k++) {
      const cx = 0.14 + 0.24 * k;
      const end = h * (0.55 + 0.45 * frac(v + k * 0.29));
      if (r < end - 2) {
        if (Math.abs(x - cx) < 0.05) return true;
      } else if (r < end && Math.abs(x - cx) < 0.11) return true;
    }
    return false;
  },
  ladder: (r, _c, x, _h, v) => r === 0 || Math.abs(x - 0.18) < 0.07 || Math.abs(x - 0.82) < 0.07 || (r % 2 === (v < 0.5 ? 1 : 0) && Math.abs(x - 0.5) < 0.33),
  butterfly: (r, _c, x, h) => {
    if (r === 0 || Math.abs(x - 0.5) < 0.04) return true;
    const ex = Math.abs(x - 0.5) - 0.24;
    return Math.hypot(ex / 0.22, (r - h * 0.42) / (h * 0.5)) < 1;
  },
  frame: (r, _c, x, h) => r === 0 || r === h - 1 || x < 0.12 || x > 0.88 || (Math.abs(x - 0.5) < 0.13 && Math.abs(r - h / 2) < 1.6),
  stalactites: (r, _c, x, h, v) => r === 0 || r < h * (1 - 1.8 * Math.abs(frac(x * 3 + v) - 0.5)),
  shelves: (r, _c, x, _h, v) => r === 0 || x < 0.13 || x > 0.87 || r % 3 !== Math.floor(v * 3) % 3,
};

const OLD_SHAPES = [
  'block', 'funnel', 'chandelier', 'curtains', 'diamond', 'tower', 'lattice', 'bridges', 'vee', 'heart',
  'hourglass', 'zigzag', 'wings', 'rings',
];
const OLD_SCHEMES: Scheme[] = ['clusters', 'bands', 'mirror', 'stripes', 'clusters', 'rings', 'diagonal', 'mirror'];
const ALL_SHAPES = Object.keys(SHAPES);
const ALL_SCHEMES: Scheme[] = ['clusters', 'bands', 'stripes', 'mirror', 'rings', 'diagonal', 'checker', 'columns', 'gradient', 'confetti', 'twin'];

/** Hand-picked layouts for world openers and finales. */
const SPECIAL: Record<number, [string, Scheme]> = {
  1: ['block', 'bands'],
  2: ['funnel', 'bands'],
  3: ['chandelier', 'bands'],
  20: ['heart', 'mirror'],
  40: ['rings', 'rings'],
  60: ['heart', 'rings'],
  61: ['arch', 'clusters'],
  80: ['star', 'rings'],
  89: ['pillars', 'gradient'],
  100: ['smile', 'twin'],
  120: ['butterfly', 'mirror'],
  140: ['crown', 'bands'],
  160: ['web', 'rings'],
  180: ['frame', 'checker'],
  200: ['heart', 'twin'],
};

function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = items.slice();
  const rng = new Rng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Colors used by a level, chosen so neighbouring levels look different. */
function paletteFor(id: number, n: number): number[] {
  return shuffled([1, 2, 3, 4, 5, 6], id * 7919 + 13)
    .slice(0, n)
    .sort((a, b) => a - b);
}

export function levelParams(id: number) {
  const world = Math.floor((id - 1) / LEVELS_PER_WORLD);
  const variation = new Rng(id * 2654435761).next();
  if (id < FIRST_PRESS_LEVEL) {
    // Worlds 1-3 (unchanged since the first release).
    const nColors = id <= 4 ? 3 : id <= 16 ? 4 : id <= 44 ? 5 : id % 4 === 0 && id < 60 ? 6 : 5;
    const height = Math.min(8, 4 + Math.floor((id + 2) / 8));
    const stones = id < 12 ? 0 : Math.min(9, Math.floor((id - 6) / 6));
    const shape = SPECIAL[id]?.[0] ?? OLD_SHAPES[(id * 5) % OLD_SHAPES.length];
    const scheme: Scheme = SPECIAL[id]?.[1] ?? OLD_SCHEMES[(id * 3) % OLD_SCHEMES.length];
    return { world, nColors, height, stones, shape, scheme, press: 0, variation };
  }
  // Worlds 4-10: every world uses 20 different shapes in its own order.
  const k = (id - 1) % LEVELS_PER_WORLD;
  const shape = SPECIAL[id]?.[0] ?? shuffled(ALL_SHAPES, 1000 + world)[k];
  const scheme: Scheme = SPECIAL[id]?.[1] ?? shuffled(ALL_SCHEMES, 2000 + world)[k % ALL_SCHEMES.length];
  const nColors = id % 3 === 0 ? 6 : 5;
  // A breather without ceiling drops every 4th level; drops get more frequent per world.
  const press = id % 4 === 1 ? 0 : [10, 9, 9, 8, 8, 7, 7][world - 3] ?? 7;
  const height = press ? 7 : 8;
  const stones = 3 + ((id * 7) % 7) + (world >= 7 ? 1 : 0);
  return { world, nColors, height, stones, shape, scheme, press, variation };
}

/** Deterministically builds the starting board for a level. */
export function buildLevelBoard(id: number): { board: Board; palette: number[] } {
  const p = levelParams(id);
  const palette = paletteFor(id, p.nColors);
  const rng = new Rng(id * 104729 + 7);
  const shape = SHAPES[p.shape];
  const b = new Board();
  const h = p.height;
  const n = palette.length;

  // Mask
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < b.rowLen(r); c++) {
      const x = b.cellX(r, c) / BOARD_W;
      if (shape(r, c, x, h, p.variation)) b.set(r, c, 1);
    }
  }
  // Colors
  const mirrorOf = (r: number, c: number) => b.rowLen(r) - 1 - c;
  const noisy = (v: number, chance: number) => (rng.chance(chance) ? rng.pick(palette) : v);
  for (let r = 0; r < h; r++) {
    const len = b.rowLen(r);
    for (let c = 0; c < len; c++) {
      if (b.get(r, c) === EMPTY) continue;
      const x = b.cellX(r, c) / BOARD_W;
      let v: number;
      switch (p.scheme) {
        case 'bands':
          v = noisy(palette[Math.floor(r / 2) % n], 0.12);
          break;
        case 'stripes':
          v = noisy(palette[Math.floor(x * n * 1.5) % n], 0.15);
          break;
        case 'rings': {
          const d = Math.hypot((x - 0.5) * 2, (r - (h - 1) / 2) / (h / 2));
          v = noisy(palette[Math.floor(d * 3.2) % n], 0.12);
          break;
        }
        case 'diagonal':
          v = noisy(palette[Math.floor((r + x * 10) / 2.2) % n], 0.12);
          break;
        case 'checker':
          v = noisy(palette[(Math.floor(r / 2) + Math.floor(x * 5)) % n], 0.1);
          break;
        case 'columns':
          v = noisy(palette[Math.floor(x * n) % n], 0.14);
          break;
        case 'gradient':
          v = noisy(palette[Math.floor(r * 0.7 + x * 3.5) % n], 0.14);
          break;
        case 'confetti':
          v = rng.pick(palette);
          break;
        case 'twin':
          if (c > mirrorOf(r, c)) {
            const left = b.get(r, mirrorOf(r, c));
            v = isColor(left) ? palette[(palette.indexOf(left) + 1) % n] : rng.pick(palette);
            break;
          }
          v = clustered(b, r, c, palette, rng);
          break;
        case 'mirror':
          if (c > mirrorOf(r, c)) {
            v = b.get(r, mirrorOf(r, c));
            break;
          }
          v = clustered(b, r, c, palette, rng);
          break;
        case 'clusters':
        default:
          v = clustered(b, r, c, palette, rng);
      }
      b.set(r, c, v);
    }
  }
  // Stones (never in the top row so the layout stays anchored by colors)
  const symmetric = p.scheme === 'mirror' || p.scheme === 'twin';
  let placed = 0;
  for (let tries = 0; placed < p.stones && tries < 400; tries++) {
    const r = 1 + rng.int(Math.max(1, h - 1));
    const c = rng.int(b.rowLen(r));
    if (!isColor(b.get(r, c))) continue;
    b.set(r, c, STONE);
    placed++;
    if (symmetric && placed < p.stones) {
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

/** Random color that tends to copy its left/upper neighbour, making clusters. */
function clustered(b: Board, r: number, c: number, palette: number[], rng: Rng): number {
  let v = rng.pick(palette);
  if (c > 0 && isColor(b.get(r, c - 1)) && rng.chance(0.45)) v = b.get(r, c - 1);
  else if (r > 0 && rng.chance(0.35)) {
    const up = b.get(r - 1, Math.min(c, b.rowLen(r - 1) - 1));
    if (isColor(up)) v = up;
  }
  return v;
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
      s += v === EMPTY ? '.' : v === STONE ? 'x' : v === WALL ? 'w' : String(v);
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
  const p = levelParams(id);
  const colored = board.countColored();
  const calib = LEVEL_CALIB[id];
  const shots = calib ? calib[0] : Math.ceil(colored / 2.2) + 6;
  const stars: [number, number] = calib ? [calib[1], calib[2]] : [colored * 14, colored * 20];
  const def: LevelDef = {
    id,
    world: p.world,
    rows: boardToRows(board),
    palette,
    shots,
    stars,
    press: p.press,
  };
  cache.set(id, def);
  return def;
}

export function levelBoard(def: LevelDef): Board {
  return Board.fromRows(def.rows);
}

/** Exposed for tests. */
export const _internals = { SHAPES, ALL_SCHEMES };
