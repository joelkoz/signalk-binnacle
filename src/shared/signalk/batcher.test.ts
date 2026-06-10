import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FrameBatcher } from './batcher';
import type { Value } from './types';

beforeEach(() => {
  vi.stubGlobal(
    'requestAnimationFrame',
    (cb: (t: number) => void) => setTimeout(() => cb(0), 0) as unknown as number,
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('FrameBatcher', () => {
  it('coalesces many puts into one flush, last write wins', () => {
    const batcher = new FrameBatcher();
    const flushes: Map<string, Value>[] = [];
    batcher.onFlush = (self) => flushes.push(self);

    batcher.put('navigation.speedOverGround', 3.1);
    batcher.put('navigation.speedOverGround', 3.2);
    batcher.put('navigation.speedOverGround', 3.3);
    vi.runAllTimers();

    expect(flushes).toHaveLength(1);
    expect(flushes[0].get('navigation.speedOverGround')).toBe(3.3);
  });

  it('schedules a new flush after the previous one drains', () => {
    const batcher = new FrameBatcher();
    const flushes: Map<string, Value>[] = [];
    batcher.onFlush = (self) => flushes.push(self);

    batcher.put('a', 1);
    vi.runAllTimers();
    batcher.put('b', 2);
    vi.runAllTimers();

    expect(flushes).toHaveLength(2);
    expect(flushes[1]).toEqual(new Map([['b', 2]]));
  });

  it('does not flush when nothing was buffered', () => {
    const batcher = new FrameBatcher();
    const flushes: Map<string, Value>[] = [];
    batcher.onFlush = (self) => flushes.push(self);
    vi.runAllTimers();
    expect(flushes).toHaveLength(0);
  });

  it('reset() drops a pending flush and clears the buffers', () => {
    const batcher = new FrameBatcher();
    const flushes: Map<string, Value>[] = [];
    batcher.onFlush = (self) => flushes.push(self);

    batcher.put('navigation.speedOverGround', 3.1);
    batcher.reset();
    vi.runAllTimers();
    expect(flushes).toHaveLength(0);

    // Still reusable: a later put schedules and flushes afresh.
    batcher.put('navigation.headingTrue', 1);
    vi.runAllTimers();
    expect(flushes).toHaveLength(1);
    expect(flushes[0]).toEqual(new Map([['navigation.headingTrue', 1]]));
  });

  it('accumulates per-vessel writes keyed by context, last write wins', () => {
    const batcher = new FrameBatcher();
    let captured: Map<string, Map<string, Value>> | undefined;
    batcher.onFlush = (_self, ais) => {
      captured = ais;
    };
    batcher.putVessel('vessels.a', 'navigation.speedOverGround', 1);
    batcher.putVessel('vessels.a', 'navigation.speedOverGround', 2);
    batcher.putVessel('vessels.b', 'navigation.headingTrue', 0.5);
    vi.runAllTimers();
    expect(captured?.get('vessels.a')?.get('navigation.speedOverGround')).toBe(2);
    expect(captured?.get('vessels.b')?.get('navigation.headingTrue')).toBe(0.5);
  });
});
