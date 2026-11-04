import { settings } from '../storage';

/**
 * All sound is synthesized with WebAudio, so the app ships no audio files.
 * The context is created lazily on the first user gesture (browser autoplay rules).
 */
class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private musicStep = 0;
  private nextNoteTime = 0;
  private lastPopAt = 0;
  private popChain = 0;
  private suspended = false;

  /** Must be called from a user gesture at least once. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.9;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(ctx.destination);
      this.sfxBus = ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = 0.0;
      this.musicBus.connect(this.master);
      const len = ctx.sampleRate * 0.5;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended' && !this.suspended) void this.ctx.resume();
    this.syncMusic();
  }

  /** App went to background / came back. */
  setSuspended(s: boolean): void {
    this.suspended = s;
    if (!this.ctx) return;
    if (s) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  private get ok(): boolean {
    return !!this.ctx && settings.sound && this.ctx.state === 'running';
  }

  private tone(freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; slide?: number; delay?: number; attack?: number } = {}): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (opts.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * opts.slide), t + dur);
    const vol = opts.vol ?? 0.3;
    const atk = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.sfxBus!);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private hiss(dur: number, freq: number, vol: number, delay = 0, q = 1): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus!);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  shoot(): void {
    if (!this.ok) return;
    this.tone(520, 0.12, { type: 'triangle', slide: 2.2, vol: 0.18 });
    this.hiss(0.08, 3000, 0.08);
  }

  bounce(): void {
    if (!this.ok) return;
    this.tone(900, 0.05, { type: 'square', vol: 0.05 });
  }

  stick(): void {
    if (!this.ok) return;
    this.tone(220, 0.08, { type: 'sine', slide: 0.7, vol: 0.22 });
    this.hiss(0.04, 1800, 0.05);
  }

  /** One bubble popping. Rapid pops climb in pitch. */
  pop(): void {
    if (!this.ok) return;
    const now = this.ctx!.currentTime;
    this.popChain = now - this.lastPopAt < 0.12 ? this.popChain + 1 : 0;
    this.lastPopAt = now;
    const f = 600 * Math.pow(1.06, Math.min(this.popChain, 24));
    this.tone(f, 0.09, { type: 'sine', slide: 1.8, vol: 0.2 });
    this.tone(f * 2.01, 0.05, { type: 'triangle', vol: 0.06 });
  }

  drop(count: number): void {
    if (!this.ok) return;
    this.tone(700, 0.45, { type: 'sine', slide: 0.35, vol: Math.min(0.25, 0.08 + count * 0.015) });
    this.hiss(0.35, 900, 0.06);
  }

  boom(): void {
    if (!this.ok) return;
    this.tone(120, 0.6, { type: 'sine', slide: 0.3, vol: 0.5 });
    this.hiss(0.5, 400, 0.4, 0, 0.6);
  }

  swap(): void {
    if (!this.ok) return;
    this.tone(660, 0.06, { type: 'triangle', vol: 0.12 });
    this.tone(880, 0.06, { type: 'triangle', vol: 0.12, delay: 0.05 });
  }

  click(): void {
    if (!this.ok) return;
    this.tone(1200, 0.04, { type: 'triangle', vol: 0.1 });
  }

  combo(n: number): void {
    if (!this.ok) return;
    const base = 520 * Math.pow(1.12, Math.min(n, 8));
    [0, 4, 7].forEach((st, i) => this.tone(base * Math.pow(2, st / 12), 0.18, { type: 'triangle', vol: 0.12, delay: i * 0.06 }));
  }

  power(): void {
    if (!this.ok) return;
    [0, 5, 9, 12].forEach((st, i) => this.tone(700 * Math.pow(2, st / 12), 0.16, { type: 'sine', vol: 0.15, delay: i * 0.05 }));
  }

  warn(): void {
    if (!this.ok) return;
    this.tone(300, 0.15, { type: 'square', vol: 0.06 });
    this.tone(300, 0.15, { type: 'square', vol: 0.06, delay: 0.2 });
  }

  rowPush(): void {
    if (!this.ok) return;
    this.tone(160, 0.25, { type: 'triangle', slide: 0.8, vol: 0.2 });
  }

  star(i: number): void {
    if (!this.ok) return;
    this.tone(880 * Math.pow(2, (i * 4) / 12), 0.35, { type: 'sine', vol: 0.2 });
    this.tone(1760 * Math.pow(2, (i * 4) / 12), 0.25, { type: 'triangle', vol: 0.05 });
  }

  win(): void {
    if (!this.ok) return;
    [0, 4, 7, 12, 16].forEach((st, i) => this.tone(523 * Math.pow(2, st / 12), 0.4, { type: 'triangle', vol: 0.16, delay: i * 0.09 }));
  }

  lose(): void {
    if (!this.ok) return;
    [7, 4, 0, -5].forEach((st, i) => this.tone(392 * Math.pow(2, st / 12), 0.35, { type: 'sine', vol: 0.16, delay: i * 0.16 }));
  }

  countdown(final: boolean): void {
    if (!this.ok) return;
    this.tone(final ? 1046 : 523, final ? 0.4 : 0.15, { type: 'triangle', vol: 0.18 });
  }

  // ---- music: a gentle generative loop (pentatonic arpeggio over a slow chord cycle) ----

  syncMusic(): void {
    if (!this.ctx || !this.musicBus) return;
    const on = settings.music;
    this.musicBus.gain.setTargetAtTime(on ? 0.11 : 0, this.ctx.currentTime, 0.4);
    if (on && !this.musicTimer) {
      this.nextNoteTime = this.ctx.currentTime + 0.1;
      this.musicTimer = setInterval(() => this.scheduleMusic(), 120);
    } else if (!on && this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private scheduleMusic(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus || ctx.state !== 'running') return;
    const stepDur = 0.24;
    const chords = [
      [0, 4, 7, 11],
      [-3, 0, 4, 7],
      [-7, -3, 0, 5],
      [-5, -1, 2, 7],
    ];
    while (this.nextNoteTime < ctx.currentTime + 0.5) {
      const step = this.musicStep++;
      const chord = chords[Math.floor(step / 16) % chords.length];
      const t = this.nextNoteTime;
      const pattern = [0, 2, 1, 3, 2, 1, 3, 2];
      const note = chord[pattern[step % 8]] + (step % 16 >= 8 ? 12 : 0);
      this.musicNote(392 * Math.pow(2, note / 12), t, 0.5, 0.35);
      if (step % 16 === 0) {
        // soft pad + bass at the start of each chord
        for (const n of chord.slice(0, 3)) this.musicNote(196 * Math.pow(2, n / 12), t, stepDur * 16, 0.12, 'sine', 1.2);
        this.musicNote(98 * Math.pow(2, chord[0] / 12), t, stepDur * 8, 0.35, 'triangle');
      }
      this.nextNoteTime += stepDur;
    }
  }

  private musicNote(freq: number, t: number, dur: number, vol: number, type: OscillatorType = 'triangle', attack = 0.01): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1800;
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(f).connect(g).connect(this.musicBus!);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
}

export const sound = new SoundEngine();
