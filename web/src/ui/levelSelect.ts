import type { App, Scene } from '../app';
import { LEVELS_PER_WORLD, LEVEL_COUNT, WORLDS } from '../core/levels';
import { SoloScene } from '../game/soloScene';
import { THEME_INFO, mapSvg, worldTheme } from '../render/scenes';
import { progress, totalStars } from '../storage';
import { button, h, iconButton, ribbon, toast } from './dom';
import { icon } from './icons';

const WORLD_NOTES = [
  'Learn the basics',
  'Bigger shapes, 5 colors',
  'Trickier layouts',
  'Ceiling drops every 10 shots',
  'Ceiling drops every 9 shots',
  'Ceiling drops every 9 shots',
  'Ceiling drops every 8 shots',
  'More stones, drops every 8',
  'More stones, drops every 7',
  'The final challenge',
];

const STEP = 94;
const PAD_TOP = 70;
const PAD_BOTTOM = 170;
const LOCKED_H = 430;

/** Smooth path through points (Catmull-Rom turned into cubic Beziers). */
function smooth(pts: [number, number][]): string {
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

function road(d: string, w: number, hgt: number): SVGSVGElement {
  const t = document.createElement('template');
  t.innerHTML = `<svg class="road" viewBox="0 0 ${w} ${hgt}" preserveAspectRatio="none" aria-hidden="true">
<path d="${d}" fill="none" stroke="rgba(10,6,40,.28)" stroke-width="30" stroke-linecap="round" stroke-linejoin="round" transform="translate(0 6)"/>
<path d="${d}" fill="none" stroke="#1c1442" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
<path d="${d}" fill="none" stroke="#fff3d9" stroke-width="23" stroke-linecap="round" stroke-linejoin="round"/>
<path d="${d}" fill="none" stroke="#efd2a2" stroke-width="5" stroke-linecap="round" stroke-dasharray="3 15"/>
</svg>`;
  return t.content.firstElementChild as SVGSVGElement;
}

export class LevelSelectScene implements Scene {
  theme = 'menu' as const;

  constructor(private app: App) {}

  mount(root: HTMLElement): void {
    const W = Math.min(window.innerWidth, 560);
    const amp = Math.min(W * 0.27, 130);
    const unlocked = Math.min(progress.unlocked, LEVEL_COUNT);
    const currentWorld = Math.floor((unlocked - 1) / LEVELS_PER_WORLD);
    const lastShown = Math.min(WORLDS.length - 1, currentWorld + 1);

    const map = h('div', { class: 'map', style: `max-width:${W}px;margin-left:auto;margin-right:auto` });
    let current: HTMLElement | null = null;

    if (lastShown < WORLDS.length - 1) {
      map.append(h('div', { class: 'map-end' }, `${WORLDS.length - 1 - lastShown} more worlds to discover`));
    }

    for (let w = lastShown; w >= 0; w--) {
      const theme = worldTheme(w);
      const info = THEME_INFO[theme];
      const first = w * LEVELS_PER_WORLD + 1;
      const last = Math.min(LEVEL_COUNT, first + LEVELS_PER_WORLD - 1);
      const locked = first > unlocked;
      const hgt = locked ? LOCKED_H : PAD_TOP + PAD_BOTTOM + (last - first) * STEP;
      const sec = h('div', { class: 'world', style: `height:${hgt}px` });
      sec.innerHTML = mapSvg(theme, W, hgt, 1000 + w * 37, locked);

      let earned = 0;
      for (let id = first; id <= last; id++) earned += progress.stars[id] ?? 0;

      if (locked) {
        sec.append(
          road(`M${W / 2} ${hgt + 20}L${W / 2} ${hgt - 120}`, W, hgt),
          h(
            'div',
            { class: 'panel gate', style: `top:${hgt * 0.42}px` },
            icon('lock', 'big'),
            h('h3', null, `${w + 1}. ${WORLDS[w]}`),
            h('p', null, `Finish level ${first - 1} to unlock levels ${first}–${last}.`),
          ),
        );
        map.append(sec);
        continue;
      }

      const pts: [number, number][] = [[W / 2, hgt + 30]];
      const nodes: HTMLElement[] = [];
      for (let id = first; id <= last; id++) {
        const k = id - first;
        const y = hgt - PAD_BOTTOM - k * STEP;
        const x = W / 2 + Math.sin(k * 0.82 + w * 1.7) * amp;
        pts.push([x, y]);
        const isLocked = id > unlocked;
        const isCurrent = id === unlocked;
        const stars = progress.stars[id] ?? 0;
        const node = button(
          isLocked ? icon('lock') : String(id),
          () => {
            if (isLocked) toast(`Finish level ${id - 1} to unlock`);
            else this.app.go(new SoloScene(this.app, 'level', id));
          },
          `node${isLocked ? ' locked' : ''}${isCurrent ? ' current' : ''}`,
        );
        node.style.left = `${x}px`;
        node.style.top = `${y}px`;
        node.setAttribute('aria-label', isLocked ? `Level ${id}, locked` : `Level ${id}, ${stars} of 3 stars`);
        if (!isLocked) {
          const [n1, n2, n3] = info.accent;
          node.style.setProperty('--n1', n1);
          node.style.setProperty('--n2', n2);
          node.style.setProperty('--n3', n3);
          if (!isCurrent || stars) node.append(h('span', { class: 'n-stars' }, ...[0, 1, 2].map((i) => icon('star', i < stars ? '' : 'off'))));
        }
        nodes.push(node);
        if (isCurrent) {
          current = node;
          const pin = h('div', { class: 'node-pin', style: `left:${x}px;top:${y}px` }, icon('happy'));
          (pin.firstElementChild as SVGElement).style.cssText = 'width:100%;height:100%';
          nodes.push(pin);
        }
      }
      pts.push([W / 2, -30]);
      sec.append(road(smooth(pts), W, hgt), ...nodes);

      sec.append(
        h(
          'div',
          { class: 'world-sign', style: `bottom:${PAD_BOTTOM - 150}px` },
          ribbon(`${w + 1}. ${WORLDS[w]}`, info.ribbon, true),
          h('div', { class: 'w-info' }, icon('star'), h('span', null, `${earned}/${(last - first + 1) * 3}`), h('span', { style: 'opacity:.5' }, '·'), h('span', null, WORLD_NOTES[w] ?? '')),
        ),
      );
      map.append(sec);
    }

    const screen = h(
      'div',
      { class: 'screen map-screen' },
      h('div', { class: 'map-bar' }, iconButton('back', 'Back', () => this.app.goHome(), 'c-blue'), h('h2', { class: 'screen-title' }, 'Levels'), h('div', { class: 'chip' }, icon('star'), String(totalStars()))),
      map,
    );
    root.append(screen);
    const target = current as HTMLElement | null;
    requestAnimationFrame(() => {
      if (target) {
        const r = target.getBoundingClientRect();
        screen.scrollTop += r.top + r.height / 2 - screen.clientHeight * 0.58;
      } else screen.scrollTop = screen.scrollHeight;
    });
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
