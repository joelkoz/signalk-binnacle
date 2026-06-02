import { describe, expect, it } from 'vitest';
import type { SKFrame } from '$shared/signalk';
import { SignalKStore } from '$shared/signalk';
import { AisTargets } from './ais-targets.svelte';

function frame(ais: Record<string, Record<string, unknown>>, epoch = 1): SKFrame {
  return {
    self: {},
    ais: new Map(Object.entries(ais).map(([ctx, vals]) => [ctx, new Map(Object.entries(vals))])),
    connection: { phase: 'open', attempt: 0 },
    epoch,
  };
}

describe('AisTargets', () => {
  it('lists targets with SI values straight from the store', () => {
    const store = new SignalKStore();
    const ais = new AisTargets(store);
    store.applyFrame(
      frame({
        'vessels.urn:mrn:imo:mmsi:123': {
          'navigation.position': { latitude: 36, longitude: -121 },
          'navigation.courseOverGroundTrue': Math.PI,
          'navigation.speedOverGround': 1,
          name: 'OTHER',
        },
      }),
    );
    const list = ais.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('vessels.urn:mrn:imo:mmsi:123');
    expect(list[0].name).toBe('OTHER');
    expect(list[0].position).toEqual({ latitude: 36, longitude: -121 });
    expect(list[0].cogRad).toBe(Math.PI);
    expect(list[0].sogMps).toBe(1);
  });

  it('skips targets without a position', () => {
    const store = new SignalKStore();
    const ais = new AisTargets(store);
    store.applyFrame(frame({ 'vessels.x': { name: 'no pos' } }));
    expect(ais.list()).toHaveLength(0);
  });

  it('exposes closestApproach as cpa and tcpa', () => {
    const store = new SignalKStore();
    const ais = new AisTargets(store);
    store.applyFrame(
      frame({
        'vessels.y': {
          'navigation.position': { latitude: 0, longitude: 0 },
          'navigation.closestApproach': { distance: 926, timeTo: 600 },
        },
      }),
    );
    const target = ais.list()[0];
    expect(target.cpaMeters).toBe(926);
    expect(target.tcpaSeconds).toBe(600);
  });
});
