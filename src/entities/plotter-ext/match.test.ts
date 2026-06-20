import { describe, expect, it } from 'vitest';
import { filterDisplays, passesFilters, type ResourceFilter, resourceSelected } from './match';

function note(skIcon: unknown, extra: Record<string, unknown> = {}) {
  return { properties: { skIcon, ...extra } };
}

function matchFilter(condition: ResourceFilter['match']): ResourceFilter {
  return { mode: 'include', match: condition };
}

describe('match engine symbol-reference tolerance', () => {
  it('matches a bare id against a stored qualified reference and vice versa', () => {
    const f = matchFilter([{ path: 'properties.skIcon', op: 'eq', value: 'anchorage' }]);
    expect(resourceSelected('a', note('default:anchorage'), f)).toBe(true);
    expect(resourceSelected('a', note('custom:anchorage'), f)).toBe(true);
    const g = matchFilter([{ path: 'properties.skIcon', op: 'eq', value: 'custom:anchorage' }]);
    expect(resourceSelected('a', note('anchorage'), g)).toBe(true);
  });

  it('does not match qualified references with differing namespaces', () => {
    const f = matchFilter([{ path: 'properties.skIcon', op: 'eq', value: 'custom:x' }]);
    expect(resourceSelected('a', note('fsk:x'), f)).toBe(false);
  });

  it('keeps strict equality for multi-colon values such as URNs', () => {
    const urn = 'urn:mrn:signalk:uuid:1';
    const f = matchFilter([{ path: 'properties.skIcon', op: 'eq', value: 'mrn:signalk' }]);
    expect(resourceSelected('a', note(urn), f)).toBe(false);
    const g = matchFilter([{ path: 'properties.skIcon', op: 'eq', value: urn }]);
    expect(resourceSelected('a', note(urn), g)).toBe(true);
  });

  it('disables tolerance when exact is set', () => {
    const f = matchFilter([
      { path: 'properties.skIcon', op: 'eq', value: 'anchorage', exact: true },
    ]);
    expect(resourceSelected('a', note('default:anchorage'), f)).toBe(false);
    expect(resourceSelected('a', note('anchorage'), f)).toBe(true);
  });

  it('applies tolerance to ne and in', () => {
    const ne = matchFilter([{ path: 'properties.skIcon', op: 'ne', value: 'anchorage' }]);
    expect(resourceSelected('a', note('default:anchorage'), ne)).toBe(false);
    const inF = matchFilter([
      { path: 'properties.skIcon', op: 'in', value: ['marina', 'anchorage'] },
    ]);
    expect(resourceSelected('a', note('default:anchorage'), inF)).toBe(true);
    expect(resourceSelected('a', note('fsk:hazard'), inF)).toBe(false);
  });
});

describe('match engine operators', () => {
  it('compares numbers and rejects type mismatches', () => {
    const f = matchFilter([{ path: 'properties.depth', op: 'lt', value: 10 }]);
    expect(resourceSelected('a', note('x', { depth: 5 }), f)).toBe(true);
    expect(resourceSelected('a', note('x', { depth: 20 }), f)).toBe(false);
    expect(resourceSelected('a', note('x', { depth: 'deep' }), f)).toBe(false);
  });

  it('contains matches substrings case-insensitively and array membership', () => {
    const s = matchFilter([{ path: 'properties.name', op: 'contains', value: 'cove' }]);
    expect(resourceSelected('a', note('x', { name: 'Quiet Cove' }), s)).toBe(true);
    const arr = matchFilter([{ path: 'properties.tags', op: 'contains', value: 'diving' }]);
    expect(resourceSelected('a', note('x', { tags: ['diving', 'reef'] }), arr)).toBe(true);
  });

  it('regex tests the field and fails closed on an invalid pattern', () => {
    const ok = matchFilter([{ path: 'properties.name', op: 'regex', value: '^Q' }]);
    expect(resourceSelected('a', note('x', { name: 'Quiet' }), ok)).toBe(true);
    const bad = matchFilter([{ path: 'properties.name', op: 'regex', value: '[' }]);
    expect(resourceSelected('a', note('x', { name: 'Quiet' }), bad)).toBe(false);
  });

  it('exists is true only for present fields; other ops are false on missing fields', () => {
    const exists = matchFilter([{ path: 'properties.skIcon', op: 'exists' }]);
    expect(resourceSelected('a', note('anchorage'), exists)).toBe(true);
    expect(resourceSelected('a', { properties: {} }, exists)).toBe(false);
    const eq = matchFilter([{ path: 'properties.missing', op: 'eq', value: 'x' }]);
    expect(resourceSelected('a', note('anchorage'), eq)).toBe(false);
  });
});

describe('selection, mode, and composition', () => {
  it('AND-combines ids and match when both are present', () => {
    const f: ResourceFilter = {
      mode: 'include',
      ids: ['a'],
      match: [{ path: 'properties.skIcon', op: 'eq', value: 'anchorage' }],
    };
    expect(resourceSelected('a', note('anchorage'), f)).toBe(true);
    expect(resourceSelected('b', note('anchorage'), f)).toBe(false);
  });

  it('a filter with neither ids nor match selects nothing', () => {
    expect(resourceSelected('a', note('anchorage'), { mode: 'include' })).toBe(false);
  });

  it('applies include and exclude modes', () => {
    const cond = [{ path: 'properties.skIcon', op: 'eq' as const, value: 'anchorage' }];
    expect(filterDisplays('a', note('anchorage'), { mode: 'include', match: cond })).toBe(true);
    expect(filterDisplays('a', note('marina'), { mode: 'include', match: cond })).toBe(false);
    expect(filterDisplays('a', note('anchorage'), { mode: 'exclude', match: cond })).toBe(false);
    expect(filterDisplays('a', note('marina'), { mode: 'exclude', match: cond })).toBe(true);
  });

  it('composes multiple filters by intersection, and an empty set displays all', () => {
    const f1: ResourceFilter = {
      mode: 'include',
      match: [{ path: 'properties.depth', op: 'gt', value: 5 }],
    };
    const f2: ResourceFilter = {
      mode: 'exclude',
      match: [{ path: 'properties.skIcon', op: 'eq', value: 'hazard' }],
    };
    expect(passesFilters('a', note('anchorage', { depth: 10 }), [f1, f2])).toBe(true);
    expect(passesFilters('a', note('hazard', { depth: 10 }), [f1, f2])).toBe(false);
    expect(passesFilters('a', note('anchorage', { depth: 1 }), [f1, f2])).toBe(false);
    expect(passesFilters('a', note('hazard', { depth: 1 }), [])).toBe(true);
  });
});

describe('match engine numeric and regex operators', () => {
  it('lte and gte include the boundary value', () => {
    const lte = matchFilter([{ path: 'properties.depth', op: 'lte', value: 10 }]);
    expect(resourceSelected('a', note('x', { depth: 10 }), lte)).toBe(true);
    expect(resourceSelected('a', note('x', { depth: 11 }), lte)).toBe(false);
    const gte = matchFilter([{ path: 'properties.depth', op: 'gte', value: 5 }]);
    expect(resourceSelected('a', note('x', { depth: 5 }), gte)).toBe(true);
    expect(resourceSelected('a', note('x', { depth: 4 }), gte)).toBe(false);
  });

  it('matches a valid regex and fails closed on an invalid one', () => {
    const ok = matchFilter([{ path: 'properties.skIcon', op: 'regex', value: '^anch' }]);
    expect(resourceSelected('a', note('anchorage'), ok)).toBe(true);
    expect(resourceSelected('a', note('marina'), ok)).toBe(false);
    const bad = matchFilter([{ path: 'properties.skIcon', op: 'regex', value: '(' }]);
    expect(resourceSelected('a', note('anchorage'), bad)).toBe(false);
  });

  it('rejects an implausibly long regex pattern rather than compiling it', () => {
    const huge = matchFilter([{ path: 'properties.skIcon', op: 'regex', value: 'a'.repeat(201) }]);
    expect(resourceSelected('a', note('a'.repeat(201)), huge)).toBe(false);
  });
});
