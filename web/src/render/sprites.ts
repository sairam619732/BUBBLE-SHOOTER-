import { BOMB, MAX_COLORS, R, RAINBOW, STONE } from '../core/constants';

export interface BubbleColor {
  name: string;
  base: string;
  light: string;
  dark: string;
}

export const COLORS: Record<number, BubbleColor> = {
  1: { name: 'Red', base: '#ff4757', light: '#ffb0b8', dark: '#a8102a' },
  2: { name: 'Yellow', base: '#ffc93c', light: '#fff3b0', dark: '#c27d00' },
  3: { name: 'Green', base: '#2ed573', light: '#b4f8cf', dark: '#0d8a43' },
  4: { name: 'Cyan', base: '#22d3ee', light: '#c4f7ff', dark: '#06819a' },
  5: { name: 'Blue', base: '#3d6bff', light: '#b3c6ff', dark: '#1832a8' },
  6: { name: 'Purple', base: '#a55eea', light: '#e6c9ff', dark: '#5f1fa3' },
};

/** Particle/accent color for any piece value. */
export function pieceTint(v: number): string {
  if (COLORS[v]) return COLORS[v].base;
  if (v === STONE) return '#9aa3b5';
  if (v === BOMB) return '#ff8a3d';
  if (v === RAINBOW) return '#ffffff';
  return '#ffffff';
}

/**
 * Pre-rendered bubble images at the current screen resolution. Drawing cached canvases is
 * far cheaper than building gradients every frame.
 */
export class BubbleSprites {
  private cache = new Map<number, HTMLCanvasElement>();
  private px = 0;
  private symbols = false;

  /** `pxPerUnit` = device pixels per world unit. */
  configure(pxPerUnit: number, symbols: boolean): void {
    const px = Math.max(8, Math.ceil(R * 2 * pxPerUnit));
    if (px === this.px && symbols === this.symbols) return;
    this.px = px;
    this.symbols = symbols;
    this.cache.clear();
  }

  get(v: number): HTMLCanvasElement {
    let c = this.cache.get(v);
    if (!c) {
      c = this.render(v);
      this.cache.set(v, c);
    }
    return c;
  }

  private render(v: number): HTMLCanvasElement {
    const size = this.px;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;
    const r = size / 2;
    ctx.translate(r, r);
    const rr = r * 0.97;

    if (v === STONE) {
      drawStone(ctx, rr);
    } else if (v === BOMB) {
      drawBomb(ctx, rr);
    } else if (v === RAINBOW) {
      drawRainbow(ctx, rr);
    } else {
      const col = COLORS[Math.min(MAX_COLORS, Math.max(1, v))];
      drawGlossy(ctx, rr, col.light, col.base, col.dark);
      if (this.symbols) drawSymbol(ctx, v, rr);
    }
    return c;
  }
}

function drawGlossy(ctx: CanvasRenderingContext2D, r: number, light: string, base: string, dark: string): void {
  const g = ctx.createRadialGradient(-r * 0.32, -r * 0.38, r * 0.08, 0, 0, r);
  g.addColorStop(0, light);
  g.addColorStop(0.42, base);
  g.addColorStop(1, dark);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  // rim
  ctx.lineWidth = r * 0.06;
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.stroke();
  // bottom bounce light
  const b = ctx.createRadialGradient(r * 0.25, r * 0.55, 0, r * 0.25, r * 0.55, r * 0.6);
  b.addColorStop(0, 'rgba(255,255,255,0.28)');
  b.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = b;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.95, 0, Math.PI * 2);
  ctx.fill();
  // specular
  ctx.save();
  ctx.rotate(-0.6);
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.56, r * 0.42, r * 0.2, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(r * 0.42, -r * 0.18, r * 0.07, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fill();
}

function drawStone(ctx: CanvasRenderingContext2D, r: number): void {
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
  g.addColorStop(0, '#d9dee8');
  g.addColorStop(0.5, '#8d96a8');
  g.addColorStop(1, '#474e5e');
  ctx.beginPath();
  // slightly faceted outline
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    const rr = r * (k % 2 ? 0.94 : 1);
    if (k === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = r * 0.07;
  ctx.strokeStyle = 'rgba(20,24,34,0.6)';
  ctx.stroke();
  ctx.strokeStyle = 'rgba(30,34,46,0.55)';
  ctx.lineWidth = r * 0.06;
  ctx.beginPath();
  ctx.moveTo(-r * 0.5, -r * 0.1);
  ctx.lineTo(-r * 0.1, r * 0.1);
  ctx.lineTo(r * 0.15, -r * 0.3);
  ctx.moveTo(-r * 0.1, r * 0.1);
  ctx.lineTo(r * 0.05, r * 0.55);
  ctx.moveTo(r * 0.3, r * 0.2);
  ctx.lineTo(r * 0.6, r * 0.1);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.35, -r * 0.5, r * 0.25, r * 0.12, -0.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawBomb(ctx: CanvasRenderingContext2D, r: number): void {
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.05, 0, 0, r);
  g.addColorStop(0, '#6b7080');
  g.addColorStop(0.45, '#2a2d3a');
  g.addColorStop(1, '#0b0c12');
  ctx.beginPath();
  ctx.arc(0, r * 0.08, r * 0.86, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  // cap + fuse
  ctx.fillStyle = '#4a4f60';
  ctx.fillRect(-r * 0.22, -r * 0.92, r * 0.44, r * 0.26);
  ctx.strokeStyle = '#d9b26a';
  ctx.lineWidth = r * 0.1;
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.92);
  ctx.quadraticCurveTo(r * 0.25, -r * 1.05, r * 0.42, -r * 0.88);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.35, -r * 0.25, r * 0.22, r * 0.12, -0.6, 0, Math.PI * 2);
  ctx.fill();
  // danger stripe
  ctx.strokeStyle = '#ff8a3d';
  ctx.lineWidth = r * 0.1;
  ctx.beginPath();
  ctx.arc(0, r * 0.08, r * 0.62, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
}

function drawRainbow(ctx: CanvasRenderingContext2D, r: number): void {
  const anyCtx = ctx as CanvasRenderingContext2D & { createConicGradient?: (a: number, x: number, y: number) => CanvasGradient };
  let g: CanvasGradient;
  const stops = ['#ff4757', '#ffc93c', '#2ed573', '#22d3ee', '#3d6bff', '#a55eea', '#ff4757'];
  if (anyCtx.createConicGradient) {
    g = anyCtx.createConicGradient(0, 0, 0);
    stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
  } else {
    g = ctx.createLinearGradient(-r, -r, r, r);
    stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
  }
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  const w = ctx.createRadialGradient(-r * 0.3, -r * 0.35, 0, 0, 0, r);
  w.addColorStop(0, 'rgba(255,255,255,0.85)');
  w.addColorStop(0.45, 'rgba(255,255,255,0.15)');
  w.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = w;
  ctx.fill();
  ctx.lineWidth = r * 0.06;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.stroke();
  drawStar(ctx, 0, 0, r * 0.38, r * 0.17, '#ffffff');
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, ro: number, ri: number, fill: string): void {
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 ? ri : ro;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Shape marks for color-blind players: each color gets a distinct symbol. */
function drawSymbol(ctx: CanvasRenderingContext2D, v: number, r: number): void {
  const s = r * 0.36;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = r * 0.06;
  ctx.beginPath();
  switch (v) {
    case 1: // heart
      ctx.moveTo(0, s * 0.9);
      ctx.bezierCurveTo(-s * 1.4, -s * 0.1, -s * 0.6, -s * 1.2, 0, -s * 0.4);
      ctx.bezierCurveTo(s * 0.6, -s * 1.2, s * 1.4, -s * 0.1, 0, s * 0.9);
      break;
    case 2: // star
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const rr = k % 2 ? s * 0.45 : s;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      break;
    case 3: // triangle
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.95, s * 0.7);
      ctx.lineTo(-s * 0.95, s * 0.7);
      break;
    case 4: // circle
      ctx.arc(0, 0, s * 0.75, 0, Math.PI * 2);
      break;
    case 5: // square
      ctx.rect(-s * 0.7, -s * 0.7, s * 1.4, s * 1.4);
      break;
    case 6: // diamond
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.75, 0);
      ctx.lineTo(0, s);
      ctx.lineTo(-s * 0.75, 0);
      break;
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
