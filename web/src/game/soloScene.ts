import type { App, Scene } from '../app';
import { sound } from '../audio/sound';
import { BOMB, MAX_ANGLE, MIN_ANGLE, SHOOTER_Y } from '../core/constants';
import { LEVEL_COUNT, getLevel } from '../core/levels';
import { angleTo, clampAngle } from '../core/physics';
import { randomSeed } from '../core/rng';
import { ShotEvent, SoloGame, SoloMode } from '../core/solo';
import { keepScreenOn } from '../platform/native';
import { ThemeName, worldTheme } from '../render/background';
import { BoardView } from '../render/boardView';
import { progress, recordLevel, saveStats, settings, stats } from '../storage';
import { button, h, haptic, starsRow } from '../ui/dom';
import { LevelSelectScene } from '../ui/levelSelect';
import { pauseMenu } from '../ui/pauseMenu';

/** Levels and Arcade gameplay. */
export class SoloScene implements Scene {
  theme: ThemeName;
  private game: SoloGame;
  private view: BoardView;
  private root!: HTMLElement;
  private hud!: {
    score: HTMLElement;
    title: HTMLElement;
    pill: HTMLElement;
    pillValue: HTMLElement;
    meter: HTMLElement;
    fill: HTMLElement;
  };
  private overlay: HTMLElement | null = null;
  private paused = false;
  private aiming = false;
  private swapTouch = false;
  private ended = false;
  private endTimer = 0;
  private shownScore = 0;
  private warned = false;

  constructor(
    private app: App,
    readonly mode: SoloMode,
    private levelId = 1,
  ) {
    const level = mode === 'level' ? getLevel(levelId) : null;
    this.game = new SoloGame(mode, level, randomSeed());
    this.theme = mode === 'level' ? worldTheme(level!.world) : 'arcade';
    this.view = new BoardView(this.game.board);
    this.view.aimGuide = settings.aimGuide;
    this.syncLauncher();
  }

  mount(root: HTMLElement): void {
    this.root = root;
    keepScreenOn(true);
    const score = h('div', { class: 'hud-score' }, '0');
    const title = h('div', { class: 'hud-title' }, this.mode === 'level' ? `Level ${this.levelId}` : 'Arcade');
    const pillValue = h('b', null, '');
    const pill = h('div', { class: 'hud-pill' }, pillValue, h('small', null, this.mode === 'level' ? 'shots' : 'best'));
    const fill = h('i');
    const meter = h('div', { class: this.mode === 'level' ? 'meter' : 'meter timer' }, fill);
    if (this.mode === 'level') {
      const l = this.game.level!;
      const tick = h('span', { class: 'tick', style: `left:${(l.stars[0] / l.stars[1]) * 100}%` });
      meter.append(tick);
    }
    const pauseBtn = button('❚❚', () => this.pause(), 'btn btn-ghost btn-icon');
    pauseBtn.setAttribute('aria-label', 'Pause');
    const hudEl = h('div', { class: 'hud' }, pauseBtn, h('div', { class: 'hud-center' }, title, score), pill);
    const sub = h('div', { class: 'hud-sub', style: 'top: calc(var(--sat) + 62px)' }, meter);
    root.append(hudEl, sub);
    this.hud = { score, title, pill, pillValue, meter, fill };
    this.refreshHud();

    if (this.mode === 'level') {
      const l = this.game.level!;
      this.banner(`Level ${l.id}`, `Clear the bubbles in ${l.shots} shots`);
    } else {
      this.banner('Arcade', 'Rows keep coming. Survive!');
    }
  }

  private banner(big: string, small?: string): void {
    const b = h('div', { class: 'banner' }, big, small ? h('small', null, small) : null);
    this.root.append(b);
    setTimeout(() => b.remove(), 1700);
  }

  resize(w: number, hgt: number): void {
    const ins = this.app.insets();
    const top = ins.top + 84;
    const bottom = ins.bottom + 6;
    this.view.layout(ins.left + 4, top, w - ins.left - ins.right - 8, hgt - top - bottom);
  }

  // ------------------------------------------------------------------ input

  pointerDown(x: number, y: number): void {
    if (this.paused || this.ended) return;
    const p = this.view.toWorld(x, y);
    if (this.view.hitsSwap(p.x, p.y)) {
      this.swapTouch = true;
      return;
    }
    this.aiming = true;
    this.aimAt(p.x, p.y);
  }

  pointerMove(x: number, y: number): void {
    if (!this.aiming) return;
    const p = this.view.toWorld(x, y);
    this.aimAt(p.x, p.y);
  }

  pointerUp(x: number, y: number): void {
    const p = this.view.toWorld(x, y);
    if (this.swapTouch) {
      this.swapTouch = false;
      if (this.view.hitsSwap(p.x, p.y)) this.swap();
      return;
    }
    if (!this.aiming) return;
    this.aiming = false;
    const angle = this.view.aimAngle;
    this.view.aimAngle = null;
    if (angle === null || p.y > SHOOTER_Y - 6) return;
    this.fire(angle);
  }

  key(e: KeyboardEvent): void {
    if (this.paused || this.ended) return;
    const a = this.view.aimAngle ?? Math.PI / 2;
    if (e.key === 'ArrowLeft') this.view.aimAngle = clampAngle(a + 0.04);
    else if (e.key === 'ArrowRight') this.view.aimAngle = clampAngle(a - 0.04);
    else if (e.key === ' ' || e.key === 'Enter') {
      this.fire(a);
      this.view.aimAngle = a;
    } else if (e.key === 'ArrowUp' || e.key === 's') this.swap();
  }

  private aimAt(x: number, y: number): void {
    if (y > SHOOTER_Y - 6) {
      this.view.aimAngle = null;
      return;
    }
    this.view.aimAngle = Math.max(MIN_ANGLE, Math.min(MAX_ANGLE, angleTo(x, y)));
  }

  private swap(): void {
    if (!this.view.ready || this.game.state !== 'playing') return;
    this.game.swap();
    this.syncLauncher();
    sound.swap();
    haptic(6);
  }

  private fire(angle: number): void {
    if (!this.view.ready || this.game.state !== 'playing' || this.paused) return;
    const shot = this.game.fire(angle);
    if (!shot) return;
    haptic(10);
    this.view.launch(shot, 0, (s) => this.landed(s));
    this.syncLauncher();
    this.refreshHud();
  }

  private landed(s: ShotEvent): void {
    const n = s.outcome.popped.length + s.outcome.dropped.length;
    if (s.piece === BOMB) haptic(60);
    else if (n >= 8) haptic(35);
    else if (n) haptic(15);
    if (this.mode === 'arcade' && this.game.state === 'playing') {
      const bonus = this.game.refillIfEmpty();
      if (bonus) {
        this.banner('Board clear!', `+${bonus}`);
        sound.win();
        this.view.pushed();
        this.syncLauncher();
      }
    }
  }

  private syncLauncher(): void {
    this.view.cur = this.game.queue.cur;
    this.view.nxt = this.game.queue.nxt;
  }

  // ------------------------------------------------------------------ loop

  update(dt: number): void {
    if (this.paused) return;
    this.view.update(dt);
    if (this.game.state === 'playing') {
      const push = this.game.update(dt, !this.view.busy);
      if (push) {
        this.view.pushed();
        this.syncLauncher();
        haptic(20);
      }
      const low = this.game.board.lowestRow();
      if (low >= 11 && !this.warned) {
        this.warned = true;
        sound.warn();
      } else if (low < 10) this.warned = false;
    }
    // Score counts up smoothly.
    if (this.shownScore !== this.game.score) {
      const diff = this.game.score - this.shownScore;
      this.shownScore += Math.sign(diff) * Math.max(1, Math.ceil(Math.abs(diff) * dt * 8));
      if (Math.abs(this.game.score - this.shownScore) < 2) this.shownScore = this.game.score;
      this.hud.score.textContent = String(this.shownScore);
    }
    if (this.mode === 'arcade') {
      this.hud.fill.style.width = `${Math.min(100, this.game.pushProgress * 100)}%`;
      this.hud.title.textContent = `Arcade · Lv ${this.game.arcadeLevel}`;
    }
    if (!this.ended && this.game.state !== 'playing' && !this.view.busy) {
      this.ended = true;
      this.endTimer = 0;
      this.onEnd();
    }
    if (this.ended) this.endTimer += dt;
  }

  draw(ctx: CanvasRenderingContext2D, dpr: number): void {
    this.view.draw(ctx, dpr);
  }

  private refreshHud(): void {
    const g = this.game;
    if (this.mode === 'level') {
      const left = g.shotsLeft;
      this.hud.pillValue.textContent = String(left);
      this.hud.pill.classList.toggle('low', left <= 5);
      const l = g.level!;
      this.hud.fill.style.width = `${Math.min(100, (g.score / l.stars[1]) * 100)}%`;
    } else {
      this.hud.pillValue.textContent = String(Math.max(stats.arcadeBest, g.score));
    }
  }

  // ------------------------------------------------------------------ end of game

  private onEnd(): void {
    keepScreenOn(false);
    const g = this.game;
    this.refreshHud();
    if (g.state === 'won') {
      const stones = g.leftoverStones();
      this.view.dropCells(stones, stones.map(() => 9));
      for (const i of stones) g.board.cells[i] = 0;
      sound.win();
      haptic(40);
      setTimeout(() => this.showLevelWon(), 900);
    } else {
      sound.lose();
      haptic(80);
      this.view.shake(6);
      setTimeout(() => (this.mode === 'level' ? this.showLevelLost() : this.showArcadeOver()), 900);
    }
  }

  private showLevelWon(): void {
    const g = this.game;
    const stars = g.stars();
    const newBest = recordLevel(this.levelId, stars, g.score);
    const starEl = starsRow(0, 3, 'big-stars');
    const hasNext = this.levelId < LEVEL_COUNT;
    const panel = h(
      'div',
      { class: 'panel dialog pop-in' },
      h('h2', { class: 'result-title' }, stars === 3 ? 'Perfect!' : 'Level Complete!'),
      starEl,
      h('div', { class: 'score-big' }, String(g.score)),
      newBest ? h('div', null, h('span', { class: 'badge' }, 'NEW BEST')) : null,
      h(
        'div',
        null,
        h('div', { class: 'score-line' }, h('span', null, 'Shots left bonus'), h('b', null, `+${g.endBonus}`)),
        h('div', { class: 'score-line' }, h('span', null, 'Best combo'), h('b', null, `x${g.bestCombo}`)),
      ),
      h(
        'div',
        { class: 'row' },
        button('Levels', () => this.app.go(new LevelSelectScene(this.app)), 'btn btn-ghost'),
        button('Retry', () => this.app.go(new SoloScene(this.app, 'level', this.levelId)), 'btn btn-sky'),
      ),
      hasNext ? button('Next level ▶', () => this.app.go(new SoloScene(this.app, 'level', this.levelId + 1)), 'btn btn-hot') : h('p', null, 'You beat every level! 🎉'),
    );
    this.showOverlay(panel);
    [...starEl.children].forEach((el, i) => {
      if (i < stars) {
        setTimeout(() => {
          el.classList.add('on');
          sound.star(i);
          haptic(12);
        }, 350 + i * 380);
      }
    });
  }

  private showLevelLost(): void {
    const g = this.game;
    const reason = g.lostReason === 'shots' ? 'Out of shots!' : 'The bubbles reached the line!';
    const panel = h(
      'div',
      { class: 'panel dialog pop-in' },
      h('h2', { class: 'result-title' }, 'So close!'),
      h('p', { class: 'muted' }, reason),
      h('div', { class: 'score-big' }, String(g.score)),
      h('p', { class: 'small muted' }, `${g.board.countColored()} bubbles left`),
      h('div', { class: 'row' }, button('Levels', () => this.app.go(new LevelSelectScene(this.app)), 'btn btn-ghost'), button('Try again', () => this.app.go(new SoloScene(this.app, 'level', this.levelId)), 'btn btn-hot')),
    );
    this.showOverlay(panel);
  }

  private showArcadeOver(): void {
    const g = this.game;
    const record = g.score > stats.arcadeBest;
    if (record) stats.arcadeBest = g.score;
    stats.arcadeBestLevel = Math.max(stats.arcadeBestLevel, g.arcadeLevel);
    saveStats();
    const panel = h(
      'div',
      { class: 'panel dialog pop-in' },
      h('h2', { class: 'result-title' }, 'Game Over'),
      h('div', { class: 'score-big' }, String(g.score)),
      record ? h('div', null, h('span', { class: 'badge' }, 'NEW RECORD')) : h('p', { class: 'muted' }, `Best: ${stats.arcadeBest}`),
      h(
        'div',
        { class: 'stat-grid' },
        h('div', { class: 'stat' }, h('b', null, String(g.arcadeLevel)), h('small', null, 'Level reached')),
        h('div', { class: 'stat' }, h('b', null, `x${g.bestCombo}`), h('small', null, 'Best combo')),
      ),
      h('div', { class: 'row' }, button('Menu', () => this.app.goHome(), 'btn btn-ghost'), button('Play again', () => this.app.go(new SoloScene(this.app, 'arcade')), 'btn btn-hot')),
    );
    this.showOverlay(panel);
  }

  private showOverlay(panel: HTMLElement): void {
    this.overlay?.remove();
    this.overlay = h('div', { class: 'overlay' }, panel);
    this.root.append(this.overlay);
  }

  // ------------------------------------------------------------------ pause / nav

  private pause(): void {
    if (this.paused || this.ended) return;
    this.paused = true;
    this.aiming = false;
    this.view.aimAngle = null;
    this.showOverlay(
      pauseMenu({
        title: 'Paused',
        onResume: () => this.resume(),
        onRestart: () => this.app.go(new SoloScene(this.app, this.mode, this.levelId)),
        onQuit: () => (this.mode === 'level' ? this.app.go(new LevelSelectScene(this.app)) : this.app.goHome()),
        quitLabel: this.mode === 'level' ? 'Levels' : 'Menu',
        onSettingsChanged: () => (this.view.aimGuide = settings.aimGuide),
      }),
    );
  }

  private resume(): void {
    this.overlay?.remove();
    this.overlay = null;
    this.paused = false;
  }

  appPaused(): void {
    this.pause();
  }

  back(): boolean {
    if (this.ended) {
      if (this.mode === 'level') this.app.go(new LevelSelectScene(this.app));
      else this.app.goHome();
    } else if (this.paused) this.resume();
    else this.pause();
    return true;
  }

  destroy(): void {
    keepScreenOn(false);
  }
}

/** Highest level the player may start. */
export function nextLevelToPlay(): number {
  return Math.min(LEVEL_COUNT, progress.unlocked);
}
