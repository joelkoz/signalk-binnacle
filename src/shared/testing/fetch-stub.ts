import { vi } from 'vitest';

// Test-only fetch stub shared by the REST client tests: stubs the global fetch with a mock that
// answers { ok, body } or throws on 'reject', returning the mock for call assertions. Set rejectJson
// to make response.json() throw, modeling a 200 with an empty or invalid body (which real Response
// rejects on), so a client's parse-degrade path can be exercised. Callers own the
// vi.unstubAllGlobals() in their afterEach. Imported by *.test.ts files only.
export function stubFetch(
  response: { ok: boolean; status?: number; body?: unknown; rejectJson?: boolean } | 'reject',
) {
  const mock = vi.fn(async (_url: string, _init?: RequestInit) => {
    if (response === 'reject') throw new TypeError('network down');
    return {
      ok: response.ok,
      status: response.status ?? (response.ok ? 200 : 500),
      json: async () => {
        if (response.rejectJson) throw new SyntaxError('Unexpected end of JSON input');
        return response.body;
      },
    } as Response;
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}
