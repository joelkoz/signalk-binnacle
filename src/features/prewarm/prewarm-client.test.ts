import { describe, expect, it, vi } from 'vitest';
import { createPrewarmClient } from './prewarm-client.js';

const ok = (body: unknown, status = 200): Response =>
  ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

describe('prewarm client', () => {
  it('posts a prewarm with the bearer token and returns the jobId', async () => {
    const fetchImpl = vi.fn(async () => ok({ jobId: 'warm-3' }));
    const client = createPrewarmClient('http://h', 'tok', fetchImpl as unknown as typeof fetch);
    const res = await client.postPrewarm({
      bbox: [-1, -1, 1, 1],
      sources: ['seamark'],
      minzoom: 6,
      maxzoom: 8,
    });
    expect(res).toEqual({ jobId: 'warm-3' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://h/plugins/signalk-binnacle-companion/api/prewarm',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
      }),
    );
  });

  it('maps a 404 status to null (the job is gone)', async () => {
    const fetchImpl = vi.fn(async () => ok({}, 404));
    const client = createPrewarmClient('http://h', 'tok', fetchImpl as unknown as typeof fetch);
    expect(await client.getStatus('warm-9')).toBeNull();
  });

  it('reads the cache stats without a token on an unsecured server', async () => {
    const stats = { rows: 2, bytes: 100, cap: 1000, perSourceAvgBytes: { seamark: 50 } };
    const fetchImpl = vi.fn(async () => ok(stats));
    const client = createPrewarmClient('http://h', undefined, fetchImpl as unknown as typeof fetch);
    expect(await client.getCacheStats()).toEqual(stats);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://h/plugins/signalk-binnacle-companion/api/cache/stats',
      undefined,
    );
  });
});
