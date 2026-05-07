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
  // Ambient A-minor pad + gentle pentatonic arpeggio, loops indefinitely.
  // Safe to call multiple times — second call is a no-op.

  startMusic(): void {
    if (this.musicGain) return;

    const ctx = this.context();

    // Dedicated music bus so we can fade in/out independently
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0, ctx.currentTime);
    bus.gain.linearRampToValueAtTime(0.55, ctx.currentTime + 3.0);
    bus.connect(this.master!);
    this.musicGain = bus;

    // Warm low-pass filter
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 900;
    lpf.Q.value = 0.7;
    lpf.connect(bus);

    // Simple shimmer delay (poor-man's reverb)
    const delay    = ctx.createDelay(0.7);
    const feedback = ctx.createGain();
    const delayOut = ctx.createGain();
    delay.delayTime.value = 0.40;
    feedback.gain.value   = 0.38;
    delayOut.gain.value   = 0.28;
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(delayOut);
    delayOut.connect(bus);

    // ── Pad: A-minor chord (A2 E3 A3 C4), gentle sine waves ──────────
    const padFreqs  = [110, 165, 220, 262];
    const detunes   = [+4, -3, +2, -4];
    padFreqs.forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type            = 'sine';
      osc.frequency.value = freq;
      osc.detune.value    = detunes[i];
      gain.gain.value     = 0.09;
      osc.connect(gain);
      gain.connect(lpf);
      osc.start();
      this.musicOscs.push(osc);
    });

    // Slow vibrato LFO on pad root (A2) for movement
    const lfo     = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.type            = 'sine';
    lfo.frequency.value = 0.18;
    lfoGain.gain.value  = 3;        // ±3 cents
    lfo.connect(lfoGain);
    lfoGain.connect(this.musicOscs[0].detune);
    lfo.start();
    this.musicOscs.push(lfo);

    // ── Arpeggio: A-minor pentatonic up→down ─────────────────────────
    // A3 C4 E4 G4 A4 G4 E4 C4
    const arpFreqs = [220, 262, 330, 392, 440, 392, 330, 262];
    const step     = 0.48;          // seconds per note
    const loopMs   = arpFreqs.length * step * 1000;

    const scheduleArp = () => {
      if (!this.musicGain) return;
      const t0 = ctx.currentTime + 0.02; // tiny lookahead
      arpFreqs.forEach((freq, i) => {
        const t   = t0 + i * step;
        const osc = ctx.createOscillator();
        const g   = ctx.createGain();
        osc.type            = 'triangle';
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.055, t + 0.06);
        g.gain.exponentialRampToValueAtTime(0.001, t + step * 0.80);
        osc.connect(g);
        g.connect(delay);        // arp goes through shimmer
        osc.start(t);
        osc.stop(t + step * 0.85);
      });
    };

    scheduleArp();
    const tick = () => {
      if (!this.musicGain) return;
      scheduleArp();
      this.musicTimer = setTimeout(tick, loopMs);
    };
    this.musicTimer = setTimeout(tick, loopMs);
  }

  stopMusic(fadeSecs = 1.5): void {
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
