import type { App, Scene } from '../app';
import { sound } from '../audio/sound';
import { MAX_ANGLE, MIN_ANGLE, SHOOTER_Y } from '../core/constants';
import { angleTo, clampAngle } from '../core/physics';
import type { ClientEvent } from '../net/client';
import { keepScreenOn } from '../platform/native';
import { BoardView } from '../render/boardView';
import { saveStats, settings, stats } from '../storage';
import { button, confirmDialog, h, haptic, iconButton, ribbon, toast } from '../ui/dom';
import { icon } from '../ui/icons';
import { LobbyScene, avatarColor } from '../ui/lobby';
import { MultiplayerScene } from '../ui/mpMenu';
import { MpSession, setSession } from './mpSession';

interface Mini {
  id: number;
  view: BoardView;
  label: HTMLElement;
  status: HTMLElement;
}

/** A versus match as seen by one player. Works the same for host and guests. */
export class MatchScene implements Scene {
  theme = 'versus' as const;
  private view: BoardView;
  private minis: Mini[] = [];
  private root!: HTMLElement;
  private scoreEl!: HTMLElement;
  private aliveEl!: HTMLElement;
  private fill!: HTMLElement;
  private labels!: HTMLElement;
  private hudEl!: HTMLElement;
  private overlay: HTMLElement | null = null;
  private aiming = false;
  private swapTouch = false;
  private pushIn = 0;
  private pushTotal = 1;
  private playing = false;
  private out = false;
  private pendingSeq = 0;
  private destroyed = false;

  constructor(
    private app: App,
    private s: MpSession,
    countdown: number,
  ) {
    const c = s.client;
    const me = c.me!;
    this.view = new BoardView(me.board);
    this.view.aimGuide = settings.aimGuide;
    this.view.cur = me.cur;
    this.view.nxt = me.nxt;
    for (const p of c.players) {
      if (p.id === c.myId) continue;
      const rb = c.boards.get(p.id);
      if (!rb) continue;
      const v = new BoardView(rb.board);
      v.quiet = true;
      v.showLauncher = false;
      this.minis.push({ id: p.id, view: v, label: h('div'), status: h('span') });
    }
    this.startCountdown(countdown);
  }

  mount(root: HTMLElement): void {
    this.root = root;
    keepScreenOn(true);
    this.scoreEl = h('div', { class: 'p-score' }, '0');
    this.aliveEl = h('b', null, '');
    this.fill = h('div', { class: 'fill' });
    const leave = iconButton('close', 'Leave match', () => this.confirmLeave(), 'c-red');
    this.hudEl = h(
      'div',
      { class: 'hud' },
      h('div', { class: 'hud-row' }, leave, h('div', { class: 'plaque' }, h('div', { class: 'p-title' }, 'Versus'), this.scoreEl), h('div', { class: 'badge' }, this.aliveEl, h('small', null, 'Alive'))),
      h('div', { class: 'meter timer' }, this.fill, icon('ceiling', 'end-ico')),
    );
    root.append(this.hudEl);
    this.labels = h('div', { class: 'mini-labels' });
    for (const m of this.minis) {
      const p = this.s.client.players.find((x) => x.id === m.id)!;
      m.status = h('span', { class: 'sc' });
      m.label = h('div', { class: 'mini-label' }, h('span', { class: 'dot', style: `background:${avatarColor(p.id)}` }), h('span', { class: 'nm' }, p.name), m.status);
      this.labels.append(m.label);
    }
    root.append(this.labels);
    this.refresh();
    this.s.client.onEvent = (e) => this.onEvent(e);
  }

  private startCountdown(n: number): void {
    let k = Math.round(n);
    const show = () => {
      if (this.destroyed) return;
      if (!this.root) return setTimeout(show, 30);
      const el = h('div', { class: 'countdown' }, h('span', { class: k > 0 ? '' : 'go' }, k > 0 ? String(k) : 'GO!'));
      this.root.append(el);
      sound.countdown(k <= 0);
      setTimeout(() => el.remove(), 950);
      k--;
      if (k >= 0) setTimeout(show, 1000);
    };
    setTimeout(show, 0);
  }

  resize(w: number, hgt: number): void {
    const ins = this.app.insets();
    const top = (this.hudEl?.getBoundingClientRect().bottom ?? ins.top + 110) + 10;
    const n = this.minis.length;
    const stripH = n ? Math.min(hgt * 0.19, 170) : 0;
    const labelH = 26;
    const gap = 10;
    const availW = w - ins.left - ins.right - 16;
    const miniW = n ? Math.min(availW / n - gap, 160) : 0;
    const total = n * miniW + (n - 1) * gap;
    let x = ins.left + 8 + (availW - total) / 2;
    this.minis.forEach((m) => {
      m.view.layout(x, top, miniW, stripH - labelH, true);
      m.label.style.left = `${x + miniW / 2}px`;
      m.label.style.top = `${top + stripH - labelH + 4}px`;
      m.label.style.maxWidth = `${miniW + 8}px`;
      x += miniW + gap;
    });
    const boardTop = top + stripH + (n ? 10 : 0);
    this.view.layout(ins.left + 6, boardTop, w - ins.left - ins.right - 12, hgt - boardTop - ins.bottom - 8);
  }

  // ---------------------------------------------------------------- network events

  private miniOf(id: number): Mini | undefined {
    return this.minis.find((m) => m.id === id);
  }

  private onEvent(e: ClientEvent): void {
    const c = this.s.client;
    switch (e.type) {
      case 'go':
        this.playing = true;
        this.pushIn = this.pushTotal = e.pushIn;
        break;
      case 'shot': {
        if (e.id === c.myId) {
          this.view.launch(e.shot, e.seq, (shot) => {
            const n = shot.outcome.popped.length + shot.outcome.dropped.length;
            if (n >= 8) haptic(30);
            else if (n) haptic(12);
          });
          if (e.seq === this.pendingSeq) this.pendingSeq = 0;
          this.syncLauncher();
          if (e.atk) {
            this.view.text(`→ ${c.playerName(e.atk.to)} +${e.atk.n}`, 180, 380, '#ffd54a', 20);
          }
        } else {
          this.miniOf(e.id)?.view.launch(e.shot);
        }
        this.refresh();
        break;
      }
      case 'nack':
        this.view.cancel(e.seq);
        if (e.seq === this.pendingSeq) this.pendingSeq = 0;
        this.syncLauncher();
        break;
      case 'swap':
        if (e.id === c.myId) this.syncLauncher();
        break;
      case 'garbage': {
        if (e.id === c.myId) {
          this.view.garbageIn(e.cells);
          this.view.text(`${c.playerName(e.from)} attacks! +${e.cells.length}`, 180, 330, '#ff8fa3', 22);
          haptic(40);
          sound.warn();
        } else {
          this.miniOf(e.id)?.view.garbageIn(e.cells);
        }
        break;
      }
      case 'prePush':
        this.view.finishNow();
        for (const m of this.minis) m.view.finishNow();
        break;
      case 'push':
        this.view.pushed();
        for (const m of this.minis) m.view.pushed();
        this.pushIn = this.pushTotal = e.pushIn;
        this.syncLauncher();
        haptic(15);
        break;
      case 'out':
        if (e.id === c.myId) {
          this.out = true;
          this.view.finishNow();
          this.view.collapse();
          this.view.dimmed = true;
          this.banner('Knocked out!', `You finished #${e.rank}`);
          sound.lose();
          haptic(80);
        } else {
          const m = this.miniOf(e.id);
          if (m) {
            m.view.finishNow();
            m.view.collapse();
            m.view.dimmed = true;
          }
          this.view.text(`${c.playerName(e.id)} is out!`, 180, 300, '#ffffff', 22);
        }
        this.refresh();
        break;
      case 'end':
        this.playing = false;
        this.showResults(e.ranking);
        break;
      case 'resynced':
        if (e.id === c.myId) {
          this.view.board = c.me!.board;
          this.syncLauncher();
        } else {
          const m = this.miniOf(e.id);
          const rb = c.boards.get(e.id);
          if (m && rb) m.view.board = rb.board;
        }
        break;
      case 'lobby':
        if (c.phase === 'lobby') this.app.go(new LobbyScene(this.app, this.s));
        break;
      case 'start':
        this.app.go(new MatchScene(this.app, this.s, e.countdown));
        break;
      case 'closed':
      case 'rejected':
        toast(e.reason, 3500);
        setSession(null);
        this.app.go(new MultiplayerScene(this.app));
        break;
    }
  }

  private syncLauncher(): void {
    const me = this.s.client.me;
    if (!me) return;
    if (this.pendingSeq) {
      // Our shot is in flight and not yet confirmed: show what comes next.
      this.view.cur = me.nxt;
      this.view.nxt = 0;
    } else {
      this.view.cur = me.cur;
      this.view.nxt = me.nxt;
    }
  }

  private refresh(): void {
    const c = this.s.client;
    const me = c.me;
    if (me) this.scoreEl.textContent = me.score.toLocaleString();
    let alive = 0;
    for (const rb of c.boards.values()) if (rb.alive) alive++;
    this.aliveEl.textContent = `${alive}/${c.boards.size}`;
    for (const m of this.minis) {
      const rb = c.boards.get(m.id);
      if (!rb) continue;
      const p = c.players.find((x) => x.id === m.id);
      m.status.textContent = rb.alive ? rb.score.toLocaleString() : p?.left ? 'left' : `OUT #${rb.rank}`;
      m.label.classList.toggle('out', !rb.alive);
    }
  }

  private banner(big: string, small?: string): void {
    const b = h('div', { class: 'banner' }, big, small ? h('small', null, small) : null);
    this.root.append(b);
    setTimeout(() => b.remove(), 1700);
  }

  // ---------------------------------------------------------------- input

  private canShoot(): boolean {
    return this.playing && !this.out && !this.pendingSeq && this.view.ready && !this.overlay;
  }

  pointerDown(x: number, y: number): void {
    if (!this.playing || this.out) return;
    const p = this.view.toWorld(x, y);
    if (this.view.hitsSwap(p.x, p.y)) {
      this.swapTouch = true;
      return;
    }
    this.aiming = true;
    this.aimAt(p.x, p.y);
  }

  pointerMove(x: number, y: number): void {
    if (!this.aiming) return;
    const p = this.view.toWorld(x, y);
    this.aimAt(p.x, p.y);
  }

  pointerUp(x: number, y: number): void {
    const p = this.view.toWorld(x, y);
    if (this.swapTouch) {
      this.swapTouch = false;
      if (this.view.hitsSwap(p.x, p.y)) this.swap();
      return;
    }
    if (!this.aiming) return;
    this.aiming = false;
    const angle = this.view.aimAngle;
    this.view.aimAngle = null;
    if (angle === null || p.y > SHOOTER_Y - 6) return;
    this.fire(angle);
  }

  key(e: KeyboardEvent): void {
    const a = this.view.aimAngle ?? Math.PI / 2;
    if (e.key === 'ArrowLeft') this.view.aimAngle = clampAngle(a + 0.04);
    else if (e.key === 'ArrowRight') this.view.aimAngle = clampAngle(a - 0.04);
    else if (e.key === ' ' || e.key === 'Enter') this.fire(a);
    else if (e.key === 'ArrowUp' || e.key === 's') this.swap();
  }

  private aimAt(x: number, y: number): void {
    this.view.aimAngle = y > SHOOTER_Y - 6 ? null : Math.max(MIN_ANGLE, Math.min(MAX_ANGLE, angleTo(x, y)));
  }

  private swap(): void {
    if (!this.canShoot()) return;
    this.s.client.swap();
    this.syncLauncher();
    sound.swap();
    haptic(6);
  }

  private fire(angle: number): void {
    if (!this.canShoot()) return;
    const me = this.s.client.me!;
    const seq = this.s.client.shoot(angle);
    this.pendingSeq = seq;
    this.view.launchProvisional(angle, me.cur, seq);
    this.syncLauncher();
    haptic(10);
  }

  // ---------------------------------------------------------------- loop

  update(dt: number): void {
    this.view.update(dt);
    for (const m of this.minis) m.view.update(dt);
    if (this.playing) {
      this.pushIn = Math.max(0, this.pushIn - dt);
      this.fill.style.width = `${(1 - this.pushIn / this.pushTotal) * 100}%`;
    }
  }

  draw(ctx: CanvasRenderingContext2D, dpr: number): void {
    for (const m of this.minis) m.view.draw(ctx, dpr);
    this.view.draw(ctx, dpr);
  }

  // ---------------------------------------------------------------- results / leaving

  private showResults(ranking: number[]): void {
    keepScreenOn(false);
    const c = this.s.client;
    const won = ranking[0] === c.myId;
    stats.mpGames++;
    if (won) stats.mpWins++;
    saveStats();
    if (won) {
      sound.win();
      haptic(50);
    }
    const rows = ranking.map((id, i) => {
      const p = c.players.find((x) => x.id === id);
      const rb = c.boards.get(id);
      const name = p?.name ?? `Player ${id}`;
      return h(
        'div',
        { class: `item ${i === 0 ? 'rank-1' : ''}` },
        i === 0 ? icon('crown', 'rank-num') : h('div', { class: 'rank-num' }, String(i + 1)),
        h('div', { class: 'avatar', style: `--av:${avatarColor(id)}` }, p?.cpu ? icon('robot') : name.slice(0, 1).toUpperCase()),
        h('div', { class: 'grow' }, h('div', { class: 'name' }, name + (id === c.myId ? ' (you)' : '')), h('div', { class: 'meta' }, `${(rb?.score ?? 0).toLocaleString()} points`)),
      );
    });
    const actions = this.s.isHost
      ? h(
          'div',
          { class: 'actions' },
          button('Lobby', () => this.s.server!.backToLobby(), 'btn c-cream', 'back'),
          button('Rematch', () => {
            if (!this.s.server!.start()) toast('Not enough players for a rematch');
          }, 'btn c-lime', 'restart'),
        )
      : h('div', { class: 'dialog', style: 'width:100%' }, h('p', { class: 'note' }, 'Waiting for the host to start a rematch…'), button('Leave', () => this.leave(), 'btn btn-wide c-cream', 'close'));
    this.overlay?.remove();
    this.overlay = h(
      'div',
      { class: 'overlay' },
      won ? h('div', { class: 'rays' }) : null,
      h('div', { class: 'panel titled dialog pop-in' }, ribbon(won ? 'You win!' : 'Match over', won ? 'c-lime' : 'c-purple'), won ? icon('trophy', 'result-face') : null, h('div', { class: 'list' }, ...rows), actions),
    );
    const overlay = this.overlay;
    setTimeout(() => {
      if (!this.destroyed && this.overlay === overlay) this.root.append(overlay);
    }, 900);
  }

  private async confirmLeave(): Promise<void> {
    const host = this.s.isHost && this.s.role === 'host';
    const yes = await confirmDialog(this.root, 'Leave the match?', host ? 'You are the host: leaving ends the game for everyone.' : 'You will be knocked out.', 'Leave', 'Stay');
    if (yes) this.leave();
  }

  private leave(): void {
    setSession(null);
    this.app.go(new MultiplayerScene(this.app));
  }

  back(): boolean {
    if (this.overlay && !this.s.isHost) this.leave();
    else void this.confirmLeave();
    return true;
  }

  destroy(): void {
    this.destroyed = true;
    keepScreenOn(false);
    this.s.client.onEvent = null;
  }
}
