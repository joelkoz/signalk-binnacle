// The resources.setFilter match engine. A filter controls only what the host displays for a
// resource type; it never modifies stored resources. See plotter-extensions-api.md, "Resource
// queries and display filters". The symbol-reference tolerance keeps these comparisons consistent
// with the Symbols API: a bare local id matches a qualified `namespace:id` with the same id.

export type MatchOp =
  | 'eq'
  | 'ne'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'in'
  | 'contains'
  | 'regex'
  | 'exists';

export interface MatchCondition {
  path: string;
  op: MatchOp;
  value?: unknown;
  // Force strict comparison for eq/ne/in, disabling the symbol-reference tolerance.
  exact?: boolean;
}

export interface ResourceFilter {
  mode: 'include' | 'exclude';
  ids?: string[];
  match?: MatchCondition[];
  label?: string;
}

// Read a dotted path (e.g. "properties.skIcon") out of a resource record. A segment that hits a
// non-object yields the missing signal so conditions on absent fields evaluate per the spec.
const MISSING = Symbol('missing');
function readPath(record: unknown, path: string): unknown | typeof MISSING {
  let current: unknown = record;
  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object') return MISSING;
    const obj = current as Record<string, unknown>;
    if (!(segment in obj)) return MISSING;
    current = obj[segment];
  }
  return current;
}

interface Ref {
  multi: boolean;
  raw: string;
  ns: string | null;
  id: string;
}

function parseRef(value: string): Ref {
  const first = value.indexOf(':');
  if (first === -1) return { multi: false, raw: value, ns: null, id: value };
  // A second colon means this is not a single namespace:id reference (for example a URN); such
  // values keep strict equality and never participate in the tolerance.
  if (value.indexOf(':', first + 1) !== -1) return { multi: true, raw: value, ns: null, id: value };
  return { multi: false, raw: value, ns: value.slice(0, first), id: value.slice(first + 1) };
}

// Equality between two values with symbol-reference tolerance applied only to single-colon
// references: a bare id matches a qualified ref with the same id, two qualified refs match only
// when both namespace and id agree, and anything else (numbers, multi-colon strings, mixed types)
// falls back to strict equality.
function refEquals(a: unknown, b: unknown, exact: boolean | undefined): boolean {
  if (exact || typeof a !== 'string' || typeof b !== 'string') return a === b;
  const ra = parseRef(a);
  const rb = parseRef(b);
  if (ra.multi || rb.multi) return ra.raw === rb.raw;
  if (ra.ns !== null && rb.ns !== null) return ra.ns === rb.ns && ra.id === rb.id;
  return ra.id === rb.id;
}

const cmp = {
  lt: (a: number, b: number) => a < b,
  lte: (a: number, b: number) => a <= b,
  gt: (a: number, b: number) => a > b,
  gte: (a: number, b: number) => a >= b,
} as const;

function compareNumbers(a: unknown, b: unknown, op: 'lt' | 'lte' | 'gt' | 'gte'): boolean {
  if (typeof a !== 'number' || typeof b !== 'number') return false;
  return cmp[op](a, b);
}

// Compiled-regex cache keyed on the (stable) condition object, so a filter pattern compiles once
// rather than once per record. A null entry marks a pattern that is invalid or implausibly long: the
// length cap bounds the compile cost and reduces the catastrophic-backtracking surface a hostile or
// careless extension could supply. A null entry matches nothing.
const MAX_REGEX_LENGTH = 200;
const regexCache = new WeakMap<MatchCondition, RegExp | null>();

function regexFor(condition: MatchCondition): RegExp | null {
  const cached = regexCache.get(condition);
  if (cached !== undefined) return cached;
  const { value } = condition;
  let compiled: RegExp | null = null;
  if (typeof value === 'string' && value.length <= MAX_REGEX_LENGTH) {
    try {
      compiled = new RegExp(value);
    } catch {
      compiled = null;
    }
  }
  regexCache.set(condition, compiled);
  return compiled;
}

function evalCondition(record: unknown, condition: MatchCondition): boolean {
  const field = readPath(record, condition.path);
  if (condition.op === 'exists') return field !== MISSING;
  // Conditions on missing fields are false except `exists`.
  if (field === MISSING) return false;
  const { op, value, exact } = condition;
  switch (op) {
    case 'eq':
      return refEquals(field, value, exact);
    case 'ne':
      return !refEquals(field, value, exact);
    case 'in':
      return Array.isArray(value) && value.some((v) => refEquals(field, v, exact));
    case 'lt':
    case 'lte':
    case 'gt':
    case 'gte':
      return compareNumbers(field, value, op);
    case 'contains':
      if (typeof field === 'string' && typeof value === 'string') {
        return field.toLowerCase().includes(value.toLowerCase());
      }
      return Array.isArray(field) && field.includes(value);
    case 'regex': {
      if (typeof field !== 'string') return false;
      return regexFor(condition)?.test(field) ?? false;
    }
    default:
      return false;
  }
}

// Whether a resource is selected by a filter (its `ids` and `match`, AND-combined when both are
// present), before the include/exclude mode is applied. A filter with neither is inert (selects
// nothing).
export function resourceSelected(id: string, record: unknown, filter: ResourceFilter): boolean {
  const hasIds = Array.isArray(filter.ids) && filter.ids.length > 0;
  const hasMatch = Array.isArray(filter.match) && filter.match.length > 0;
  if (!hasIds && !hasMatch) return false;
  if (hasIds && !(filter.ids as string[]).includes(id)) return false;
  if (hasMatch && !(filter.match as MatchCondition[]).every((c) => evalCondition(record, c))) {
    return false;
  }
  return true;
}

// Whether a single filter would display a resource: include shows the selected, exclude hides them.
export function filterDisplays(id: string, record: unknown, filter: ResourceFilter): boolean {
  const selected = resourceSelected(id, record, filter);
  return filter.mode === 'exclude' ? !selected : selected;
}

// Whether a resource survives a set of composed filters. Filters from multiple extensions compose
// by intersection: a resource displays only when every active filter would display it.
export function passesFilters(
  id: string,
  record: unknown,
  filters: readonly ResourceFilter[],
): boolean {
  return filters.every((filter) => filterDisplays(id, record, filter));
}
