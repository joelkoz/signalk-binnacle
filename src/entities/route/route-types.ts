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
