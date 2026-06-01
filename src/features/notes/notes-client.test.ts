import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchNotes } from './notes-client';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('fetchNotes', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('requests with a bbox and no provider, and parses positioned notes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        a: { name: 'Marina', position: { latitude: 42.6, longitude: -83.5 } },
        b: { title: 'Anchorage', position: { latitude: 42.7, longitude: -83.4 } },
        c: { name: 'No position here' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const notes = await fetchNotes('http://pi', 'tok', [-84, 42, -83, 43]);
    expect(notes).toHaveLength(2);
    expect(notes[0]).toEqual({
      id: 'a',
      name: 'Marina',
      position: { latitude: 42.6, longitude: -83.5 },
    });
    expect(notes[1].name).toBe('Anchorage');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/signalk/v2/api/resources/notes?');
    expect(url).toContain('bbox=');
    expect(url).not.toContain('provider=');
    expect((init as RequestInit).headers).toEqual({ Authorization: 'Bearer tok' });
  });

  it('returns an empty list on an error response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(400, { state: 'FAILED' })));
    expect(await fetchNotes('http://pi', undefined, [0, 0, 1, 1])).toEqual([]);
  });

  it('returns an empty list when the fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')));
    expect(await fetchNotes('http://pi', undefined, [0, 0, 1, 1])).toEqual([]);
  });
});
