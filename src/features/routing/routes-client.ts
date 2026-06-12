import { featureToRoute, type Route, routeToFeature } from '$entities/route';
import { deleteResource, fetchKeyedResource, putResource } from '$shared/signalk';

const V2 = '/signalk/v2/api/resources/routes';
const V1 = '/signalk/v1/api/resources/routes';

// Returns the routes, or undefined when both the v2 and v1 endpoints are unreachable (a transient
// failure), so a caller can keep the current list rather than blanking it. A reachable but empty
// server returns []. A reachable v2 wins; v1 is the fallback. The v1 fallback is deliberately
// read-only degradation: saveRoute and deleteRoute below are v2-only, so a v1-only server gets
// list-but-not-edit behavior rather than writes against a legacy API the rest of the app does not
// speak.
export function fetchRoutes(base: string, token?: string): Promise<Route[] | undefined> {
  return fetchKeyedResource(base, [V2, V1], token, featureToRoute);
}

// PUT the route to its client-chosen id. Returns whether the write succeeded.
export function saveRoute(base: string, token: string | undefined, route: Route): Promise<boolean> {
  return putResource(`${base}${V2}/${encodeURIComponent(route.id)}`, token, routeToFeature(route));
}

export function deleteRoute(base: string, token: string | undefined, id: string): Promise<boolean> {
  return deleteResource(`${base}${V2}/${encodeURIComponent(id)}`, token);
}
