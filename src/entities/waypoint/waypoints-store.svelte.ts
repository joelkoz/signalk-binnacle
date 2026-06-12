import type { Waypoint } from './waypoint-types';

// The reactive home for waypoints. A version counter lets the overlay poll for changes the way
// the route overlay does, without deep reactivity on the array. There is no per-waypoint shown
// set on purpose: the overlay renders every waypoint, and visibility is the layer toggle.
export class WaypointsStore {
  waypoints = $state<Waypoint[]>([]);
  version = $state(0);

  setWaypoints(waypoints: Waypoint[]): void {
    this.waypoints = waypoints;
    this.version += 1;
  }
}
