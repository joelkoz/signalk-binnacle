import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./radar-worker-client', () => ({
  createRadarWorkerClient: () => ({
    open: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
  }),
}));

import { createMarineRadarController } from './marine-radar-controller.svelte';

afterEach(() => vi.restoreAllMocks());

describe('createMarineRadarController', () => {
  it('does not discover or open a worker when radar is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    );
    const controller = createMarineRadarController({
      origin: '',
      getToken: () => undefined,
      getCenter: () => ({ latitude: 0, longitude: 0 }),
      radarAvailable: () => false,
    });
    await controller.start();
    expect(controller.store.radars).toHaveLength(0);
    controller.dispose();
  });

  it('discovers radars and selects the first when available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('/signalk/v2/api/vessels/self/radars')
          ? new Response(
              JSON.stringify({
                a: { id: 'a', name: 'A', spokes: 2048, maxSpokeLen: 1024, legend: { pixels: [] } },
              }),
              { status: 200 },
            )
          : new Response('', { status: 404 }),
      ),
    );
    const controller = createMarineRadarController({
      origin: '',
      getToken: () => undefined,
      getCenter: () => ({ latitude: 0, longitude: 0 }),
      radarAvailable: () => true,
    });
    await controller.start();
    expect(controller.store.selectedId).toBe('a');
    controller.dispose();
  });
});
