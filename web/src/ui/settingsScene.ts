import type { App, Scene } from '../app';
import { appVersion, openUrl } from '../platform/native';
import { setSymbols } from '../render/boardView';
import { resetProgress, saveSettings, settings, stats } from '../storage';
import { button, confirmDialog, h, toast } from './dom';
import { audioToggles, toggleRow } from './pauseMenu';

export const PRIVACY_URL = 'https://github.com/sairam619732/BUBBLE-SHOOTER-/blob/main/docs/privacy-policy.md';

export class SettingsScene implements Scene {
  theme = 'menu' as const;
  private root!: HTMLElement;

  constructor(private app: App) {}

  mount(root: HTMLElement): void {
    this.root = root;
    const name = h('input', { class: 'input', maxlength: '14', placeholder: 'Your name', value: settings.name }) as HTMLInputElement;
    name.addEventListener('change', () => {
      settings.name = name.value.trim().slice(0, 14);
      saveSettings();
    });
    root.append(
      h(
        'div',
        { class: 'screen' },
        h('div', { class: 'topbar' }, button('←', () => this.app.goHome(), 'btn btn-ghost btn-icon'), h('h2', null, 'Settings')),
        h(
          'div',
          { class: 'panel' },
          h('div', { class: 'field' }, h('label', null, 'Player name (multiplayer)'), name),
          ...audioToggles(),
          toggleRow(
            'Color-blind symbols',
            'Adds a shape to every bubble color',
            () => settings.symbols,
            (v) => {
              settings.symbols = v;
              setSymbols(v);
            },
          ),
        ),
        h(
          'div',
          { class: 'panel' },
          h('div', { class: 'stat-grid', style: 'margin-top:0' }, h('div', { class: 'stat' }, h('b', null, String(stats.arcadeBest)), h('small', null, 'Arcade best')), h('div', { class: 'stat' }, h('b', null, `${stats.mpWins}/${stats.mpGames}`), h('small', null, 'Versus wins'))),
          h(
            'div',
            { class: 'row', style: 'margin-top:14px' },
            button('Privacy policy', () => openUrl(PRIVACY_URL), 'btn btn-ghost btn-small'),
            button(
              'Reset progress',
              async () => {
                const yes = await confirmDialog(this.root, 'Reset progress?', 'This clears all stars, unlocked levels and records.', 'Reset', 'Cancel');
                if (yes) {
                  resetProgress();
                  toast('Progress reset');
                }
              },
              'btn btn-ghost btn-small',
            ),
          ),
          h('p', { class: 'small muted', style: 'text-align:center' }, `Version ${appVersion()}`),
        ),
      ),
    );
  }

  update(): void {}
  draw(): void {}
  resize(): void {}
  back(): boolean {
    this.app.goHome();
    return true;
  }
  destroy(): void {
    saveSettings();
  }
}
