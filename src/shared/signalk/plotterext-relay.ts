import { withTimeout } from '$shared/lib';
import { authInit } from './resource';

// Server relays for the plotter-extension host API: a generic Signal K PUT (signalk.put) and a
// resource collection query (resources.list). Both go through the user's authenticated session, so
// an extension stays inside the host's auth and session semantics.

// PUT a value to a self path. The v1 API addresses paths with slashes, so dots become slashes.
// Returns the server's PUT response body (or an empty object when there is no JSON body).
export async function putSignalKPath(
  origin: string,
  token: string | undefined,
  path: string,
  value: unknown,
): Promise<unknown> {
  const encodedPath = path.split('.').map(encodeURIComponent).join('/');
  const url = `${origin}/signalk/v1/api/vessels/self/${encodedPath}`;
  const response = await fetch(
    url,
    withTimeout(
      authInit(token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      }),
    ),
  );
  // Surface a rejected PUT (auth, validation, or server error) rather than returning an empty body
  // that the extension cannot distinguish from success. An OK response may legitimately carry no
  // JSON body (204), so the empty-body tolerance applies only on the success path.
  if (!response.ok) {
    throw new Error(`signalk.put ${path} failed: ${response.status}`);
  }
  return response.json().catch(() => ({}));
}

// GET a resource collection, serializing the query object to the resources query string (array
// values are JSON-encoded, matching the position/distance form the resources API expects).
export async function listResources(
  origin: string,
  token: string | undefined,
  type: string,
  query?: Record<string, unknown>,
): Promise<unknown> {
  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(query ?? {})) {
    if (raw === undefined || raw === null) continue;
    params.set(key, typeof raw === 'string' ? raw : JSON.stringify(raw));
  }
  const qs = params.toString();
  const url = `${origin}/signalk/v2/api/resources/${encodeURIComponent(type)}${qs ? `?${qs}` : ''}`;
  const response = await fetch(url, withTimeout(authInit(token)));
  if (!response.ok) throw new Error(`resources.list ${type} failed: ${response.status}`);
  return response.json();
}
