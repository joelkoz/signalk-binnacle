import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OwnVessel } from '$entities/vessel';
import type { OverlayContext } from '$shared/map';
import { SignalKStore } from '$shared/signalk';
import { createVesselOverlay } from './vessel-overlay';

// ImageData is a browser global; the overlay builds the vessel icon with it, so the
// node test environment needs a minimal stand-in.
class FakeImageData {
  constructor(
    public data: Uint8ClampedArray,
    public width: number,
    public height: number,
  ) {}
}

beforeEach(() => {
  vi.stubGlobal('ImageData', FakeImageData);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function fakeMap() {
  const sources = new Map<string, { setData: (d: unknown) => void; data: unknown }>();
  const layers = new Set<string>();
  const images = new Set<string>();
  return {
    sources,
    layers,
    images,
    hasImage: (id: string) => images.has(id),
    addImage: (id: string) => images.add(id),
    addSource: (id: string, spec: { data: unknown }) => {
      sources.set(id, {
        data: spec.data,
        setData(d: unknown) {
          this.data = d;
        },
      });
    },
    getSource: (id: string) => sources.get(id),
    getLayer: (id: string) => (layers.has(id) ? { id } : undefined),
    addLayer: (layer: { id: string }) => layers.add(layer.id),
    removeLayer: (id: string) => layers.delete(id),
    removeSource: (id: string) => sources.delete(id),
    setLayoutProperty: vi.fn(),
    setPaintProperty: vi.fn(),
  };
}

function ctxFor(map: ReturnType<typeof fakeMap>): OverlayContext {
  return { map: map as never, beforeIdFor: () => undefined };
}

describe('vessel overlay', () => {
  it('adds an image, a source, and a symbol layer', async () => {
    const store = new SignalKStore();
    const overlay = createVesselOverlay(new OwnVessel(store));
    const map = fakeMap();
    await overlay.add(ctxFor(map));
    expect(map.images.size).toBe(1);
    expect(map.sources.size).toBe(1);
    expect(map.layers.size).toBe(1);
  });

  it('updates the source position from the store', async () => {
    const store = new SignalKStore();
    const overlay = createVesselOverlay(new OwnVessel(store));
    const map = fakeMap();
    await overlay.add(ctxFor(map));
    store.applyFrame({
      self: { 'navigation.position': { latitude: 36.8, longitude: -121.7 } } as never,
      connection: { phase: 'open', attempt: 0, since: 0 },
      epoch: 1,
    });
    overlay.sync(ctxFor(map));
    const source = [...map.sources.values()][0];
    const fc = source.data as { features: Array<{ geometry: { coordinates: number[] } }> };
    expect(fc.features[0].geometry.coordinates).toEqual([-121.7, 36.8]);
  });

  it('remove deletes the layer and source', async () => {
    const store = new SignalKStore();
    const overlay = createVesselOverlay(new OwnVessel(store));
    const map = fakeMap();
    await overlay.add(ctxFor(map));
    overlay.remove(ctxFor(map));
    expect(map.layers.size).toBe(0);
    expect(map.sources.size).toBe(0);
  });
});
