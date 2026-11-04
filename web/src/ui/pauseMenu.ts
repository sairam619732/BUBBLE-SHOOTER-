import { sound } from '../audio/sound';
import { saveSettings, settings } from '../storage';
import { button, h } from './dom';

export function toggleRow(label: string, hint: string | null, get: () => boolean, set: (v: boolean) => void): HTMLElement {
  const sw = h('button', { class: get() ? 'switch on' : 'switch', type: 'button', 'aria-label': label });
  sw.addEventListener('click', () => {
    set(!get());
    sw.classList.toggle('on', get());
    saveSettings();
    sound.unlock();
    sound.click();
  });
  return h('div', { class: 'toggle' }, h('div', null, label, hint ? h('small', null, hint) : null), sw);
}

export function audioToggles(onChange?: () => void): HTMLElement[] {
  return [
    toggleRow('Sound effects', null, () => settings.sound, (v) => (settings.sound = v)),
    toggleRow(
      'Music',
      null,
      () => settings.music,
      (v) => {
        settings.music = v;
        sound.syncMusic();
      },
    ),
    toggleRow('Vibration', null, () => settings.vibration, (v) => (settings.vibration = v)),
    toggleRow(
      'Aim guide',
      'Show the full shot path',
      () => settings.aimGuide,
      (v) => {
        settings.aimGuide = v;
        onChange?.();
      },
    ),
  ];
}

export function pauseMenu(o: {
  title: string;
  onResume: () => void;
  onRestart?: () => void;
  onQuit: () => void;
  quitLabel: string;
  onSettingsChanged?: () => void;
}): HTMLElement {
  return h(
    'div',
    { class: 'panel dialog pop-in' },
    h('h2', null, o.title),
    h('div', null, ...audioToggles(o.onSettingsChanged)),
    button('▶  Resume', o.onResume, 'btn btn-mint'),
    h('div', { class: 'row' }, o.onRestart ? button('Restart', o.onRestart, 'btn btn-sky') : null, button(o.quitLabel, o.onQuit, 'btn btn-ghost')),
  );
}
