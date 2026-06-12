import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubFetch } from '$shared/testing/fetch-stub';
import {
  fetchHistoryProviders,
  fetchHistoryValues,
  fetchHistoryValuesAcrossProviders,
} from './history-client';

const BASE = 'http://boat';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchHistoryProviders', () => {
  it('orders the default provider first', async () => {
    stubFetch({
      ok: true,
      body: { kip: { isDefault: false }, 'signalk-questdb': { isDefault: true } },
    });
    await expect(fetchHistoryProviders(BASE, 'tok')).resolves.toEqual({
      ids: ['signalk-questdb', 'kip'],
    });
  });

  it('reports no providers as an empty list and an absent API as undefined', async () => {
    stubFetch({ ok: true, body: {} });
    await expect(fetchHistoryProviders(BASE)).resolves.toEqual({ ids: [] });
    stubFetch({ ok: false, status: 404 });
    await expect(fetchHistoryProviders(BASE)).resolves.toBeUndefined();
  });
});

describe('fetchHistoryValues', () => {
  it('parses the columnar response and keeps only well-shaped rows', async () => {
    const mock = stubFetch({
      ok: true,
      body: {
        context: 'vessels.self',
        range: { from: '2026-06-11T00:00:00Z', to: '2026-06-12T00:00:00Z' },
        values: [{ path: 'environment.depth.belowTransducer', method: 'average' }],
        data: [
          ['2026-06-11T00:00:00Z', 4.2],
          ['2026-06-11T00:05:00Z', null],
          ['bad row'],
          'not a row',
        ],
      },
    });
    const got = await fetchHistoryValues(BASE, 'tok', {
      paths: ['environment.depth.belowTransducer'],
      durationSeconds: 86400,
      resolutionSeconds: 300,
    });
    expect(got?.columns).toEqual([
      { path: 'environment.depth.belowTransducer', method: 'average' },
    ]);
    expect(got?.rows).toEqual([
      ['2026-06-11T00:00:00Z', 4.2],
      ['2026-06-11T00:05:00Z', null],
    ]);
    const url = String(mock.mock.calls[0][0]);
    expect(url).toContain('/signalk/v2/api/history/values?');
    expect(url).toContain('duration=86400');
    expect(url).toContain('resolution=300');
  });

  it('returns undefined on a 501 no-provider answer or a transport failure', async () => {
    stubFetch({ ok: false, status: 501 });
    await expect(
      fetchHistoryValues(BASE, undefined, { paths: ['a'], durationSeconds: 60 }),
    ).resolves.toBeUndefined();
    stubFetch('reject');
    await expect(
      fetchHistoryValues(BASE, undefined, { paths: ['a'], durationSeconds: 60 }),
    ).resolves.toBeUndefined();
  });
});

describe('fetchHistoryValuesAcrossProviders', () => {
  it('falls past an empty default provider to one that has rows', async () => {
    const mock = vi.fn(async (url: string) => {
      const empty = String(url).includes('provider=kip');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          range: {},
          values: [{ path: 'p', method: 'average' }],
          data: empty ? [] : [['2026-06-12T00:00:00Z', 1]],
        }),
      } as Response;
    });
    vi.stubGlobal('fetch', mock);
    const got = await fetchHistoryValuesAcrossProviders(
      BASE,
      undefined,
      { ids: ['kip', 'qdb'] },
      {
        paths: ['p'],
        durationSeconds: 60,
      },
    );
    expect(got?.provider).toBe('qdb');
    expect(got?.values.rows).toHaveLength(1);
  });
});
