import type { App, Scene } from '../app';
import { AD_EXTRA_SHOTS } from '../platform/ads';
import { isAndroidApp } from '../platform/native';
import { h, titledPanel, topBar } from './dom';
import { IconName, icon } from './icons';

export class HowToScene implements Scene {
  theme = 'menu' as const;

  constructor(private app: App) {}

  mount(root: HTMLElement): void {
    const rule = (ico: IconName, title: string, text: string) => h('div', { class: 'rule' }, icon(ico, 'r-ico'), h('div', null, h('b', null, title), h('span', null, text)));
    root.append(
      h(
        'div',
        { class: 'screen' },
        topBar('How to play', () => this.app.goHome()),
        titledPanel(
          'Rules',
          'c-pink',
          h(
            'div',
            { class: 'rules' },
            rule('finger', 'Aim', 'Touch and drag above the cannon, then lift your finger to shoot. Drag below the cannon to cancel.'),
            rule('pop', 'Match 3', 'Connect three or more bubbles of the same color to pop them.'),
            rule('drop', 'Drop', 'Bubbles cut off from the ceiling fall for big bonus points.'),
            rule('swap', 'Swap', 'Tap the cannon or the small bubble beside it to swap to the next bubble.'),
            rule('bounce', 'Bank shots', 'Bounce off the walls to reach tricky spots.'),
            rule('bomb', 'Power-ups', 'Big pops earn a bomb (blasts everything nearby, even stones) or a rainbow bubble (matches any color).'),
            rule('stone', 'Stones', 'Grey stones never pop. Knock them loose by clearing what holds them up.'),
            rule('ceiling', 'Ceiling drops', 'From world 4, a steel plate pushes everything down every few shots. Watch the counter at the top.'),
            isAndroidApp ? rule('play', 'Extra shots', `Out of shots? Watch a short video for ${AD_EXTRA_SHOTS} more, once per level.`) : null,
          ),
        ),
        titledPanel(
          'Modes',
          'c-teal',
          h(
            'div',
            { class: 'rules' },
            rule('map', 'Levels', '200 levels in 10 worlds. Clear every colored bubble before you run out of shots. Leftover shots add bonus points and stars.'),
            rule('bolt', 'Arcade', 'A new row drops in on a timer, faster and with more colors as you go. Missed shots speed it up.'),
            rule('users', 'Versus', 'Up to 4 players on the same Wi-Fi or phone hotspot. One phone hosts, the others join. Drops and big pops send bubbles to your rivals. Last one standing wins!'),
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
  destroy(): void {}
}
