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

// A minimal valid RadarInfo as the server would return it in the discovery array.
const fakeRadar = {
  id: 'a',
  name: 'A',
  status: 'standby',
  spokesPerRevolution: 2048,
  maxSpokeLen: 1024,
  range: 1852,
  controls: { gain: { value: 50 } },
};

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
          ? new Response(JSON.stringify([fakeRadar]), { status: 200 })
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

  it('setControl optimistically updates the store and writes the value', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url);
        if (
          url.includes('/radars') &&
          !url.includes('/controls') &&
          !url.includes('/capabilities')
        ) {
          return new Response(
            JSON.stringify([
              {
                id: 'a',
                name: 'A',
                status: 'standby',
                spokesPerRevolution: 16,
                maxSpokeLen: 8,
                range: 100,
                controls: { gain: { value: 50 } },
              },
            ]),
            { status: 200 },
          );
        }
        return new Response('', { status: 200 });
      }),
    );
    const controller = createMarineRadarController({
      origin: '',
      getToken: () => undefined,
      getCenter: () => ({ latitude: 0, longitude: 0 }),
      radarAvailable: () => true,
    });
    await controller.start();
    await controller.setControl('gain', 55);
    expect(controller.store.controlValues.gain).toBe(55);
    expect(urls.some((u) => u.includes('/controls/gain'))).toBe(true);
    controller.dispose();
  });
});
