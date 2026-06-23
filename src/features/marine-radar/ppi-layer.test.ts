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
});
