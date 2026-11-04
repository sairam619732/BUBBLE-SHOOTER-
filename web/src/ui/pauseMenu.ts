import { sound } from '../audio/sound';
import { saveSettings, settings } from '../storage';
import { button, h, ribbon } from './dom';
import { IconName, icon } from './icons';

export function toggleRow(label: string, hint: string | null, get: () => boolean, set: (v: boolean) => void, ico?: IconName): HTMLElement {
  const sw = h('button', { class: get() ? 'switch on' : 'switch', type: 'button', role: 'switch', 'aria-checked': String(get()), 'aria-label': label });
  sw.addEventListener('click', () => {
    set(!get());
    sw.classList.toggle('on', get());
    sw.setAttribute('aria-checked', String(get()));
    saveSettings();
    sound.unlock();
    sound.click();
  });
  return h('div', { class: 'toggle' }, ico ? icon(ico, 't-ico') : null, h('div', { class: 't-text' }, label, hint ? h('small', null, hint) : null), sw);
}

export function audioToggles(onChange?: () => void): HTMLElement[] {
  return [
    toggleRow('Sound effects', null, () => settings.sound, (v) => (settings.sound = v), 'sound'),
    toggleRow(
      'Music',
      null,
      () => settings.music,
      (v) => {
        settings.music = v;
        sound.syncMusic();
      },
      'music',
    ),
    toggleRow('Vibration', null, () => settings.vibration, (v) => (settings.vibration = v), 'vibrate'),
    toggleRow(
      'Aim guide',
      'Show the full shot path',
      () => settings.aimGuide,
      (v) => {
        settings.aimGuide = v;
        onChange?.();
      },
      'aim',
    ),
  ];
}

export function pauseMenu(o: {
  title: string;
  onResume: () => void;
  onRestart?: () => void;
  onQuit: () => void;
  quitLabel: string;
  quitIcon?: IconName;
  onSettingsChanged?: () => void;
}): HTMLElement {
  return h(
    'div',
    { class: 'panel titled dialog pop-in' },
    ribbon(o.title, 'c-blue'),
    h('div', { style: 'width:100%' }, ...audioToggles(o.onSettingsChanged)),
    button('Resume', o.onResume, 'btn btn-wide c-lime', 'play'),
    h('div', { class: 'row' }, o.onRestart ? button('Restart', o.onRestart, 'btn c-orange', 'restart') : null, button(o.quitLabel, o.onQuit, 'btn c-cream', o.quitIcon ?? 'map')),
  );
}
