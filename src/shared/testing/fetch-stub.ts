import { vi } from 'vitest';

// Test-only fetch stub shared by the REST client tests: stubs the global fetch with a mock that
// answers { ok, body } or throws on 'reject', returning the mock for call assertions. Callers
// own the vi.unstubAllGlobals() in their afterEach. Imported by *.test.ts files only.
export function stubFetch(response: { ok: boolean; status?: number; body?: unknown } | 'reject') {
  const mock = vi.fn(async (_url: string, _init?: RequestInit) => {
    if (response === 'reject') throw new TypeError('network down');
    return {
      ok: response.ok,
      status: response.status ?? (response.ok ? 200 : 500),
      json: async () => response.body,
    } as Response;
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}
