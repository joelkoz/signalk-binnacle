// Helpers shared by the resource clients (charts, notes, tracks): the bearer-auth request init
// and the string guards for parsing untyped resource JSON. A token is sent only when present.

export function authInit(token: string | undefined, extra?: RequestInit): RequestInit | undefined {
  if (!token && !extra) return undefined;
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  return { ...extra, headers: { ...headers, ...extra?.headers } };
}

export function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function strArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((v): v is string => typeof v === 'string' && v.length > 0);
  return out.length > 0 ? out : undefined;
}
