import { featureToWaypoint, type Waypoint, waypointToFeature } from '$entities/waypoint';
import { deleteResource, fetchKeyedResource, putResource } from '$shared/signalk';

const V2 = '/signalk/v2/api/resources/waypoints';
const V1 = '/signalk/v1/api/resources/waypoints';

// Returns the waypoints, or undefined when both the v2 and v1 endpoints are unreachable (a
// transient failure), so a caller can keep the current list rather than blanking it. A reachable
// but empty server returns []. A reachable v2 wins; v1 is the fallback. The v1 fallback is
// deliberately read-only degradation: saveWaypoint and deleteWaypoint below are v2-only, so a
// v1-only server gets list-but-not-edit behavior rather than writes against a legacy API the
// rest of the app does not speak.
export function fetchWaypoints(base: string, token?: string): Promise<Waypoint[] | undefined> {
  return fetchKeyedResource(base, [V2, V1], token, featureToWaypoint);
}

// PUT the waypoint to its client-chosen id. Returns whether the write succeeded.
export function saveWaypoint(
  base: string,
  token: string | undefined,
  waypoint: Waypoint,
): Promise<boolean> {
  return putResource(
    `${base}${V2}/${encodeURIComponent(waypoint.id)}`,
    token,
    waypointToFeature(waypoint),
  );
}

export function deleteWaypoint(
  base: string,
  token: string | undefined,
  id: string,
): Promise<boolean> {
  return deleteResource(`${base}${V2}/${encodeURIComponent(id)}`, token);
}
