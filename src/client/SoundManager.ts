/**
 * Web Audio API Procedural Synthesizer & Dynamic Cyberpunk Soundtrack
 * Zero external audio files required — 100% reliable across cellular and offline networks.
 */
export class SoundManager {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;
  private musicActive: boolean = false;
  private musicInterval: number | null = null;
  private musicStep: number = 0;

  // Bass arpeggio frequencies (Synthwave F minor progression: F2, Ab2, Bb2, C3)
  private static BASS_NOTES = [87.31, 87.31, 103.83, 87.31, 116.54, 103.83, 130.81, 116.54];

  constructor() {
    const saved = localStorage.getItem('neon_orbit_muted');
    if (saved === 'true') {
      this.muted = true;
    }
  }

  private initContext(): void {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public unlockAudio(): void {
    this.initContext();
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    localStorage.setItem('neon_orbit_muted', String(this.muted));
    if (this.muted) {
      this.stopMusic();
    }
    return this.muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public startMusic(): void {
    if (this.muted || this.musicActive) return;
    this.initContext();
    if (!this.ctx) return;

    this.musicActive = true;
    this.musicStep = 0;

    // 130 BPM eighth-note arpeggiator clock (~230ms per step)
    const stepDurationMs = 230;
    this.musicInterval = window.setInterval(() => {
      if (!this.musicActive || this.muted) return;
      this.playSynthBassStep();
      this.musicStep = (this.musicStep + 1) % SoundManager.BASS_NOTES.length;
    }, stepDurationMs);
  }

  public stopMusic(): void {
    this.musicActive = false;
    if (this.musicInterval) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
  }

  private playSynthBassStep(): void {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const freq = SoundManager.BASS_NOTES[this.musicStep];

    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, now);

    // Resonant low-pass filter sweep for that authentic analog synth growl
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(450, now);
    filter.frequency.exponentialRampToValueAtTime(120, now + 0.18);
    filter.Q.setValueAtTime(4, now);

    // Pluck envelope
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.22);
  }

  public playCountdown(isFinal: boolean = false): void {
    if (this.muted) return;
    this.initContext();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    osc.type = isFinal ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(isFinal ? 880 : 440, now);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isFinal ? 0.45 : 0.2));

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + (isFinal ? 0.5 : 0.25));
  }

  public playOrbCollect(isSuper: boolean = false): void {
    if (this.muted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    if (isSuper) {
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(1174.66, now + 0.15); // D6
    } else {
      osc.frequency.setValueAtTime(440, now); // A4
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.08); // A5
    }

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isSuper ? 0.25 : 0.12));

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + (isSuper ? 0.28 : 0.15));
  }

  public playPulse(): void {
    if (this.muted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.35);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.38);
  }

  public playCollision(): void {
    if (this.muted) return;
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.1);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.14);
  }

  public playVictory(): void {
    if (this.muted) return;
    this.initContext();
    if (!this.ctx) return;

    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const start = this.ctx.currentTime + idx * 0.12;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.22, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(start);
      osc.stop(start + 0.38);
    });
  }
}
