import { describe, expect, it, vi } from 'vitest';
import { beforeIdFor, installSentinels, sentinelId } from './sentinels';
import { Z_ORDER } from './types';

function fakeMap() {
  const layers = new Set<string>();
  return {
    layers,
    getLayer: (id: string) => (layers.has(id) ? { id } : undefined),
    addLayer: (layer: { id: string }) => layers.add(layer.id),
  };
}

describe('sentinels', () => {
  it('installs one sentinel per z-band', () => {
    const map = fakeMap();
    installSentinels(map as never);
    for (const band of Z_ORDER) {
      expect(map.getLayer(sentinelId(band))).toBeTruthy();
    }
  });

  it('is idempotent', () => {
    const map = fakeMap();
    const spy = vi.spyOn(map, 'addLayer');
    installSentinels(map as never);
    installSentinels(map as never);
    expect(spy).toHaveBeenCalledTimes(Z_ORDER.length);
  });

  it('beforeIdFor returns the next band sentinel', () => {
    expect(beforeIdFor('traffic')).toBe(sentinelId('vessel'));
  });

  it('beforeIdFor returns undefined for the top band', () => {
    expect(beforeIdFor('overlay-top')).toBeUndefined();
  });
});
