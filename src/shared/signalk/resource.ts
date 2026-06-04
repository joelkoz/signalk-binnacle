// Helpers shared by the resource clients (charts, notes, tracks): the bearer-auth request init
// and the string guards for parsing untyped resource JSON. A token is sent only when present.

export function authInit(token: string | undefined, extra?: RequestInit): RequestInit | undefined {
  if (!token && !extra) return undefined;
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  return { ...extra, headers: { ...headers, ...extra?.headers } };
}

// The Signal K resources API returns a keyed object (id to record). An error envelope
// ({state, statusCode, message}) or an array arriving with a 200 is not that shape, so reject it:
// every resource client shares this guard so a malformed body never flows on as bogus records.
export function asKeyedObject(body: unknown): Record<string, unknown> | undefined {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;
  return body as Record<string, unknown>;
}

export function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function strArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((v): v is string => typeof v === 'string' && v.length > 0);
  return out.length > 0 ? out : undefined;
}
