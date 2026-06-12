import { describe, expect, it, vi } from 'vitest';
import { loadTrendHistory, TREND_RESOLUTION_SECONDS, TREND_WINDOW_SECONDS } from './trends-history';

const PROVIDERS = { ids: ['qdb'] };

describe('loadTrendHistory', () => {
  it('maps the combined columnar answer back to per-metric series', async () => {
    const fetchValues = vi.fn(async () => ({
      provider: 'qdb',
      values: {
        from: '',
        to: '',
        columns: [
          { path: 'environment.depth.belowTransducer', method: 'average' },
          { path: 'environment.wind.speedApparent', method: 'max' },
          { path: 'environment.outside.pressure', method: 'average' },
          { path: 'navigation.speedOverGround', method: 'average' },
        ],
        rows: [
          ['2026-06-12T00:00:00Z', 4.2, null, 101325, 2.5],
          ['2026-06-12T00:05:00Z', null, 7.1, null, null],
          ['not a time', 1, 1, 1, 1],
        ] as Array<[string, ...unknown[]]>,
      },
    }));
    const got = await loadTrendHistory('http://boat', 'tok', PROVIDERS, { fetchValues });
    expect(fetchValues).toHaveBeenCalledWith('http://boat', 'tok', PROVIDERS, {
      paths: [
        'environment.depth.belowTransducer:average',
        'environment.wind.speedApparent:max',
        'environment.outside.pressure:average',
        'navigation.speedOverGround:average',
      ],
      durationSeconds: TREND_WINDOW_SECONDS,
      resolutionSeconds: TREND_RESOLUTION_SECONDS,
    });
    expect(got?.provider).toBe('qdb');
    const depth = got?.series.get('depth');
    expect(depth?.values).toEqual([4.2, null]);
    expect(depth?.times).toEqual([
      Date.parse('2026-06-12T00:00:00Z') / 1000,
      Date.parse('2026-06-12T00:05:00Z') / 1000,
    ]);
    expect(got?.series.get('wind')?.values).toEqual([null, 7.1]);
  });

  it('matches a column by path and method, falling back to path alone', async () => {
    const fetchValues = vi.fn(async () => ({
      provider: 'qdb',
      values: {
        from: '',
        to: '',
        // The wind path twice with different methods: the max column is wind's, not the first.
        columns: [
          { path: 'environment.wind.speedApparent', method: 'average' },
          { path: 'environment.wind.speedApparent', method: 'max' },
          { path: 'navigation.speedOverGround', method: '' },
        ],
        rows: [['2026-06-12T00:00:00Z', 3.0, 7.1, 2.5]] as Array<[string, ...unknown[]]>,
      },
    }));
    const got = await loadTrendHistory('http://boat', undefined, PROVIDERS, { fetchValues });
    expect(got?.series.get('wind')?.values).toEqual([7.1]);
    // No method echo: sog still resolves by path alone.
    expect(got?.series.get('sog')?.values).toEqual([2.5]);
  });

  it('returns undefined when the query fails and empty series for missing columns', async () => {
    expect(
      await loadTrendHistory('http://boat', undefined, PROVIDERS, {
        fetchValues: async () => undefined,
      }),
    ).toBeUndefined();
    const got = await loadTrendHistory('http://boat', undefined, PROVIDERS, {
      fetchValues: async () => ({
        provider: undefined,
        values: { from: '', to: '', columns: [], rows: [] },
      }),
    });
    expect(got?.series.get('depth')).toEqual({ times: [], values: [] });
  });
});
