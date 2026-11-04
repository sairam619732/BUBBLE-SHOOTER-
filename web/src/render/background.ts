import { ThemeName, sceneSvg } from './scenes';
import { COLORS, renderPiece } from './sprites';

export type { ThemeName } from './scenes';
export { worldTheme } from './scenes';

type Ambient = 'menu' | 'soap' | 'rising' | 'twinkle' | 'embers' | 'snow' | 'fireflies' | 'sand' | 'sparks' | 'sparkles' | 'arena';

const AMBIENT: Record<ThemeName, Ambient> = {
  menu: 'menu',
  meadow: 'soap',
  reef: 'rising',
  starlight: 'twinkle',
  lava: 'embers',
  frost: 'snow',
  jungle: 'fireflies',
  desert: 'sand',
  neon: 'sparks',
  crystal: 'sparkles',
  cosmic: 'twinkle',
  arcade: 'sparks',
  versus: 'arena',
};

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  p: number;
  k: number;
}

const TAU = Math.PI * 2;

/**
 * The backdrop: a static illustrated scene in a DOM layer behind the canvas, plus a few
 * animated touches (light rays, floating bubbles, snow...) drawn on the canvas each frame.
 */
export class Background {
  private el: HTMLElement;
  private name: ThemeName = 'menu';
  private w = 0;
  private h = 0;
  private t = 0;
  private motes: Mote[] = [];
  private paintTimer: ReturnType<typeof setTimeout> | null = null;
  private glow: HTMLCanvasElement | null = null;
  private balls: HTMLCanvasElement[] = [];

  constructor() {
    let el = document.getElementById('bg');
    if (!el) {
      el = document.createElement('div');
      el.id = 'bg';
      document.body.prepend(el);
    }
    this.el = el;
  }

  get theme(): ThemeName {
    return this.name;
  }

  set(name: ThemeName): void {
    if (name === this.name && this.el.firstChild) return;
    this.name = name;
    this.paint();
    this.spawn();
  }

  resize(w: number, h: number): void {
    if (Math.abs(w - this.w) < 1 && Math.abs(h - this.h) < 1) return;
    const first = this.w === 0;
    this.w = w;
    this.h = h;
    if (first) {
      this.paint();
      this.spawn();
      return;
    }
    if (this.paintTimer) clearTimeout(this.paintTimer);
    this.paintTimer = setTimeout(() => {
      this.paint();
      this.spawn();
    }, 120);
  }

  private paint(): void {
    if (!this.w) return;
    this.el.innerHTML = sceneSvg(this.name, this.w, this.h);
  }

  private spawn(): void {
    const kind = AMBIENT[this.name];
    const n = { menu: 16, soap: 14, rising: 26, twinkle: 30, embers: 34, snow: 60, fireflies: 22, sand: 40, sparks: 26, sparkles: 18, arena: 24 }[kind];
    this.motes = [];
    for (let i = 0; i < n; i++) this.motes.push(this.make(kind, true));
  }

  private make(kind: Ambient, anywhere: boolean): Mote {
    const w = this.w || 400;
    const h = this.h || 800;
    const m: Mote = { x: Math.random() * w, y: anywhere ? Math.random() * h : h + 40, vx: 0, vy: 0, r: 2, p: Math.random() * TAU, k: Math.floor(Math.random() * 6) };
    switch (kind) {
      case 'menu': {
        const depth = Math.random();
        m.r = 10 + depth * 26;
        m.vy = -(14 + depth * 30);
        break;
      }
      case 'soap':
        m.r = 6 + Math.random() * 16;
        m.vy = -(10 + Math.random() * 20);
        break;
      case 'rising':
        m.r = 2 + Math.random() * 6;
        m.vy = -(30 + Math.random() * 50);
        break;
      case 'embers':
        m.r = 1.2 + Math.random() * 2.6;
        m.vy = -(30 + Math.random() * 60);
        m.vx = (Math.random() - 0.5) * 16;
        break;
      case 'snow':
        if (!anywhere) m.y = -10;
        m.r = 1.2 + Math.random() * 3;
        m.vy = 20 + m.r * 12;
        break;
      case 'fireflies':
        m.r = 2 + Math.random() * 2;
        m.vx = (Math.random() - 0.5) * 20;
        m.vy = (Math.random() - 0.5) * 20;
        break;
      case 'sand':
        if (!anywhere) {
          m.x = -10;
          m.y = Math.random() * h;
        }
        m.r = 0.8 + Math.random() * 1.8;
        m.vx = 30 + Math.random() * 60;
        m.vy = (Math.random() - 0.5) * 8;
        break;
      case 'sparks':
        m.r = 1.2 + Math.random() * 2.2;
        m.vy = -(20 + Math.random() * 40);
        break;
      case 'twinkle':
      case 'sparkles':
      case 'arena':
        m.r = 2 + Math.random() * 5;
        break;
    }
    return m;
  }

  update(dt: number): void {
    this.t += dt;
    const kind = AMBIENT[this.name];
    const w = this.w;
    const h = this.h;
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i];
      m.p += dt;
      switch (kind) {
        case 'fireflies':
          m.vx += (Math.random() - 0.5) * 40 * dt;
          m.vy += (Math.random() - 0.5) * 40 * dt;
          m.vx = Math.max(-25, Math.min(25, m.vx));
          m.vy = Math.max(-25, Math.min(25, m.vy));
          break;
        case 'twinkle':
        case 'sparkles':
        case 'arena':
          if (m.p > 4 + m.r) {
            const n = this.make(kind, true);
            n.p = 0;
            this.motes[i] = n;
          }
          continue;
      }
      m.x += (m.vx + (kind === 'snow' || kind === 'soap' || kind === 'menu' || kind === 'rising' ? Math.sin(m.p * 1.3 + m.k) * 14 : 0)) * dt;
      m.y += m.vy * dt;
      if (m.y < -60 || m.y > h + 60 || m.x < -60 || m.x > w + 60) this.motes[i] = this.make(kind, false);
    }
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const kind = AMBIENT[this.name];
    if (kind === 'menu') this.drawRays(ctx, w, h);
    if (kind === 'arena') this.drawBeams(ctx, w, h);
    for (const m of this.motes) this.drawMote(ctx, kind, m);
    ctx.globalAlpha = 1;
  }

  private drawRays(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const cx = w / 2;
    const cy = h * 0.27;
    const len = Math.hypot(w, h);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, len * 0.62);
    g.addColorStop(0, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.t * 0.06);
    ctx.translate(-cx, -cy);
    ctx.fillStyle = g;
    const n = 18;
    ctx.beginPath();
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * TAU;
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, len, a0, a0 + TAU / (n * 2));
      ctx.closePath();
    }
    ctx.fill();
    ctx.restore();
  }

  private drawBeams(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const u = Math.max(0.75, Math.min(w, h * 0.62) / 400);
    const rigs: [number, number, number][] = [
      [28 * u, h * 0.05 + 11 * u, 0.9],
      [w - 28 * u, h * 0.05 + 11 * u, Math.PI - 0.9],
    ];
    ctx.save();
    for (let i = 0; i < rigs.length; i++) {
      const [x, y, base] = rigs[i];
      const a = base + Math.sin(this.t * 0.5 + i * 2) * 0.35;
      const len = h * 1.1;
      const spread = 0.12;
      const g = ctx.createLinearGradient(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.addColorStop(0, 'rgba(255,250,214,0.32)');
      g.addColorStop(1, 'rgba(255,250,214,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a - spread) * len, y + Math.sin(a - spread) * len);
      ctx.lineTo(x + Math.cos(a + spread) * len, y + Math.sin(a + spread) * len);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private glowSprite(): HTMLCanvasElement {
    if (this.glow) return this.glow;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d')!;
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    this.glow = c;
    return c;
  }

  private ball(k: number): HTMLCanvasElement {
    if (!this.balls.length) for (let v = 1; v <= 6; v++) this.balls.push(renderPiece(v, 96));
    return this.balls[k % this.balls.length];
  }

  private drawMote(ctx: CanvasRenderingContext2D, kind: Ambient, m: Mote): void {
    switch (kind) {
      case 'menu': {
        const depth = (m.r - 10) / 26;
        ctx.globalAlpha = 0.45 + depth * 0.5;
        const d = m.r * 2;
        ctx.drawImage(this.ball(m.k), m.x - m.r, m.y - m.r, d, d);
        break;
      }
      case 'soap':
      case 'rising': {
        ctx.globalAlpha = kind === 'soap' ? 0.7 : 0.55;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1.2, m.r * 0.12);
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.ellipse(m.x - m.r * 0.35, m.y - m.r * 0.4, m.r * 0.32, m.r * 0.18, -0.6, 0, TAU);
        ctx.fill();
        break;
      }
      case 'embers':
      case 'fireflies':
      case 'sparks': {
        const flick = kind === 'fireflies' ? 0.5 + 0.5 * Math.sin(m.p * 3 + m.k) : 0.7 + 0.3 * Math.sin(m.p * 9 + m.k);
        const color = kind === 'embers' ? '#ff9a3d' : kind === 'fireflies' ? '#f4ff8a' : m.k % 2 ? '#ff4fd8' : '#3dfcff';
        ctx.globalAlpha = flick * 0.9;
        const gr = m.r * 5;
        ctx.drawImage(this.tinted(color), m.x - gr, m.y - gr, gr * 2, gr * 2);
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r * 0.6, 0, TAU);
        ctx.fill();
        break;
      }
      case 'snow':
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, TAU);
        ctx.fill();
        break;
      case 'sand':
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = '#fff3d6';
        ctx.fillRect(m.x, m.y, m.r * 2, m.r);
        break;
      case 'twinkle':
      case 'sparkles':
      case 'arena': {
        const life = 4 + m.r;
        const a = Math.sin((m.p / life) * Math.PI);
        if (a <= 0) break;
        ctx.globalAlpha = a * (kind === 'arena' ? 0.9 : 0.85);
        const s = m.r * (kind === 'arena' ? 1.2 : 1.6);
        ctx.fillStyle = kind === 'arena' && m.k % 3 === 0 ? '#ffe9a8' : '#ffffff';
        ctx.beginPath();
        ctx.moveTo(m.x, m.y - s);
        ctx.quadraticCurveTo(m.x, m.y, m.x + s, m.y);
        ctx.quadraticCurveTo(m.x, m.y, m.x, m.y + s);
        ctx.quadraticCurveTo(m.x, m.y, m.x - s, m.y);
        ctx.quadraticCurveTo(m.x, m.y, m.x, m.y - s);
        ctx.fill();
        break;
      }
    }
  }

  private tintCache = new Map<string, HTMLCanvasElement>();
  private tinted(color: string): HTMLCanvasElement {
    let c = this.tintCache.get(color);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d')!;
    x.drawImage(this.glowSprite(), 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color;
    x.fillRect(0, 0, 64, 64);
    this.tintCache.set(color, c);
    return c;
  }
}

/** Kept for code that wants a color per bubble value (menu art etc.). */
export const BUBBLE_BASES = Object.values(COLORS).map((c) => c.base);
