import type { LatLon } from '$shared/geo';

// A route waypoint. Position is decimal degrees (the SI exception); name is optional.
export interface Waypoint {
  position: LatLon;
  name?: string;
}

// A planned route: an ordered list of waypoints with a stable client id and a name.
export interface Route {
  id: string;
  name: string;
  waypoints: Waypoint[];
}

// Which part of the working route is highlighted for the cross-highlight between the leg list and the
// chart. A leg lights its segment and both end dots; a waypoint lights itself and the legs it joins.
export type RouteHighlight = { kind: 'leg'; index: number } | { kind: 'waypoint'; index: number };
