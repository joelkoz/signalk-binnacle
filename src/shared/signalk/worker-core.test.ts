import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeWebSocket } from '$shared/testing/fake-websocket';
import type { Path, SKFrame } from './types';
import { WorkerCore } from './worker-core';

beforeEach(() => {
  FakeWebSocket.reset();
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
    expect(frames.at(-1)?.self.get('navigation.speedOverGround')).toBe(4.2);
  });

  it('forwards subscribe messages to the socket', () => {
    const core = new WorkerCore();
    core.connect('ws://test', () => {});
    const ws = FakeWebSocket.instances[0];
    ws.open();
    core.subscribe([{ path: 'navigation.position' as Path, policy: 'instant', minPeriod: 1000 }]);
    expect(ws.sent.some((m) => m.includes('navigation.position'))).toBe(true);
  });

  it('routes own-vessel deltas to self and other vessels to ais', () => {
    const frames: SKFrame[] = [];
    const core = new WorkerCore();
    core.connect('ws://test', (f) => frames.push(f));
    const ws = FakeWebSocket.instances[0];
    ws.onopen?.();
    ws.onmessage?.({
      data: JSON.stringify({ name: 'sk', version: '1.0.0', self: 'vessels.self-urn' }),
    });
    ws.onmessage?.({
      data: JSON.stringify({
        context: 'vessels.self-urn',
        updates: [{ values: [{ path: 'navigation.speedOverGround', value: 5 }] }],
      }),
    });
    ws.onmessage?.({
      data: JSON.stringify({
        context: 'vessels.other',
        updates: [{ values: [{ path: 'navigation.speedOverGround', value: 9 }] }],
      }),
    });
    vi.runAllTimers();
    const frame = frames.at(-1);
    expect(frame?.self.get('navigation.speedOverGround')).toBe(5);
    expect(frame?.ais?.get('vessels.other')?.get('navigation.speedOverGround')).toBe(9);
    expect(frame?.ais?.get('vessels.self-urn')).toBeUndefined();
  });

  it('treats vessels.self context as own vessel', () => {
    const frames: SKFrame[] = [];
    const core = new WorkerCore();
    core.connect('ws://test', (f) => frames.push(f));
    const ws = FakeWebSocket.instances[0];
    ws.onopen?.();
    ws.onmessage?.({
      data: JSON.stringify({
        context: 'vessels.self',
        updates: [{ values: [{ path: 'navigation.headingTrue', value: 1 }] }],
      }),
    });
    vi.runAllTimers();
    expect(frames.at(-1)?.self.get('navigation.headingTrue')).toBe(1);
  });
});
