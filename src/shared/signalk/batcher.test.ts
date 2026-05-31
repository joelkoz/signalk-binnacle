import type { Value } from '@signalk/server-api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FrameBatcher } from './batcher';

beforeEach(() => {
  vi.stubGlobal(
    'requestAnimationFrame',
    (cb: (t: number) => void) => setTimeout(() => cb(0), 0) as unknown as number,
  );
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('FrameBatcher', () => {
  it('coalesces many puts into one flush, last write wins', () => {
    const batcher = new FrameBatcher();
    const flushes: Record<string, Value>[] = [];
    batcher.onFlush = (self) => flushes.push(self);

    batcher.put('navigation.speedOverGround', 3.1);
    batcher.put('navigation.speedOverGround', 3.2);
    batcher.put('navigation.speedOverGround', 3.3);
    vi.runAllTimers();

    expect(flushes).toHaveLength(1);
    expect(flushes[0]['navigation.speedOverGround']).toBe(3.3);
  });

  it('schedules a new flush after the previous one drains', () => {
    const batcher = new FrameBatcher();
    const flushes: Record<string, Value>[] = [];
    batcher.onFlush = (self) => flushes.push(self);

    batcher.put('a', 1);
    vi.runAllTimers();
    batcher.put('b', 2);
    vi.runAllTimers();

    expect(flushes).toHaveLength(2);
    expect(flushes[1]).toEqual({ b: 2 });
  });

  it('does not flush when nothing was buffered', () => {
    const batcher = new FrameBatcher();
    const flushes: Record<string, Value>[] = [];
    batcher.onFlush = (self) => flushes.push(self);
    vi.runAllTimers();
    expect(flushes).toHaveLength(0);
  });
});
