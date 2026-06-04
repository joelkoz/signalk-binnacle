// A client-chosen id: a UUID in a secure context, a prefixed timestamp-plus-random fallback over
// plain http where crypto.randomUUID is unavailable. The prefix only appears in the fallback form.
export function clientId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}
