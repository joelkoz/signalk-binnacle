import { describe, expect, it, vi } from 'vitest';
import { createFakeMap } from '$shared/testing/fake-map';
import { beforeIdFor, installSentinels, sentinelId } from './sentinels';
import { Z_ORDER } from './types';

describe('sentinels', () => {
  it('installs one sentinel per z-band', () => {
    const map = createFakeMap();
    installSentinels(map as never);
    for (const band of Z_ORDER) {
      expect(map.getLayer(sentinelId(band))).toBeTruthy();
    }
  });

  it('is idempotent', () => {
    const map = createFakeMap();
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
