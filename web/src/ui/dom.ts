import { sound } from '../audio/sound';
import { vibrate } from '../platform/native';
import { settings } from '../storage';

type Child = Node | string | number | null | undefined | false;
type Attrs = {
  class?: string;
  style?: string;
  onClick?: (e: MouseEvent) => void;
  [key: string]: unknown;
};

/** Tiny hyperscript helper for building DOM. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'style') el.setAttribute('style', String(v));
      else if (k === 'onClick') el.addEventListener('click', v as EventListener);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'number' ? String(c) : c);
  }
  return el;
}

/** Standard game button with click sound + haptic tick. */
export function button(label: Child, onClick: () => void, cls = 'btn'): HTMLButtonElement {
  const b = h('button', { class: cls, type: 'button' }, label);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    sound.unlock();
    sound.click();
    haptic(8);
    onClick();
  });
  return b;
}

export function haptic(ms: number): void {
  if (settings.vibration) vibrate(ms);
}

export function starsRow(n: number, max = 3, cls = 'stars'): HTMLElement {
  const row = h('div', { class: cls });
  for (let i = 0; i < max; i++) row.append(h('span', { class: i < n ? 'star on' : 'star' }, '★'));
  return row;
}

export function toast(text: string, ms = 2200): void {
  const t = h('div', { class: 'toast' }, text);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 400);
  }, ms);
}

/** Modal confirm dialog rendered in the UI layer. */
export function confirmDialog(root: HTMLElement, title: string, text: string, yes: string, no: string): Promise<boolean> {
  return new Promise((resolve) => {
    const close = (v: boolean) => {
      overlay.remove();
      resolve(v);
    };
    const overlay = h(
      'div',
      { class: 'overlay' },
      h(
        'div',
        { class: 'panel dialog pop-in' },
        h('h2', null, title),
        h('p', { class: 'muted' }, text),
        h('div', { class: 'row' }, button(no, () => close(false), 'btn btn-ghost'), button(yes, () => close(true), 'btn btn-hot')),
      ),
    );
    root.append(overlay);
  });
}
