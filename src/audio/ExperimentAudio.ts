/**
 * Minimal Web Audio wrapper for the puzzle's sound feedback — restrained
 * "glass/resonance/low electronic hum" character, not sci-fi beeps or
 * arcade stingers. Every tone is synthesized (OscillatorNode/GainNode),
 * no audio files.
 *
 * IMPORTANT: the AudioContext is created lazily, on first call to any
 * method — never at module load or in the constructor — because browser
 * autoplay policy requires a real user gesture (click/keypress) to already
 * be in progress. This class has no way to know when that happens, so the
 * CALLER is responsible for only constructing/calling it from inside a
 * user-gesture handler (e.g. the first pointerdown on a device window).
 */
export class ExperimentAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private stabilizeOsc: OscillatorNode | null = null;
  private stabilizeGain: GainNode | null = null;

  /** Creates the AudioContext + master gain on first use only. Also
   * resumes the context if the browser started it suspended (some
   * browsers do this even after a gesture, depending on timing). */
  private ensure(): { ctx: AudioContext; master: GainNode } {
    if (!this.ctx || !this.master) {
      const ctx = new AudioContext();
      const master = ctx.createGain();
      master.gain.value = 1;
      master.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return { ctx: this.ctx, master: this.master };
  }

  /** Very short, quiet tick for hover/selection feedback. */
  hover(): void {
    const { ctx, master } = this.ensure();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 1100;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

    osc.connect(gain).connect(master);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  /** Starts a low hum that fades in (not an abrupt loop start). Idempotent
   * — a second call while already running is a no-op. */
  stabilizingStart(): void {
    if (this.stabilizeOsc) return;
    const { ctx, master } = this.ensure();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 58;

    // Gentle lowpass keeps the hum soft/round rather than buzzy.
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 220;
    filter.Q.value = 0.7;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.1, now + 0.5);

    osc.connect(filter).connect(gain).connect(master);
    osc.start(now);

    this.stabilizeOsc = osc;
    this.stabilizeGain = gain;
  }

  /** Fades the hum out and stops it. No-op if not currently running. */
  stabilizingStop(): void {
    if (!this.ctx || !this.stabilizeOsc || !this.stabilizeGain) return;
    const now = this.ctx.currentTime;
    const osc = this.stabilizeOsc;
    const gain = this.stabilizeGain;

    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0.0001, now + 0.35);
    osc.stop(now + 0.37);

    this.stabilizeOsc = null;
    this.stabilizeGain = null;
  }

  /** Low hum settling into a clean resonant tone — the "solved" moment.
   * A brief attack, gentle release, no percussive stinger. If the
   * stabilize hum is still running it is folded into this call's own
   * fade-out rather than left to cross-fade unpredictably. */
  solved(): void {
    const { ctx, master } = this.ensure();
    const now = ctx.currentTime;

    if (this.stabilizeOsc && this.stabilizeGain) {
      this.stabilizeGain.gain.cancelScheduledValues(now);
      this.stabilizeGain.gain.setValueAtTime(this.stabilizeGain.gain.value, now);
      this.stabilizeGain.gain.linearRampToValueAtTime(0.0001, now + 0.3);
      this.stabilizeOsc.stop(now + 0.32);
      this.stabilizeOsc = null;
      this.stabilizeGain = null;
    }

    // Low settling hum.
    const humOsc = ctx.createOscillator();
    humOsc.type = 'sine';
    humOsc.frequency.value = 90;
    const humGain = ctx.createGain();
    humGain.gain.setValueAtTime(0, now);
    humGain.gain.linearRampToValueAtTime(0.14, now + 0.06);
    humGain.gain.linearRampToValueAtTime(0.0001, now + 0.45);
    humOsc.connect(humGain).connect(master);
    humOsc.start(now);
    humOsc.stop(now + 0.47);

    // Clean resonant tone: two close oscillators (root + fifth) through a
    // narrow-ish lowpass for a "glass" quality, short attack, slow release.
    const toneStart = now + 0.28;
    const toneFilter = ctx.createBiquadFilter();
    toneFilter.type = 'lowpass';
    toneFilter.frequency.value = 1800;
    toneFilter.Q.value = 1.2;
    toneFilter.connect(master);

    const toneGain = ctx.createGain();
    toneGain.gain.setValueAtTime(0, toneStart);
    toneGain.gain.linearRampToValueAtTime(0.18, toneStart + 0.05);
    toneGain.gain.exponentialRampToValueAtTime(0.001, toneStart + 1.6);
    toneGain.connect(toneFilter);

    const root = ctx.createOscillator();
    root.type = 'triangle';
    root.frequency.value = 392; // G4
    root.connect(toneGain);

    const fifth = ctx.createOscillator();
    fifth.type = 'sine';
    fifth.frequency.value = 587.33; // D5 — perfect fifth above, kept quiet
    const fifthGain = ctx.createGain();
    fifthGain.gain.value = 0.4;
    fifth.connect(fifthGain).connect(toneGain);

    root.start(toneStart);
    fifth.start(toneStart);
    root.stop(toneStart + 1.7);
    fifth.stop(toneStart + 1.7);
  }
}
