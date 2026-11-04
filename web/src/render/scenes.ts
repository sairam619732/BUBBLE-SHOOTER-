// Illustrated backdrops, generated as SVG for the exact screen size.
// Flat shapes with soft shading, so the outlined game pieces stay in front.

export type ThemeName =
  | 'menu'
  | 'meadow'
  | 'reef'
  | 'starlight'
  | 'lava'
  | 'frost'
  | 'jungle'
  | 'desert'
  | 'neon'
  | 'crystal'
  | 'cosmic'
  | 'arcade'
  | 'versus';

export const WORLD_THEMES: ThemeName[] = ['meadow', 'reef', 'starlight', 'lava', 'frost', 'jungle', 'desert', 'neon', 'crystal', 'cosmic'];

export interface ThemeInfo {
  /** Map node / accent gradient: light, mid, dark. */
  accent: [string, string, string];
  /** Ribbon color class. */
  ribbon: string;
  /** Map background top/bottom. */
  map: [string, string];
}

export const THEME_INFO: Record<ThemeName, ThemeInfo> = {
  menu: { accent: ['#7bdcff', '#2a8cff', '#0c4fb3'], ribbon: 'c-blue', map: ['#2aa8f0', '#0b5aa8'] },
  meadow: { accent: ['#ff9fd0', '#f0398f', '#991257'], ribbon: 'c-pink', map: ['#8fe06a', '#4fb043'] },
  reef: { accent: ['#ffb38a', '#ff6b4a', '#a8321a'], ribbon: 'c-orange', map: ['#20b8d8', '#0a6aa8'] },
  starlight: { accent: ['#caa8ff', '#8656f5', '#4a23ad'], ribbon: 'c-purple', map: ['#2b1a6e', '#4b2590'] },
  lava: { accent: ['#ffd257', '#ff8a1a', '#b04a00'], ribbon: 'c-orange', map: ['#5a1414', '#2a080c'] },
  frost: { accent: ['#7bdcff', '#2a8cff', '#0c4fb3'], ribbon: 'c-blue', map: ['#cfeaff', '#93c9f0'] },
  jungle: { accent: ['#b4f25e', '#3dbf3d', '#1b7a29'], ribbon: 'c-lime', map: ['#2f9a55', '#14603a'] },
  desert: { accent: ['#ffd257', '#f0a020', '#a86200'], ribbon: 'c-gold', map: ['#f7c77a', '#e09a48'] },
  neon: { accent: ['#ff9ff0', '#e23de0', '#851384'], ribbon: 'c-pink', map: ['#1d0b45', '#0b0424'] },
  crystal: { accent: ['#7ef2dc', '#12b8a2', '#06725f'], ribbon: 'c-teal', map: ['#0d3350', '#071a2e'] },
  cosmic: { accent: ['#caa8ff', '#7a4cf0', '#3f1aa0'], ribbon: 'c-purple', map: ['#1a0838', '#050314'] },
  arcade: { accent: ['#ffd257', '#ff8a1a', '#b04a00'], ribbon: 'c-orange', map: ['#3a1070', '#1b0b4d'] },
  versus: { accent: ['#ff9fd0', '#f0398f', '#991257'], ribbon: 'c-pink', map: ['#1b2f7a', '#0d1b4a'] },
};

export function worldTheme(world: number): ThemeName {
  return WORLD_THEMES[world] ?? 'meadow';
}

// ---------------------------------------------------------------- helpers

type Rnd = () => number;

function rng(seed: number): Rnd {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n: number) => (Math.round(n * 10) / 10).toString();

function lin(id: string, stops: [number, string, number?][], vertical = true): string {
  const s = stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ''}/>`).join('');
  return `<linearGradient id="${id}" x1="0" y1="0" x2="${vertical ? 0 : 1}" y2="${vertical ? 1 : 0}">${s}</linearGradient>`;
}

function rad(id: string, stops: [number, string, number?][], cx = 0.5, cy = 0.5, r = 0.5): string {
  const s = stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ''}/>`).join('');
  return `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${s}</radialGradient>`;
}

/** Smooth hill line across the width, closed to the bottom. */
function hill(w: number, h: number, y: number, amp: number, freq: number, phase: number, fill: string, extra = ''): string {
  const n = 28;
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * w;
    const k = i / n;
    pts.push([x, y + Math.sin(k * Math.PI * 2 * freq + phase) * amp + Math.sin(k * Math.PI * 2 * freq * 2.3 + phase * 1.7) * amp * 0.35]);
  }
  let d = `M${f(-4)} ${f(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    d += `Q${f(x0)} ${f(y0)} ${f((x0 + x1) / 2)} ${f((y0 + y1) / 2)}`;
  }
  d += `L${f(w + 4)} ${f(pts[n][1])}L${f(w + 4)} ${f(h + 4)}L-4 ${f(h + 4)}Z`;
  return `<path d="${d}" fill="${fill}" ${extra}/>`;
}

/** Jagged mountain range closed to the bottom. Returns path data. */
function ridge(w: number, h: number, y: number, peakH: number, count: number, r: Rnd): { d: string; peaks: [number, number][] } {
  const peaks: [number, number][] = [];
  let d = `M-10 ${f(y)}`;
  const step = (w + 20) / count;
  for (let i = 0; i < count; i++) {
    const px = -10 + step * (i + 0.5) + (r() - 0.5) * step * 0.4;
    const py = y - peakH * (0.55 + r() * 0.45);
    const vx = -10 + step * (i + 1);
    const vy = y - peakH * (0.08 + r() * 0.2);
    peaks.push([px, py]);
    d += `L${f(px)} ${f(py)}L${f(vx)} ${f(vy)}`;
  }
  d += `L${f(w + 10)} ${f(h + 10)}L-10 ${f(h + 10)}Z`;
  return { d, peaks };
}

function cloud(x: number, y: number, s: number, fill: string, shade: string): string {
  const c = (dx: number, dy: number, r: number, col: string) => `<circle cx="${f(x + dx * s)}" cy="${f(y + dy * s)}" r="${f(r * s)}" fill="${col}"/>`;
  return (
    `<g>` +
    c(-26, 6, 18, shade) +
    c(0, 2, 24, shade) +
    c(26, 7, 17, shade) +
    `<rect x="${f(x - 40 * s)}" y="${f(y + 4 * s)}" width="${f(80 * s)}" height="${f(20 * s)}" rx="${f(10 * s)}" fill="${shade}"/>` +
    c(-24, 0, 17, fill) +
    c(0, -6, 23, fill) +
    c(25, 1, 16, fill) +
    `<rect x="${f(x - 40 * s)}" y="${f(y - 2 * s)}" width="${f(80 * s)}" height="${f(18 * s)}" rx="${f(9 * s)}" fill="${fill}"/>` +
    `</g>`
  );
}

function stars(w: number, h: number, n: number, r: Rnd, maxY = 1, color = '#fff'): string {
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = r() * w;
    const y = r() * h * maxY;
    const rr = 0.6 + r() * 1.6;
    s += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(rr)}" fill="${color}" fill-opacity="${f(0.35 + r() * 0.6)}"/>`;
  }
  return s;
}

function sparkle(x: number, y: number, s: number, fill: string, op = 1): string {
  return `<path d="M${f(x)} ${f(y - s)}C${f(x + s * 0.12)} ${f(y - s * 0.25)} ${f(x + s * 0.25)} ${f(y - s * 0.12)} ${f(x + s)} ${f(y)}C${f(x + s * 0.25)} ${f(y + s * 0.12)} ${f(x + s * 0.12)} ${f(y + s * 0.25)} ${f(x)} ${f(y + s)}C${f(x - s * 0.12)} ${f(y + s * 0.25)} ${f(x - s * 0.25)} ${f(y + s * 0.12)} ${f(x - s)} ${f(y)}C${f(x - s * 0.25)} ${f(y - s * 0.12)} ${f(x - s * 0.12)} ${f(y - s * 0.25)} ${f(x)} ${f(y - s)}Z" fill="${fill}" fill-opacity="${op}"/>`;
}

function lollipop(x: number, y: number, s: number, c1: string, c2: string): string {
  const top = y - 46 * s;
  return (
    `<rect x="${f(x - 2.4 * s)}" y="${f(top)}" width="${f(4.8 * s)}" height="${f(46 * s)}" rx="${f(2.4 * s)}" fill="#fff4f8"/>` +
    `<circle cx="${f(x)}" cy="${f(top)}" r="${f(17 * s)}" fill="${c1}"/>` +
    `<circle cx="${f(x)}" cy="${f(top)}" r="${f(12 * s)}" fill="${c2}"/>` +
    `<circle cx="${f(x)}" cy="${f(top)}" r="${f(7.5 * s)}" fill="${c1}"/>` +
    `<circle cx="${f(x)}" cy="${f(top)}" r="${f(3.4 * s)}" fill="${c2}"/>` +
    `<ellipse cx="${f(x - 6 * s)}" cy="${f(top - 7 * s)}" rx="${f(5 * s)}" ry="${f(2.6 * s)}" fill="#fff" fill-opacity=".7" transform="rotate(-30 ${f(x - 6 * s)} ${f(top - 7 * s)})"/>`
  );
}

function bush(x: number, y: number, s: number, fill: string, light: string): string {
  return `<circle cx="${f(x - 12 * s)}" cy="${f(y - 8 * s)}" r="${f(12 * s)}" fill="${fill}"/><circle cx="${f(x + 10 * s)}" cy="${f(y - 9 * s)}" r="${f(13 * s)}" fill="${fill}"/><circle cx="${f(x)}" cy="${f(y - 16 * s)}" r="${f(14 * s)}" fill="${fill}"/><circle cx="${f(x - 4 * s)}" cy="${f(y - 21 * s)}" r="${f(6 * s)}" fill="${light}"/>`;
}

function flower(x: number, y: number, s: number, petal: string): string {
  let p = '';
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    p += `<circle cx="${f(x + Math.cos(a) * 4 * s)}" cy="${f(y + Math.sin(a) * 4 * s)}" r="${f(3.4 * s)}" fill="${petal}"/>`;
  }
  return p + `<circle cx="${f(x)}" cy="${f(y)}" r="${f(2.6 * s)}" fill="#ffd43b"/>`;
}

function coral(x: number, y: number, s: number, color: string, r: Rnd): string {
  let d = '';
  const branch = (bx: number, by: number, ang: number, len: number, depth: number) => {
    const ex = bx + Math.cos(ang) * len;
    const ey = by + Math.sin(ang) * len;
    d += `M${f(bx)} ${f(by)}Q${f(bx + Math.cos(ang + 0.3) * len * 0.5)} ${f(by + Math.sin(ang + 0.3) * len * 0.5)} ${f(ex)} ${f(ey)}`;
    if (depth > 0) {
      branch(ex, ey, ang - 0.45 - r() * 0.3, len * 0.72, depth - 1);
      branch(ex, ey, ang + 0.45 + r() * 0.3, len * 0.72, depth - 1);
    }
  };
  branch(x, y, -Math.PI / 2, 34 * s, 3);
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${f(8 * s)}" stroke-linecap="round"/>`;
}

function seaweed(x: number, y: number, s: number, color: string, hgt: number): string {
  let d = `M${f(x)} ${f(y)}`;
  const seg = 5;
  for (let i = 1; i <= seg; i++) {
    const yy = y - (hgt * s * i) / seg;
    const xx = x + (i % 2 ? 10 : -10) * s;
    d += `Q${f(xx)} ${f(yy + (hgt * s) / seg / 2)} ${f(x)} ${f(yy)}`;
  }
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${f(7 * s)}" stroke-linecap="round"/>`;
}

function pine(x: number, y: number, s: number, fill: string, snow: string | null): string {
  let g = `<rect x="${f(x - 3 * s)}" y="${f(y - 10 * s)}" width="${f(6 * s)}" height="${f(10 * s)}" fill="#5b3a2a"/>`;
  for (let k = 0; k < 3; k++) {
    const by = y - 8 * s - k * 15 * s;
    const hw = (24 - k * 6) * s;
    g += `<path d="M${f(x - hw)} ${f(by)}L${f(x)} ${f(by - 26 * s)}L${f(x + hw)} ${f(by)}Z" fill="${fill}"/>`;
    if (snow) g += `<path d="M${f(x - hw * 0.42)} ${f(by - 15 * s)}L${f(x)} ${f(by - 26 * s)}L${f(x + hw * 0.42)} ${f(by - 15 * s)}Q${f(x)} ${f(by - 12 * s)} ${f(x - hw * 0.42)} ${f(by - 15 * s)}Z" fill="${snow}"/>`;
  }
  return g;
}

function cactus(x: number, y: number, s: number, fill: string, light: string): string {
  const w = 14 * s;
  const hgt = 70 * s;
  return (
    `<rect x="${f(x - w / 2)}" y="${f(y - hgt)}" width="${f(w)}" height="${f(hgt)}" rx="${f(w / 2)}" fill="${fill}"/>` +
    `<path d="M${f(x - w / 2)} ${f(y - hgt * 0.45)}h${f(-12 * s)}a${f(6 * s)} ${f(6 * s)} 0 0 1 ${f(-6 * s)} ${f(-6 * s)}v${f(-16 * s)}" fill="none" stroke="${fill}" stroke-width="${f(11 * s)}" stroke-linecap="round"/>` +
    `<path d="M${f(x + w / 2)} ${f(y - hgt * 0.62)}h${f(11 * s)}a${f(6 * s)} ${f(6 * s)} 0 0 0 ${f(6 * s)} ${f(-6 * s)}v${f(-12 * s)}" fill="none" stroke="${fill}" stroke-width="${f(11 * s)}" stroke-linecap="round"/>` +
    `<path d="M${f(x - 2 * s)} ${f(y - hgt + 8 * s)}V${f(y - 6 * s)}" stroke="${light}" stroke-width="${f(2.4 * s)}" stroke-linecap="round"/>`
  );
}

function crystal(x: number, y: number, s: number, c1: string, c2: string, ang: number, hgt: number): string {
  const w = 16 * s;
  const ht = hgt * s;
  const body = `M${f(-w / 2)} 0V${f(-ht + w * 0.6)}L0 ${f(-ht)}L${f(w / 2)} ${f(-ht + w * 0.6)}V0Z`;
  const face = `M0 0V${f(-ht)}L${f(w / 2)} ${f(-ht + w * 0.6)}V0Z`;
  return `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(ang)})"><path d="${body}" fill="${c1}"/><path d="${face}" fill="${c2}"/><path d="M${f(-w * 0.22)} ${f(-ht * 0.2)}V${f(-ht * 0.75)}" stroke="#fff" stroke-opacity=".7" stroke-width="${f(2.4 * s)}" stroke-linecap="round"/></g>`;
}

function leaf(x: number, y: number, s: number, ang: number, fill: string, vein: string): string {
  const L = 70 * s;
  return `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(ang)})"><path d="M0 0C${f(L * 0.25)} ${f(-L * 0.32)} ${f(L * 0.78)} ${f(-L * 0.3)} ${f(L)} 0C${f(L * 0.78)} ${f(L * 0.3)} ${f(L * 0.25)} ${f(L * 0.32)} 0 0Z" fill="${fill}"/><path d="M${f(L * 0.06)} 0L${f(L * 0.92)} 0" stroke="${vein}" stroke-width="${f(2.4 * s)}" stroke-linecap="round"/></g>`;
}

function planet(x: number, y: number, r: number, id: string, c1: string, c2: string, ring: string | null): string {
  const g = `<radialGradient id="${id}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient>`;
  const back = ring ? `<path d="M${f(x - r * 1.8)} ${f(y)}A${f(r * 1.8)} ${f(r * 0.5)} 0 0 1 ${f(x + r * 1.8)} ${f(y)}" fill="none" stroke="${ring}" stroke-width="${f(r * 0.22)}" stroke-opacity=".8" transform="rotate(-18 ${f(x)} ${f(y)})"/>` : '';
  const front = ring ? `<path d="M${f(x - r * 1.8)} ${f(y)}A${f(r * 1.8)} ${f(r * 0.5)} 0 0 0 ${f(x + r * 1.8)} ${f(y)}" fill="none" stroke="${ring}" stroke-width="${f(r * 0.22)}" transform="rotate(-18 ${f(x)} ${f(y)})"/>` : '';
  return `<defs>${g}</defs>${back}<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="url(#${id})"/><ellipse cx="${f(x - r * 0.35)}" cy="${f(y - r * 0.4)}" rx="${f(r * 0.35)}" ry="${f(r * 0.18)}" fill="#fff" fill-opacity=".35" transform="rotate(-30 ${f(x - r * 0.35)} ${f(y - r * 0.4)})"/>${front}`;
}

function lightRays(w: number, h: number, n: number, r: Rnd, color: string, op: number): string {
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = w * (0.08 + (i / n) * 0.9 + (r() - 0.5) * 0.08);
    const spread = w * (0.06 + r() * 0.08);
    s += `<path d="M${f(x - spread * 0.3)} -10L${f(x + spread * 0.3)} -10L${f(x + spread * 2.4)} ${f(h * 0.85)}L${f(x + spread * 0.6)} ${f(h * 0.85)}Z" fill="${color}" fill-opacity="${op}"/>`;
  }
  return s;
}

// ---------------------------------------------------------------- scenes

type Painter = (w: number, h: number, u: number, r: Rnd) => { defs: string; body: string };

const PAINTERS: Record<ThemeName, Painter> = {
  menu: (w, h, u, r) => {
    let body = `<rect width="${w}" height="${h}" fill="url(#g-sky)"/>`;
    for (let i = 0; i < 14; i++) body += sparkle(r() * w, r() * h * 0.7, (3 + r() * 6) * u, '#fff', 0.35 + r() * 0.4);
    body += hill(w, h, h * 0.9, 10 * u, 1.3, 1, '#3b9be8', 'fill-opacity=".55"');
    for (let i = 0; i < 6; i++) body += cloud(w * (i / 5) + (r() - 0.5) * 40 * u, h * (0.92 + r() * 0.04), (1.3 + r() * 0.6) * u, '#f4fbff', '#bfe3fb');
    return {
      defs: `<radialGradient id="g-sky" cx=".5" cy=".3" r=".85"><stop offset="0" stop-color="#7ae9ff"/><stop offset=".45" stop-color="#22a9ec"/><stop offset="1" stop-color="#0b4f9c"/></radialGradient>`,
      body,
    };
  },

  meadow: (w, h, u, r) => {
    let body = `<rect width="${w}" height="${h}" fill="url(#g-sky)"/>`;
    body += `<circle cx="${f(w * 0.82)}" cy="${f(h * 0.12)}" r="${f(70 * u)}" fill="url(#g-sun)"/><circle cx="${f(w * 0.82)}" cy="${f(h * 0.12)}" r="${f(30 * u)}" fill="#fff8c9"/>`;
    for (let i = 0; i < 4; i++) body += cloud(w * (0.12 + i * 0.27) + (r() - 0.5) * 30 * u, h * (0.1 + r() * 0.22), (0.8 + r() * 0.5) * u, '#ffffff', '#d6efff');
    body += hill(w, h, h * 0.62, 24 * u, 1.2, 0.4, '#b5ea84');
    for (let i = 0; i < 4; i++) body += lollipop(w * (0.1 + i * 0.27 + r() * 0.05), h * (0.645 + r() * 0.02), (0.75 + r() * 0.3) * u, ['#ff6fa8', '#ffb347', '#a55eea', '#22d3ee'][i], '#fff');
    body += hill(w, h, h * 0.72, 20 * u, 1.6, 2.1, '#86d65c');
    for (let i = 0; i < 6; i++) body += bush(w * (r() * 1), h * (0.74 + r() * 0.03), (0.8 + r() * 0.5) * u, '#5fbf47', '#8ee06d');
    body += hill(w, h, h * 0.84, 16 * u, 1.1, 4, '#5cbf45');
    for (let i = 0; i < 18; i++) body += flower(r() * w, h * (0.87 + r() * 0.11), (0.8 + r() * 0.5) * u, ['#ff8fc0', '#fff', '#ffd1e6'][i % 3]);
    return {
      defs: lin('g-sky', [[0, '#58c8ff'], [0.7, '#bdeeff'], [1, '#e6fbff']]) + rad('g-sun', [[0, '#fff7c2', 0.9], [1, '#fff7c2', 0]]),
      body,
    };
  },

  reef: (w, h, u, r) => {
    let body = `<rect width="${w}" height="${h}" fill="url(#g-sky)"/>`;
    body += lightRays(w, h, 5, r, '#e6ffff', 0.1);
    body += hill(w, h, h * 0.7, 30 * u, 1.4, 1.2, '#0a6f99', 'fill-opacity=".7"');
    body += hill(w, h, h * 0.86, 12 * u, 1.2, 0.2, '#f3d48c');
    body += hill(w, h, h * 0.92, 10 * u, 1.8, 2.4, '#e8bf6c');
    const corals = ['#ff7a8a', '#ff9f43', '#ff5fa8', '#ffd166'];
    for (let i = 0; i < 7; i++) {
      const x = w * (i / 6) + (r() - 0.5) * 30 * u;
      if (i % 2) body += seaweed(x, h * 0.9, (0.9 + r() * 0.4) * u, '#2fbf71', 90 + r() * 60);
      else body += coral(x, h * (0.89 + r() * 0.03), (0.8 + r() * 0.5) * u, corals[(i / 2) % 4 | 0], r);
    }
    for (let i = 0; i < 3; i++) {
      const x = w * (0.2 + r() * 0.6);
      body += `<path d="${starShape(x, h * (0.95 + r() * 0.03), 8 * u, 3.4 * u)}" fill="#ff8a5c"/>`;
    }
    return { defs: lin('g-sky', [[0, '#3fe0f0'], [0.45, '#109dd0'], [1, '#064a8c']]), body };
  },

  starlight: (w, h, u, r) => {
    let body = `<rect width="${w}" height="${h}" fill="url(#g-sky)"/>`;
    body += stars(w, h, 110, r, 0.75);
    for (let i = 0; i < 8; i++) body += sparkle(r() * w, r() * h * 0.6, (3 + r() * 5) * u, '#fff', 0.8);
    const mx = w * 0.22;
    const my = h * 0.13;
    body += `<mask id="g-moon"><circle cx="${f(mx)}" cy="${f(my)}" r="${f(30 * u)}" fill="#fff"/><circle cx="${f(mx + 12 * u)}" cy="${f(my - 8 * u)}" r="${f(26 * u)}" fill="#000"/></mask>`;
    body += `<circle cx="${f(mx)}" cy="${f(my)}" r="${f(60 * u)}" fill="url(#g-glow)"/><circle cx="${f(mx)}" cy="${f(my)}" r="${f(30 * u)}" fill="#fff3c4" mask="url(#g-moon)"/>`;
    body += hill(w, h, h * 0.72, 26 * u, 1.1, 0.8, '#4a2a92');
    body += hill(w, h, h * 0.8, 18 * u, 1.7, 2.6, '#341c74');
    for (let i = 0; i < 5; i++) {
      const x = r() * w;
      const y = h * (0.8 + r() * 0.04);
      body += `<rect x="${f(x - 2.5 * u)}" y="${f(y - 30 * u)}" width="${f(5 * u)}" height="${f(30 * u)}" fill="#22114f"/><circle cx="${f(x)}" cy="${f(y - 36 * u)}" r="${f(16 * u)}" fill="#22114f"/>`;
    }
    body += hill(w, h, h * 0.9, 12 * u, 1.3, 4.2, '#22114f');
    return { defs: lin('g-sky', [[0, '#0f0a3f'], [0.55, '#3b1c7a'], [1, '#8a4cb0']]) + rad('g-glow', [[0, '#fff3c4', 0.45], [1, '#fff3c4', 0]]), body };
  },

  lava: (w, h, u, r) => {
    let body = `<rect width="${w}" height="${h}" fill="url(#g-sky)"/>`;
    for (let i = 0; i < 3; i++) {
      const cx = w * (0.15 + i * 0.36 + (r() - 0.5) * 0.1);
      const base = h * 0.92;
      const top = h * (0.4 + r() * 0.12);
      const hw = w * (0.22 + r() * 0.08);
      body += `<path d="M${f(cx - hw)} ${f(base)}L${f(cx - 16 * u)} ${f(top)}Q${f(cx)} ${f(top + 6 * u)} ${f(cx + 16 * u)} ${f(top)}L${f(cx + hw)} ${f(base)}Z" fill="#3a0d14"/>`;
      body += `<ellipse cx="${f(cx)}" cy="${f(top + 2 * u)}" rx="${f(18 * u)}" ry="${f(6 * u)}" fill="#ffb347"/>`;
      body += `<circle cx="${f(cx)}" cy="${f(top)}" r="${f(50 * u)}" fill="url(#g-glow)"/>`;
      body += `<path d="M${f(cx - 6 * u)} ${f(top + 4 * u)}q${f(-8 * u)} ${f(40 * u)} ${f(-26 * u)} ${f(90 * u)}M${f(cx + 6 * u)} ${f(top + 4 * u)}q${f(10 * u)} ${f(50 * u)} ${f(30 * u)} ${f(110 * u)}" fill="none" stroke="#ff7a1f" stroke-width="${f(5 * u)}" stroke-linecap="round"/>`;
    }
    const rr = ridge(w, h, h * 0.86, 60 * u, 6, r);
    body += `<path d="${rr.d}" fill="#24070c"/>`;
    for (let i = 0; i < 6; i++) {
      const x = r() * w;
      const y = h * (0.9 + r() * 0.08);
      body += `<path d="M${f(x)} ${f(y)}l${f(14 * u)} ${f(-6 * u)}l${f(10 * u)} ${f(8 * u)}l${f(16 * u)} ${f(-4 * u)}" fill="none" stroke="#ff6a1f" stroke-width="${f(2.6 * u)}" stroke-linecap="round" stroke-opacity=".85"/>`;
    }
    return { defs: lin('g-sky', [[0, '#2a0811'], [0.55, '#7a1810'], [1, '#f0641c']]) + rad('g-glow', [[0, '#ff9a3d', 0.5], [1, '#ff9a3d', 0]]), body };
  },

  frost: (w, h, u, r) => {
    let body = `<rect width="${w}" height="${h}" fill="url(#g-sky)"/>`;
    for (let i = 0; i < 3; i++) body += cloud(w * (0.15 + i * 0.34), h * (0.1 + r() * 0.12), (0.8 + r() * 0.4) * u, '#ffffff', '#dceffd');
    const far = ridge(w, h, h * 0.62, 150 * u, 4, r);
    body += `<path d="${far.d}" fill="#a9c9ea"/>`;
    for (const [px, py] of far.peaks) body += `<path d="M${f(px - 26 * u)} ${f(py + 34 * u)}L${f(px)} ${f(py)}L${f(px + 26 * u)} ${f(py + 34 * u)}L${f(px + 12 * u)} ${f(py + 26 * u)}L${f(px)} ${f(py + 36 * u)}L${f(px - 12 * u)} ${f(py + 26 * u)}Z" fill="#fff"/>`;
    const near = ridge(w, h, h * 0.74, 90 * u, 5, r);
    body += `<path d="${near.d}" fill="#cfe3f6"/>`;
    for (let i = 0; i < 7; i++) body += pine(w * (i / 6) + (r() - 0.5) * 24 * u, h * (0.8 + r() * 0.03), (0.8 + r() * 0.4) * u, '#2e7391', '#ffffff');
    body += hill(w, h, h * 0.84, 10 * u, 1.2, 1.1, '#f2f9ff');
    body += hill(w, h, h * 0.9, 8 * u, 1.7, 3.3, '#ffffff');
    return { defs: lin('g-sky', [[0, '#6cc0ff'], [0.7, '#cdeeff'], [1, '#eef9ff']]), body };
  },

  jungle: (w, h, u, r) => {
    let body = `<rect width="${w}" height="${h}" fill="url(#g-sky)"/>`;
    body += lightRays(w, h, 4, r, '#f6ffcf', 0.12);
    // temple
    const tx = w * 0.5;
    const ty = h * 0.74;
    for (let k = 0; k < 5; k++) {
      const hw = (110 - k * 18) * u;
      body += `<rect x="${f(tx - hw)}" y="${f(ty - (k + 1) * 26 * u)}" width="${f(hw * 2)}" height="${f(27 * u)}" fill="${k % 2 ? '#3f7d5a' : '#356f4e'}"/>`;
    }
    body += `<rect x="${f(tx - 14 * u)}" y="${f(ty - 40 * u)}" width="${f(28 * u)}" height="${f(40 * u)}" rx="${f(14 * u)}" fill="#1e4a33"/>`;
    body += hill(w, h, h * 0.76, 16 * u, 1.5, 0.6, '#2f8a4c');
    for (let i = 0; i < 8; i++) body += bush(r() * w, h * (0.8 + r() * 0.04), (1 + r() * 0.6) * u, '#237a40', '#3fa65a');
    body += hill(w, h, h * 0.88, 10 * u, 1.3, 2.2, '#1a6334');
    // framing leaves
    for (let i = 0; i < 5; i++) {
      body += leaf(-10 * u, h * (0.05 + i * 0.2), (1.2 + r() * 0.6) * u, -10 + r() * 50, '#167a3e', '#3fb062');
      body += leaf(w + 10 * u, h * (0.12 + i * 0.2), (1.2 + r() * 0.6) * u, 190 - r() * 50, '#13703a', '#3fb062');
    }
    for (let i = 0; i < 5; i++) {
      const x = w * (0.1 + i * 0.2);
      body += `<path d="M${f(x)} -5Q${f(x + 14 * u)} ${f(h * 0.08)} ${f(x)} ${f(h * (0.12 + r() * 0.1))}" fill="none" stroke="#1f7a3e" stroke-width="${f(3.4 * u)}" stroke-linecap="round"/>`;
    }
    return { defs: lin('g-sky', [[0, '#a6eb8a'], [0.5, '#46b066'], [1, '#155c36']]), body };
  },

  desert: (w, h, u, r) => {
    let body = `<rect width="${w}" height="${h}" fill="url(#g-sky)"/>`;
    body += `<circle cx="${f(w * 0.62)}" cy="${f(h * 0.5)}" r="${f(110 * u)}" fill="url(#g-sun)"/><circle cx="${f(w * 0.62)}" cy="${f(h * 0.5)}" r="${f(46 * u)}" fill="#fff4d1"/>`;
    for (let i = 0; i < 2; i++) {
      const px = w * (0.2 + i * 0.22);
      const base = h * 0.66;
      const hw = (54 + i * 18) * u;
      body += `<path d="M${f(px - hw)} ${f(base)}L${f(px)} ${f(base - hw * 0.9)}L${f(px + hw)} ${f(base)}Z" fill="#e8a560"/><path d="M${f(px)} ${f(base - hw * 0.9)}L${f(px + hw)} ${f(base)}L${f(px + hw * 0.1)} ${f(base)}Z" fill="#cf8445"/>`;
    }
    body += hill(w, h, h * 0.68, 14 * u, 1.1, 1.4, '#f7c071');
    body += hill(w, h, h * 0.78, 18 * u, 0.9, 3.1, '#efa957');
    for (let i = 0; i < 3; i++) body += cactus(w * (0.12 + i * 0.36 + r() * 0.08), h * (0.8 + r() * 0.02), (0.85 + r() * 0.35) * u, '#3c9a5c', '#62c27f');
    body += hill(w, h, h * 0.88, 12 * u, 1.4, 0.3, '#de9244');
    return { defs: lin('g-sky', [[0, '#ff9f5a'], [0.6, '#ffd59b'], [1, '#fff1cf']]) + rad('g-sun', [[0, '#fff4d1', 0.8], [1, '#fff4d1', 0]]), body };
  },

  neon: (w, h, u, r) => {
    let body = `<rect width="${w}" height="${h}" fill="url(#g-sky)"/>`;
    body += stars(w, h, 50, r, 0.45);
    body += `<ellipse cx="${f(w * 0.5)}" cy="${f(h * 0.7)}" rx="${f(w * 0.7)}" ry="${f(140 * u)}" fill="url(#g-glow)"/>`;
    const row = (baseY: number, minH: number, maxH: number, fill: string, lit: number) => {
      let x = -10;
      let s = '';
      while (x < w + 10) {
        const bw = (26 + r() * 34) * u;
        const bh = (minH + r() * (maxH - minH)) * u;
        s += `<rect x="${f(x)}" y="${f(baseY - bh)}" width="${f(bw)}" height="${f(bh + 4)}" fill="${fill}"/>`;
        for (let wy = baseY - bh + 8 * u; wy < baseY - 8 * u; wy += 11 * u) {
          for (let wx = x + 5 * u; wx < x + bw - 6 * u; wx += 9 * u) {
            if (r() < lit) s += `<rect x="${f(wx)}" y="${f(wy)}" width="${f(4 * u)}" height="${f(5 * u)}" fill="${r() < 0.5 ? '#ffe066' : '#5ce1ff'}" fill-opacity="${f(0.45 + r() * 0.5)}"/>`;
          }
        }
        if (r() < 0.4) s += `<rect x="${f(x + 3 * u)}" y="${f(baseY - bh - 3 * u)}" width="${f(bw - 6 * u)}" height="${f(3 * u)}" fill="${r() < 0.5 ? '#ff3df0' : '#3dfcff'}"/>`;
        x += bw + 2 * u;
      }
      return s;
    };
    body += row(h * 0.72, 90, 220, '#21104a', 0.18);
    body += row(h * 0.8, 50, 130, '#160a35', 0.28);
    body += `<rect x="0" y="${f(h * 0.8)}" width="${w}" height="${f(h * 0.2 + 4)}" fill="#120626"/>`;
    for (let i = -8; i <= 8; i++) body += `<path d="M${f(w / 2 + i * 14 * u)} ${f(h * 0.8)}L${f(w / 2 + i * 70 * u)} ${f(h + 4)}" stroke="#ff3df0" stroke-opacity=".55" stroke-width="${f(1.6 * u)}"/>`;
    for (let k = 0; k < 6; k++) {
      const y = h * 0.8 + Math.pow(k / 6, 1.8) * h * 0.2 + 4;
      body += `<path d="M0 ${f(y)}H${w}" stroke="#ff3df0" stroke-opacity=".5" stroke-width="${f(1.6 * u)}"/>`;
    }
    return { defs: lin('g-sky', [[0, '#090322'], [0.6, '#2c0b55'], [1, '#5c1477']]) + rad('g-glow', [[0, '#ff3df0', 0.35], [1, '#ff3df0', 0]]), body };
  },

  crystal: (w, h, u, r) => {
    let body = `<rect width="${w}" height="${h}" fill="url(#g-sky)"/>`;
    for (let i = 0; i < 4; i++) body += `<circle cx="${f(r() * w)}" cy="${f(h * (0.3 + r() * 0.5))}" r="${f((80 + r() * 60) * u)}" fill="url(#g-glow${i % 2})"/>`;
    // stalactites
    let st = '';
    for (let x = -10; x < w + 10; ) {
      const sw = (18 + r() * 26) * u;
      const sh = (30 + r() * 90) * u;
      st += `<path d="M${f(x)} -4L${f(x + sw / 2)} ${f(sh)}L${f(x + sw)} -4Z" fill="#0a1f3a"/>`;
      x += sw * 0.8;
    }
    body += st;
    body += hill(w, h, h * 0.82, 16 * u, 1.4, 1.5, '#081a31');
    const cols: [string, string][] = [
      ['#5ff3ff', '#22b5d6'],
      ['#c59bff', '#8655e8'],
      ['#ff8fe0', '#d0449f'],
    ];
    for (let i = 0; i < 6; i++) {
      const x = w * (i < 3 ? 0.02 + i * 0.1 : 0.78 + (i - 3) * 0.1) + (r() - 0.5) * 10 * u;
      const y = h * (0.86 + r() * 0.03);
      const [c1, c2] = cols[i % 3];
      body += `<circle cx="${f(x)}" cy="${f(y - 30 * u)}" r="${f(46 * u)}" fill="url(#g-glow${i % 2})"/>`;
      body += crystal(x - 12 * u, y, (0.9 + r() * 0.3) * u, c1, c2, -22, 60 + r() * 30);
      body += crystal(x + 12 * u, y, (0.9 + r() * 0.3) * u, c1, c2, 18, 50 + r() * 26);
      body += crystal(x, y + 2 * u, (1.1 + r() * 0.3) * u, c1, c2, 0, 80 + r() * 40);
    }
    body += hill(w, h, h * 0.93, 8 * u, 1.8, 3.3, '#050f20');
    return {
      defs: lin('g-sky', [[0, '#061226'], [0.5, '#0d3350'], [1, '#105a70']]) + rad('g-glow0', [[0, '#5ff3ff', 0.22], [1, '#5ff3ff', 0]]) + rad('g-glow1', [[0, '#c59bff', 0.22], [1, '#c59bff', 0]]),
      body,
    };
  },

  cosmic: (w, h, u, r) => {
    let body = `<rect width="${w}" height="${h}" fill="url(#g-sky)"/>`;
    body += `<ellipse cx="${f(w * 0.3)}" cy="${f(h * 0.35)}" rx="${f(w * 0.6)}" ry="${f(h * 0.18)}" fill="url(#g-neb1)" transform="rotate(-25 ${f(w * 0.3)} ${f(h * 0.35)})"/>`;
    body += `<ellipse cx="${f(w * 0.75)}" cy="${f(h * 0.7)}" rx="${f(w * 0.55)}" ry="${f(h * 0.16)}" fill="url(#g-neb2)" transform="rotate(20 ${f(w * 0.75)} ${f(h * 0.7)})"/>`;
    body += stars(w, h, 140, r, 1);
    for (let i = 0; i < 10; i++) body += sparkle(r() * w, r() * h, (3 + r() * 5) * u, '#fff', 0.85);
    body += planet(w * 0.8, h * 0.16, 44 * u, 'g-p1', '#ffb3e6', '#8a2be2', '#ffd8a8');
    body += planet(w * 0.14, h * 0.62, 26 * u, 'g-p2', '#9ff0ff', '#1d6fd6', null);
    body += planet(w * 0.62, h * 0.9, 70 * u, 'g-p3', '#ffcf8a', '#d04a2a', '#fff1c9');
    return {
      defs: lin('g-sky', [[0, '#04020f'], [0.5, '#170735'], [1, '#2e0b58']]) + rad('g-neb1', [[0, '#ff3d9a', 0.38], [1, '#ff3d9a', 0]]) + rad('g-neb2', [[0, '#3dd6ff', 0.3], [1, '#3dd6ff', 0]]),
      body,
    };
  },

  arcade: (w, h, u, r) => {
    let body = `<rect width="${w}" height="${h}" fill="url(#g-sky)"/>`;
    body += stars(w, h, 60, r, 0.4);
    const sx = w * 0.5;
    const sy = h * 0.6;
    const sr = Math.min(w * 0.42, 150 * u);
    let cut = '';
    for (let k = 0; k < 6; k++) {
      const y = sy + sr * (0.05 + k * 0.17);
      cut += `<rect x="${f(sx - sr - 2)}" y="${f(y)}" width="${f(sr * 2 + 4)}" height="${f(3 + k * 2.4)}" fill="#000"/>`;
    }
    body += `<defs><mask id="g-sunmask"><rect width="${w}" height="${h}" fill="#fff"/>${cut}</mask></defs><circle cx="${f(sx)}" cy="${f(sy)}" r="${f(sr)}" fill="url(#g-sun)" mask="url(#g-sunmask)"/>`;
    const far = ridge(w, h, h * 0.72, 120 * u, 5, r);
    body += `<path d="${far.d}" fill="#2a0f5c"/>`;
    body += `<path d="${far.d}" fill="none" stroke="#ff4fd8" stroke-width="${f(2 * u)}" stroke-opacity=".7"/>`;
    body += `<rect x="0" y="${f(h * 0.76)}" width="${w}" height="${f(h * 0.24 + 4)}" fill="#160838"/>`;
    for (let i = -9; i <= 9; i++) body += `<path d="M${f(w / 2 + i * 16 * u)} ${f(h * 0.76)}L${f(w / 2 + i * 80 * u)} ${f(h + 4)}" stroke="#ff4fd8" stroke-opacity=".6" stroke-width="${f(1.8 * u)}"/>`;
    for (let k = 0; k < 7; k++) {
      const y = h * 0.76 + Math.pow(k / 7, 1.8) * h * 0.24 + 3;
      body += `<path d="M0 ${f(y)}H${w}" stroke="#ff4fd8" stroke-opacity=".55" stroke-width="${f(1.8 * u)}"/>`;
    }
    return {
      defs: lin('g-sky', [[0, '#14063d'], [0.45, '#5a1680'], [0.75, '#e2407e'], [1, '#ffab4a']]) + lin('g-sun', [[0, '#fff27a'], [0.5, '#ffab4a'], [1, '#ff4f8b']]),
      body,
    };
  },

  versus: (w, h, u, r) => {
    let body = `<rect width="${w}" height="${h}" fill="url(#g-sky)"/>`;
    body += `<ellipse cx="${f(w / 2)}" cy="${f(h * 0.42)}" rx="${f(w * 0.7)}" ry="${f(h * 0.3)}" fill="url(#g-glow)"/>`;
    // light rigs
    for (const side of [0, 1]) {
      const x = side ? w - 46 * u : 10 * u;
      body += `<rect x="${f(x)}" y="${f(h * 0.05)}" width="${f(36 * u)}" height="${f(22 * u)}" rx="${f(5 * u)}" fill="#0a1233"/>`;
      for (let k = 0; k < 3; k++) body += `<circle cx="${f(x + 7 * u + k * 11 * u)}" cy="${f(h * 0.05 + 11 * u)}" r="${f(4 * u)}" fill="#fff8d6"/>`;
    }
    // bunting
    const by = h * 0.13;
    let flags = `<path d="M-5 ${f(by)}Q${f(w / 2)} ${f(by + 40 * u)} ${f(w + 5)} ${f(by)}" fill="none" stroke="#0a1233" stroke-width="${f(2 * u)}"/>`;
    const cols = ['#ff5fa8', '#ffd43b', '#3fd0ff', '#7df06a'];
    for (let i = 0; i < 12; i++) {
      const t = (i + 0.5) / 12;
      const x = t * w;
      const y = by + Math.sin(t * Math.PI) * 30 * u;
      flags += `<path d="M${f(x - 10 * u)} ${f(y)}L${f(x + 10 * u)} ${f(y)}L${f(x)} ${f(y + 20 * u)}Z" fill="${cols[i % 4]}"/>`;
    }
    body += flags;
    // crowd
    const rows: [number, string][] = [
      [0.8, '#1a2c6e'],
      [0.86, '#132257'],
      [0.92, '#0c1742'],
    ];
    for (const [ry, col] of rows) {
      let s = `<rect x="0" y="${f(h * ry)}" width="${w}" height="${f(h * (1 - ry) + 4)}" fill="${col}"/>`;
      for (let x = -6 * u; x < w + 10; x += 22 * u) {
        const hx = x + (r() - 0.5) * 6 * u;
        const hy = h * ry - (2 + r() * 6) * u;
        s += `<circle cx="${f(hx)}" cy="${f(hy)}" r="${f(9 * u)}" fill="${col}"/>`;
        if (r() < 0.18) s += `<path d="M${f(hx + 6 * u)} ${f(hy)}l${f(5 * u)} ${f(-18 * u)}" stroke="${col}" stroke-width="${f(5 * u)}" stroke-linecap="round"/>`;
      }
      body += s;
    }
    return { defs: lin('g-sky', [[0, '#0a1440'], [0.6, '#1d3384'], [1, '#2a47a8']]) + rad('g-glow', [[0, '#5d8bff', 0.4], [1, '#5d8bff', 0]]), body };
  },
};

function starShape(cx: number, cy: number, ro: number, ri: number): string {
  let d = '';
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 ? ri : ro;
    d += `${k ? 'L' : 'M'}${f(cx + Math.cos(a) * rr)} ${f(cy + Math.sin(a) * rr)}`;
  }
  return d + 'Z';
}

const SEEDS: Record<ThemeName, number> = { menu: 11, meadow: 21, reef: 31, starlight: 41, lava: 51, frost: 61, jungle: 71, desert: 81, neon: 91, crystal: 101, cosmic: 111, arcade: 121, versus: 131 };

/** Full-screen backdrop for a theme, sized to w x h CSS pixels. */
export function sceneSvg(theme: ThemeName, w: number, h: number): string {
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  const u = Math.max(0.75, Math.min(w, h * 0.62) / 400);
  const { defs, body } = PAINTERS[theme](w, h, u, rng(SEEDS[theme]));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="none"><defs>${defs}</defs>${body}</svg>`;
  // Keep gradient ids unique per theme so two scenes can share a page.
  return svg.replace(/(id="|#)g-/g, `$1${theme}-`);
}

// ---------------------------------------------------------------- level map strips

/** Decor for one world's stretch of the level map (tall strip). The road runs down the middle. */
export function mapSvg(theme: ThemeName, w: number, h: number, seed: number, locked: boolean): string {
  const r = rng(seed);
  const u = Math.max(0.8, w / 420);
  const [top, bottom] = THEME_INFO[theme].map;
  let body = `<rect width="${w}" height="${h}" fill="url(#m-bg${seed})"/>`;
  // soft islands behind the road
  for (let y = 60; y < h; y += 220 * u) {
    const left = (y / (220 * u)) % 2 < 1;
    const cx = w * (left ? 0.3 : 0.7);
    body += `<ellipse cx="${f(cx)}" cy="${f(y)}" rx="${f(w * 0.5)}" ry="${f(120 * u)}" fill="#fff" fill-opacity=".08"/>`;
  }
  const side = (i: number) => (i % 2 ? w * (0.86 + r() * 0.12) : w * (0.02 + r() * 0.12));
  const n = Math.round(h / (120 * u));
  for (let i = 0; i < n; i++) {
    const x = side(i);
    const y = 40 + (i + r() * 0.6) * (h / n);
    const s = (0.8 + r() * 0.5) * u;
    body += decor(theme, x, y, s, r, i);
  }
  const defs = lin(`m-bg${seed}`, [[0, top], [1, bottom]]);
  const filter = locked ? ' style="filter:saturate(.45) brightness(.8)"' : '';
  return `<svg class="world-bg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.round(w)} ${Math.round(h)}" preserveAspectRatio="none"${filter}><defs>${defs}</defs>${body}</svg>`;
}

function decor(theme: ThemeName, x: number, y: number, s: number, r: Rnd, i: number): string {
  switch (theme) {
    case 'meadow':
      return i % 3 === 0 ? lollipop(x, y + 20 * s, s, ['#ff6fa8', '#ffb347', '#a55eea'][i % 3], '#fff') : bush(x, y + 16 * s, s * 1.2, '#5fbf47', '#8ee06d') + flower(x + 18 * s, y + 22 * s, s, '#ff8fc0');
    case 'reef':
      return i % 2 ? seaweed(x, y + 40 * s, s, '#2fbf71', 70) : coral(x, y + 40 * s, s, ['#ff7a8a', '#ff9f43', '#ff5fa8'][i % 3], r);
    case 'starlight':
      return sparkle(x, y, 9 * s, '#fff6c2', 0.9) + `<circle cx="${f(x + 20 * s)}" cy="${f(y + 24 * s)}" r="${f(2 * s)}" fill="#fff"/>`;
    case 'lava':
      return `<path d="M${f(x - 30 * s)} ${f(y + 30 * s)}L${f(x - 6 * s)} ${f(y - 14 * s)}L${f(x + 8 * s)} ${f(y - 14 * s)}L${f(x + 32 * s)} ${f(y + 30 * s)}Z" fill="#3a0d14"/><ellipse cx="${f(x + s)}" cy="${f(y - 13 * s)}" rx="${f(8 * s)}" ry="${f(3 * s)}" fill="#ffb347"/>`;
    case 'frost':
      return pine(x, y + 30 * s, s, '#2e7391', '#fff');
    case 'jungle':
      return leaf(x - 30 * s, y, s, -20 + r() * 40, '#167a3e', '#3fb062');
    case 'desert':
      return cactus(x, y + 34 * s, s * 0.8, '#3c9a5c', '#62c27f');
    case 'neon':
      return `<rect x="${f(x - 16 * s)}" y="${f(y - 40 * s)}" width="${f(32 * s)}" height="${f(80 * s)}" fill="#1a0b40"/><rect x="${f(x - 13 * s)}" y="${f(y - 43 * s)}" width="${f(26 * s)}" height="${f(3 * s)}" fill="${i % 2 ? '#ff3df0' : '#3dfcff'}"/>`;
    case 'crystal':
      return crystal(x, y + 30 * s, s, '#5ff3ff', '#22b5d6', -10 + r() * 20, 60) + crystal(x + 14 * s, y + 32 * s, s * 0.8, '#c59bff', '#8655e8', 20, 44);
    case 'cosmic':
      return i % 3 === 0 ? planet(x, y, 16 * s, `mp${i}${Math.round(y)}`, '#ffb3e6', '#8a2be2', null) : sparkle(x, y, 8 * s, '#fff', 0.85);
    default:
      return sparkle(x, y, 8 * s, '#fff', 0.6);
  }
}
