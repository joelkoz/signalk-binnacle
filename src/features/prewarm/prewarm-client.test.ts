import { describe, expect, it, vi } from 'vitest';
import { createPrewarmClient } from './prewarm-client.js';

const ok = (body: unknown, status = 200): Response =>
  ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

describe('prewarm client', () => {
  it('maps a region status 404 to null (the job is gone)', async () => {
    const fetchImpl = vi.fn(async () => ok({}, 404));
    const client = createPrewarmClient('http://h/plugins/signalk-chart-locker', 'tok', fetchImpl as unknown as typeof fetch);
    expect(await client.getRegionJobStatus('region-9')).toBeNull();
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://h/plugins/signalk-chart-locker/api/regions/region-9/status',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer tok' }) }),
    );
  });

  it('encodes lat and lon into the geocode query', async () => {
    const fetchImpl = vi.fn(async () => ok({ display_name: 'Test City' }));
    const client = createPrewarmClient('http://h/plugins/signalk-chart-locker', undefined, fetchImpl as unknown as typeof fetch);
    expect(await client.geocode(37.77, -122.41)).toBe('Test City');
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://h/plugins/signalk-chart-locker/api/geocode?lat=37.77&lon=-122.41',
      undefined,
    );
  });

  it('reads the cache stats without a token on an unsecured server', async () => {
    const stats = { rows: 2, bytes: 100, cap: 1000, perSourceAvgBytes: { seamark: 50 } };
    const fetchImpl = vi.fn(async () => ok(stats));
    const client = createPrewarmClient('http://h/plugins/signalk-chart-locker', undefined, fetchImpl as unknown as typeof fetch);
    expect(await client.getCacheStats()).toEqual(stats);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://h/plugins/signalk-chart-locker/api/cache/stats',
      undefined,
    );
  });

  it('posts config with the bearer token', async () => {
    const fetchImpl = vi.fn(async () => ok(undefined));
    const client = createPrewarmClient('http://h/plugins/signalk-chart-locker', 'tok', fetchImpl as unknown as typeof fetch);
    const config = { sources: ['seamark'] };
    await client.postConfig(config);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://h/plugins/signalk-chart-locker/api/prewarm/config',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
        body: JSON.stringify(config),
      }),
    );
  });
});
