import { withTimeout } from '$shared/lib';

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

// Parse a Response body as JSON, falling back to a default when there is no JSON to parse (an empty
// 204, a non-JSON error page). Never throws. Shared by the resource clients so the
// parse-JSON-or-default idiom is spelled once rather than re-rolled as `.json().catch(...)` per client.
export async function jsonOr<T>(response: Response, fallback: T): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    return fallback;
  }
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
    const response = await fetch(url, withTimeout(authInit(token)));
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

// A single app-wide observer of write outcomes. Every write goes through sendJson, so this is the one
// chokepoint where a read-only token reveals itself: an authenticated session whose write returns
// 401/403 has read-only access. The auth controller registers a listener to flip its writeBlocked flag,
// and a later 2xx write clears it. Kept as a module callback (not a parameter) so the dozens of write
// call sites need no change.
type WriteOutcomeListener = (ok: boolean, status: number) => void;
let writeOutcomeListener: WriteOutcomeListener | undefined;
export function setWriteOutcomeListener(listener: WriteOutcomeListener | undefined): void {
  writeOutcomeListener = listener;
}

// Send a JSON body (or no body) to a URL and return the raw Response, or undefined on a network
// failure. Never throws. Shared by putResource and the notifications client so the
// fetch-plus-timeout-plus-auth-plus-try/catch shape lives in one place.
export async function sendJson(
  url: string,
  token: string | undefined,
  method: string,
  body?: unknown,
): Promise<Response | undefined> {
  try {
    const response = await fetch(
      url,
      withTimeout(
        authInit(token, {
          method,
          ...(body !== undefined
            ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
            : {}),
        }),
      ),
    );
    writeOutcomeListener?.(response.ok, response.status);
    return response;
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
  return (await sendJson(url, token, 'PUT', body))?.ok ?? false;
}

// DELETE a resource URL, returning whether it succeeded. Never throws (see putResource).
export async function deleteResource(url: string, token: string | undefined): Promise<boolean> {
  return (await sendJson(url, token, 'DELETE'))?.ok ?? false;
}
