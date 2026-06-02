import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AisTargets } from '$entities/ais';
import { mapThemePaint, type OverlayContext } from '$shared/map';
import { SignalKStore } from '$shared/signalk';
import { createFakeMap } from '$shared/testing/fake-map';
import { createAisOverlay } from './ais-overlay';

class FakeImageData {
  constructor(
    public data: Uint8ClampedArray,
    public width: number,
    public height: number,
  ) {}
}

beforeEach(() => vi.stubGlobal('ImageData', FakeImageData));
afterEach(() => vi.unstubAllGlobals());

function ctxFor(map: ReturnType<typeof createFakeMap>): OverlayContext {
  return { map: map as never, beforeIdFor: () => undefined };
}

describe('ais overlay', () => {
  it('adds an image, a source, and a symbol layer in the traffic band', () => {
    const store = new SignalKStore();
    const overlay = createAisOverlay(new AisTargets(store), store);
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    expect(overlay.band).toBe('traffic');
    expect(map.images.size).toBe(1);
    expect(map.sources.size).toBe(1);
    expect(map.layers.size).toBe(1);
  });

  it('syncs one feature per positioned target', () => {
    const store = new SignalKStore();
    const overlay = createAisOverlay(new AisTargets(store), store);
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    store.applyFrame({
      self: {},
      ais: {
        'vessels.a': { 'navigation.position': { latitude: 1, longitude: 2 } },
        'vessels.b': { name: 'no pos' },
      },
      connection: { phase: 'open', attempt: 0 },
      // The worker stamps targets with a wall clock; a recent epoch keeps them
      // inside the staleness window when sync prunes.
      epoch: Date.now(),
    });
    overlay.sync(ctxFor(map));
    const source = [...map.sources.values()][0];
    const fc = source.data as { features: unknown[] };
    expect(fc.features).toHaveLength(1);
  });

  it('skips setData when the ais version is unchanged', () => {
    const store = new SignalKStore();
    const overlay = createAisOverlay(new AisTargets(store), store);
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    store.applyFrame({
      self: {},
      ais: { 'vessels.a': { 'navigation.position': { latitude: 1, longitude: 2 } } },
      connection: { phase: 'open', attempt: 0 },
      epoch: Date.now(),
    });
    const source = [...map.sources.values()][0];
    const spy = vi.spyOn(source, 'setData');
    overlay.sync(ctxFor(map));
    overlay.sync(ctxFor(map));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('applyTheme recolors the icon image', () => {
    const store = new SignalKStore();
    const overlay = createAisOverlay(new AisTargets(store), store);
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    overlay.applyTheme?.(ctxFor(map), mapThemePaint('night-red'));
    expect(map.updatedImages).toContain('binnacle-ais-icon');
  });
});
