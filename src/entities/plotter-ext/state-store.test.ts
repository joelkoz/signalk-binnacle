import { describe, expect, it } from 'vitest';
import { PersistedValue } from '$shared/settings';
import { PlotterExtState } from './state-store';

function fakeStorage(map = new Map<string, string>()): Pick<Storage, 'getItem' | 'setItem'> {
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}

function store(storage = fakeStorage()) {
  return new PlotterExtState(new PersistedValue('k', {}, storage));
}

describe('PlotterExtState', () => {
  it('reads and writes instance and extension scopes independently', () => {
    const s = store();
    expect(s.set('ext', 'instance', 'i1', { color: 'red' })).toEqual(['color']);
    s.set('ext', 'extension', null, { shared: true });
    s.set('ext', 'instance', 'i2', { color: 'blue' });
    expect(s.get('ext', 'instance', 'i1')).toEqual({ color: 'red' });
    expect(s.get('ext', 'instance', 'i2')).toEqual({ color: 'blue' });
    expect(s.get('ext', 'extension', null)).toEqual({ shared: true });
  });

  it('merges on set and filters reads by keys', () => {
    const s = store();
    s.set('ext', 'instance', 'i1', { a: 1, b: 2 });
    s.set('ext', 'instance', 'i1', { b: 3 });
    expect(s.get('ext', 'instance', 'i1')).toEqual({ a: 1, b: 3 });
    expect(s.get('ext', 'instance', 'i1', ['b'])).toEqual({ b: 3 });
    expect(s.get('ext', 'instance', 'i1', ['missing'])).toEqual({});
  });

  it('rejects instance-scoped writes with no instance id', () => {
    expect(() => store().set('ext', 'instance', null, { a: 1 })).toThrow();
  });

  it('removes an instance bucket', () => {
    const s = store();
    s.set('ext', 'instance', 'i1', { a: 1 });
    s.removeInstance('ext', 'i1');
    expect(s.get('ext', 'instance', 'i1')).toEqual({});
  });

  it('persists across store instances sharing storage', () => {
    const storage = fakeStorage();
    store(storage).set('ext', 'instance', 'i1', { a: 1 });
    expect(store(storage).get('ext', 'instance', 'i1')).toEqual({ a: 1 });
  });

  it('rejects a write that would exceed the per-extension quota', () => {
    const s = store();
    const big = 'x'.repeat(300 * 1024);
    expect(() => s.set('ext', 'extension', null, { big })).toThrow(/quota/);
  });

  it('reads unknown scopes as empty', () => {
    expect(store().get('nope', 'instance', 'i1')).toEqual({});
  });
});
