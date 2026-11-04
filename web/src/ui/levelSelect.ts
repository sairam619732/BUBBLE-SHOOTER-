import type { App, Scene } from '../app';
import { LEVELS_PER_WORLD, LEVEL_COUNT, WORLDS } from '../core/levels';
import { SoloScene } from '../game/soloScene';
import { progress } from '../storage';
import { button, h, starsRow, toast } from './dom';

export class LevelSelectScene implements Scene {
  theme = 'menu' as const;

  constructor(private app: App) {}

  mount(root: HTMLElement): void {
    const screen = h(
      'div',
      { class: 'screen' },
      h('div', { class: 'topbar' }, button('←', () => this.app.goHome(), 'btn btn-ghost btn-icon'), h('h2', null, 'Levels')),
    );
    let current: HTMLElement | null = null;
    WORLDS.forEach((name, w) => {
      const first = w * LEVELS_PER_WORLD + 1;
      const last = Math.min(LEVEL_COUNT, first + LEVELS_PER_WORLD - 1);
      let earned = 0;
      for (let id = first; id <= last; id++) earned += progress.stars[id] ?? 0;
      screen.append(h('div', { class: 'world-title' }, h('span', null, name), h('span', { class: 'small muted' }, `★ ${earned}/${(last - first + 1) * 3}`)));
      const grid = h('div', { class: 'level-grid' });
      for (let id = first; id <= last; id++) {
        const locked = id > progress.unlocked;
        const cls = `lvl w${w}${locked ? ' locked' : ''}${id === progress.unlocked ? ' current' : ''}`;
        const tile = button(
          locked ? h('span', null, '🔒') : h('span', null, String(id)),
          () => {
            if (locked) toast(`Finish level ${id - 1} to unlock`);
            else this.app.go(new SoloScene(this.app, 'level', id));
          },
          cls,
        );
        if (!locked) tile.append(starsRow(progress.stars[id] ?? 0));
        if (id === progress.unlocked) current = tile;
        grid.append(tile);
      }
      screen.append(grid);
    });
    screen.append(h('div', { style: 'height:20px;flex:none' }));
    root.append(screen);
    const target = current as HTMLElement | null;
    if (target) requestAnimationFrame(() => target.scrollIntoView({ block: 'center' }));
  }

  update(): void {}
  draw(): void {}
  resize(): void {}
  back(): boolean {
    this.app.goHome();
    return true;
  }
  destroy(): void {}
}
