import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { SignalKStore } from './store.svelte';
import type { SKFrame } from './types';

function frame(self: Record<string, unknown>): SKFrame {
  return {
    self: new Map(Object.entries(self)) as SKFrame['self'],
    connection: { phase: 'open', attempt: 0 },
    epoch: 1000,
  };
}

// Build the frame's nested AIS Map from a readable record literal.
function aisMap(record: Record<string, Record<string, unknown>>): SKFrame['ais'] {
  return new Map(Object.entries(record).map(([ctx, vals]) => [ctx, new Map(Object.entries(vals))]));
}

describe('SignalKStore', () => {
  it('exposes the latest value of a path through its cell', () => {
    const store = new SignalKStore();
    store.applyFrame(frame({ 'navigation.speedOverGround': 5.1 }));
    expect(store.cell('navigation.speedOverGround').value).toBe(5.1);
  });

  it('bumps aisVersion only when a context actually updates', () => {
    const store = new SignalKStore();
    const before = store.aisVersion;
    // An empty ais object (a self-only worker frame) must not bump the version,
    // or the consumers' version guards would fire every frame.
    store.applyFrame({
      self: new Map(),
      ais: aisMap({}),
      connection: { phase: 'open', attempt: 0 },
      epoch: 1000,
    });
    expect(store.aisVersion).toBe(before);
    store.applyFrame({
      self: new Map(),
      ais: aisMap({ 'vessels.a': { name: 'A' } }),
      connection: { phase: 'open', attempt: 0 },
      epoch: 1001,
    });
    expect(store.aisVersion).toBe(before + 1);
  });

  it('updates connection state reactively', () => {
    const store = new SignalKStore();
    store.applyFrame(frame({}));
    expect(store.connection.phase).toBe('open');
  });

  it('stamps each self cell with the frame epoch for staleness', () => {
    const store = new SignalKStore();
    expect(store.cell('navigation.position').epoch).toBe(0);
    store.applyFrame({
      self: new Map([['navigation.position', { latitude: 0, longitude: 0 }]]),
      connection: { phase: 'open', attempt: 0 },
      epoch: 1234,
    });
    expect(store.cell('navigation.position').epoch).toBe(1234);
  });

  it('reacts only for the changed cell, not unrelated cells', () => {
    const store = new SignalKStore();
    const cleanup = $effect.root(() => {
      let windRuns = 0;
      const wind = store.cell('environment.wind.speedApparent');
      $effect(() => {
        void wind.value;
        windRuns += 1;
      });
      flushSync();
      expect(windRuns).toBe(1);
      store.applyFrame(frame({ 'navigation.speedOverGround': 6 }));
      flushSync();
      expect(windRuns).toBe(1);
      store.applyFrame(frame({ 'environment.wind.speedApparent': 9 }));
      flushSync();
      expect(windRuns).toBe(2);
    });
    cleanup();
  });

  it('applies ais targets from the frame', () => {
    const store = new SignalKStore();
    store.applyFrame({
      self: new Map(),
      ais: aisMap({ 'vessels.a': { 'navigation.speedOverGround': 4 } }),
      connection: { phase: 'open', attempt: 0 },
      epoch: 5,
    });
    expect(store.aisTargets.get('vessels.a')?.values.get('navigation.speedOverGround')).toBe(4);
    expect(store.aisTargets.get('vessels.a')?.lastUpdate).toBe(5);
  });

  it('merges later ais updates and refreshes lastUpdate', () => {
    const store = new SignalKStore();
    const aisFrame = (epoch: number, value: number): SKFrame => ({
      self: new Map(),
      ais: aisMap({ 'vessels.a': { 'navigation.speedOverGround': value } }),
      connection: { phase: 'open', attempt: 0 },
      epoch,
    });
    store.applyFrame(aisFrame(1, 4));
    store.applyFrame(aisFrame(2, 6));
    expect(store.aisTargets.get('vessels.a')?.values.get('navigation.speedOverGround')).toBe(6);
    expect(store.aisTargets.get('vessels.a')?.lastUpdate).toBe(2);
  });

  it('prunes targets older than the ttl', () => {
    const store = new SignalKStore();
    store.applyFrame({
      self: new Map(),
      ais: aisMap({ 'vessels.a': { name: 'A' }, 'vessels.b': { name: 'B' } }),
      connection: { phase: 'open', attempt: 0 },
      epoch: 1000,
    });
    store.applyFrame({
      self: new Map(),
      ais: aisMap({ 'vessels.b': { name: 'B' } }),
      connection: { phase: 'open', attempt: 0 },
      epoch: 400000,
    });
    const removed = store.pruneAis(400000, 360000);
    expect(removed).toBe(1);
    expect(store.aisTargets.has('vessels.a')).toBe(false);
    expect(store.aisTargets.has('vessels.b')).toBe(true);
  });
});
