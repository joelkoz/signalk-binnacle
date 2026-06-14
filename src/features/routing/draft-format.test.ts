import { describe, expect, it } from 'vitest';
import { formatDraftFuel, groupDraftFlags, orderDraftFlags } from './draft-format';
import type { DraftFlag } from './route-draft-client';

describe('orderDraftFlags', () => {
  it('orders land, then shallow, then hazard, then fuel, then other', () => {
    const flags: DraftFlag[] = [
      { kind: 'other', message: 'o' },
      { kind: 'fuel', message: 'f' },
      { kind: 'hazard', message: 'h' },
      { kind: 'land', message: 'l' },
      { kind: 'shallow', message: 's' },
    ];
    expect(orderDraftFlags(flags).map((f) => f.kind)).toEqual([
      'land',
      'shallow',
      'hazard',
      'fuel',
      'other',
    ]);
  });

  it('keeps same-kind flags in their original order (stable)', () => {
    const flags: DraftFlag[] = [
      { kind: 'land', message: 'first' },
      { kind: 'land', message: 'second' },
    ];
    expect(orderDraftFlags(flags).map((f) => f.message)).toEqual(['first', 'second']);
  });

  it('does not mutate the input array', () => {
    const flags: DraftFlag[] = [
      { kind: 'fuel', message: 'f' },
      { kind: 'land', message: 'l' },
    ];
    orderDraftFlags(flags);
    expect(flags.map((f) => f.kind)).toEqual(['fuel', 'land']);
  });
});

describe('groupDraftFlags', () => {
  it('collapses several hazards on one leg into a summary with deduped counts', () => {
    const flags: DraftFlag[] = [
      { kind: 'hazard', leg: 1, message: 'Charted rock within the leg corridor' },
      { kind: 'hazard', leg: 1, message: 'Charted rock within the leg corridor' },
      { kind: 'hazard', leg: 1, message: 'Charted snag/stump within the leg corridor' },
    ];
    const [group] = groupDraftFlags(flags);
    expect(group.kind).toBe('hazard');
    expect(group.message).toBe('3 charted hazards near leg 2, verify on the chart');
    expect(group.detail).toEqual(['Rock ×2', 'Snag/stump']);
  });

  it('leaves a lone hazard on a leg as a single line with no detail', () => {
    const flags: DraftFlag[] = [
      { kind: 'hazard', leg: 0, message: 'Charted dangerous wreck within the leg corridor' },
    ];
    const [item] = groupDraftFlags(flags);
    expect(item.message).toBe('Charted dangerous wreck within the leg corridor');
    expect(item.detail).toBeUndefined();
  });

  it('keeps non-hazard flags in kind order around the hazard groups', () => {
    const flags: DraftFlag[] = [
      { kind: 'other', message: 'o' },
      { kind: 'hazard', leg: 0, message: 'Charted rock within the leg corridor' },
      { kind: 'hazard', leg: 0, message: 'Charted rock within the leg corridor' },
      { kind: 'land', message: 'l' },
    ];
    expect(groupDraftFlags(flags).map((f) => f.kind)).toEqual(['land', 'hazard', 'other']);
  });

  it('emits one summary per leg', () => {
    const flags: DraftFlag[] = [
      { kind: 'hazard', leg: 0, message: 'Charted rock within the leg corridor' },
      { kind: 'hazard', leg: 0, message: 'Charted rock within the leg corridor' },
      { kind: 'hazard', leg: 1, message: 'Charted snag/stump within the leg corridor' },
      { kind: 'hazard', leg: 1, message: 'Charted snag/stump within the leg corridor' },
    ];
    const groups = groupDraftFlags(flags);
    expect(groups).toHaveLength(2);
    expect(groups[0].message).toContain('near leg 1');
    expect(groups[1].message).toContain('near leg 2');
  });
});

describe('formatDraftFuel', () => {
  it('renders liters in metric mode', () => {
    expect(formatDraftFuel({ neededL: 45 }, 'metric')).toBe('Fuel: needs ~45 L.');
  });

  it('converts to US gallons in imperial mode', () => {
    expect(formatDraftFuel({ neededL: 37.854_117_84 }, 'imperial')).toBe('Fuel: needs ~10 gal.');
  });

  it('includes aboard and margin when present', () => {
    expect(formatDraftFuel({ neededL: 45, aboardL: 150, marginPct: 70 }, 'metric')).toBe(
      'Fuel: needs ~45 L, ~150 L aboard, 70% margin.',
    );
  });

  it('appends a derate note when present', () => {
    expect(
      formatDraftFuel({ neededL: 45, derateNote: '15% headwind derate applied.' }, 'metric'),
    ).toBe('Fuel: needs ~45 L. 15% headwind derate applied.');
  });
});
