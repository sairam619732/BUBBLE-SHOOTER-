import type { App, Scene } from '../app';
import { MpSession, setSession } from '../game/mpSession';
import { GAME_PORT, PROTOCOL_VERSION, RoomAd } from '../net/protocol';
import { addressForCode, cleanCode, parseRoomCode } from '../net/roomCode';
import { createJoinNet } from '../net/transports';
import { isAndroidApp, native } from '../platform/native';
import { saveSettings, settings } from '../storage';
import { button, h, titledPanel, toast, topBar } from './dom';
import { icon } from './icons';
import { LobbyScene } from './lobby';

export function playerName(): string {
  if (!settings.name) {
    settings.name = `Player ${100 + Math.floor(Math.random() * 900)}`;
    saveSettings();
  }
  return settings.name;
}

export class MultiplayerScene implements Scene {
  theme = 'versus' as const;
  private stopScan: (() => void) | null = null;
  private rooms = new Map<string, RoomAd & { seen: number }>();
  private list!: HTMLElement;
  private busy = false;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private app: App) {}

  mount(root: HTMLElement): void {
    setSession(null);
    const name = h('input', { class: 'input', maxlength: '14', placeholder: 'Your name', value: playerName() }) as HTMLInputElement;
    name.addEventListener('change', () => {
      settings.name = name.value.trim().slice(0, 14) || playerName();
      saveSettings();
    });
    const addr = h('input', { class: 'input', placeholder: 'e.g. K7P2M', maxlength: '21', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false' }) as HTMLInputElement;
    this.list = h('div', { class: 'list' });

    root.append(
      h(
        'div',
        { class: 'screen' },
        topBar('Versus', () => this.app.goHome()),
        titledPanel(
          'Play',
          'c-pink',
          h(
            'div',
            { class: 'dialog' },
            h('div', { class: 'field' }, h('label', null, 'Your name'), name),
            h('div', { class: 'row' }, button('Host', () => this.host(false), 'btn c-orange', 'wifi'), button('Vs CPU', () => this.host(true), 'btn c-purple', 'robot')),
            h('p', { class: 'note' }, isAndroidApp ? 'Hosting turns this phone into the game server. Friends on the same Wi-Fi (or your hotspot) can join.' : 'Browser test mode: open this page in a second tab and join from there.'),
          ),
        ),
        titledPanel(
          'Games nearby',
          'c-teal',
          this.list,
          h('div', { class: 'field', style: 'margin-top:14px' }, h('label', null, 'Or join with a room code'), h('div', { class: 'input-row' }, addr, button('Join', () => this.joinManual(addr.value), 'btn c-blue', 'join'))),
        ),
      ),
    );
    this.renderRooms();
    this.stopScan = createJoinNet().scan((ad) => {
      if (ad.v !== PROTOCOL_VERSION) return;
      this.rooms.set(`${ad.address}:${ad.port}`, { ...ad, seen: Date.now() });
      this.renderRooms();
    });
    this.refreshTimer = setInterval(() => {
      const now = Date.now();
      let changed = false;
      for (const [k, r] of this.rooms) {
        if (now - r.seen > 5000) {
          this.rooms.delete(k);
          changed = true;
        }
      }
      if (changed) this.renderRooms();
    }, 1500);
  }

  private renderRooms(): void {
    const items = [...this.rooms.values()];
    if (!items.length) {
      this.list.replaceChildren(h('div', { class: 'empty' }, icon('radar'), 'Looking for games on your Wi-Fi…'));
      return;
    }
    this.list.replaceChildren(
      ...items.map((r) => {
        const open = r.phase === 'lobby' && r.players < r.max;
        const item = h(
          'button',
          { class: 'item', type: 'button', disabled: !open },
          h('div', { class: 'avatar', style: '--av:#ff6b9d' }, icon('wifi')),
          h('div', { class: 'grow' }, h('div', { class: 'name' }, r.room), h('div', { class: 'meta' }, open ? `${r.players}/${r.max} players · tap to join` : r.phase === 'lobby' ? 'Full' : 'Match in progress')),
        );
        item.addEventListener('click', () => open && this.join(r.address, r.port || GAME_PORT));
        return item;
      }),
    );
  }

  private async host(offline: boolean): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const s = await MpSession.host(playerName(), offline);
      if (offline) s.server!.addCpu('normal');
      setSession(s);
      this.app.go(new LobbyScene(this.app, s));
    } catch (e) {
      toast((e as Error).message || 'Could not start hosting.', 3500);
    } finally {
      this.busy = false;
    }
  }

  private joinManual(value: string): void {
    const v = value.trim();
    if (!v) return toast('Enter the room code shown on the host phone');
    // Old-style address, e.g. 192.168.1.23 or 192.168.1.23:47778.
    if (v.includes('.')) {
      const [address, port] = v.split(':');
      return void this.join(address, Number(port) || GAME_PORT);
    }
    const code = parseRoomCode(v);
    if (!code) return toast('Room codes are 5 letters and numbers, like K7P2M');
    if (!isAndroidApp) return void this.join(cleanCode(v), 0);
    let mine: string[] = [];
    try {
      mine = JSON.parse(native?.localAddresses?.() ?? '[]');
    } catch {
      /* no address info */
    }
    const seen = [...this.rooms.values()].map((r) => r.address);
    void this.join(addressForCode(code, seen, mine), code.port);
  }

  private async join(address: string, port: number): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    toast('Connecting…', 1200);
    try {
      const s = await MpSession.join(address, port, playerName());
      setSession(s);
      this.app.go(new LobbyScene(this.app, s));
    } catch (e) {
      toast((e as Error).message || 'Could not join.', 3500);
    } finally {
      this.busy = false;
    }
  }

  update(): void {}
  draw(): void {}
  resize(): void {}
  back(): boolean {
    this.app.goHome();
    return true;
  }
  destroy(): void {
    this.stopScan?.();
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }
}
