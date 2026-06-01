import { describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.svelte';

function storage(seed: Record<string, string> = {}): Pick<Storage, 'getItem' | 'setItem'> {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}

function res(ok: boolean, body: unknown = {}): Response {
  return { ok, json: async () => body } as unknown as Response;
}

const BASE = 'http://sk.test';
const noSchedule = () => {};

describe('AuthController', () => {
  it('reports an unsecured server and needs no token', async () => {
    const fetchFn = vi.fn(async () => res(true, {}));
    const auth = new AuthController(BASE, {
      fetch: fetchFn as unknown as typeof fetch,
      storage: storage(),
      schedule: noSchedule,
    });
    await auth.probe();
    expect(auth.status).toBe('unsecured');
    expect(auth.token).toBeNull();
  });

  it('uses a stored token that still works', async () => {
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) =>
      res(Boolean(init?.headers), {}),
    );
    const auth = new AuthController(BASE, {
      fetch: fetchFn as unknown as typeof fetch,
      storage: storage({
        'binnacle:signalk-auth': JSON.stringify({ clientId: 'c1', token: 'tok' }),
      }),
      schedule: noSchedule,
    });
    await auth.probe();
    expect(auth.status).toBe('authenticated');
    expect(auth.token).toBe('tok');
  });

  it('requests access when secured with no usable token', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.endsWith('/access/requests')) return res(true, { href: '/signalk/v1/requests/r1' });
      return res(false, {});
    });
    const auth = new AuthController(BASE, {
      fetch: fetchFn as unknown as typeof fetch,
      storage: storage(),
      schedule: noSchedule,
    });
    await auth.probe();
    expect(auth.status).toBe('requesting');
    expect(fetchFn).toHaveBeenCalledWith(
      `${BASE}/signalk/v1/access/requests`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('stores the token and authenticates when the request is approved', async () => {
    const saved: string[] = [];
    const store = storage();
    const origSet = store.setItem;
    store.setItem = (k, v) => {
      saved.push(v);
      origSet(k, v);
    };
    const fetchFn = vi.fn(async (url: string) => {
      if (url.endsWith('/access/requests')) return res(true, { href: '/signalk/v1/requests/r1' });
      if (url.endsWith('/requests/r1'))
        return res(true, {
          state: 'COMPLETED',
          accessRequest: { permission: 'APPROVED', token: 'newtok' },
        });
      return res(false, {});
    });
    const auth = new AuthController(BASE, {
      fetch: fetchFn as unknown as typeof fetch,
      storage: store,
      schedule: noSchedule,
    });
    await auth.requestAccess();
    await auth.checkRequest();
    expect(auth.status).toBe('authenticated');
    expect(auth.token).toBe('newtok');
    expect(saved.some((v) => v.includes('newtok'))).toBe(true);
  });

  it('reports denied when the request is refused', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.endsWith('/access/requests')) return res(true, { href: '/signalk/v1/requests/r1' });
      if (url.endsWith('/requests/r1'))
        return res(true, { state: 'COMPLETED', accessRequest: { permission: 'DENIED' } });
      return res(false, {});
    });
    const auth = new AuthController(BASE, {
      fetch: fetchFn as unknown as typeof fetch,
      storage: storage(),
      schedule: noSchedule,
    });
    await auth.requestAccess();
    await auth.checkRequest();
    expect(auth.status).toBe('denied');
  });

  it('keeps a stable clientId across instances', () => {
    const store = storage();
    const a = new AuthController(BASE, {
      fetch: (async () => res(true)) as unknown as typeof fetch,
      storage: store,
      schedule: noSchedule,
    });
    const b = new AuthController(BASE, {
      fetch: (async () => res(true)) as unknown as typeof fetch,
      storage: store,
      schedule: noSchedule,
    });
    expect(a.clientId).toBe(b.clientId);
  });
});
