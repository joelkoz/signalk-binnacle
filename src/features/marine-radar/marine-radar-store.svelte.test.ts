import { describe, expect, it } from 'vitest';
import { MarineRadarStore } from './marine-radar-store.svelte';
import type { RadarInfo } from './radar-types';

const radar: RadarInfo = {
  id: 'a',
  name: 'A',
  spokes: 2048,
  maxSpokeLen: 1024,
  legend: { pixels: [] },
};

describe('MarineRadarStore', () => {
  it('selects the first radar on discovery and exposes it via selected', () => {
    const store = new MarineRadarStore();
    store.setDiscovered('mayara', [radar]);
    expect(store.provider).toBe('mayara');
    expect(store.selectedId).toBe('a');
    expect(store.selected?.name).toBe('A');
  });

  it('records control values by id', () => {
    const store = new MarineRadarStore();
    store.setControlValue('gain', 42);
    expect(store.controlValues.gain).toBe(42);
  });

  it('clears selection and radars when discovery is empty', () => {
    const store = new MarineRadarStore();
    store.setDiscovered('mayara', [radar]);
    store.setDiscovered('mayara', []);
    expect(store.selectedId).toBeUndefined();
    expect(store.selected).toBeUndefined();
  });
});
