import type { App, Scene } from '../app';
import { LEVEL_COUNT } from '../core/levels';
import { SoloScene } from '../game/soloScene';
import { progress, stats, totalStars } from '../storage';
import { button, h } from './dom';
import { HowToScene } from './howto';
import { LevelSelectScene } from './levelSelect';
import { MultiplayerScene } from './mpMenu';
import { SettingsScene } from './settingsScene';

const BUBBLE_COLORS = ['#ff4757', '#ffc93c', '#2ed573', '#22d3ee', '#a55eea'];

export class MenuScene implements Scene {
  theme = 'menu' as const;

  constructor(private app: App) {}

  mount(root: HTMLElement): void {
    const big = (title: string, sub: string, cls: string, fn: () => void) =>
      button(h('span', { class: 'lbl' }, h('span', null, title), h('span', { class: 'sub' }, sub)), fn, `btn ${cls}`);
    const withIcon = (b: HTMLButtonElement, ico: string) => {
      b.prepend(h('span', { class: 'ico' }, ico));
      return b;
    };
    const lvl = Math.min(progress.unlocked, LEVEL_COUNT);
    root.append(
      h(
        'div',
        { class: 'screen' },
        h(
          'div',
          { class: 'logo' },
          h('div', { class: 'logo-bubbles' }, ...BUBBLE_COLORS.map((c) => h('span', { style: `background:${c}` }))),
          h('span', { class: 'l1' }, 'Bubble Shooter'),
          h('span', { class: 'l2' }, 'ARENA'),
        ),
        h(
          'div',
          { class: 'menu' },
          withIcon(big('Levels', `Level ${lvl} · ★ ${totalStars()}/${LEVEL_COUNT * 3}`, 'btn-hot', () => this.app.go(new LevelSelectScene(this.app))), '🎯'),
          withIcon(big('Arcade', stats.arcadeBest ? `Best ${stats.arcadeBest}` : 'Endless rows, rising speed', 'btn-sun', () => this.app.go(new SoloScene(this.app, 'arcade'))), '⚡'),
          withIcon(big('Multiplayer', 'Host or join on the same Wi-Fi', 'btn-sky', () => this.app.go(new MultiplayerScene(this.app))), '👥'),
        ),
        h(
          'div',
          { class: 'footer-row' },
          button('⚙', () => this.app.go(new SettingsScene(this.app)), 'btn btn-ghost btn-icon'),
          button('?', () => this.app.go(new HowToScene(this.app)), 'btn btn-ghost btn-icon'),
        ),
      ),
    );
  }

  update(): void {}
  draw(): void {}
  resize(): void {}
  back(): boolean {
    return false;
  }
  destroy(): void {}
}
