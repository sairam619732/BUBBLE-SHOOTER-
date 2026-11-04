import { sound } from '../audio/sound';
import { vibrate } from '../platform/native';
import { settings } from '../storage';
import { IconName, icon } from './icons';

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

/**
 * Standard game button with click sound + haptic tick.
 * `cls` is the full class list, e.g. 'btn c-lime btn-wide'. Text labels are wrapped in a span
 * so they sit above the glossy highlight.
 */
export function button(label: Child | Child[], onClick: () => void, cls = 'btn c-blue', ico?: IconName): HTMLButtonElement {
  const kids = (Array.isArray(label) ? label : [label]).map((c) => (typeof c === 'string' || typeof c === 'number' ? h('span', null, String(c)) : c));
  const b = h('button', { class: cls, type: 'button' }, ico ? icon(ico) : null, ...kids);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    sound.unlock();
    sound.click();
    haptic(8);
    onClick();
  });
  return b;
}

/** Round icon-only button. */
export function iconButton(ico: IconName, label: string, onClick: () => void, color = 'c-blue', extra = ''): HTMLButtonElement {
  const b = button(null, onClick, `btn btn-round ${color} ${extra}`.trim(), ico);
  b.setAttribute('aria-label', label);
  b.title = label;
  return b;
}

const TAIL = '<path d="M30 2H4.5c-1.4 0-2.1 1.6-1.2 2.6L11 21.5 3.3 38.4c-.9 1 0 2.6 1.2 2.6H30z" stroke="#1c1442" stroke-width="3" stroke-linejoin="round"/><path d="M30 2v9l-6-9z" fill="#1c1442" fill-opacity=".35"/>';

/** Folded ribbon banner. Place it inside a `.panel.titled` or use `inline` for a free-standing one. */
export function ribbon(text: string, color = 'c-pink', inline = false): HTMLElement {
  const tail = (side: string) => {
    const t = document.createElement('template');
    t.innerHTML = `<svg class="rb-tail ${side}" viewBox="0 0 32 44" aria-hidden="true">${TAIL}</svg>`;
    return t.content.firstElementChild as SVGElement;
  };
  const el = h('div', { class: `ribbon ${color}${inline ? ' inline' : ''}` }, tail('l'), h('div', { class: 'rb-band' }, text), tail('r'));
  return el;
}

/** Cream card with a ribbon title. */
export function titledPanel(title: string, color: string, ...children: Child[]): HTMLElement {
  return h('div', { class: 'panel titled' }, ribbon(title, color), ...children);
}

/** Standard top bar: back button, title, optional right-hand element. */
export function topBar(title: string, onBack: () => void, right?: HTMLElement | null): HTMLElement {
  return h('div', { class: 'topbar' }, iconButton('back', 'Back', onBack, 'c-blue'), h('h2', { class: 'screen-title' }, title), right ?? h('span'));
}

export function haptic(ms: number): void {
  if (settings.vibration) vibrate(ms);
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
        { class: 'panel titled dialog pop-in' },
        ribbon(title, 'c-purple'),
        h('p', null, text),
        h('div', { class: 'row' }, button(no, () => close(false), 'btn c-cream'), button(yes, () => close(true), 'btn c-red')),
      ),
    );
    root.append(overlay);
  });
}
