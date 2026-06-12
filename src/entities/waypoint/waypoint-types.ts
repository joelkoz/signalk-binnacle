import type { LatLon } from '$shared/geo';

// A standalone waypoint resource. Position is decimal degrees (the SI exception); the id is a
// v4 UUID because the server validates standard resource ids against the Signal K UUID format.
export interface Waypoint {
  id: string;
  name: string;
  position: LatLon;
  description?: string;
}
