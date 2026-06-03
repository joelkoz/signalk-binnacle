import { describe, expect, it, vi } from 'vitest';
import { fetchRadar } from './rainviewer-client';

function res(body: unknown): Response {
  return { ok: true, json: async () => body } as unknown as Response;
}

const maps = {
  host: 'https://tilecache.rainviewer.com',
  radar: {
    past: [
      { time: 1780508400, path: '/v2/radar/aaa' },
      { time: 1780509000, path: '/v2/radar/bbb' },
    ],
    nowcast: [{ time: 1780509600, path: '/v2/radar/ccc' }],
  },
};

describe('fetchRadar', () => {
  it('parses host and frames (past then nowcast), times in ms', async () => {
    const fetchFn = vi.fn(async () => res(maps));
    const radar = await fetchRadar(fetchFn as unknown as typeof fetch);
    expect(radar?.host).toBe('https://tilecache.rainviewer.com');
    expect(radar?.frames).toHaveLength(3);
    expect(radar?.frames[0]).toEqual({ time: 1780508400000, path: '/v2/radar/aaa' });
    expect(radar?.frames[2].path).toBe('/v2/radar/ccc');
  });

  it('returns undefined on failure', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('offline');
    });
    expect(await fetchRadar(fetchFn as unknown as typeof fetch)).toBeUndefined();
  });
});
