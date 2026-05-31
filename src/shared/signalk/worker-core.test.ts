import type { Path } from '@signalk/server-api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeWebSocket } from '$shared/testing/fake-websocket';
import type { SKFrame } from './types';
import { WorkerCore } from './worker-core';

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
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

describe('WorkerCore', () => {
  it('batches incoming deltas into one frame of self values', () => {
    const frames: SKFrame[] = [];
    const core = new WorkerCore();
    core.connect('ws://test', (f) => frames.push(f));
    const ws = FakeWebSocket.instances[0];
    ws.onopen?.();
    ws.onmessage?.({
      data: JSON.stringify({
        context: 'vessels.self',
        updates: [{ values: [{ path: 'navigation.speedOverGround', value: 4.2 }] }],
      }),
    });
    vi.runAllTimers();
    expect(frames.at(-1)?.self['navigation.speedOverGround']).toBe(4.2);
  });

  it('forwards subscribe messages to the socket', () => {
    const core = new WorkerCore();
    core.connect('ws://test', () => {});
    const ws = FakeWebSocket.instances[0];
    ws.onopen?.();
    core.subscribe([{ path: 'navigation.position' as Path, policy: 'instant', minPeriod: 1000 }]);
    expect(ws.sent.some((m) => m.includes('navigation.position'))).toBe(true);
  });
});
