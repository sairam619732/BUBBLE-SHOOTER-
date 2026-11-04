export interface Theme {
  top: string;
  bottom: string;
  bokeh: string;
  stars?: boolean;
}

export const THEMES = {
  menu: { top: '#5b3df5', bottom: '#ff6fb1', bokeh: 'rgba(255,255,255,0.10)' },
  meadow: { top: '#6a5af9', bottom: '#ff8fc0', bokeh: 'rgba(255,255,255,0.10)' },
  reef: { top: '#0b3d74', bottom: '#19b8c6', bokeh: 'rgba(190,255,255,0.10)' },
  starlight: { top: '#0d0930', bottom: '#4b1d82', bokeh: 'rgba(200,180,255,0.08)', stars: true },
  arcade: { top: '#170f45', bottom: '#d93a7a', bokeh: 'rgba(255,150,220,0.09)', stars: true },
  versus: { top: '#0c1f3d', bottom: '#5a2a8a', bokeh: 'rgba(150,200,255,0.08)', stars: true },
} satisfies Record<string, Theme>;

export type ThemeName = keyof typeof THEMES;

export function worldTheme(world: number): ThemeName {
  return (['meadow', 'reef', 'starlight'] as const)[world] ?? 'meadow';
}

interface Orb {
  x: number;
  y: number;
  r: number;
  vy: number;
  phase: number;
}

/** Soft gradient sky with slowly rising blurred bubbles. Drawn in CSS pixels. */
export class Background {
  private orbs: Orb[] = [];
  private stars: { x: number; y: number; s: number; p: number }[] = [];
  private t = 0;
  theme: Theme = THEMES.menu;
  private cache: { w: number; h: number; theme: Theme; grad: CanvasGradient } | null = null;

  constructor() {
    for (let i = 0; i < 18; i++) {
      this.orbs.push({ x: Math.random(), y: Math.random(), r: 0.04 + Math.random() * 0.11, vy: 0.008 + Math.random() * 0.02, phase: Math.random() * 6 });
    }
    for (let i = 0; i < 70; i++) this.stars.push({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random() * 1.3, p: Math.random() * 6 });
  }

  set(name: ThemeName): void {
    this.theme = THEMES[name];
  }

  update(dt: number): void {
    this.t += dt;
    for (const o of this.orbs) {
      o.y -= o.vy * dt;
      if (o.y < -0.2) {
        o.y = 1.2;
        o.x = Math.random();
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (!this.cache || this.cache.w !== w || this.cache.h !== h || this.cache.theme !== this.theme) {
      const grad = ctx.createLinearGradient(0, 0, w * 0.3, h);
      grad.addColorStop(0, this.theme.top);
      grad.addColorStop(1, this.theme.bottom);
      this.cache = { w, h, theme: this.theme, grad };
    }
    ctx.fillStyle = this.cache.grad;
    ctx.fillRect(0, 0, w, h);
    if (this.theme.stars) {
      for (const s of this.stars) {
        const a = 0.35 + 0.35 * Math.sin(this.t * 1.7 + s.p);
        ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
        ctx.fillRect(s.x * w, s.y * h, s.s, s.s);
      }
    }
    const m = Math.max(w, h);
    ctx.fillStyle = this.theme.bokeh;
    for (const o of this.orbs) {
      const x = (o.x + Math.sin(this.t * 0.3 + o.phase) * 0.03) * w;
      ctx.beginPath();
      ctx.arc(x, o.y * h, o.r * m * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
