// A repeating alarm tone, synthesized with the Web Audio API so nothing has to be bundled
// or fetched. Browsers block audio until a user gesture, so call prime() from a click once;
// after that the alarm can sound on its own when a danger arises.

export interface AlarmTone {
  // Beep pitch in Hz.
  frequency: number;
  // Length of each beep and the silence between beeps in a burst, in milliseconds.
  beepMs: number;
  gapMs: number;
  // Beeps per burst, and how often a burst repeats.
  beeps: number;
  periodMs: number;
  // Peak gain, 0..1.
  volume: number;
}

// An urgent two-beep burst every 1.2s: the collision danger alarm.
export const DANGER_TONE: AlarmTone = {
  frequency: 880,
  beepMs: 140,
  gapMs: 90,
  beeps: 2,
  periodMs: 1200,
  volume: 0.18,
};

// The surface a consumer drives; the real Alarm implements it and tests can fake it.
export interface AlarmControl {
  prime(): void;
  start(tone: AlarmTone): void;
  stop(): void;
}

function createContext(): AudioContext | undefined {
  if (typeof window === 'undefined') return undefined;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Ctor ? new Ctor() : undefined;
}

export class Alarm implements AlarmControl {
  #ctx: AudioContext | undefined;
  #timer: ReturnType<typeof setInterval> | undefined;
  #tone: AlarmTone | undefined;

  // Create and resume the audio context. Must run from a user gesture (autoplay policy).
  prime(): void {
    const ctx = this.#context();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  }

  start(tone: AlarmTone): void {
    // Already sounding this tone: leave the running burst loop alone. Compare by the fields that
    // define the audible loop (pitch and period) rather than object identity, so a caller passing
    // a fresh tone object with the same values does not tear down and rebuild the loop each call.
    if (
      this.#timer !== undefined &&
      this.#tone?.frequency === tone.frequency &&
      this.#tone?.periodMs === tone.periodMs
    ) {
      return;
    }
    this.stop();
    const ctx = this.#context();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    this.#tone = tone;
    this.#burst(ctx, tone);
    this.#timer = setInterval(() => this.#burst(ctx, tone), tone.periodMs);
  }

  stop(): void {
    if (this.#timer !== undefined) clearInterval(this.#timer);
    this.#timer = undefined;
    this.#tone = undefined;
  }

  #context(): AudioContext | undefined {
    if (!this.#ctx) this.#ctx = createContext();
    return this.#ctx;
  }

  #burst(ctx: AudioContext, tone: AlarmTone): void {
    if (ctx.state === 'suspended') void ctx.resume();
    const step = (tone.beepMs + tone.gapMs) / 1000;
    for (let i = 0; i < tone.beeps; i += 1) {
      this.#beep(ctx, tone, ctx.currentTime + i * step);
    }
  }

  #beep(ctx: AudioContext, tone: AlarmTone, start: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = tone.frequency;
    const duration = tone.beepMs / 1000;
    // A short attack and release so the beep does not click.
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(tone.volume, start + 0.012);
    gain.gain.setValueAtTime(tone.volume, start + duration - 0.02);
    gain.gain.linearRampToValueAtTime(0, start + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration);
  }
}
