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

// Fetch a keyed-resource collection, trying each path in order (v2 then v1) and mapping every
// id/record entry through mapEntry (entries it returns undefined for are skipped). Returns the
// mapped list from the first reachable path, or undefined when every path is unreachable, so a
// caller can keep its current list rather than blank it on a transient failure. A reachable but
// empty server returns []. onError fires for a reachable path that answers with a non-OK status.
export async function fetchKeyedResource<T>(
  base: string,
  paths: readonly string[],
  token: string | undefined,
  mapEntry: (id: string, raw: unknown) => T | undefined,
  onError?: (url: string, status: number) => void,
): Promise<T[] | undefined> {
  for (const path of paths) {
    const out = await tryKeyedResource(`${base}${path}`, token, mapEntry, onError);
    if (out) return out;
  }
  return undefined;
}

async function tryKeyedResource<T>(
  url: string,
  token: string | undefined,
  mapEntry: (id: string, raw: unknown) => T | undefined,
  onError?: (url: string, status: number) => void,
): Promise<T[] | undefined> {
  try {
    const response = await fetch(url, authInit(token));
    if (!response.ok) {
      onError?.(url, response.status);
      return undefined;
    }
    const keyed = asKeyedObject(await response.json());
    if (!keyed) return undefined;
    const out: T[] = [];
    for (const [id, raw] of Object.entries(keyed)) {
      const mapped = mapEntry(id, raw);
      if (mapped !== undefined) out.push(mapped);
    }
    return out;
  } catch {
    return undefined;
  }
}

// PUT a JSON body to a resource URL, returning whether the write succeeded. Never throws: a network
// failure becomes false so the caller can surface a transient error rather than crash.
export async function putResource(
  url: string,
  token: string | undefined,
  body: unknown,
): Promise<boolean> {
  try {
    const response = await fetch(
      url,
      authInit(token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
    return response.ok;
  } catch {
    return false;
  }
}

// DELETE a resource URL, returning whether it succeeded. Never throws (see putResource).
export async function deleteResource(url: string, token: string | undefined): Promise<boolean> {
  try {
    const response = await fetch(url, authInit(token, { method: 'DELETE' }));
    return response.ok;
  } catch {
    return false;
  }
}
