import type { Route } from '$entities/route';
import type { SignalKChart } from '$shared/map';

// Imperative map actions the chart exposes to the app shell (e.g. for menu items),
// handed up once the map is ready.
export interface MapCommands {
  centerOnVessel: () => void;
  // Pan to a position at the current zoom, with no animation, for the follow lock that keeps
  // the boat centered as it moves. Unlike centerOnVessel it never changes the zoom.
  recenterOnVessel: (latitude: number, longitude: number) => void;
  // Clear any selected note (drop the selection ring); used when the detail panel closes.
  clearNoteSelection: () => void;
  // Fly the map to a position (for example a route's start) at a usable zoom, animated.
  flyTo: (latitude: number, longitude: number) => void;
  // Fit the map to a [west, south, east, north] bounding box, animated; used after importing a
  // chart so the imported area comes into view.
  fitBounds: (bounds: [number, number, number, number]) => void;
  // Start on-chart route editing (Terra Draw): with a route, edit it; without one, draw a fresh
  // route. stopRouteEdit tears the editor down.
  startRouteEdit: (route?: Route) => void;
  stopRouteEdit: () => void;
}

// Register or remove a user-imported chart overlay once the map is ready. The app drives this
// from the user-charts entity, resolving each chart's tile url before calling register.
export interface UserChartRegistrar {
  register: (chart: SignalKChart) => Promise<void>;
  unregister: (identifier: string) => void;
}
