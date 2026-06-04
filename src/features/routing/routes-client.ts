import { featureToRoute, type Route, routeToFeature } from '$entities/route';
import { asKeyedObject, authInit } from '$shared/signalk';

const V2 = '/signalk/v2/api/resources/routes';
const V1 = '/signalk/v1/api/resources/routes';

async function tryFetch(url: string, token?: string): Promise<Route[] | undefined> {
  try {
    const response = await fetch(url, authInit(token));
    if (!response.ok) return undefined;
    const keyed = asKeyedObject(await response.json());
    if (!keyed) return undefined;
    const out: Route[] = [];
    for (const [id, raw] of Object.entries(keyed)) {
      const route = featureToRoute(id, raw);
      if (route) out.push(route);
    }
    return out;
  } catch {
    return undefined;
  }
}

export async function fetchRoutes(base: string, token?: string): Promise<Route[]> {
  const v2 = await tryFetch(`${base}${V2}`, token);
  if (v2) return v2;
  return (await tryFetch(`${base}${V1}`, token)) ?? [];
}

// PUT the route to its client-chosen id. Returns whether the write succeeded.
export async function saveRoute(
  base: string,
  token: string | undefined,
  route: Route,
): Promise<boolean> {
  try {
    const response = await fetch(
      `${base}${V2}/${encodeURIComponent(route.id)}`,
      authInit(token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(routeToFeature(route)),
      }),
    );
    return response.ok;
  } catch {
    return false;
  }
}

export async function deleteRoute(
  base: string,
  token: string | undefined,
  id: string,
): Promise<boolean> {
  try {
    const response = await fetch(
      `${base}${V2}/${encodeURIComponent(id)}`,
      authInit(token, { method: 'DELETE' }),
    );
    return response.ok;
  } catch {
    return false;
  }
}
