import type { WeatherStore } from '$entities/weather';

// The grid-plus-time dirty check every weather overlay repeats: an overlay rebuilds its features
// only when the loaded grid object or the selected forecast time changes. changed() records the
// current grid and time and returns whether either moved since the last call; reset() clears the
// memory so the next sync redraws after a base-style swap (which recreates the emptied sources)
// even though the grid reference is unchanged. One instance per overlay.
export function gridTimeGate(store: WeatherStore): { changed(): boolean; reset(): void } {
  let lastGrid: unknown;
  let lastTime = Number.NaN;
  return {
    changed() {
      const grid = store.grid;
      const time = store.selectedTime;
      if (grid === lastGrid && time === lastTime) return false;
      lastGrid = grid;
      lastTime = time;
      return true;
    },
    reset() {
      lastGrid = undefined;
      lastTime = Number.NaN;
    },
  };
}
