import type { App, Scene } from '../app';
import { sound } from '../audio/sound';
import { BOMB, MAX_ANGLE, MIN_ANGLE, SHOOTER_Y } from '../core/constants';
import { LEVEL_COUNT, getLevel } from '../core/levels';
import { angleTo, clampAngle } from '../core/physics';
import { randomSeed } from '../core/rng';
import { ShotEvent, SoloGame, SoloMode } from '../core/solo';
import { AD_EXTRA_SHOTS, adBreak, adsStatus, showRewardedAd } from '../platform/ads';
import { keepScreenOn } from '../platform/native';
import { ThemeName, worldTheme } from '../render/background';
import { BoardView } from '../render/boardView';
import { THEME_INFO } from '../render/scenes';
import { progress, recordLevel, saveStats, settings, stats } from '../storage';
import { button, h, haptic, iconButton, ribbon, toast } from '../ui/dom';
import { IconName, icon } from '../ui/icons';
import { LevelSelectScene } from '../ui/levelSelect';
import { pauseMenu } from '../ui/pauseMenu';

/** Where the 2-star mark sits on the score bar (percent). */
const STAR2_AT = 62;

/** Levels and Arcade gameplay. */
export class SoloScene implements Scene {
  theme: ThemeName;
  private game: SoloGame;
  private view: BoardView;
  private root!: HTMLElement;
  private hud!: {
    el: HTMLElement;
    score: HTMLElement;
    title: HTMLElement;
    badge: HTMLElement;
    badgeValue: HTMLElement;
    fill: HTMLElement;
    marks: HTMLElement[];
  };
  private overlay: HTMLElement | null = null;
  private paused = false;
  private aiming = false;
  private swapTouch = false;
  private ended = false;
  private endTimer = 0;
  private shownScore = 0;
  private warned = false;
  private destroyed = false;
  /** The level was already continued with extra shots from an ad. */
  private revived = false;
  private leaving = false;
  private newBest = false;
  private record = false;

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
    const level = this.mode === 'level';
    const score = h('div', { class: 'p-score' }, '0');
    const title = h('div', { class: 'p-title' }, level ? `Level ${this.levelId}` : 'Arcade');
    const badgeValue = h('b', null, '');
    const badge = h('div', { class: 'badge' }, badgeValue, h('small', null, level ? 'Shots' : 'Best'));
    const fill = h('div', { class: 'fill' });
    const meter = h('div', { class: level ? 'meter' : 'meter timer' }, fill);
    const marks: HTMLElement[] = [];
    if (level) {
      for (const pct of [STAR2_AT, 100]) {
        const m = h('div', { class: 'mark', style: `left:${pct}%` }, icon('star'));
        marks.push(m);
        meter.append(m);
      }
    } else {
      meter.append(icon('ceiling', 'end-ico'));
    }
    const pauseBtn = iconButton('pause', 'Pause', () => this.pause(), 'c-blue');
    const el = h('div', { class: 'hud' }, h('div', { class: 'hud-row' }, pauseBtn, h('div', { class: 'plaque' }, title, score), badge), meter);
    root.append(el);
    this.hud = { el, score, title, badge, badgeValue, fill, marks };
    this.refreshHud();

    if (level) {
      const l = this.game.level!;
      const color = THEME_INFO[this.theme].ribbon;
      if (l.press) this.banner(`Level ${l.id}`, `The ceiling drops every ${l.press} shots!`, 'ceiling', color);
      else this.banner(`Level ${l.id}`, `Clear the bubbles in ${l.shots} shots`, 'pop', color);
    } else {
      this.banner('Arcade', 'Rows keep coming. Survive!', 'bolt', 'c-orange');
    }
  }

  private banner(big: string, small?: string, ico?: IconName, color = 'c-pink'): void {
    const b = h('div', { class: 'banner' }, ribbon(big, color, true), small ? h('div', { class: 'goal' }, ico ? icon(ico) : null, h('span', null, small)) : null);
    this.root.append(b);
    setTimeout(() => b.remove(), 2000);
  }

  resize(w: number, hgt: number): void {
    const ins = this.app.insets();
    const top = (this.hud?.el.getBoundingClientRect().bottom ?? ins.top + 110) + 12;
    const bottom = ins.bottom + 8;
    this.view.layout(ins.left + 6, top, w - ins.left - ins.right - 12, hgt - top - bottom);
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
        this.banner('Board clear!', `+${bonus.toLocaleString()} bonus`, 'star', 'c-lime');
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
        if (this.mode === 'level') this.view.shake(5);
        this.syncLauncher();
        this.refreshHud();
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
      this.hud.score.textContent = this.shownScore.toLocaleString();
    }
    if (this.mode === 'arcade') {
      this.hud.fill.style.width = `${Math.min(100, this.game.pushProgress * 100)}%`;
      const t = `Arcade · Lv ${this.game.arcadeLevel}`;
      if (this.hud.title.textContent !== t) this.hud.title.textContent = t;
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
      this.hud.badgeValue.textContent = String(left);
      this.hud.badge.classList.toggle('low', left <= 5);
      const l = g.level!;
      // Stars sit at fixed spots on the bar; the fill is piecewise so each threshold lines up.
      const [s2, s3] = l.stars;
      const pct = g.score < s2 ? (g.score / s2) * STAR2_AT : STAR2_AT + Math.min(1, (g.score - s2) / Math.max(1, s3 - s2)) * (100 - STAR2_AT);
      this.hud.fill.style.width = `${Math.min(100, pct)}%`;
      this.hud.marks[0]?.classList.toggle('on', g.score >= l.stars[0]);
      this.hud.marks[1]?.classList.toggle('on', g.score >= l.stars[1]);
      if (l.press) {
        const n = g.shotsToPress;
        this.hud.title.replaceChildren(h('span', null, `Level ${l.id}`), icon('ceiling'), h('span', null, String(n)));
        this.hud.title.classList.toggle('warn', n <= 1);
      }
    } else {
      const best = Math.max(stats.arcadeBest, g.score);
      this.hud.badgeValue.textContent = best >= 10000 ? `${Math.floor(best / 1000)}k` : String(best);
      this.hud.badgeValue.classList.toggle('long', String(best).length > 3 && best < 10000);
    }
  }

  // ------------------------------------------------------------------ end of game

  /** Runs `fn` later unless the player already left this screen. */
  private later(ms: number, fn: () => void): void {
    setTimeout(() => {
      if (!this.destroyed) fn();
    }, ms);
  }

  private onEnd(): void {
    keepScreenOn(false);
    const g = this.game;
    this.refreshHud();
    // Save results right away so leaving quickly never loses them.
    if (this.mode === 'level') {
      if (g.state === 'won') this.newBest = recordLevel(this.levelId, g.stars(), g.score);
    } else {
      this.record = g.score > stats.arcadeBest;
      if (this.record) stats.arcadeBest = g.score;
      stats.arcadeBestLevel = Math.max(stats.arcadeBestLevel, g.arcadeLevel);
      saveStats();
    }
    if (g.state === 'won') {
      const stones = g.leftoverStones();
      this.view.dropCells(stones, stones.map(() => 9));
      for (const i of stones) g.board.cells[i] = 0;
      sound.win();
      haptic(40);
      this.later(900, () => this.showLevelWon());
    } else {
      sound.lose();
      haptic(80);
      this.view.shake(6);
      this.later(900, () => (this.mode === 'level' ? this.showLevelLost() : this.showArcadeOver()));
    }
  }

  private showLevelWon(): void {
    const g = this.game;
    const stars = g.stars();
    const newBest = this.newBest;
    const starEls = [0, 1, 2].map(() => h('div', { class: 'rs' }, icon('star', 'dim'), icon('star', 'lit')));
    const hasNext = this.levelId < LEVEL_COUNT;
    const line = (label: string, value: string) => h('div', { class: 'score-line' }, h('span', null, label), h('b', null, value));
    const panel = h(
      'div',
      { class: 'panel titled dialog pop-in' },
      ribbon(stars === 3 ? 'Perfect!' : 'Level complete!', 'c-lime'),
      h('div', { class: 'result-stars' }, ...starEls),
      h('div', { class: 'score-label' }, 'Score'),
      h('div', { class: 'score-big' }, g.score.toLocaleString()),
      newBest ? h('div', { class: 'new-best' }, 'NEW BEST') : null,
      h('div', { class: 'score-lines' }, line('Shots left bonus', `+${g.endBonus.toLocaleString()}`), line('Best combo', `x${g.bestCombo}`)),
      h(
        'div',
        { class: 'actions' },
        iconButton('map', 'Levels', () => this.leave(() => this.app.go(new LevelSelectScene(this.app))), 'c-cream'),
        iconButton('restart', 'Play again', () => this.leave(() => this.app.go(new SoloScene(this.app, 'level', this.levelId))), 'c-orange'),
        hasNext ? button([h('span', null, 'Next'), icon('next')], () => this.leave(() => this.app.go(new SoloScene(this.app, 'level', this.levelId + 1))), 'btn c-lime') : h('p', { class: 'note' }, 'You beat every level!'),
      ),
    );
    this.showOverlay(panel, true);
    starEls.forEach((el, i) => {
      if (i < stars) {
        this.later(450 + i * 400, () => {
          el.classList.add('on');
          sound.star(i);
          haptic(12);
        });
      }
    });
  }

  private showLevelLost(): void {
    const g = this.game;
    const shots = g.lostReason === 'shots';
    const panel = h(
      'div',
      { class: 'panel titled dialog pop-in' },
      ribbon(shots ? 'Out of shots!' : 'Too close!', 'c-red'),
      icon('sad', 'result-face'),
      h('p', null, shots ? `So close! ${g.board.countColored()} bubbles left.` : 'The bubbles reached the line.'),
      h('div', { class: 'score-label' }, 'Score'),
      h('div', { class: 'score-big' }, g.score.toLocaleString()),
      shots && !this.revived && adsStatus().rewarded ? this.extraShotsButton() : null,
      h(
        'div',
        { class: 'actions' },
        iconButton('map', 'Levels', () => this.leave(() => this.app.go(new LevelSelectScene(this.app))), 'c-cream'),
        button('Try again', () => this.leave(() => this.app.go(new SoloScene(this.app, 'level', this.levelId))), 'btn c-orange', 'restart'),
      ),
    );
    this.showOverlay(panel);
  }

  /** "Watch an ad for 5 more shots" (once per level). */
  private extraShotsButton(): HTMLButtonElement {
    const b = button([h('span', null, `+${AD_EXTRA_SHOTS} shots`), h('small', { class: 'ad-tag' }, 'Watch ad')], () => void this.watchForShots(b), 'btn btn-wide c-purple', 'play');
    return b;
  }

  private async watchForShots(b: HTMLButtonElement): Promise<void> {
    b.disabled = true;
    const earned = await showRewardedAd();
    if (this.destroyed) return;
    if (!earned || !this.game.addShots(AD_EXTRA_SHOTS)) {
      b.disabled = false;
      toast('No extra shots this time. Watch the whole video to get them.');
      return;
    }
    this.revived = true;
    this.overlay?.remove();
    this.overlay = null;
    this.ended = false;
    this.endTimer = 0;
    keepScreenOn(true);
    this.syncLauncher();
    this.refreshHud();
    this.banner(`+${AD_EXTRA_SHOTS} shots`, 'Keep going!', 'star', 'c-lime');
  }

  /** Leaves a finished game, with an occasional ad break first. */
  private leave(go: () => void): void {
    if (this.leaving) return;
    this.leaving = true;
    const early = this.mode === 'level' && this.levelId <= 5;
    void (early ? Promise.resolve() : adBreak()).then(() => {
      if (!this.destroyed) go();
    });
  }

  private showArcadeOver(): void {
    const g = this.game;
    const record = this.record;
    const panel = h(
      'div',
      { class: 'panel titled dialog pop-in' },
      ribbon('Game over', 'c-orange'),
      record ? icon('trophy', 'result-face') : null,
      h('div', { class: 'score-label' }, 'Score'),
      h('div', { class: 'score-big' }, g.score.toLocaleString()),
      record ? h('div', { class: 'new-best' }, 'NEW RECORD') : h('p', null, `Best: ${stats.arcadeBest.toLocaleString()}`),
      h(
        'div',
        { class: 'stat-grid' },
        h('div', { class: 'stat' }, h('b', null, String(g.arcadeLevel)), h('small', null, 'Level reached')),
        h('div', { class: 'stat' }, h('b', null, `x${g.bestCombo}`), h('small', null, 'Best combo')),
      ),
      h(
        'div',
        { class: 'actions' },
        iconButton('home', 'Menu', () => this.leave(() => this.app.goHome()), 'c-cream'),
        button('Play again', () => this.leave(() => this.app.go(new SoloScene(this.app, 'arcade'))), 'btn c-lime', 'restart'),
      ),
    );
    this.showOverlay(panel, record);
  }

  private showOverlay(panel: HTMLElement, rays = false): void {
    this.overlay?.remove();
    this.overlay = h('div', { class: 'overlay' }, rays ? h('div', { class: 'rays' }) : null, panel);
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
        quitIcon: this.mode === 'level' ? 'map' : 'home',
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
    this.destroyed = true;
    keepScreenOn(false);
  }
}

/** Highest level the player may start. */
export function nextLevelToPlay(): number {
  return Math.min(LEVEL_COUNT, progress.unlocked);
}
