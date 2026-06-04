import type { Route } from './route-types';

// The reactive home for routes: the loaded list, which are shown on the chart, the working route
// under edit, and which route is active. A version counter lets the overlay poll for changes the
// way the saved-tracks overlay does, without deep reactivity on the arrays.
export class RouteStore {
  routes = $state<Route[]>([]);
  shownIds = $state<Set<string>>(new Set());
  working = $state<Route | undefined>(undefined);
  activeId = $state<string | undefined>(undefined);
  version = $state(0);

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
    // No version bump: the working route is drawn by the Terra Draw editor, not the route overlay,
    // and the panel reads `working` as reactive $state directly, so the overlay's poll counter does
    // not need to change on every edit.
    this.working = route;
  }

  setActive(id: string | undefined): void {
    this.activeId = id;
    this.version += 1;
  }
}
