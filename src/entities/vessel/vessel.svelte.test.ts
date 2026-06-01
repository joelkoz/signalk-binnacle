import { describe, expect, it } from 'vitest';
import type { SKFrame } from '$shared/signalk';
import { SignalKStore } from '$shared/signalk';
import { OwnVessel } from './vessel.svelte';

function frame(self: Record<string, unknown>): SKFrame {
  return {
    self: self as SKFrame['self'],
    connection: { phase: 'open', attempt: 0, since: 0 },
    epoch: 1000,
  };
}

describe('OwnVessel', () => {
  it('exposes speed over ground in knots', () => {
    const store = new SignalKStore();
    const vessel = new OwnVessel(store);
    store.applyFrame(frame({ 'navigation.speedOverGround': 1 }));
    expect(vessel.sogKnots).toBeCloseTo(1.943844, 5);
  });

  it('exposes course over ground in degrees', () => {
    const store = new SignalKStore();
    const vessel = new OwnVessel(store);
    store.applyFrame(frame({ 'navigation.courseOverGroundTrue': Math.PI }));
    expect(vessel.cogDegrees).toBeCloseTo(180, 6);
  });

  it('returns the position object unchanged (already degrees)', () => {
    const store = new SignalKStore();
    const vessel = new OwnVessel(store);
    store.applyFrame(frame({ 'navigation.position': { latitude: 36.8, longitude: -121.7 } }));
    expect(vessel.position).toEqual({ latitude: 36.8, longitude: -121.7 });
  });

  it('returns undefined readouts before any data arrives', () => {
    const store = new SignalKStore();
    const vessel = new OwnVessel(store);
    expect(vessel.sogKnots).toBeUndefined();
    expect(vessel.position).toBeUndefined();
  });

  it('pre-creates its cells at construction so reactive reads track them', () => {
    // The store creates a cell lazily on first access. If that first access were a
    // reactive template read, the freshly created $state source would not be tracked
    // and later updates would not re-render (this caused the readouts to stay blank
    // with live data flowing). Constructing the vessel must create the cells up front.
    const store = new SignalKStore();
    const created: string[] = [];
    const realCell = store.cell.bind(store);
    store.cell = (path: string) => {
      created.push(path);
      return realCell(path);
    };
    new OwnVessel(store);
    expect(created).toEqual([
      'navigation.position',
      'navigation.speedOverGround',
      'navigation.courseOverGroundTrue',
      'navigation.headingTrue',
    ]);
  });
});
