import type { App, Scene } from '../app';
import { button, h } from './dom';

export class HowToScene implements Scene {
  theme = 'menu' as const;

  constructor(private app: App) {}

  mount(root: HTMLElement): void {
    const li = (title: string, text: string) => h('li', null, h('b', null, title + ' '), text);
    root.append(
      h(
        'div',
        { class: 'screen' },
        h('div', { class: 'topbar' }, button('←', () => this.app.goHome(), 'btn btn-ghost btn-icon'), h('h2', null, 'How to play')),
        h(
          'div',
          { class: 'panel howto' },
          h(
            'ul',
            { style: 'padding-left:20px;margin:0' },
            li('Aim:', 'touch and drag above the launcher. Lift your finger to shoot. Drag back below the launcher to cancel.'),
            li('Match 3:', 'connect three or more bubbles of the same color to pop them.'),
            li('Drop:', 'bubbles cut off from the ceiling fall for big bonus points.'),
            li('Swap:', 'tap the launcher or the small bubble beside it to swap to the next bubble.'),
            li('Bank shots:', 'bounce off the walls to reach tricky spots.'),
            li('Power-ups:', 'big pops earn a 💣 bomb (blasts everything nearby, even stones) or a 🌈 rainbow (matches any color).'),
            li('Stones:', 'grey stones never pop. Knock them loose by clearing what holds them up.'),
          ),
        ),
        h(
          'div',
          { class: 'panel howto' },
          h('h3', null, 'Modes'),
          h(
            'ul',
            { style: 'padding-left:20px;margin:8px 0 0' },
            li('Levels:', 'clear every colored bubble before you run out of shots. Leftover shots add bonus points and stars.'),
            li('Arcade:', 'a new row drops in on a timer, faster and with more colors as you go. Missed shots speed it up.'),
            li('Multiplayer:', 'up to 4 players on the same Wi-Fi (or phone hotspot). One phone hosts the game, the others join. Drops and big pops send bubbles to your rivals. Last one standing wins!'),
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
