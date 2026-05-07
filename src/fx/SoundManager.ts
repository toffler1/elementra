let _instance: SoundManager | null = null;
export function getOrCreateSoundManager(): SoundManager {
  if (!_instance) _instance = new SoundManager();
  return _instance;
}

export class SoundManager {
  private ctx:    AudioContext | null = null;
  private master: GainNode | null     = null;
  private muted   = localStorage.getItem('elementra_muted') === '1';

  // ── music state ──────────────────────────────────────────────────────
  private musicGain:  GainNode | null      = null;
  private musicOscs:  OscillatorNode[]     = [];
  private musicTimer: ReturnType<typeof setTimeout> | null = null;

  isMuted() { return this.muted; }

  toggleMute(): boolean {
    this.muted = !this.muted;
    localStorage.setItem('elementra_muted', this.muted ? '1' : '0');
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.45;
    return this.muted;
  }

  // Force-mute without changing the user's saved preference (used during ads)
  forceMute(muted: boolean): void {
    if (this.master) this.master.gain.value = muted ? 0 : (this.muted ? 0 : 0.45);
  }

  resume() {
    this.context();
  }

  // Unlock iOS Web Audio. MUST run synchronously inside a native DOM
  // user-gesture handler — Promise callbacks lose the gesture context on
  // iOS, so resume() and start(0) are both called inline. The buffer is
  // queued by the AudioContext and plays once the resume promise settles.
  playSilent(): void {
    try {
      const ctx = this.context();
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.master!);
      src.start(0);
    } catch {}
  }

  // ── Music ────────────────────────────────────────────────────────────
  // Upbeat C-major chiptune: clear square-wave melody + punchy bass.
  // No sustained pads — clean, fun, loopable. Safe to call multiple times.

  startMusic(): void {
    if (this.musicGain) return;

    const ctx = this.context();
    const BPM = 128;
    const q   = 60 / BPM;        // quarter note ≈ 0.469 s
    const e   = q / 2;           // eighth  note ≈ 0.234 s

    // Music bus
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0, ctx.currentTime);
    bus.gain.linearRampToValueAtTime(0.7, ctx.currentTime + 0.4);
    bus.connect(this.master!);
    this.musicGain = bus;

    // Soft low-pass to tame square-wave harshness
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 2200;
    lpf.connect(bus);

    // Short echo for playful bounce (no sustained reverb)
    const echo    = ctx.createDelay(0.25);
    const echoFb  = ctx.createGain();
    const echoOut = ctx.createGain();
    echo.delayTime.value = q * 0.75;   // dotted-eighth echo
    echoFb.gain.value    = 0.20;
    echoOut.gain.value   = 0.18;
    echo.connect(echoFb); echoFb.connect(echo);
    echo.connect(echoOut); echoOut.connect(bus);

    // ── Melody: C-major, high octave (C5–B5), square wave ───────────
    // 16 eighth-note pattern (4 bars of 4/4):
    // E5 G5 A5 G5 | E5 C5 D5 E5 | G5 A5 B5 A5 | G5 E5 C5 –
    const M = 0; // rest
    const melSeq: [number, number][] = [  // [freq, duration]
      [659, e],[784, e],[880, e],[784, e],
      [659, e],[523, e],[587, e],[659, e],
      [784, e],[880, e],[988, e],[880, e],
      [784, e],[659, e],[523, q],[M, e],
    ];
    const loopDur = melSeq.reduce((s, [, d]) => s + d, 0);

    // ── Bass: triangle, punchy quarter-note roots ────────────────────
    // C3  –   F3  –  | G3  –   C3  –
    const bassSeq: [number, number][] = [
      [131, q],[M, q],[175, q],[M, q],
      [196, q],[M, q],[131, q],[M, q],
    ];

    // ── Chord accent: brief stab on beat 1 of bars 1 & 3 ────────────
    const chordSeq: [number[], number][] = [
      [[262,330,392], e * 0.6],  // C major
      [[175,262,349], e * 0.6],  // F major
    ];
    const chordBeats = [0, q * 4]; // bar 1 and bar 3 start times

    const scheduleLoop = () => {
      if (!this.musicGain) return;
      const t0 = ctx.currentTime + 0.03;

      // melody
      let t = t0;
      for (const [freq, dur] of melSeq) {
        if (freq > 0) {
          const osc = ctx.createOscillator();
          const g   = ctx.createGain();
          osc.type = 'square';
          osc.frequency.value = freq;
          g.gain.setValueAtTime(0.09, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.78);
          osc.connect(g); g.connect(lpf); g.connect(echo);
          osc.start(t); osc.stop(t + dur * 0.82);
        }
        t += dur;
      }

      // bass
      t = t0;
      for (const [freq, dur] of bassSeq) {
        if (freq > 0) {
          const osc = ctx.createOscillator();
          const g   = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.value = freq;
          g.gain.setValueAtTime(0.18, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.55);
          osc.connect(g); g.connect(bus);
          osc.start(t); osc.stop(t + dur * 0.6);
        }
        t += dur;
      }

      // chord accents
      chordBeats.forEach((beat, ci) => {
        const [notes, dur] = chordSeq[ci % chordSeq.length];
        notes.forEach(freq => {
          const osc = ctx.createOscillator();
          const g   = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq;
          g.gain.setValueAtTime(0.06, t0 + beat);
          g.gain.exponentialRampToValueAtTime(0.001, t0 + beat + dur);
          osc.connect(g); g.connect(bus);
          osc.start(t0 + beat); osc.stop(t0 + beat + dur + 0.01);
        });
      });
    };

    scheduleLoop();
    const tick = () => {
      if (!this.musicGain) return;
      scheduleLoop();
      this.musicTimer = setTimeout(tick, loopDur * 1000);
    };
    this.musicTimer = setTimeout(tick, loopDur * 1000);
  }

  stopMusic(fadeSecs = 1.0): void {
    if (!this.musicGain) return;

    if (this.musicTimer !== null) {
      clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }

    const ctx  = this.context();
    const gain = this.musicGain;
    gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + fadeSecs);

    const oscs = this.musicOscs;
    this.musicOscs = [];
    this.musicGain = null;

    oscs.forEach(osc => {
      try { osc.stop(ctx.currentTime + fadeSecs + 0.05); } catch {}
    });
  }

  // ── SFX ─────────────────────────────────────────────────────────────

  private context(): AudioContext {
    if (!this.ctx) {
      const AC    = window.AudioContext ?? (window as any).webkitAudioContext;
      this.ctx    = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.45;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  private tone(
    freq: number, type: OscillatorType,
    vol: number, delay: number, release: number,
  ) {
    const ctx  = this.context();
    const t0   = ctx.currentTime + delay;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(this.master!);
    osc.type            = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + release);
    osc.start(t0);
    osc.stop(t0 + release + 0.02);
  }

  playDrop() {
    const ctx = this.context();
    const t0  = ctx.currentTime;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(this.master!);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(420, t0);
    osc.frequency.exponentialRampToValueAtTime(110, t0 + 0.13);
    gain.gain.setValueAtTime(0.18, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.14);
    osc.start(t0);
    osc.stop(t0 + 0.16);
  }

  playMerge(level: number) {
    const ctx  = this.context();
    const t0   = ctx.currentTime;
    const freq = 210 + level * 52; // 262 (Spark) → 730 (Cosmos)

    // pitch-sweep pop
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(this.master!);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 0.75, t0);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.25, t0 + 0.06);
    osc.frequency.exponentialRampToValueAtTime(freq, t0 + 0.18);
    gain.gain.setValueAtTime(0.38, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.32);
    osc.start(t0);
    osc.stop(t0 + 0.35);

    // overtones for higher-level merges
    if (level >= 4) this.tone(freq * 2, 'triangle', 0.10, 0,    0.20);
    if (level >= 7) this.tone(freq * 3, 'sine',     0.06, 0.02, 0.15);
  }

  // descending 4-note melody: G4 F4 D4 G3
  playGameOver() {
    [392, 349, 294, 196].forEach((f, i) =>
      this.tone(f, 'triangle', 0.32, i * 0.21, 0.28),
    );
  }
}
