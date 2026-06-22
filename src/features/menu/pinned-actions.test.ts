import { describe, expect, it } from 'vitest';
import type { MenuItem } from './menu-item';
import { DEFAULT_PINNED, resolvePinned } from './pinned-actions';

const noop = () => {};
const item = (id: string): MenuItem => ({ id, label: id, onSelect: noop });
const registry: MenuItem[] = ['center', 'follow', 'layers', 'anchor', 'forecast'].map(item);

describe('resolvePinned', () => {
  it('returns matches in registry (canonical) order, not pin order', () => {
    expect(resolvePinned(registry, ['anchor', 'center']).map((i) => i.id)).toEqual([
      'center',
      'anchor',
    ]);
  });

  it('skips ids with no matching action', () => {
    expect(resolvePinned(registry, ['center', 'radar', 'layers']).map((i) => i.id)).toEqual([
      'center',
      'layers',
    ]);
  });

  it('treats a non-array input as empty (a corrupt or cross-version document)', () => {
    expect(resolvePinned(registry, undefined)).toEqual([]);
    expect(resolvePinned(registry, { junk: true } as unknown)).toEqual([]);
    expect(resolvePinned(registry, 'abc' as unknown)).toEqual([]);
  });

  it('returns the empty array for an empty pin list', () => {
    expect(resolvePinned(registry, [])).toEqual([]);
  });
});

describe('DEFAULT_PINNED', () => {
  it('is Center, Follow, and Charts (the layers action)', () => {
    expect([...DEFAULT_PINNED]).toEqual(['center', 'follow', 'layers']);
  });
});
