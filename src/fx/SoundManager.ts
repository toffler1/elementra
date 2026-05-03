export class SoundManager {
  private ctx:    AudioContext | null = null;
  private master: GainNode | null     = null;
  private muted   = localStorage.getItem('elementra_muted') === '1';

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
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  private context(): AudioContext {
    if (!this.ctx) {
      this.ctx    = new AudioContext();
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
    const freq = 210 + level * 52; // 262 (Funke) → 730 (Kosmos)

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
