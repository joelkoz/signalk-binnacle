import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { SignalKStore } from './store.svelte';
import type { SKFrame } from './types';

function frame(self: Record<string, unknown>): SKFrame {
  return {
    self: self as SKFrame['self'],
    connection: { phase: 'open', attempt: 0 },
    epoch: 1000,
  };
}

describe('SignalKStore', () => {
  it('exposes the latest value of a path through its cell', () => {
    const store = new SignalKStore();
    store.applyFrame(frame({ 'navigation.speedOverGround': 5.1 }));
    expect(store.cell('navigation.speedOverGround').value).toBe(5.1);
  });

  it('records receivedAt from the frame epoch', () => {
    const store = new SignalKStore();
    store.applyFrame(frame({ 'navigation.headingTrue': 1.2 }));
    expect(store.cell('navigation.headingTrue').receivedAt).toBe(1000);
  });

  it('updates connection state reactively', () => {
    const store = new SignalKStore();
    store.applyFrame(frame({}));
    expect(store.connection.phase).toBe('open');
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
      self: {},
      ais: { 'vessels.a': { 'navigation.speedOverGround': 4 } },
      connection: { phase: 'open', attempt: 0 },
      epoch: 5,
    });
    expect(store.aisTargets.get('vessels.a')?.values.get('navigation.speedOverGround')).toBe(4);
    expect(store.aisTargets.get('vessels.a')?.lastUpdate).toBe(5);
  });

  it('merges later ais updates and refreshes lastUpdate', () => {
    const store = new SignalKStore();
    const aisFrame = (epoch: number, value: number): SKFrame => ({
      self: {},
      ais: { 'vessels.a': { 'navigation.speedOverGround': value } },
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
      self: {},
      ais: { 'vessels.a': { name: 'A' }, 'vessels.b': { name: 'B' } },
      connection: { phase: 'open', attempt: 0 },
      epoch: 1000,
    });
    store.applyFrame({
      self: {},
      ais: { 'vessels.b': { name: 'B' } },
      connection: { phase: 'open', attempt: 0 },
      epoch: 400000,
    });
    const removed = store.pruneAis(400000, 360000);
    expect(removed).toBe(1);
    expect(store.aisTargets.has('vessels.a')).toBe(false);
    expect(store.aisTargets.has('vessels.b')).toBe(true);
  });
});
