// The object-shape guard every parser of stored or wire JSON needs before reading properties: it
// narrows unknown to a keyed record and excludes null and arrays, so the call sites stop re-spelling
// the `typeof x === 'object'` test and the follow-on cast. Arrays are excluded because the records
// guarded here (a notification, a stored profile, a saved view, chart metadata) are never arrays, so a
// stray array should fail the guard rather than slip through as an object.
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
