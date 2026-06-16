import type { Route, RouteHighlight } from './route-types';

// The reactive home for routes. A version counter lets the overlay poll for changes the way the
// saved-tracks overlay does, without deep reactivity on the arrays.
export class RouteStore {
  routes = $state<Route[]>([]);
  shownIds = $state<Set<string>>(new Set());
  working = $state<Route | undefined>(undefined);
  activeId = $state<string | undefined>(undefined);
  version = $state(0);
  // The leg or waypoint of the working route the leg list and the chart cross-highlight.
  highlight = $state<RouteHighlight | undefined>(undefined);
  // A separate poll counter for the working route, bumped on every working-route edit and highlight
  // change. The saved-route overlay polls `version` and the working-route overlay polls this, so a
  // per-pointermove edit re-syncs only the working overlay, not the saved-route layers.
  editVersion = $state(0);

  setRoutes(routes: Route[]): void {
    this.routes = routes;
    this.version += 1;
  }

  isShown(id: string): boolean {
    return this.shownIds.has(id);
  }

  toggleShown(id: string, shown: boolean): void {
    const next = new Set(this.shownIds);
    if (shown) next.add(id);
    else next.delete(id);
    this.shownIds = next;
    this.version += 1;
  }

  setWorking(route: Route | undefined): void {
    // `version` is not bumped: the working route is not drawn by the saved-route overlay, and the
    // panel reads `working` as reactive $state directly. `editVersion` is bumped so the working-route
    // overlay re-syncs its dots and highlight on every edit, including each pointermove of a drag.
    const prevCount = this.working?.waypoints.length ?? 0;
    this.working = route;
    const nextCount = route?.waypoints.length ?? 0;
    // A waypoint insert or delete shifts indices, so a kept highlight would point at the wrong dot.
    // Clear it on any count change; a pure drag (same count) keeps it.
    if (nextCount !== prevCount) this.highlight = undefined;
    this.editVersion += 1;
  }

  setHighlight(next: RouteHighlight): void {
    // A plain set, not a toggle: a click MapLibre synthesizes at the end of a small drag must not
    // toggle a dot's highlight off. The leg-list toggle lives in the panel's handler instead.
    this.highlight = next;
    this.editVersion += 1;
  }

  clearHighlight(): void {
    if (!this.highlight) return;
    this.highlight = undefined;
    this.editVersion += 1;
  }

  setActive(id: string | undefined): void {
    this.activeId = id;
    this.version += 1;
  }
}
