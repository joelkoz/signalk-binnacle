import { describe, expect, it, vi } from 'vitest';
import { wrapRadarWorker } from './radar-worker-client';

describe('wrapRadarWorker', () => {
  it('forwards open and close to the wrapped api and disposes the proxy and worker', () => {
    const api = {
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const release = vi.fn();
    const terminate = vi.fn();
    const client = wrapRadarWorker(api as never, release, terminate);
    void client.open('ws://x/spokes', 'mayara', 2048, 1024, 15, () => {});
    expect(api.open).toHaveBeenCalledOnce();
    client.dispose();
    expect(release).toHaveBeenCalledOnce();
    expect(terminate).toHaveBeenCalledOnce();
  });
});
