import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMPANION_POLL_MS, CompanionStatus } from './companion-status.svelte.js';

// A stub Document with just the visibility surface the poller reads, so the class can run under the
// node test environment (no DOM). fire() invokes the registered visibilitychange listeners.
function makeDoc(): {
  hidden: boolean;
  addEventListener: (type: string, cb: () => void) => void;
  removeEventListener: (type: string, cb: () => void) => void;
  fire: () => void;
  listenerCount: () => number;
} {
  const listeners = new Set<() => void>();
  return {
    hidden: false,
    addEventListener(type, cb) {
      if (type === 'visibilitychange') listeners.add(cb);
    },
    removeEventListener(_type, cb) {
      listeners.delete(cb);
    },
    fire() {
      for (const cb of listeners) cb();
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

const okResponse = (bytes: number, status = 200): Response =>
  ({
    ok: status < 400,
    status,
    json: async () => ({ rows: 1, bytes, cap: 1000, perSourceAvgBytes: {} }),
  }) as unknown as Response;

const errorResponse = (status: number): Response =>
  ({ ok: false, status, json: async () => ({ error: status }) }) as unknown as Response;

let doc: ReturnType<typeof makeDoc>;

beforeEach(() => {
  vi.useFakeTimers();
  doc = makeDoc();
  vi.stubGlobal('document', doc);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('CompanionStatus', () => {
  it('present derives from the base getter', () => {
    let base: string | null = null;
    const status = new CompanionStatus(
      'http://h',
      () => base,
      () => 'tok',
      vi.fn(),
    );
    expect(status.present).toBe(false);
    base = 'http://h/plugins/signalk-chart-locker';
    expect(status.present).toBe(true);
  });

  it('a successful poll sets serving and cacheBytes', async () => {
    const fetchImpl = vi.fn(async () => okResponse(4096));
    const status = new CompanionStatus(
      'http://h',
      () => 'http://h/plugins/signalk-chart-locker',
      () => 'tok',
      fetchImpl as unknown as typeof fetch,
    );
    status.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(status.state).toBe('serving');
    expect(status.cacheBytes).toBe(4096);
    status.stop();
  });

  it('a network failure sets down and keeps polling', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline');
    });
    const status = new CompanionStatus(
      'http://h',
      () => 'http://h/plugins/signalk-chart-locker',
      () => 'tok',
      fetchImpl as unknown as typeof fetch,
    );
    status.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(status.state).toBe('down');
    const afterFirst = fetchImpl.mock.calls.length;
    await vi.advanceTimersByTimeAsync(COMPANION_POLL_MS);
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(afterFirst);
    status.stop();
  });

  it('a 5xx sets down (not needs-auth)', async () => {
    const fetchImpl = vi.fn(async () => errorResponse(500));
    const status = new CompanionStatus(
      'http://h',
      () => 'http://h/plugins/signalk-chart-locker',
      () => 'tok',
      fetchImpl as unknown as typeof fetch,
    );
    status.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(status.state).toBe('down');
    status.stop();
  });

  it('a 401 sets needs-auth and stops polling until the token flips null to value', async () => {
    let token: string | null = 'stale';
    const fetchImpl = vi.fn(async () => (token === 'good' ? okResponse(8) : errorResponse(401)));
    const status = new CompanionStatus(
      'http://h',
      () => 'http://h/plugins/signalk-chart-locker',
      () => token,
      fetchImpl as unknown as typeof fetch,
    );
    status.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(status.state).toBe('needs-auth');
    const afterAuthFail = fetchImpl.mock.calls.length;

    // Still refused with the same token: no further network hits.
    await vi.advanceTimersByTimeAsync(COMPANION_POLL_MS);
    expect(fetchImpl.mock.calls.length).toBe(afterAuthFail);

    // The token clears (sign-out), then a fresh one arrives (re-approval): polling resumes.
    token = null;
    await vi.advanceTimersByTimeAsync(COMPANION_POLL_MS);
    expect(fetchImpl.mock.calls.length).toBe(afterAuthFail);
    token = 'good';
    await vi.advanceTimersByTimeAsync(COMPANION_POLL_MS);
    expect(fetchImpl.mock.calls.length).toBe(afterAuthFail + 1);
    expect(status.state).toBe('serving');
    status.stop();
  });

  it('a refused token refreshed directly to a new one resumes polling', async () => {
    let token = 'stale';
    const fetchImpl = vi.fn(async () => (token === 'fresh' ? okResponse(9) : errorResponse(403)));
    const status = new CompanionStatus(
      'http://h',
      () => 'http://h/plugins/signalk-chart-locker',
      () => token,
      fetchImpl as unknown as typeof fetch,
    );
    status.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(status.state).toBe('needs-auth');
    const afterAuthFail = fetchImpl.mock.calls.length;

    // Same refused token: backed off, no hit.
    await vi.advanceTimersByTimeAsync(COMPANION_POLL_MS);
    expect(fetchImpl.mock.calls.length).toBe(afterAuthFail);

    // The expired token is refreshed to a new value with no null in between: polling resumes.
    token = 'fresh';
    await vi.advanceTimersByTimeAsync(COMPANION_POLL_MS);
    expect(fetchImpl.mock.calls.length).toBe(afterAuthFail + 1);
    expect(status.state).toBe('serving');
    status.stop();
  });

  it('no token means zero polls and needs-auth', async () => {
    const fetchImpl = vi.fn(async () => okResponse(1));
    const status = new CompanionStatus(
      'http://h',
      () => 'http://h/plugins/signalk-chart-locker',
      () => null,
      fetchImpl as unknown as typeof fetch,
    );
    status.start();
    await vi.advanceTimersByTimeAsync(COMPANION_POLL_MS * 3);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(status.state).toBe('needs-auth');
    status.stop();
  });

  it('a hidden tab pauses polling and a resume refetches', async () => {
    const fetchImpl = vi.fn(async () => okResponse(2));
    const status = new CompanionStatus(
      'http://h',
      () => 'http://h/plugins/signalk-chart-locker',
      () => 'tok',
      fetchImpl as unknown as typeof fetch,
    );
    status.start();
    await vi.advanceTimersByTimeAsync(0);
    const afterMount = fetchImpl.mock.calls.length;

    doc.hidden = true;
    await vi.advanceTimersByTimeAsync(COMPANION_POLL_MS);
    expect(fetchImpl.mock.calls.length).toBe(afterMount);

    doc.hidden = false;
    doc.fire();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl.mock.calls.length).toBe(afterMount + 1);
    status.stop();
  });

  it('stop clears the timer and removes the visibilitychange listener', async () => {
    const fetchImpl = vi.fn(async () => okResponse(3));
    const status = new CompanionStatus(
      'http://h',
      () => 'http://h/plugins/signalk-chart-locker',
      () => 'tok',
      fetchImpl as unknown as typeof fetch,
    );
    status.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(doc.listenerCount()).toBe(1);
    status.stop();
    expect(doc.listenerCount()).toBe(0);
    const afterStop = fetchImpl.mock.calls.length;
    await vi.advanceTimersByTimeAsync(COMPANION_POLL_MS * 2);
    expect(fetchImpl.mock.calls.length).toBe(afterStop);
  });

  it('start is idempotent: a second call does not stack a timer or listener', async () => {
    const fetchImpl = vi.fn(async () => okResponse(5));
    const status = new CompanionStatus(
      'http://h',
      () => 'http://h/plugins/signalk-chart-locker',
      () => 'tok',
      fetchImpl as unknown as typeof fetch,
    );
    status.start();
    status.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(doc.listenerCount()).toBe(1);
    const afterStart = fetchImpl.mock.calls.length;
    await vi.advanceTimersByTimeAsync(COMPANION_POLL_MS);
    // One interval elapsed fires exactly one poll, not two.
    expect(fetchImpl.mock.calls.length).toBe(afterStart + 1);
    status.stop();
  });
});
