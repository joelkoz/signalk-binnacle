import { describe, expect, it, vi } from 'vitest';
import { fetchManagedCharts, putChartOverride } from './charts-management-client';

const ORIGIN = 'http://pi.local';
const API = `${ORIGIN}/plugins/signalk-binnacle-companion/api`;

describe('charts-management-client', () => {
  it('fetches and parses the managed charts list with the bearer token', async () => {
    const payload = {
      charts: [
        {
          identifier: 'sf-pmtiles',
          fileName: 'sf.pmtiles',
          name: 'sf',
          description: '',
          scale: 250000,
          minzoom: 0,
          maxzoom: 14,
          format: 'mvt',
          override: {},
        },
      ],
      invalid: [],
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
    const result = await fetchManagedCharts(ORIGIN, 'tok', fetchImpl);
    expect(result?.charts[0].identifier).toBe('sf-pmtiles');
    expect(fetchImpl).toHaveBeenCalledWith(
      `${API}/charts`,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
      }),
    );
  });

  it('returns undefined on a non-ok response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 403 }));
    expect(await fetchManagedCharts(ORIGIN, 'tok', fetchImpl)).toBeUndefined();
  });

  it('posts an override with the bearer token and reports success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const ok = await putChartOverride(ORIGIN, 'tok', 'sf-pmtiles', { name: 'Renamed' }, fetchImpl);
    expect(ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      `${API}/charts/sf-pmtiles/override`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
      }),
    );
  });
});
