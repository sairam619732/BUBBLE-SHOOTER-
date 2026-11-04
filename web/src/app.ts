import { sound } from './audio/sound';
import { exitApp, isAndroidApp, onNative } from './platform/native';
import { Background, ThemeName } from './render/background';
import { setSymbols } from './render/boardView';
import { settings } from './storage';
import { confirmDialog } from './ui/dom';

export interface Scene {
  theme: ThemeName;
  mount(root: HTMLElement): void;
  update(dt: number): void;
  draw(ctx: CanvasRenderingContext2D, dpr: number, w: number, h: number): void;
  resize(w: number, h: number): void;
  pointerDown?(x: number, y: number): void;
  pointerMove?(x: number, y: number): void;
  pointerUp?(x: number, y: number): void;
  key?(e: KeyboardEvent): void;
  /** Android back / Escape. Return true if handled. */
  back(): boolean;
  /** App moved to the background. */
  appPaused?(): void;
  destroy(): void;
}

/** Owns the canvas, the UI layer, the frame loop, and the current scene. */
export class App {
  readonly ctx: CanvasRenderingContext2D;
  readonly bg = new Background();
  scene: Scene | null = null;
  w = 0;
  h = 0;
  dpr = 1;
  private last = 0;
  private home: (() => Scene) | null = null;
  private dialogOpen = false;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly ui: HTMLElement,
  ) {
    this.ctx = canvas.getContext('2d')!;
    setSymbols(settings.symbols);
  }

  start(home: () => Scene): void {
    this.home = home;
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.bindInput();
    this.go(home());
    this.last = performance.now();
    const frame = (t: number) => {
      const dt = Math.min(0.05, Math.max(0, (t - this.last) / 1000));
      this.last = t;
      this.tick(dt);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  go(scene: Scene): void {
    this.scene?.destroy();
    this.ui.replaceChildren();
    this.scene = scene;
    this.bg.set(scene.theme);
    scene.mount(this.ui);
    scene.resize(this.w, this.h);
  }

  goHome(): void {
    if (this.home) this.go(this.home());
  }

  private tick(dt: number): void {
    const s = this.scene;
    this.bg.update(dt);
    s?.update(dt);
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    this.bg.draw(ctx, this.w, this.h);
    s?.draw(ctx, this.dpr, this.w, this.h);
  }

  private resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    this.bg.resize(this.w, this.h);
    this.scene?.resize(this.w, this.h);
  }

  private bindInput(): void {
    const c = this.canvas;
    let active = -1;
    c.addEventListener('pointerdown', (e) => {
      sound.unlock();
      if (active !== -1) return;
      active = e.pointerId;
      c.setPointerCapture(e.pointerId);
      this.scene?.pointerDown?.(e.clientX, e.clientY);
    });
    c.addEventListener('pointermove', (e) => {
      if (e.pointerId === active) this.scene?.pointerMove?.(e.clientX, e.clientY);
    });
    const end = (e: PointerEvent, cancel: boolean) => {
      if (e.pointerId !== active) return;
      active = -1;
      if (cancel) this.scene?.pointerUp?.(-1e6, 1e6);
      else this.scene?.pointerUp?.(e.clientX, e.clientY);
    };
    c.addEventListener('pointerup', (e) => end(e, false));
    c.addEventListener('pointercancel', (e) => end(e, true));
    document.addEventListener('pointerdown', () => sound.unlock(), { capture: true });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.back();
        return;
      }
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      this.scene?.key?.(e);
    });

    // Android shell events
    onNative((e) => {
      if (e.type === 'back') this.back();
      else if (e.type === 'pause') {
        sound.setSuspended(true);
        this.scene?.appPaused?.();
      } else if (e.type === 'resume') sound.setSuspended(false);
      else if (e.type === 'insets') {
        const st = document.documentElement.style;
        st.setProperty('--sat', `${e.top}px`);
        st.setProperty('--sab', `${e.bottom}px`);
        st.setProperty('--sal', `${e.left}px`);
        st.setProperty('--sar', `${e.right}px`);
        this.scene?.resize(this.w, this.h);
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.scene?.appPaused?.();
    });
  }

  /** Back button: let the scene handle it, otherwise go home / offer to exit. */
  async back(): Promise<void> {
    if (this.dialogOpen) return;
    if (this.scene?.back()) return;
    if (!isAndroidApp) return;
    this.dialogOpen = true;
    const yes = await confirmDialog(this.ui, 'Leave the game?', 'Your progress is saved.', 'Exit', 'Stay');
    this.dialogOpen = false;
    if (yes) exitApp();
  }

  /** Safe-area insets in CSS px (from CSS variables). */
  insets(): { top: number; bottom: number; left: number; right: number } {
    const cs = getComputedStyle(document.documentElement);
    const read = (n: string) => parseFloat(cs.getPropertyValue(n)) || 0;
    // env() values are resolved through a probe element.
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;padding:var(--sat) var(--sar) var(--sab) var(--sal)';
    document.body.append(probe);
    const ps = getComputedStyle(probe);
    const out = {
      top: parseFloat(ps.paddingTop) || read('--sat'),
      right: parseFloat(ps.paddingRight) || 0,
      bottom: parseFloat(ps.paddingBottom) || 0,
      left: parseFloat(ps.paddingLeft) || 0,
    };
    probe.remove();
    return out;
  }
}
