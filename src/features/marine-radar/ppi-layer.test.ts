import { describe, expect, it } from 'vitest';
import { MarineRadarStore } from './marine-radar-store.svelte';
import { createPpiLayer, RADAR_ECHO_LAYER_ID, RADAR_RINGS_LAYER_ID } from './ppi-layer';

describe('createPpiLayer', () => {
  it('declares the marine-radar identity, the traffic band, and both managed layer ids', () => {
    const layer = createPpiLayer(new MarineRadarStore(), () => ({ latitude: 0, longitude: 0 }));
    expect(layer.id).toBe('marine-radar');
    expect(layer.title).toBe('Radar');
    expect(layer.band).toBe('traffic');
    expect(layer.supportsOpacity).toBe(true);
    expect(layer.defaultVisible).toBe(false);
    expect(layer.layerIds).toEqual([RADAR_ECHO_LAYER_ID, RADAR_RINGS_LAYER_ID]);
  });

  it('never uses the reserved weather radar id', () => {
    const layer = createPpiLayer(new MarineRadarStore(), () => undefined);
    expect(layer.id).not.toBe('weather-radar');
    expect(layer.layerIds).not.toContain('weather-radar');
  });

  it('is unavailable with a hint until a radar is discovered, and is manageable', () => {
    const store = new MarineRadarStore();
    const layer = createPpiLayer(store, () => ({ latitude: 0, longitude: 0 }));
    expect(layer.available?.()).toBe(false);
    expect(layer.unavailableHint).toBeTruthy();
    expect(layer.manageable).toBe(true);
    store.setDiscovered([
      {
        id: 'a',
        name: 'A',
        status: 'standby',
        spokesPerRevolution: 16,
        maxSpokeLen: 8,
        range: 100,
        controls: {},
      },
    ]);
    expect(layer.available?.()).toBe(true);
  });
});
