import { Board } from '../core/board';
import {
  BOARD_W,
  BOMB,
  COLS,
  D,
  DEADLINE_ROW,
  DEADLINE_Y,
  EMPTY,
  R,
  ROW_H,
  SHOOTER_X,
  SHOOTER_Y,
  SHOT_SPEED,
  WORLD_H,
} from '../core/constants';
import { Trace, pointAlong, polylineLength, traceShot } from '../core/physics';
import type { ShotEvent } from '../core/solo';
import { sound } from '../audio/sound';

type Sfx = typeof sound;
import { BubbleSprites, pieceTint } from './sprites';

interface Flight {
  piece: number;
  points: number[];
  length: number;
  dist: number;
  seq: number;
  shot: ShotEvent | null;
  bounceAt: number[];
  onLand?: (shot: ShotEvent) => void;
}

interface Linger {
  x: number;
  y: number;
  v: number;
  /** Seconds after landing when it pops (or starts falling). */
  at: number;
  fall: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  ring?: boolean;
}

interface Faller {
  x: number;
  y: number;
  vx: number;
  vy: number;
  v: number;
  rot: number;
  vr: number;
  t: number;
}

interface FloatText {
  text: string;
  x: number;
  y: number;
  life: number;
  max: number;
  color: string;
  size: number;
}

interface Incoming {
  idx: number;
  v: number;
  x0: number;
  y0: number;
  delay: number;
  t: number;
}

const FRAME = 6;
const tmp = { x: 0, y: 0 };

/** Draws one board with its launcher and all the juicy animation. Works in world units. */
export class BoardView {
  ox = 0;
  oy = 0;
  scale = 1;
  cur = 0;
  nxt = 0;
  aimAngle: number | null = null;
  aimGuide = true;
  showLauncher = true;
  /** Fade + label for knocked-out boards. */
  dimmed = false;
  /** Opponent mini-boards animate silently. */
  quiet = false;
  /** Called when a confirmed flight lands (after effects start). */
  onLand: ((shot: ShotEvent) => void) | null = null;

  private flight: Flight | null = null;
  private hidden: Uint8Array;
  private lingering: Linger[] = [];
  private landTime = 0;
  private particles: Particle[] = [];
  private fallers: Faller[] = [];
  private texts: FloatText[] = [];
  private incoming: Incoming[] = [];
  private jx: Float32Array;
  private jy: Float32Array;
  private jvx: Float32Array;
  private jvy: Float32Array;
  private pushOffset = 0;
  private shakeT = 0;
  private shakeAmp = 0;
  private t = 0;
  private aimCache: { angle: number; hash: number; trace: Trace } | null = null;

  constructor(
    public board: Board,
    private sprites: BubbleSprites = new BubbleSprites(),
  ) {
    const n = board.cells.length;
    this.hidden = new Uint8Array(n);
    this.jx = new Float32Array(n);
    this.jy = new Float32Array(n);
    this.jvx = new Float32Array(n);
    this.jvy = new Float32Array(n);
  }

  /** Fits the world into a screen rectangle (CSS px). */
  layout(x: number, y: number, w: number, h: number, alignTop = false): void {
    const s = Math.min(w / (BOARD_W + FRAME * 2), h / (WORLD_H + FRAME));
    this.scale = s;
    this.ox = x + (w - BOARD_W * s) / 2;
    this.oy = alignTop ? y + FRAME * s : y + (h - WORLD_H * s) / 2 + FRAME * s * 0.5;
  }

  toWorld(px: number, py: number): { x: number; y: number } {
    return { x: (px - this.ox) / this.scale, y: (py - this.oy) / this.scale };
  }

  private get sfx(): Sfx | null {
    return this.quiet ? null : sound;
  }

  get busy(): boolean {
    return !!this.flight || this.incoming.length > 0;
  }

  get flying(): boolean {
    return !!this.flight;
  }

  /** True when the launcher should accept a new shot. */
  get ready(): boolean {
    return !this.flight;
  }

  // ---------------------------------------------------------------- shots

  /** Multiplayer: start flying immediately while the server confirms the shot. */
  launchProvisional(angle: number, piece: number, seq: number): void {
    this.finishNow();
    const tr = traceShot(this.board, angle);
    this.startFlight(tr, piece, seq, null);
  }

  /** A shot whose result is known (single player, or a server-confirmed shot). */
  launch(shot: ShotEvent, seq = 0, onLand?: (s: ShotEvent) => void): void {
    if (this.flight && this.flight.seq === seq && seq !== 0 && !this.flight.shot) {
      this.confirm(shot, onLand);
      return;
    }
    this.finishNow();
    this.startFlight(shot.trace, shot.piece, seq, shot, onLand);
    this.adoptShot(shot);
  }

  /** Server confirmed our provisional shot. */
  private confirm(shot: ShotEvent, onLand?: (s: ShotEvent) => void): void {
    const f = this.flight!;
    const pts = this.flightPoints(shot.trace);
    const len = polylineLength(pts);
    f.points = pts;
    f.length = len;
    f.dist = Math.min(f.dist, len);
    f.shot = shot;
    f.onLand = onLand;
    f.bounceAt = bounceDistances(pts);
    this.adoptShot(shot);
  }

  /** Server refused our provisional shot. */
  cancel(seq: number): void {
    if (this.flight && this.flight.seq === seq && !this.flight.shot) this.flight = null;
  }

  private startFlight(tr: Trace, piece: number, seq: number, shot: ShotEvent | null, onLand?: (s: ShotEvent) => void): void {
    const pts = this.flightPoints(tr);
    this.flight = { piece, points: pts, length: polylineLength(pts), dist: 0, seq, shot, bounceAt: bounceDistances(pts), onLand };
    this.sfx?.shoot();
  }

  private flightPoints(tr: Trace): number[] {
    const pts = tr.points.slice();
    pts.push(this.board.cellX(tr.r, tr.c), this.board.cellY(tr.r));
    return pts;
  }

  /** The board already contains the shot's result; keep removed bubbles visible until impact. */
  private adoptShot(shot: ShotEvent): void {
    const o = shot.outcome;
    if (o.placed !== EMPTY) this.hidden[o.at] = 1;
    this.lingering = [];
    o.popped.forEach((i, k) => {
      if (i === o.at) return;
      this.lingering.push({ x: this.board.idxX(i), y: this.board.idxY(i), v: shot.poppedColors[k], at: k * 0.035, fall: false });
    });
    const popEnd = o.popped.length * 0.035 + 0.06;
    o.dropped.forEach((i, k) => {
      this.lingering.push({ x: this.board.idxX(i), y: this.board.idxY(i), v: shot.droppedColors[k], at: popEnd, fall: true });
    });
  }

  /** Completes any animation that depends on board positions (before a row push). */
  finishNow(): void {
    if (this.flight) {
      if (this.flight.shot) {
        this.flight.dist = this.flight.length;
        this.land();
      } else {
        // An unconfirmed shot keeps flying; the server's answer will place it.
      }
    }
    for (const l of this.lingering) this.releaseLinger(l);
    this.lingering = [];
    for (const g of this.incoming) this.hidden[g.idx] = 0;
    this.incoming = [];
  }

  private land(): void {
    const f = this.flight!;
    const shot = f.shot!;
    this.flight = null;
    const o = shot.outcome;
    this.hidden[o.at] = 0;
    this.landTime = 0;
    const lx = this.board.idxX(o.at);
    const ly = this.board.idxY(o.at);
    if (shot.piece === BOMB) {
      this.sfx?.boom();
      this.shake(9);
      this.ring(lx, ly, '#ffb347', D * 2.4);
      this.burst(lx, ly, '#ffb347', 26, 1.6);
    } else if (o.popped.length) {
      // landing bubble pops first
      this.burst(lx, ly, pieceTint(o.placed), 10, 1);
      this.sfx?.pop();
    } else {
      this.sfx?.stick();
      this.jiggle(lx, ly);
    }
    if (o.dropped.length) setTimeout(() => this.sfx?.drop(o.dropped.length), (o.popped.length * 35 + 60) | 0);
    if (shot.points > 0) {
      const label = `+${shot.points}`;
      this.text(label, lx, ly - R, '#ffffff', shot.points >= 300 ? 26 : 20);
    }
    if (shot.combo >= 2 && o.popped.length) {
      this.text(`Combo x${shot.combo}`, BOARD_W / 2, DEADLINE_Y - 30, '#ffe066', 24);
      this.sfx?.combo(shot.combo);
    }
    if (shot.reward) {
      this.text(shot.reward === BOMB ? 'Bomb ready!' : 'Rainbow ready!', BOARD_W / 2, DEADLINE_Y - 60, '#ffffff', 22);
      this.sfx?.power();
    }
    (f.onLand ?? this.onLand)?.(shot);
  }

  private releaseLinger(l: Linger): void {
    if (l.fall) {
      this.fallers.push({ x: l.x, y: l.y, vx: (Math.random() - 0.5) * 160, vy: -60 - Math.random() * 120, v: l.v, rot: 0, vr: (Math.random() - 0.5) * 8, t: 0 });
    } else {
      this.burst(l.x, l.y, pieceTint(l.v), 8, 1);
      if (Math.random() < 0.6) this.sfx?.pop();
    }
  }

  // ---------------------------------------------------------------- other events

  /** Animates garbage bubbles flying in from below. */
  garbageIn(cells: [number, number][]): void {
    cells.forEach(([idx, v], k) => {
      this.hidden[idx] = 1;
      this.incoming.push({ idx, v, x0: R + Math.random() * (BOARD_W - D), y0: WORLD_H + R, delay: k * 0.06, t: 0 });
    });
    this.shake(3);
  }

  /** Call right after a row was pushed onto the board. */
  pushed(): void {
    this.pushOffset = -ROW_H;
    this.sfx?.rowPush();
  }

  /** Stones and leftovers falling away at the end of a level. */
  dropCells(indices: number[], values: number[]): void {
    indices.forEach((i, k) => {
      this.fallers.push({ x: this.board.idxX(i), y: this.board.idxY(i), vx: (Math.random() - 0.5) * 120, vy: -40 - k * 4, v: values[k], rot: 0, vr: (Math.random() - 0.5) * 6, t: 0 });
    });
  }

  /** Whole board falls (game over / knocked out). */
  collapse(): void {
    const idx: number[] = [];
    const vals: number[] = [];
    for (let i = 0; i < this.board.cells.length; i++) {
      if (this.board.cells[i] !== EMPTY) {
        idx.push(i);
        vals.push(this.board.cells[i]);
      }
    }
    this.dropCells(idx, vals);
  }

  shake(amp: number): void {
    this.shakeAmp = Math.max(this.shakeAmp, amp);
    this.shakeT = 0.35;
  }

  text(text: string, x: number, y: number, color: string, size: number): void {
    if (this.quiet) return;
    this.texts.push({ text, x, y, life: 1.1, max: 1.1, color, size });
  }

  private burst(x: number, y: number, color: string, n: number, power: number): void {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (80 + Math.random() * 220) * power;
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5, max: 0.5, size: 2 + Math.random() * 3.5, color });
    }
    this.particles.push({ x, y, vx: 0, vy: 0, life: 0.3, max: 0.3, size: R, color, ring: true });
  }

  private ring(x: number, y: number, color: string, size: number): void {
    this.particles.push({ x, y, vx: 0, vy: 0, life: 0.45, max: 0.45, size, color, ring: true });
  }

  private jiggle(x: number, y: number): void {
    for (let i = 0; i < this.board.cells.length; i++) {
      if (this.board.cells[i] === EMPTY) continue;
      const dx = this.board.idxX(i) - x;
      const dy = this.board.idxY(i) - y;
      const d = Math.hypot(dx, dy);
      if (d < 0.01 || d > D * 2.6) continue;
      const k = (1 - d / (D * 2.6)) * 140;
      this.jvx[i] += (dx / d) * k;
      this.jvy[i] += (dy / d) * k;
    }
  }

  // ---------------------------------------------------------------- update/draw

  update(dt: number): void {
    this.t += dt;
    const f = this.flight;
    if (f) {
      const before = f.dist;
      f.dist = Math.min(f.length, f.dist + SHOT_SPEED * dt);
      for (const b of f.bounceAt) if (b > before && b <= f.dist) this.sfx?.bounce();
      if (f.dist >= f.length && f.shot) this.land();
    } else {
      this.landTime += dt;
      if (this.lingering.length) {
        const keep: Linger[] = [];
        for (const l of this.lingering) {
          if (this.landTime >= l.at) this.releaseLinger(l);
          else keep.push(l);
        }
        this.lingering = keep;
      }
    }

    for (let k = this.incoming.length - 1; k >= 0; k--) {
      const g = this.incoming[k];
      g.t += dt;
      if (g.t - g.delay >= 0.28) {
        this.hidden[g.idx] = 0;
        this.incoming.splice(k, 1);
        this.jiggle(this.board.idxX(g.idx), this.board.idxY(g.idx));
      }
    }

    // spring jiggle
    const n = this.board.cells.length;
    const stiff = 260;
    const damp = Math.exp(-dt * 9);
    for (let i = 0; i < n; i++) {
      if (this.jx[i] === 0 && this.jvx[i] === 0 && this.jy[i] === 0 && this.jvy[i] === 0) continue;
      this.jvx[i] = (this.jvx[i] - this.jx[i] * stiff * dt) * damp;
      this.jvy[i] = (this.jvy[i] - this.jy[i] * stiff * dt) * damp;
      this.jx[i] += this.jvx[i] * dt;
      this.jy[i] += this.jvy[i] * dt;
      if (Math.abs(this.jx[i]) + Math.abs(this.jy[i]) + Math.abs(this.jvx[i]) + Math.abs(this.jvy[i]) < 0.05) {
        this.jx[i] = this.jy[i] = this.jvx[i] = this.jvy[i] = 0;
      }
    }

    if (this.pushOffset < 0) this.pushOffset = Math.min(0, this.pushOffset + ROW_H * dt * 4);
    if (this.shakeT > 0) this.shakeT -= dt;

    for (let k = this.particles.length - 1; k >= 0; k--) {
      const p = this.particles[k];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(k, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy = p.vy * 0.92 + 300 * dt;
    }
    for (let k = this.fallers.length - 1; k >= 0; k--) {
      const b = this.fallers[k];
      b.t += dt;
      b.vy += 1700 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.vr * dt;
      if (b.x < R || b.x > BOARD_W - R) b.vx = -b.vx * 0.6;
      if (b.y > WORLD_H + D * 2) this.fallers.splice(k, 1);
    }
    for (let k = this.texts.length - 1; k >= 0; k--) {
      const tx = this.texts[k];
      tx.life -= dt;
      tx.y -= 40 * dt;
      if (tx.life <= 0) this.texts.splice(k, 1);
    }
  }

  /** `dpr` = device pixel ratio of the canvas. */
  draw(ctx: CanvasRenderingContext2D, dpr: number): void {
    const s = this.scale;
    let sx = 0;
    let sy = 0;
    if (this.shakeT > 0) {
      const a = this.shakeAmp * (this.shakeT / 0.35);
      sx = (Math.random() - 0.5) * a;
      sy = (Math.random() - 0.5) * a;
    }
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (this.ox + sx * s), dpr * (this.oy + sy * s));
    this.sprites.configure(s * dpr, symbolsOn());

    this.drawFrame(ctx);

    const b = this.board;
    const danger = b.lowestRow() >= DEADLINE_ROW - 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(-FRAME, -FRAME, BOARD_W + FRAME * 2, WORLD_H + FRAME * 2);
    ctx.clip();
    if (this.dimmed) ctx.globalAlpha = 0.45;
    const oy = this.pushOffset;
    for (let i = 0; i < b.cells.length; i++) {
      const v = b.cells[i];
      if (v === EMPTY || this.hidden[i]) continue;
      const r = (i / COLS) | 0;
      let x = b.cellX(r, i % COLS) + this.jx[i];
      let y = b.cellY(r) + this.jy[i] + oy;
      if (danger && r >= DEADLINE_ROW - 3) {
        x += Math.sin(this.t * 40 + i) * 0.6;
        y += Math.cos(this.t * 37 + i) * 0.6;
      }
      ctx.drawImage(this.sprites.get(v), x - R, y - R, D, D);
    }
    for (const l of this.lingering) ctx.drawImage(this.sprites.get(l.v), l.x - R, l.y - R + oy, D, D);
    ctx.globalAlpha = 1;

    // incoming garbage
    for (const g of this.incoming) {
      const p = Math.max(0, Math.min(1, (g.t - g.delay) / 0.28));
      if (p <= 0) continue;
      const tx = b.idxX(g.idx);
      const ty = b.idxY(g.idx);
      const e = 1 - (1 - p) * (1 - p);
      ctx.drawImage(this.sprites.get(g.v), g.x0 + (tx - g.x0) * e - R, g.y0 + (ty - g.y0) * e - R, D, D);
    }

    if (this.showLauncher && !this.dimmed) this.drawAim(ctx);

    // flying bubble
    const f = this.flight;
    if (f) {
      pointAlong(f.points, f.dist, tmp);
      ctx.drawImage(this.sprites.get(f.piece), tmp.x - R, tmp.y - R, D, D);
    }

    for (const fb of this.fallers) {
      ctx.save();
      ctx.translate(fb.x, fb.y);
      ctx.rotate(fb.rot);
      ctx.globalAlpha = Math.max(0, 1 - fb.t * 0.6);
      ctx.drawImage(this.sprites.get(fb.v), -R, -R, D, D);
      ctx.restore();
    }
    ctx.restore();

    if (this.showLauncher) this.drawLauncher(ctx);

    for (const p of this.particles) {
      const a = p.life / p.max;
      ctx.globalAlpha = a;
      if (p.ring) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3 * a + 0.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y + oy, p.size * (1.4 - a * 0.5), 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y + oy, p.size * (0.4 + a * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const tx of this.texts) {
      const a = Math.min(1, tx.life / (tx.max * 0.4));
      const pop = 1 + Math.max(0, tx.life - tx.max + 0.15) * 3;
      ctx.globalAlpha = a;
      ctx.font = `700 ${Math.round(tx.size * pop)}px Fredoka, system-ui, sans-serif`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(30,10,60,0.75)';
      ctx.strokeText(tx.text, tx.x, tx.y);
      ctx.fillStyle = tx.color;
      ctx.fillText(tx.text, tx.x, tx.y);
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  private drawFrame(ctx: CanvasRenderingContext2D): void {
    const w = BOARD_W;
    // panel
    ctx.fillStyle = 'rgba(12, 8, 40, 0.28)';
    roundRect(ctx, -FRAME, -FRAME, w + FRAME * 2, WORLD_H + FRAME, 14);
    ctx.fill();
    // ceiling bar
    const g = ctx.createLinearGradient(0, -FRAME, 0, 4);
    g.addColorStop(0, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0.05)');
    ctx.fillStyle = g;
    roundRect(ctx, -FRAME, -FRAME, w + FRAME * 2, FRAME + 3, 6);
    ctx.fill();
    // deadline
    const danger = this.board.lowestRow() >= DEADLINE_ROW - 2;
    const pulse = danger ? 0.5 + 0.5 * Math.sin(this.t * 10) : 0;
    ctx.strokeStyle = danger ? `rgba(255,80,100,${0.55 + pulse * 0.4})` : 'rgba(255,255,255,0.28)';
    ctx.lineWidth = danger ? 3 : 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(0, DEADLINE_Y);
    ctx.lineTo(w, DEADLINE_Y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawAim(ctx: CanvasRenderingContext2D): void {
    if (this.aimAngle === null || this.flight || !this.cur) return;
    const h = this.board.hash();
    if (!this.aimCache || this.aimCache.angle !== this.aimAngle || this.aimCache.hash !== h) {
      this.aimCache = { angle: this.aimAngle, hash: h, trace: traceShot(this.board, this.aimAngle) };
    }
    const tr = this.aimCache.trace;
    const color = pieceTint(this.cur);
    if (this.aimGuide) {
      const total = polylineLength(tr.points);
      const step = 15;
      const offset = (this.t * 60) % step;
      ctx.fillStyle = color;
      for (let d = offset + 28; d < total - 4; d += step) {
        pointAlong(tr.points, d, tmp);
        const fade = 1 - d / (total + 60);
        ctx.globalAlpha = 0.35 + fade * 0.6;
        ctx.beginPath();
        ctx.arc(tmp.x, tmp.y, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // ghost at landing cell
      const gx = this.board.cellX(tr.r, tr.c);
      const gy = this.board.cellY(tr.r);
      ctx.globalAlpha = 0.45 + 0.15 * Math.sin(this.t * 8);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(gx, gy, R - 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    } else {
      // short pointer only
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(SHOOTER_X, SHOOTER_Y);
      ctx.lineTo(SHOOTER_X + Math.cos(this.aimAngle) * 90, SHOOTER_Y - Math.sin(this.aimAngle) * 90);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  private drawLauncher(ctx: CanvasRenderingContext2D): void {
    const x = SHOOTER_X;
    const y = SHOOTER_Y;
    const a = this.aimAngle ?? Math.PI / 2;
    // base
    const base = ctx.createLinearGradient(0, y - 10, 0, y + 40);
    base.addColorStop(0, '#ffffff');
    base.addColorStop(1, '#b9a6ff');
    ctx.fillStyle = 'rgba(20,10,60,0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y + 30, 46, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    // barrel
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-a + Math.PI / 2);
    const bar = ctx.createLinearGradient(-12, 0, 12, 0);
    bar.addColorStop(0, '#6c4cf5');
    bar.addColorStop(0.5, '#a48bff');
    bar.addColorStop(1, '#5236d6');
    ctx.fillStyle = bar;
    roundRect(ctx, -11, -R - 26, 22, 34, 7);
    ctx.fill();
    ctx.restore();
    // ring
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.arc(x, y, R + 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(80,50,180,0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (this.cur && !this.dimmed) ctx.drawImage(this.sprites.get(this.cur), x - R, y - R, D, D);

    // next bubble + swap hint
    const nx = x - 72;
    const ny = y + 12;
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.arc(nx, ny, R * 0.78 + 5, 0, Math.PI * 2);
    ctx.fill();
    if (this.nxt && !this.dimmed) ctx.drawImage(this.sprites.get(this.nxt), nx - R * 0.78, ny - R * 0.78, D * 0.78, D * 0.78);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(x - 36, y + 4, 9, Math.PI * 1.15, Math.PI * 1.95);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 29, y - 4);
    ctx.lineTo(x - 27, y + 3);
    ctx.lineTo(x - 34, y + 1);
    ctx.stroke();
  }

  /** World-space hit test for the swap control (launcher + next bubble). */
  hitsSwap(wx: number, wy: number): boolean {
    return Math.hypot(wx - SHOOTER_X, wy - SHOOTER_Y) < R + 12 || Math.hypot(wx - (SHOOTER_X - 72), wy - (SHOOTER_Y + 12)) < R + 10;
  }
}

function bounceDistances(pts: number[]): number[] {
  const out: number[] = [];
  let d = 0;
  for (let i = 2; i < pts.length - 4; i += 2) {
    d += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
    out.push(d);
  }
  return out;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

let symbolsFlag = false;
export function setSymbols(on: boolean): void {
  symbolsFlag = on;
}
function symbolsOn(): boolean {
  return symbolsFlag;
}
