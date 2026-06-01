import { describe, expect, it } from 'vitest';
import { PersistedValue } from './persisted.svelte';

function fakeStorage(map: Map<string, string>): Pick<Storage, 'getItem' | 'setItem'> {
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}

describe('PersistedValue', () => {
  it('uses the default when storage is empty', () => {
    const store = new Map<string, string>();
    const p = new PersistedValue('k', { a: 1 }, fakeStorage(store));
    expect(p.value).toEqual({ a: 1 });
  });

  it('restores a persisted value', () => {
    const store = new Map<string, string>([['k', JSON.stringify({ a: 9 })]]);
    const p = new PersistedValue('k', { a: 1 }, fakeStorage(store));
    expect(p.value).toEqual({ a: 9 });
  });

  it('set persists and updates', () => {
    const store = new Map<string, string>();
    const p = new PersistedValue('k', { a: 1 }, fakeStorage(store));
    p.set({ a: 2 });
    expect(p.value).toEqual({ a: 2 });
    expect(JSON.parse(store.get('k') as string)).toEqual({ a: 2 });
  });

  it('falls back to the default on malformed JSON', () => {
    const store = new Map<string, string>([['k', 'not json']]);
    const p = new PersistedValue('k', { a: 1 }, fakeStorage(store));
    expect(p.value).toEqual({ a: 1 });
  });
});
