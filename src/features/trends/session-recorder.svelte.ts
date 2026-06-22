import { DAY_MS, isFiniteNumber } from '$shared/lib';
import { TREND_METRICS, type TrendKey, type TrendSeries } from './trend-metrics';

// One sample every 30 s: fine enough to draw a day-long trend without growing the ring buffer past
// MAX_SAMPLES points.
const SAMPLE_MS = 30_000;
const WINDOW_MS = DAY_MS;
const MAX_SAMPLES = Math.ceil(WINDOW_MS / SAMPLE_MS);

export type TrendSample = Partial<Record<TrendKey, number | undefined>>;

// The no-history fallback: a bounded in-memory recording of the live values, sampled every 30
// seconds from app start, so the Trends panel always has something honest to show ("this
// session") on a stock server. SI values; missing instruments record null gaps. The version is
// the panel's one reactive dependency, so charts redraw per sample, not per store delta.
export class TrendSessionRecorder {
  #times: number[] = [];
  #values = new Map<TrendKey, Array<number | null>>();
  #interval: number | undefined;
  #version = $state(0);

  constructor() {
    for (const metric of TREND_METRICS) this.#values.set(metric.key, []);
  }

  get version(): number {
    return this.#version;
  }

  start(sample: () => TrendSample, now: () => number = Date.now): () => void {
    this.stop();
    const tick = () => this.record(sample(), now());
    tick();
    // The bare global, not window.setInterval: identical in the browser, and testable under
    // the node vitest environment where window does not exist.
    this.#interval = setInterval(tick, SAMPLE_MS);
    return () => this.stop();
  }

  stop(): void {
    if (this.#interval !== undefined) clearInterval(this.#interval);
    this.#interval = undefined;
  }

  record(sample: TrendSample, nowMs: number): void {
    this.#times.push(nowMs / 1000);
    for (const metric of TREND_METRICS) {
      const value = sample[metric.key];
      this.#values.get(metric.key)?.push(isFiniteNumber(value) ? value : null);
    }
    if (this.#times.length > MAX_SAMPLES) {
      const drop = this.#times.length - MAX_SAMPLES;
      this.#times.splice(0, drop);
      for (const series of this.#values.values()) series.splice(0, drop);
    }
    this.#version += 1;
  }

  series(key: TrendKey): TrendSeries {
    return { times: this.#times, values: this.#values.get(key) ?? [] };
  }
}
