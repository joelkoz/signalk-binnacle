import { describe, expect, it } from 'vitest';
import { MarineRadarStore } from './marine-radar-store.svelte';
import type { RadarInfo } from './radar-types';

const radar: RadarInfo = {
  id: 'a',
  name: 'A',
  status: 'standby',
  spokesPerRevolution: 2048,
  maxSpokeLen: 1024,
  range: 1852,
  controls: { gain: { value: 50 }, sea: { value: 20 } },
};

describe('MarineRadarStore', () => {
  it('selects the first radar on discovery and exposes it via selected', () => {
    const store = new MarineRadarStore();
    store.setDiscovered([radar]);
    expect(store.selectedId).toBe('a');
    expect(store.selected?.name).toBe('A');
  });

  it('seeds controlValues from the discovered radar controls map', () => {
    const store = new MarineRadarStore();
    store.setDiscovered([radar]);
    expect(store.controlValues.gain).toBe(50);
    expect(store.controlValues.sea).toBe(20);
  });

  it('records control values by id', () => {
    const store = new MarineRadarStore();
    store.setControlValue('gain', 42);
    expect(store.controlValues.gain).toBe(42);
  });

  it('clears selection and radars when discovery is empty', () => {
    const store = new MarineRadarStore();
    store.setDiscovered([radar]);
    store.setDiscovered([]);
    expect(store.selectedId).toBeUndefined();
    expect(store.selected).toBeUndefined();
  });

  it('seeds control values from the newly selected radar when selection changes', () => {
    const radarB: RadarInfo = {
      ...radar,
      id: 'b',
      name: 'B',
      controls: { gain: { value: 75 } },
    };
    const store = new MarineRadarStore();
    store.setDiscovered([radar, radarB]);
    store.setControlValue('gain', 99);
    store.select('b');
    expect(store.controlValues.gain).toBe(75);
    expect(store.controlValues.sea).toBeUndefined();
  });

  it('clears a stale read-only warning on a fresh discovery', () => {
    const store = new MarineRadarStore();
    store.setControlsForbidden(true);
    store.setDiscovered([radar]);
    expect(store.controlsForbidden).toBe(false);
  });
});
