import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCharts } from './charts-client';

afterEach(() => vi.restoreAllMocks());

function jsonResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(body) } as Response);
}

describe('fetchCharts', () => {
  it('normalizes the v2 charts map to an array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        jsonResponse({
          noaa: { identifier: 'noaa', name: 'NOAA', type: 'tilelayer' },
          enc: { identifier: 'enc', name: 'ENC', type: 'tileJSON' },
        }),
      ),
    );
    const charts = (await fetchCharts('http://pi.local')) ?? [];
    expect(charts).toHaveLength(2);
    expect(charts.map((c) => c.identifier).sort()).toEqual(['enc', 'noaa']);
  });

  it('falls back to v1 when v2 returns 404', async () => {
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(jsonResponse({}, false, 404))
      .mockReturnValueOnce(
        jsonResponse({ noaa: { identifier: 'noaa', name: 'NOAA', type: 'tilelayer' } }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const charts = (await fetchCharts('http://pi.local')) ?? [];
    expect(charts).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns undefined when both endpoints fail so a caller keeps its charts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse({}, false, 500)),
    );
    expect(await fetchCharts('http://pi.local')).toBeUndefined();
  });

  it('returns undefined on a fetch rejection so a caller keeps its charts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    expect(await fetchCharts('http://pi.local')).toBeUndefined();
  });

  it('returns an empty array for a reachable server with no charts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse({})),
    );
    expect(await fetchCharts('http://pi.local')).toEqual([]);
  });

  it('sends the auth token as a Bearer header when given', async () => {
    const fetchMock = vi.fn(() =>
      jsonResponse({ noaa: { identifier: 'noaa', name: 'NOAA', type: 'tilelayer' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await fetchCharts('http://pi.local', 'tok');
    expect(fetchMock).toHaveBeenCalledWith('http://pi.local/signalk/v2/api/resources/charts', {
      headers: { Authorization: 'Bearer tok' },
    });
  });
});
