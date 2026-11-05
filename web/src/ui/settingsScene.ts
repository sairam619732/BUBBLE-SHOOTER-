import type { App, Scene } from '../app';
import { LEVEL_COUNT } from '../core/levels';
import { adsStatus, showPrivacyOptions } from '../platform/ads';
import { appVersion, openUrl } from '../platform/native';
import { setSymbols } from '../render/boardView';
import { resetProgress, saveSettings, settings, stats, totalStars } from '../storage';
import { button, confirmDialog, h, titledPanel, toast, topBar } from './dom';
import { audioToggles, toggleRow } from './pauseMenu';

export const PRIVACY_URL = 'https://github.com/sairam619732/BUBBLE-SHOOTER-/blob/main/docs/privacy-policy.md';

export class SettingsScene implements Scene {
  theme = 'menu' as const;
  private root!: HTMLElement;

  constructor(private app: App) {}

  mount(root: HTMLElement): void {
    this.root = root;
    const name = h('input', { class: 'input', id: 'player-name', maxlength: '14', placeholder: 'Your name', value: settings.name }) as HTMLInputElement;
    name.addEventListener('change', () => {
      settings.name = name.value.trim().slice(0, 14);
      saveSettings();
    });
    const stat = (value: string, label: string) => h('div', { class: 'stat' }, h('b', null, value), h('small', null, label));
    root.append(
      h(
        'div',
        { class: 'screen' },
        topBar('Settings', () => this.app.goHome()),
        titledPanel('Player', 'c-orange', h('div', { class: 'field' }, h('label', { for: 'player-name' }, 'Name shown in multiplayer'), name)),
        titledPanel(
          'Sound & play',
          'c-blue',
          ...audioToggles(),
          toggleRow(
            'Color-blind symbols',
            'Adds a shape to every bubble color',
            () => settings.symbols,
            (v) => {
              settings.symbols = v;
              setSymbols(v);
            },
            'shapes',
          ),
        ),
        titledPanel(
          'Records',
          'c-purple',
          h(
            'div',
            { class: 'dialog' },
            h('div', { class: 'stat-grid' }, stat(`${totalStars()}/${LEVEL_COUNT * 3}`, 'Stars'), stat(stats.arcadeBest.toLocaleString(), 'Arcade best'), stat(`${stats.mpWins}/${stats.mpGames}`, 'Versus wins'), stat(String(stats.arcadeBestLevel), 'Arcade level')),
            h(
              'div',
              { class: 'row' },
              button('Privacy policy', () => openUrl(PRIVACY_URL), 'btn btn-sm c-cream'),
              adsStatus().privacy ? button('Ad choices', () => showPrivacyOptions(), 'btn btn-sm c-cream') : null,
              button(
                'Reset progress',
                async () => {
                  const yes = await confirmDialog(this.root, 'Reset progress?', 'This clears all stars, unlocked levels and records.', 'Reset', 'Cancel');
                  if (yes) {
                    resetProgress();
                    toast('Progress reset');
                    this.app.go(new SettingsScene(this.app));
                  }
                },
                'btn btn-sm c-red',
              ),
            ),
            h('p', { class: 'note' }, `Version ${appVersion()}`),
          ),
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
