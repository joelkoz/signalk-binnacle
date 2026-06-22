import { describe, expect, it, vi } from 'vitest';
import type { HistoryProviders, HistoryValues } from '$shared/signalk';
import { SK_PATHS } from '$shared/signalk';
import { loadTimeTravelHistory } from './time-travel-client';

const providers: HistoryProviders = { ids: ['signalk-questdb'] };

function okValues(): HistoryValues {
  return {
    from: '2026-06-17T00:00:00.000Z',
    to: '2026-06-17T01:00:00.000Z',
    columns: [{ path: SK_PATHS.position, method: '' }],
    rows: [['2026-06-17T00:00:00.000Z', { latitude: 1, longitude: 2 }]],
  };
}

describe('loadTimeTravelHistory', () => {
  it('sends position with no aggregate suffix and the metrics with theirs', async () => {
    const fetchValues = vi
      .fn()
      .mockResolvedValue({ values: okValues(), provider: 'signalk-questdb' });
    await loadTimeTravelHistory('http://x', 't', providers, { fetchValues });
    const query = fetchValues.mock.calls[0][3];
    expect(query.paths).toEqual([
      SK_PATHS.position,
      `${SK_PATHS.depthBelowTransducer}:average`,
      `${SK_PATHS.windSpeedApparent}:max`,
      `${SK_PATHS.outsidePressure}:average`,
      `${SK_PATHS.speedOverGround}:average`,
    ]);
    expect(query.durationSeconds).toBe(24 * 60 * 60);
    expect(query.resolutionSeconds).toBe(60);
    expect(fetchValues.mock.calls[0][1]).toBe('t');
  });

  it('returns parsed samples and range on success', async () => {
    const fetchValues = vi.fn().mockResolvedValue({ values: okValues(), provider: 'p' });
    const data = await loadTimeTravelHistory('http://x', undefined, providers, { fetchValues });
    expect(data?.samples).toHaveLength(1);
    expect(data?.from).toBe(Date.parse('2026-06-17T00:00:00.000Z'));
    expect(data?.to).toBe(Date.parse('2026-06-17T01:00:00.000Z'));
  });

  it('returns undefined when the query is unreachable', async () => {
    const fetchValues = vi.fn().mockResolvedValue(undefined);
    expect(
      await loadTimeTravelHistory('http://x', undefined, providers, { fetchValues }),
    ).toBeUndefined();
  });

  it('returns an empty sample list when the provider answered with no rows', async () => {
    const empty: HistoryValues = { ...okValues(), rows: [] };
    const fetchValues = vi.fn().mockResolvedValue({ values: empty, provider: 'p' });
    const data = await loadTimeTravelHistory('http://x', undefined, providers, { fetchValues });
    expect(data?.samples).toEqual([]);
  });
});
