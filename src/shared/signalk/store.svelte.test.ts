import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { SignalKStore } from './store.svelte';
import type { SKFrame } from './types';

function frame(self: Record<string, unknown>): SKFrame {
  return {
    self: self as SKFrame['self'],
    connection: { phase: 'open', attempt: 0, since: 0 },
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
});
