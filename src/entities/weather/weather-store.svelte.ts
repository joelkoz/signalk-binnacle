import type { Bbox, TimeBracket, WeatherGrid } from './weather-grid';
import { timeBracket } from './weather-grid';

export type WeatherStatus = 'idle' | 'loading' | 'ready' | 'error' | 'stale';

export class WeatherStore {
  grid = $state<WeatherGrid | undefined>(undefined);
  status = $state<WeatherStatus>('idle');
  bbox = $state<Bbox | undefined>(undefined);
  selectedTime = $state<number>(0);

  // The two forecast indices and blend fraction for the selected time. Overlays read this to render
  // the right step; it recomputes only when the grid or the selected time changes.
  bracket = $derived<TimeBracket>(
    this.grid ? timeBracket(this.grid, this.selectedTime) : { lo: 0, hi: 0, frac: 0 },
  );

  setStatus(status: WeatherStatus): void {
    this.status = status;
  }

  setGrid(grid: WeatherGrid): void {
    this.grid = grid;
    this.status = 'ready';
    const first = grid.times[0];
    const last = grid.times[grid.times.length - 1];
    if (first !== undefined && (this.selectedTime < first || this.selectedTime > last)) {
      this.selectedTime = first;
    }
  }

  setSelectedTime(time: number): void {
    this.selectedTime = time;
  }
}
