import type { App, Scene } from '../app';
import { MatchScene } from '../game/matchScene';
import { MpSession, setSession } from '../game/mpSession';
import { CpuLevel, MAX_PLAYERS } from '../net/protocol';
import { button, h, toast } from './dom';
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

  mount(root: HTMLElement): void {
    const c = this.s.client;
    const isHost = this.s.isHost;
    this.list = h('div', { class: 'list' });
    const panels: HTMLElement[] = [];

    if (this.s.role === 'host') {
      panels.push(
        h(
          'div',
          { class: 'panel', style: 'text-align:center' },
          h('div', { class: 'small muted' }, 'Friends can find this room under “Games nearby”, or join with:'),
          ...this.s.addresses.slice(0, 3).map((a) => h('div', { class: 'addr' }, this.s.port ? `${a}` : a)),
          h('div', { class: 'small muted' }, this.s.port ? `Port ${this.s.port} · same Wi-Fi or this phone's hotspot` : ''),
        ),
      );
    }

    const playersPanel = h('div', { class: 'panel' }, h('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px' }, h('h3', null, 'Players'), h('span', { class: 'small muted', id: 'count' }, '')), this.list);
    panels.push(playersPanel);

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
      this.startBtn = button('▶  Start match', () => this.start(), 'btn btn-hot');
      panels.push(
        h(
          'div',
          { class: 'panel', style: 'display:flex;flex-direction:column;gap:12px' },
          h('div', { style: 'display:flex;gap:10px;align-items:center' }, seg([['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']], this.cpuLevel, (v) => (this.cpuLevel = v as CpuLevel)), button('+ CPU', () => this.addCpu(), 'btn btn-sky btn-small')),
          this.colorsSeg,
          this.startBtn,
        ),
      );
    } else {
      panels.push(h('div', { class: 'panel', style: 'text-align:center' }, h('span', { class: 'spinner' }), h('p', { class: 'muted' }, 'Waiting for the host to start the match…')));
    }

    root.append(
      h(
        'div',
        { class: 'screen' },
        h('div', { class: 'topbar' }, button('←', () => this.leave(), 'btn btn-ghost btn-icon'), h('h2', null, this.s.role === 'offline' ? 'Vs CPU' : c.room || 'Lobby')),
        ...panels,
      ),
    );

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
        if (p.id === c.myId) tags.push(h('span', { class: 'tag' }, 'You'));
        const kick = this.s.isHost && !p.host ? button('✕', () => this.s.server!.kick(p.id), 'btn btn-ghost btn-icon btn-small') : null;
        return h('div', { class: 'item' }, h('div', { class: 'avatar', style: `background:${avatarColor(p.id)}` }, p.cpu ? '🤖' : p.name.slice(0, 1).toUpperCase()), h('div', { class: 'grow' }, h('div', { class: 'name' }, p.name), h('div', { style: 'display:flex;gap:6px;margin-top:3px' }, ...tags)), kick);
      }),
    );
    for (let i = players.length; i < MAX_PLAYERS; i++) {
      this.list.append(h('div', { class: 'item', style: 'opacity:0.45' }, h('div', { class: 'avatar', style: 'background:rgba(255,255,255,0.15)' }, '+'), h('div', { class: 'grow small muted' }, this.s.role === 'offline' ? 'Add a CPU player' : 'Open slot')));
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
