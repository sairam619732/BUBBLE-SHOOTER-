import { settings } from '../storage';

/** Major pentatonic steps (C D E G A) as semitones. Everything musical uses it, so it never clashes. */
const PENTA = [0, 2, 4, 7, 9];
const C4 = 261.63;

function semis(n: number): number {
  return Math.pow(2, n / 12);
}

/** Semitones above C for step `i` of the pentatonic scale (5 steps per octave). */
function pentaStep(i: number): number {
  const oct = Math.floor(i / 5);
  return PENTA[((i % 5) + 5) % 5] + 12 * oct;
}

/**
 * A calm chord loop with a music-box melody that wanders over it. Each chord lasts 2 bars.
 * Semitones are relative to C4.
 */
const CHORDS: { pad: number[]; bass: number; tones: number[] }[] = [
  { pad: [-7, -3, 0, 4], bass: -19, tones: [-7, -3, 0, 4] }, // Fmaj7
  { pad: [-8, -5, -1, 2], bass: -20, tones: [-8, -5, 2, 4] }, // Em7
  { pad: [-3, 0, 4, 7], bass: -15, tones: [-3, 0, 4, 7] }, // Am7
  { pad: [-5, -3, 2, 4], bass: -17, tones: [-5, 2, 4, 7] }, // G6sus2
];
const BEAT = 60 / 70; // 70 BPM, unhurried
const STEP = BEAT / 2; // eighth notes
const STEPS_PER_CHORD = 16;

/**
 * All sound is synthesized with WebAudio, so the app ships no audio files.
 * The context is created lazily on the first user gesture (browser autoplay rules).
 */
class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private sfxVerb: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private musicStep = 0;
  private nextNoteTime = 0;
  private melody = 7;
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
      comp.threshold.value = -16;
      comp.knee.value = 12;
      comp.ratio.value = 3;
      this.master.connect(comp).connect(ctx.destination);

      // Soft room reverb shared by music and effects.
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = this.impulse(2.4);
      const verbOut = ctx.createGain();
      verbOut.gain.value = 0.55;
      this.reverb.connect(verbOut).connect(this.master);

      this.sfxBus = ctx.createGain();
      this.sfxBus.connect(this.master);
      this.sfxVerb = ctx.createGain();
      this.sfxVerb.gain.value = 0.22;
      this.sfxBus.connect(this.sfxVerb).connect(this.reverb);

      const warm = ctx.createBiquadFilter();
      warm.type = 'lowpass';
      warm.frequency.value = 2400;
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = 0.0;
      this.musicBus.connect(warm);
      warm.connect(this.master);
      const musicVerb = ctx.createGain();
      musicVerb.gain.value = 0.7;
      warm.connect(musicVerb).connect(this.reverb);

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

  /** Decaying stereo noise: a simple, smooth reverb tail. */
  private impulse(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    return buf;
  }

  /** One oscillator with an attack/decay envelope. */
  private voice(
    out: AudioNode,
    freq: number,
    t: number,
    dur: number,
    vol: number,
    opts: { type?: OscillatorType; attack?: number; glideTo?: number; glideTime?: number; detune?: number } = {},
  ): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (opts.detune) osc.detune.value = opts.detune;
    if (opts.glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.glideTo), t + (opts.glideTime ?? dur));
    const atk = opts.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, atk + 0.01));
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /** Music-box / kalimba bell: a pure tone with quieter, faster-fading overtones. */
  private bell(out: AudioNode, freq: number, t: number, dur: number, vol: number): void {
    this.voice(out, freq, t, dur, vol);
    this.voice(out, freq * 2, t, dur * 0.45, vol * 0.28);
    this.voice(out, freq * 3.01, t, dur * 0.2, vol * 0.1);
  }

  /** Filtered noise burst (air, whoosh, splash). */
  private hiss(dur: number, freq: number, vol: number, opts: { delay?: number; q?: number; type?: BiquadFilterType; sweepTo?: number } = {}): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.setValueAtTime(freq, t);
    if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, t + dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus!);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  private get now(): number {
    return this.ctx!.currentTime;
  }

  // ------------------------------------------------------------------ effects

  shoot(): void {
    if (!this.ok) return;
    this.hiss(0.11, 700, 0.11, { sweepTo: 2600, q: 1.4 });
    this.voice(this.sfxBus!, 260, this.now, 0.09, 0.07, { glideTo: 460, glideTime: 0.07 });
  }

  bounce(): void {
    if (!this.ok) return;
    this.voice(this.sfxBus!, 1100, this.now, 0.05, 0.05, { glideTo: 800 });
  }

  /** Bubble sticks without popping: a soft, round "plunk". */
  stick(): void {
    if (!this.ok) return;
    this.voice(this.sfxBus!, 340, this.now, 0.14, 0.16, { glideTo: 230, glideTime: 0.1 });
    this.voice(this.sfxBus!, 170, this.now, 0.08, 0.08, { type: 'triangle' });
  }

  /** One bubble popping: a water-drop "bloop". Quick chains climb a pentatonic scale. */
  pop(): void {
    if (!this.ok) return;
    const now = this.now;
    this.popChain = now - this.lastPopAt < 0.14 ? this.popChain + 1 : 0;
    this.lastPopAt = now;
    const f = C4 * 2 * semis(pentaStep(Math.min(this.popChain, 14)));
    this.voice(this.sfxBus!, f * 0.55, now, 0.13, 0.17, { glideTo: f * 1.05, glideTime: 0.05 });
    this.voice(this.sfxBus!, f * 2, now + 0.01, 0.07, 0.035);
    this.hiss(0.035, 3800, 0.025, { q: 0.8, type: 'highpass' });
  }

  /** Bubbles cut loose: a little cascade of falling notes. */
  drop(count: number): void {
    if (!this.ok) return;
    const n = Math.min(7, 2 + Math.floor(count / 2));
    for (let k = 0; k < n; k++) {
      this.bell(this.sfxBus!, C4 * 2 * semis(pentaStep(9 - k)), this.now + k * 0.055, 0.35, 0.07);
    }
    this.hiss(0.4, 1400, 0.05, { sweepTo: 400, q: 0.7 });
  }

  boom(): void {
    if (!this.ok) return;
    this.voice(this.sfxBus!, 120, this.now, 0.6, 0.5, { glideTo: 38, glideTime: 0.5 });
    this.hiss(0.5, 900, 0.32, { type: 'lowpass', sweepTo: 180, q: 0.5 });
  }

  swap(): void {
    if (!this.ok) return;
    this.voice(this.sfxBus!, 620, this.now, 0.07, 0.09, { glideTo: 700 });
    this.voice(this.sfxBus!, 930, this.now + 0.055, 0.07, 0.09, { glideTo: 1040 });
  }

  click(): void {
    if (!this.ok) return;
    this.voice(this.sfxBus!, 760, this.now, 0.05, 0.08, { glideTo: 1150, glideTime: 0.03 });
  }

  combo(n: number): void {
    if (!this.ok) return;
    const base = 4 + Math.min(n, 6);
    [0, 1, 2].forEach((k) => this.bell(this.sfxBus!, C4 * 2 * semis(pentaStep(base + k * 2)), this.now + k * 0.07, 0.6, 0.08));
  }

  power(): void {
    if (!this.ok) return;
    for (let k = 0; k < 6; k++) this.bell(this.sfxBus!, C4 * 2 * semis(pentaStep(5 + k)), this.now + k * 0.045, 0.5, 0.06);
  }

  warn(): void {
    if (!this.ok) return;
    this.voice(this.sfxBus!, 330, this.now, 0.16, 0.1, { type: 'triangle' });
    this.voice(this.sfxBus!, 294, this.now + 0.2, 0.2, 0.1, { type: 'triangle' });
  }

  rowPush(): void {
    if (!this.ok) return;
    this.voice(this.sfxBus!, 150, this.now, 0.25, 0.2, { glideTo: 95 });
    this.hiss(0.18, 500, 0.05, { type: 'lowpass' });
  }

  star(i: number): void {
    if (!this.ok) return;
    const f = C4 * 2 * semis([4, 7, 12][Math.min(i, 2)]);
    this.bell(this.sfxBus!, f, this.now, 1.1, 0.16);
    this.bell(this.sfxBus!, f * 2, this.now + 0.04, 0.6, 0.05);
  }

  win(): void {
    if (!this.ok) return;
    [0, 4, 7, 12, 16].forEach((st, k) => this.bell(this.sfxBus!, C4 * 2 * semis(st), this.now + k * 0.1, 1.2, 0.1));
    for (const st of [0, 4, 7]) this.voice(this.sfxBus!, C4 * semis(st), this.now + 0.4, 1.6, 0.04, { attack: 0.3 });
  }

  lose(): void {
    if (!this.ok) return;
    [9, 7, 4, 0].forEach((st, k) => this.bell(this.sfxBus!, C4 * semis(st), this.now + k * 0.22, 0.8, 0.09));
  }

  countdown(final: boolean): void {
    if (!this.ok) return;
    if (final) [0, 4, 7].forEach((st) => this.bell(this.sfxBus!, C4 * 2 * semis(st), this.now, 0.9, 0.1));
    else this.bell(this.sfxBus!, C4 * 2 * semis(7), this.now, 0.35, 0.1);
  }

  // ------------------------------------------------------------------ music

  syncMusic(): void {
    if (!this.ctx || !this.musicBus) return;
    const on = settings.music;
    this.musicBus.gain.setTargetAtTime(on ? 0.26 : 0, this.ctx.currentTime, 0.6);
    if (on && !this.musicTimer) {
      this.nextNoteTime = this.ctx.currentTime + 0.15;
      this.musicTimer = setInterval(() => this.scheduleMusic(), 110);
    } else if (!on && this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private scheduleMusic(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus || ctx.state !== 'running') return;
    const out = this.musicBus;
    while (this.nextNoteTime < ctx.currentTime + 0.6) {
      const step = this.musicStep++;
      const t = this.nextNoteTime;
      const inChord = step % STEPS_PER_CHORD;
      const chord = CHORDS[Math.floor(step / STEPS_PER_CHORD) % CHORDS.length];

      // Pad: soft swell for the whole chord.
      if (inChord === 0) {
        const len = STEP * STEPS_PER_CHORD;
        for (const n of chord.pad) {
          const f = C4 * semis(n);
          this.padNote(out, f, t, len, 0.05);
        }
      }
      // Bass: a gentle pulse on beats 1 and 3.
      if (inChord % 4 === 0) {
        const n = inChord === 8 ? chord.bass + 7 : chord.bass;
        this.voice(out, C4 * semis(n), t, BEAT * 1.9, 0.2, { attack: 0.03 });
      }
      // Melody: a music box that wanders up and down the scale, resting often.
      const strong = step % 4 === 0;
      const phraseEnd = Math.floor(step / 8) % 4 === 3;
      const chance = phraseEnd ? 0.12 : strong ? 0.62 : 0.24;
      if (Math.random() < chance) {
        const moves = [-2, -1, -1, 0, 1, 1, 2];
        this.melody = Math.max(4, Math.min(13, this.melody + moves[Math.floor(Math.random() * moves.length)]));
        let n = pentaStep(this.melody);
        if (strong) {
          // Lean on a chord tone (an octave up) on strong beats.
          const target = chord.tones.map((x) => x + 12).reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));
          if (Math.abs(target - n) <= 2) n = target;
        }
        this.bell(out, C4 * semis(n), t, 1.8, strong ? 0.17 : 0.12);
      }
      // A high sparkle now and then.
      if (step % 32 === 28) this.bell(out, C4 * 4 * semis(pentaStep(Math.floor(Math.random() * 5))), t, 2.2, 0.05);
      this.nextNoteTime += STEP;
    }
  }

  /** Slow-attack pad tone: a sine plus a slightly detuned triangle. */
  private padNote(out: AudioNode, freq: number, t: number, len: number, vol: number): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 1.4);
    g.gain.setValueAtTime(vol, t + len - 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len + 2);
    lp.connect(g).connect(out);
    for (const [type, detune] of [
      ['sine', 0],
      ['triangle', 6],
    ] as [OscillatorType, number][]) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      osc.detune.value = detune;
      osc.connect(lp);
      osc.start(t);
      osc.stop(t + len + 2.1);
    }
  }
}

export const sound = new SoundEngine();
