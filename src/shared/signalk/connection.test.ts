import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SkConnection } from './connection';
import type { ConnectionState } from './types';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  sent: string[] = [];
  closed = false;
  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
    this.onclose?.();
  }
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('SkConnection', () => {
  it('opens with subscribe=none and reports connecting then open', () => {
    const states: ConnectionState[] = [];
    const conn = new SkConnection('ws://test/signalk/v1/stream', {
      onState: (s) => states.push(s),
      onDelta: () => {},
    });
    conn.connect();
    expect(FakeWebSocket.instances[0].url).toContain('subscribe=none');
    expect(states.at(-1)?.phase).toBe('connecting');
    FakeWebSocket.instances[0].onopen?.();
    expect(states.at(-1)?.phase).toBe('open');
  });

  it('forwards raw messages to onDelta', () => {
    const deltas: string[] = [];
    const conn = new SkConnection('ws://test', {
      onState: () => {},
      onDelta: (d) => deltas.push(d),
    });
    conn.connect();
    FakeWebSocket.instances[0].onmessage?.({ data: '{"updates":[]}' });
    expect(deltas).toEqual(['{"updates":[]}']);
  });

  it('reconnects after close and reports reconnecting', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const states: ConnectionState[] = [];
    const conn = new SkConnection('ws://test', {
      onState: (s) => states.push(s),
      onDelta: () => {},
    });
    conn.connect();
    FakeWebSocket.instances[0].onopen?.();
    FakeWebSocket.instances[0].onclose?.();
    expect(states.at(-1)?.phase).toBe('reconnecting');
    vi.runOnlyPendingTimers();
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('resets the attempt counter on a successful open', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const states: ConnectionState[] = [];
    const conn = new SkConnection('ws://test', {
      onState: (s) => states.push(s),
      onDelta: () => {},
    });
    conn.connect();
    FakeWebSocket.instances[0].onclose?.();
    vi.runOnlyPendingTimers();
    FakeWebSocket.instances[1].onopen?.();
    expect(states.at(-1)).toMatchObject({ phase: 'open', attempt: 0 });
  });
});
