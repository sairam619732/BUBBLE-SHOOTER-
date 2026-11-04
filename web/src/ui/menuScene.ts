import type { App, Scene } from '../app';
import { LEVEL_COUNT } from '../core/levels';
import { SoloScene } from '../game/soloScene';
import { progress, stats, totalStars } from '../storage';
import { button, h, iconButton } from './dom';
import { HowToScene } from './howto';
import { icon } from './icons';
import { LevelSelectScene } from './levelSelect';
import { MultiplayerScene } from './mpMenu';
import { SettingsScene } from './settingsScene';

const INK = '#1c1442';

function bubble(x: number, y: number, r: number, light: string, base: string, dark: string, face = false): string {
  const id = `lb${Math.round(x)}${Math.round(y)}`;
  const eyes = face
    ? `<circle cx="${x - r * 0.3}" cy="${y + r * 0.02}" r="${r * 0.13}" fill="${INK}"/><circle cx="${x + r * 0.3}" cy="${y + r * 0.02}" r="${r * 0.13}" fill="${INK}"/><path d="M${x - r * 0.22} ${y + r * 0.3}q${r * 0.22} ${r * 0.2} ${r * 0.44} 0" fill="none" stroke="${INK}" stroke-width="${r * 0.1}" stroke-linecap="round"/><circle cx="${x - r * 0.52}" cy="${y + r * 0.28}" r="${r * 0.1}" fill="#ff6b9d" fill-opacity=".7"/><circle cx="${x + r * 0.52}" cy="${y + r * 0.28}" r="${r * 0.1}" fill="#ff6b9d" fill-opacity=".7"/>`
    : '';
  return `<radialGradient id="${id}" cx="${x - r * 0.3}" cy="${y - r * 0.35}" r="${r * 1.25}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${light}"/><stop offset=".45" stop-color="${base}"/><stop offset="1" stop-color="${dark}"/></radialGradient>
<circle cx="${x}" cy="${y}" r="${r}" fill="url(#${id})" stroke="${INK}" stroke-width="4"/>
<ellipse cx="${x - r * 0.34}" cy="${y - r * 0.42}" rx="${r * 0.38}" ry="${r * 0.2}" fill="#fff" fill-opacity=".8" transform="rotate(-32 ${x - r * 0.34} ${y - r * 0.42})"/>${eyes}`;
}

/** The game logo as one SVG: wavy outlined letters, a light sweep and a ribbon. */
export function logoSvg(): string {
  const word = (text: string, y: number, size: number, len: number, fill: string, dy: string, rot: string) => {
    const t = (attrs: string) => `<text x="200" y="${y}" font-size="${size}" textLength="${len}" lengthAdjust="spacingAndGlyphs" ${attrs}><tspan dy="${dy}" rotate="${rot}">${text}</tspan></text>`;
    return (
      t(`fill="#0d3d7a" stroke="${INK}" stroke-width="16" stroke-linejoin="round" paint-order="stroke" transform="translate(0 9)"`) +
      t(`fill="${fill}" stroke="${INK}" stroke-width="13" stroke-linejoin="round" paint-order="stroke"`)
    );
  };
  return `<svg viewBox="0 0 400 262" role="img" aria-label="Bubble Shooter Arena">
<defs>
<linearGradient id="lgA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#fff4b0"/><stop offset="1" stop-color="#ffc533"/></linearGradient>
<linearGradient id="lgB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#d8f6ff"/><stop offset="1" stop-color="#6fd0ff"/></linearGradient>
<linearGradient id="lgR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9fd0"/><stop offset="1" stop-color="#e8307f"/></linearGradient>
<linearGradient id="lgS" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<clipPath id="lgClip"><text x="200" y="104" font-size="100" textLength="338" lengthAdjust="spacingAndGlyphs" font-family="Lilita One, sans-serif" text-anchor="middle"><tspan dy="-3 6 -6 6 -6 6">BUBBLE</tspan></text><text x="200" y="186" font-size="84" textLength="330" lengthAdjust="spacingAndGlyphs" font-family="Lilita One, sans-serif" text-anchor="middle"><tspan dy="3 -6 6 -6 6 -6 6">SHOOTER</tspan></text></clipPath>
</defs>
${bubble(34, 52, 25, '#ffd0d6', '#ff4d6a', '#a3102c', true)}
${bubble(372, 44, 19, '#fff6c4', '#ffc93c', '#c27d00')}
${bubble(388, 136, 14, '#c4f7ff', '#22d3ee', '#06819a')}
${bubble(12, 150, 13, '#d6c4ff', '#a55eea', '#5f1fa3')}
<g font-family="Lilita One, sans-serif" text-anchor="middle">
${word('BUBBLE', 104, 100, 338, 'url(#lgA)', '-3 6 -6 6 -6 6', '-6 4 -4 5 -3 6')}
${word('SHOOTER', 186, 84, 330, 'url(#lgB)', '3 -6 6 -6 6 -6 6', '5 -4 4 -5 3 -4 5')}
</g>
<g clip-path="url(#lgClip)"><rect class="shine" x="0" y="0" width="70" height="220" fill="url(#lgS)"/></g>
<g>
<path d="M98 214h-44c-2.4 0-3.4 3-1.6 4.6L66 230l-13.6 11.4c-1.8 1.6-.8 4.6 1.6 4.6h44z" fill="#991257" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
<path d="M302 214h44c2.4 0 3.4 3 1.6 4.6L334 230l13.6 11.4c1.8 1.6.8 4.6-1.6 4.6h-44z" fill="#991257" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
<rect x="84" y="200" width="232" height="42" rx="10" fill="url(#lgR)" stroke="${INK}" stroke-width="4"/>
<rect x="92" y="205" width="216" height="9" rx="4.5" fill="#fff" fill-opacity=".35"/>
<text x="200" y="233" font-family="Lilita One, sans-serif" font-size="32" text-anchor="middle" letter-spacing="9" fill="#fff" stroke="${INK}" stroke-width="7" stroke-linejoin="round" paint-order="stroke">ARENA</text>
</g>
${bubble(66, 222, 11, '#b4f8cf', '#2ed573', '#0d8a43')}
${bubble(338, 226, 15, '#b3c6ff', '#3d6bff', '#1832a8', true)}
</svg>`;
}

export class MenuScene implements Scene {
  theme = 'menu' as const;

  constructor(private app: App) {}

  mount(root: HTMLElement): void {
    const lvl = Math.min(progress.unlocked, LEVEL_COUNT);
    const logo = h('div', { class: 'logo' });
    logo.innerHTML = logoSvg();

    const play = button(
      [h('span', { class: 'pl-main' }, icon('play'), h('span', null, 'PLAY')), h('span', { class: 'pl-sub' }, `Level ${lvl}`)],
      () => this.app.go(new LevelSelectScene(this.app)),
      'btn btn-xl c-lime play-btn',
    );
    const arcade = button(
      [icon('bolt'), h('span', { class: 't-name' }, 'Arcade'), h('span', { class: 't-sub' }, stats.arcadeBest ? `Best ${stats.arcadeBest.toLocaleString()}` : 'Endless rows')],
      () => this.app.go(new SoloScene(this.app, 'arcade')),
      'btn tile c-orange',
    );
    const versus = button(
      [icon('users'), h('span', { class: 't-name' }, 'Versus'), h('span', { class: 't-sub' }, 'Wi-Fi or vs CPU')],
      () => this.app.go(new MultiplayerScene(this.app)),
      'btn tile c-pink',
    );

    root.append(
      h(
        'div',
        { class: 'screen menu-screen' },
        h(
          'div',
          { class: 'menu-top' },
          h('div', { class: 'chip', title: 'Stars earned' }, icon('star'), `${totalStars()} / ${LEVEL_COUNT * 3}`),
          h('div', { class: 'spacer' }),
          iconButton('help', 'How to play', () => this.app.go(new HowToScene(this.app)), 'c-teal'),
          iconButton('gear', 'Settings', () => this.app.go(new SettingsScene(this.app)), 'c-purple'),
        ),
        logo,
        h('div', { class: 'menu-main' }, play, h('div', { class: 'tiles' }, arcade, versus)),
        h('div', { class: 'menu-foot' }, 'Plays offline · no ads · up to 4 players on Wi-Fi'),
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
