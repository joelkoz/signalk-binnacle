import { describe, expect, it, vi } from 'vitest';
import { PlotterExtFilters } from './filters.svelte';
import type { ResourceFilter } from './match';

const anchorageOnly: ResourceFilter = {
  mode: 'include',
  match: [{ path: 'properties.skIcon', op: 'eq', value: 'anchorage' }],
  label: 'Anchorages only',
};

function note(skIcon: string) {
  return { properties: { skIcon } };
}

describe('PlotterExtFilters', () => {
  it('applies an active filter to passes() and reports it via forType and chips', () => {
    const f = new PlotterExtFilters();
    f.setFilter('ext', 'notes', anchorageOnly);
    expect(f.hasFilter('notes')).toBe(true);
    expect(f.forType('notes')).toHaveLength(1);
    expect(f.passes('notes', 'a', note('anchorage'))).toBe(true);
    expect(f.passes('notes', 'a', note('marina'))).toBe(false);
    expect(f.chips).toEqual([
      { key: 'ext|notes', extensionId: 'ext', type: 'notes', label: 'Anchorages only' },
    ]);
  });

  it('displays everything for a type with no filter', () => {
    const f = new PlotterExtFilters();
    expect(f.hasFilter('notes')).toBe(false);
    expect(f.passes('notes', 'a', note('marina'))).toBe(true);
  });

  it('notifies on set and clear, once per change', () => {
    const onChange = vi.fn();
    const f = new PlotterExtFilters(onChange);
    f.setFilter('ext', 'notes', anchorageOnly);
    f.clearFilter('ext', 'notes');
    f.clearFilter('ext', 'notes');
    expect(onChange.mock.calls).toEqual([
      ['ext', 'notes', true],
      ['ext', 'notes', false],
    ]);
  });

  it('composes filters from multiple extensions by intersection', () => {
    const f = new PlotterExtFilters();
    f.setFilter('a', 'notes', anchorageOnly);
    f.setFilter('b', 'notes', {
      mode: 'exclude',
      match: [{ path: 'properties.hidden', op: 'eq', value: true }],
    });
    expect(f.passes('notes', 'x', { properties: { skIcon: 'anchorage', hidden: false } })).toBe(
      true,
    );
    expect(f.passes('notes', 'x', { properties: { skIcon: 'anchorage', hidden: true } })).toBe(
      false,
    );
  });

  it('bumps version on every mutation, so an imperative overlay can poll for changes', () => {
    const f = new PlotterExtFilters();
    expect(f.version).toBe(0);
    f.setFilter('ext', 'notes', anchorageOnly);
    expect(f.version).toBe(1);
    // A no-op clear (nothing to remove) does not bump.
    f.clearFilter('ext', 'waypoints');
    expect(f.version).toBe(1);
    f.clearFilter('ext', 'notes');
    expect(f.version).toBe(2);
    f.setFilter('ext', 'notes', anchorageOnly);
    f.removeExtension('ext');
    expect(f.version).toBe(4);
  });

  it('removes every filter an extension owns and notifies per type', () => {
    const onChange = vi.fn();
    const f = new PlotterExtFilters(onChange);
    f.setFilter('ext', 'notes', anchorageOnly);
    f.setFilter('ext', 'waypoints', anchorageOnly);
    onChange.mockClear();
    f.removeExtension('ext');
    expect(f.chips).toEqual([]);
    expect(onChange.mock.calls.sort()).toEqual([
      ['ext', 'notes', false],
      ['ext', 'waypoints', false],
    ]);
  });
});
