import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrendSessionRecorder } from './session-recorder.svelte';

const SAMPLE_MS = 30_000;
const MAX_SAMPLES = Math.ceil((24 * 60 * 60 * 1000) / SAMPLE_MS);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TrendSessionRecorder', () => {
  it('records each metric, with null gaps for missing or non-finite values', () => {
    const recorder = new TrendSessionRecorder();
    recorder.record({ depth: 4.2, wind: Number.NaN }, 30_000);
    expect(recorder.series('depth')).toEqual({ times: [30], values: [4.2] });
    expect(recorder.series('wind').values).toEqual([null]);
    expect(recorder.series('sog').values).toEqual([null]);
    expect(recorder.version).toBe(1);
  });

  it('samples on start, then per interval, and stops cleanly', () => {
    const recorder = new TrendSessionRecorder();
    let depth = 1;
    const stop = recorder.start(
      () => ({ depth: depth++ }),
      () => Date.now(),
    );
    expect(recorder.series('depth').values).toEqual([1]);
    vi.advanceTimersByTime(SAMPLE_MS * 2);
    expect(recorder.series('depth').values).toEqual([1, 2, 3]);
    stop();
    vi.advanceTimersByTime(SAMPLE_MS * 2);
    expect(recorder.series('depth').values).toEqual([1, 2, 3]);
  });

  it('evicts the oldest samples once the 24 hour window fills', () => {
    const recorder = new TrendSessionRecorder();
    for (let i = 0; i < MAX_SAMPLES + 2; i++) {
      recorder.record({ depth: i }, i * SAMPLE_MS);
    }
    const got = recorder.series('depth');
    expect(got.times).toHaveLength(MAX_SAMPLES);
    expect(got.values).toHaveLength(MAX_SAMPLES);
    // The two oldest samples are gone; the newest survives.
    expect(got.values[0]).toBe(2);
    expect(got.values[got.values.length - 1]).toBe(MAX_SAMPLES + 1);
  });

  it('restarting replaces the previous interval instead of stacking a second one', () => {
    const recorder = new TrendSessionRecorder();
    recorder.start(() => ({ depth: 1 }));
    recorder.start(() => ({ depth: 2 }));
    const before = recorder.series('depth').values.length;
    vi.advanceTimersByTime(SAMPLE_MS);
    // One tick adds one sample, not two.
    expect(recorder.series('depth').values).toHaveLength(before + 1);
    recorder.stop();
  });
});
