import { BOMB, MAX_COLORS, R, RAINBOW, STONE, WALL } from '../core/constants';

export interface BubbleColor {
  name: string;
  base: string;
  light: string;
  dark: string;
}

export const COLORS: Record<number, BubbleColor> = {
  1: { name: 'Red', base: '#ff3d5e', light: '#ffc2cb', dark: '#a30d2c' },
  2: { name: 'Yellow', base: '#ffc928', light: '#fff6c2', dark: '#c27100' },
  3: { name: 'Green', base: '#34d36a', light: '#c4fad6', dark: '#0b8239' },
  4: { name: 'Cyan', base: '#1fd0f0', light: '#cff8ff', dark: '#047a99' },
  5: { name: 'Blue', base: '#3b66ff', light: '#c2d1ff', dark: '#162ca3' },
  6: { name: 'Purple', base: '#a755f2', light: '#ebd1ff', dark: '#5a17a3' },
};

const INK = '#1c1442';

/** Particle/accent color for any piece value. */
export function pieceTint(v: number): string {
  if (COLORS[v]) return COLORS[v].base;
  if (v === STONE) return '#a9b0c4';
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
      c = renderPiece(v, this.px, this.symbols);
      this.cache.set(v, c);
    }
    return c;
  }
}

/** Draws one piece into a new square canvas of `size` device pixels. */
export function renderPiece(v: number, size: number, symbols = false): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const r = size / 2;
  ctx.translate(r, r);
  const rr = r * 0.95;
  if (v === STONE || v === WALL) drawStone(ctx, rr);
  else if (v === BOMB) drawBomb(ctx, rr);
  else if (v === RAINBOW) drawRainbow(ctx, rr);
  else {
    const col = COLORS[Math.min(MAX_COLORS, Math.max(1, v))];
    drawGlossy(ctx, rr, col.light, col.base, col.dark);
    if (symbols) drawSymbol(ctx, v, rr);
  }
  return c;
}

function circle(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
}

function drawGlossy(ctx: CanvasRenderingContext2D, r: number, light: string, base: string, dark: string): void {
  const ow = r * 0.11;
  const ir = r - ow / 2;
  // body
  const g = ctx.createRadialGradient(-r * 0.28, -r * 0.36, r * 0.04, 0, r * 0.08, r * 1.02);
  g.addColorStop(0, light);
  g.addColorStop(0.36, base);
  g.addColorStop(0.86, dark);
  g.addColorStop(1, dark);
  circle(ctx, ir);
  ctx.fillStyle = g;
  ctx.fill();
  // reflected light along the lower edge
  const rim = ctx.createRadialGradient(0, -r * 0.3, r * 0.5, 0, -r * 0.12, r);
  rim.addColorStop(0, 'rgba(255,255,255,0)');
  rim.addColorStop(0.82, 'rgba(255,255,255,0)');
  rim.addColorStop(1, 'rgba(255,255,255,0.42)');
  ctx.fillStyle = rim;
  circle(ctx, ir);
  ctx.fill();
  // outline
  ctx.lineWidth = ow;
  ctx.strokeStyle = INK;
  circle(ctx, ir);
  ctx.stroke();
  // big soft highlight
  ctx.save();
  ctx.translate(-r * 0.26, -r * 0.42);
  ctx.rotate(-0.55);
  const hg = ctx.createLinearGradient(0, -r * 0.26, 0, r * 0.26);
  hg.addColorStop(0, 'rgba(255,255,255,0.95)');
  hg.addColorStop(1, 'rgba(255,255,255,0.15)');
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.44, r * 0.24, 0, 0, Math.PI * 2);
  ctx.fillStyle = hg;
  ctx.fill();
  ctx.restore();
  // sharp glint
  ctx.beginPath();
  ctx.arc(r * 0.36, -r * 0.5, r * 0.08, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fill();
}

function drawStone(ctx: CanvasRenderingContext2D, r: number): void {
  const ow = r * 0.11;
  const pts: [number, number][] = [];
  const n = 9;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 - 0.3;
    const rr = (r - ow / 2) * (k % 3 === 1 ? 0.9 : k % 2 ? 0.95 : 1);
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  const path = () => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  };
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
  g.addColorStop(0, '#e6e9f2');
  g.addColorStop(0.5, '#a3aac0');
  g.addColorStop(1, '#5c6380');
  path();
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.lineWidth = ow;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // cracks
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(28,20,66,0.7)';
  ctx.lineWidth = r * 0.07;
  ctx.beginPath();
  ctx.moveTo(-r * 0.46, -r * 0.08);
  ctx.lineTo(-r * 0.08, r * 0.12);
  ctx.lineTo(r * 0.16, -r * 0.3);
  ctx.moveTo(-r * 0.08, r * 0.12);
  ctx.lineTo(r * 0.04, r * 0.5);
  ctx.moveTo(r * 0.3, r * 0.22);
  ctx.lineTo(r * 0.56, r * 0.1);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.32, -r * 0.5, r * 0.24, r * 0.11, -0.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawBomb(ctx: CanvasRenderingContext2D, r: number): void {
  const ow = r * 0.1;
  // fuse
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = r * 0.2;
  ctx.beginPath();
  ctx.moveTo(r * 0.1, -r * 0.62);
  ctx.quadraticCurveTo(r * 0.3, -r * 1.0, r * 0.62, -r * 0.82);
  ctx.stroke();
  ctx.strokeStyle = '#e9c46a';
  ctx.lineWidth = r * 0.09;
  ctx.stroke();
  // body
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.2, r * 0.05, 0, r * 0.1, r * 0.9);
  g.addColorStop(0, '#7a8098');
  g.addColorStop(0.45, '#333850');
  g.addColorStop(1, '#10121c');
  ctx.beginPath();
  ctx.arc(0, r * 0.12, r * 0.8, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = ow;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // cap
  ctx.save();
  ctx.translate(r * 0.06, -r * 0.62);
  ctx.rotate(0.35);
  ctx.fillStyle = '#7a8098';
  ctx.fillRect(-r * 0.2, -r * 0.13, r * 0.4, r * 0.26);
  ctx.lineWidth = ow * 0.8;
  ctx.strokeRect(-r * 0.2, -r * 0.13, r * 0.4, r * 0.26);
  ctx.restore();
  // shine + danger band
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.32, -r * 0.14, r * 0.22, r * 0.11, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ff8a3d';
  ctx.lineWidth = r * 0.11;
  ctx.beginPath();
  ctx.arc(0, r * 0.12, r * 0.56, Math.PI * 0.2, Math.PI * 0.8);
  ctx.stroke();
  // spark
  drawStar(ctx, r * 0.66, -r * 0.84, r * 0.26, r * 0.11, '#ffd43b');
}

function drawRainbow(ctx: CanvasRenderingContext2D, r: number): void {
  const ow = r * 0.11;
  const ir = r - ow / 2;
  const anyCtx = ctx as CanvasRenderingContext2D & { createConicGradient?: (a: number, x: number, y: number) => CanvasGradient };
  const stops = ['#ff3d5e', '#ffc928', '#34d36a', '#1fd0f0', '#3b66ff', '#a755f2', '#ff3d5e'];
  let g: CanvasGradient;
  if (anyCtx.createConicGradient) g = anyCtx.createConicGradient(0, 0, 0);
  else g = ctx.createLinearGradient(-r, -r, r, r);
  stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
  circle(ctx, ir);
  ctx.fillStyle = g;
  ctx.fill();
  const w = ctx.createRadialGradient(-r * 0.3, -r * 0.35, 0, 0, 0, r);
  w.addColorStop(0, 'rgba(255,255,255,0.9)');
  w.addColorStop(0.45, 'rgba(255,255,255,0.2)');
  w.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = w;
  ctx.fill();
  ctx.lineWidth = ow;
  ctx.strokeStyle = INK;
  ctx.stroke();
  drawStar(ctx, 0, r * 0.04, r * 0.42, r * 0.19, '#ffffff', INK, r * 0.07);
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, ro: number, ri: number, fill: string, stroke?: string, lw = 0): void {
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 ? ri : ro;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = lw;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

/** Shape marks for color-blind players: each color gets a distinct symbol. */
function drawSymbol(ctx: CanvasRenderingContext2D, v: number, r: number): void {
  const s = r * 0.36;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.strokeStyle = INK;
  ctx.lineWidth = r * 0.08;
  ctx.lineJoin = 'round';
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
  ctx.stroke();
  ctx.fill();
  ctx.restore();
}
