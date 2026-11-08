import type { App, Scene } from '../app';
import { MatchScene } from '../game/matchScene';
import { MpSession, setSession } from '../game/mpSession';
import { CpuLevel, GAME_PORT, MAX_PLAYERS } from '../net/protocol';
import { makeRoomCode } from '../net/roomCode';
import { button, h, iconButton, titledPanel, toast, topBar } from './dom';
import { icon } from './icons';
import { MultiplayerScene } from './mpMenu';

export const AVATAR_COLORS = ['#ff4757', '#22d3ee', '#ffc93c', '#2ed573', '#a55eea', '#3d6bff'];

export function avatarColor(id: number): string {
  return AVATAR_COLORS[(id - 1) % AVATAR_COLORS.length];
}

export class LobbyScene implements Scene {
  theme = 'versus' as const;
  private list!: HTMLElement;
  private startBtn: HTMLButtonElement | null = null;
  private cpuLevel: CpuLevel = 'normal';
  private colorsSeg: HTMLElement | null = null;

  constructor(
    private app: App,
    private s: MpSession,
  ) {}

  /** How friends can join: a 5-character room code, or the address if no code fits. */
  private joinInfo(): HTMLElement[] {
    const { addresses, port } = this.s;
    const code = port ? makeRoomCode(addresses[0] ?? '', port) : addresses[0];
    const lead = h('p', { class: 'note' }, 'Friends on the same Wi-Fi see this room under “Games nearby”, or can join with this code:');
    const tail = h('p', { class: 'note' }, port ? "Same Wi-Fi or this phone's hotspot" : 'Browser test mode: join from another tab.');
    if (code) return [lead, h('div', { class: 'addr room-code' }, code), tail];
    const where = addresses.slice(0, 3).map((a) => h('div', { class: 'addr' }, port && port !== GAME_PORT ? `${a}:${port}` : a));
    return [h('p', { class: 'note' }, 'Friends on the same Wi-Fi see this room under “Games nearby”. They can also join with:'), ...where, tail];
  }

  mount(root: HTMLElement): void {
    const c = this.s.client;
    const isHost = this.s.isHost;
    this.list = h('div', { class: 'list' });
    const panels: HTMLElement[] = [];

    if (this.s.role === 'host') {
      panels.push(
        titledPanel(
          'Your room',
          'c-teal',
          h('div', { class: 'dialog' }, ...this.joinInfo()),
        ),
      );
    }

    panels.push(titledPanel('Players', 'c-pink', h('div', { class: 'panel-head' }, h('span', { class: 'note' }, 'Last one standing wins'), h('span', { class: 'count', id: 'count' }, '')), this.list));

    if (isHost) {
      const seg = (options: [string, string][], current: string, pick: (v: string) => void) => {
        const el = h('div', { class: 'seg' });
        for (const [v, label] of options) {
          const b = h('button', { type: 'button', class: v === current ? 'on' : '' }, label);
          b.addEventListener('click', () => {
            for (const x of el.children) x.classList.remove('on');
            b.classList.add('on');
            pick(v);
          });
          el.append(b);
        }
        return el;
      };
      this.colorsSeg = seg(
        [
          ['4', '4 colors'],
          ['5', '5 colors'],
          ['6', '6 colors'],
        ],
        String(this.s.server!.settings.colors),
        (v) => this.s.server!.setColors(Number(v)),
      );
      this.startBtn = button('Start match', () => this.start(), 'btn btn-wide c-lime', 'play');
      panels.push(
        titledPanel(
          'Match setup',
          'c-orange',
          h(
            'div',
            { class: 'dialog' },
            h('div', { class: 'ctrl-row', style: 'width:100%' }, icon('robot', 't-ico'), seg([['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']], this.cpuLevel, (v) => (this.cpuLevel = v as CpuLevel)), button('CPU', () => this.addCpu(), 'btn btn-sm c-blue', 'plus')),
            h('div', { class: 'ctrl-row', style: 'width:100%' }, icon('palette', 't-ico'), this.colorsSeg),
            this.startBtn,
          ),
        ),
      );
    } else {
      panels.push(h('div', { class: 'panel dialog' }, h('span', { class: 'spinner' }), h('p', { class: 'note' }, 'Waiting for the host to start the match…')));
    }

    root.append(h('div', { class: 'screen' }, topBar(this.s.role === 'offline' ? 'Vs CPU' : c.room || 'Lobby', () => this.leave()), ...panels));

    c.onEvent = (e) => {
      if (e.type === 'lobby') this.render();
      else if (e.type === 'start') this.app.go(new MatchScene(this.app, this.s, e.countdown));
      else if (e.type === 'closed' || e.type === 'rejected') {
        toast(e.reason, 3500);
        setSession(null);
        this.app.go(new MultiplayerScene(this.app));
      }
    };
    this.render();
  }

  private render(): void {
    const c = this.s.client;
    const players = this.s.server ? this.s.server.players : c.players;
    const count = document.getElementById('count');
    if (count) count.textContent = `${players.length}/${MAX_PLAYERS}`;
    this.list.replaceChildren(
      ...players.map((p) => {
        const tags: HTMLElement[] = [];
        if (p.host) tags.push(h('span', { class: 'tag host' }, 'Host'));
        if (p.cpu) tags.push(h('span', { class: 'tag' }, 'CPU'));
        if (p.id === c.myId) tags.push(h('span', { class: 'tag you' }, 'You'));
        const kick = this.s.isHost && !p.host ? iconButton('close', `Remove ${p.name}`, () => this.s.server!.kick(p.id), 'c-red', 'btn-sm') : null;
        return h(
          'div',
          { class: 'item' },
          h('div', { class: 'avatar', style: `--av:${avatarColor(p.id)}` }, p.cpu ? icon('robot') : p.name.slice(0, 1).toUpperCase()),
          h('div', { class: 'grow' }, h('div', { class: 'name' }, p.name), h('div', { class: 'tags' }, ...tags)),
          kick,
        );
      }),
    );
    for (let i = players.length; i < MAX_PLAYERS; i++) {
      this.list.append(h('div', { class: 'item open-slot' }, h('div', { class: 'avatar empty' }, '+'), h('div', { class: 'grow' }, h('div', { class: 'meta' }, this.s.role === 'offline' ? 'Add a CPU player' : 'Open slot'))));
    }
    if (this.startBtn) this.startBtn.disabled = !(this.s.server?.canStart() ?? false);
  }

  private addCpu(): void {
    if (!this.s.server!.addCpu(this.cpuLevel)) toast('The room is full');
    this.render();
  }

  private start(): void {
    if (!this.s.server!.start()) toast('Need at least 2 players. Add a CPU or wait for a friend.');
  }

  private leave(): void {
    setSession(null);
    this.app.go(new MultiplayerScene(this.app));
  }

  update(): void {}
  draw(): void {}
  resize(): void {}
  back(): boolean {
    this.leave();
    return true;
  }
  destroy(): void {
    this.s.client.onEvent = null;
  }
}
