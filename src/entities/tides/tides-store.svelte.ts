import type { CurrentReading, TideReading, TidesSource, TidesStatus } from './tides-types';

// The tide and tidal-current state for the nearest stations, fed by the loader and read by the panel
// and the on-chart markers. Cross-feature data flows through this store, never feature to feature.
export class TidesStore {
  status = $state<TidesStatus>('idle');
  // The nearest tide station and its day of high and low events, or undefined when none is in range.
  tide = $state<TideReading | undefined>(undefined);
  // The nearest current station and its flood, ebb, and slack events, when one is close enough.
  current = $state<CurrentReading | undefined>(undefined);
  // Which source served the tide reading; undefined until a reading lands or after coverage is lost.
  source = $state<TidesSource | undefined>(undefined);

  setLoading(): void {
    this.status = 'loading';
  }

  setReadings(
    tide: TideReading | undefined,
    current: CurrentReading | undefined,
    source?: TidesSource,
  ): void {
    this.tide = tide;
    this.current = current;
    this.source = tide ? source : undefined;
    this.status = tide ? 'ready' : 'no-coverage';
  }

  setNoCoverage(): void {
    this.tide = undefined;
    this.current = undefined;
    this.source = undefined;
    this.status = 'no-coverage';
  }

  // A failed refresh keeps the last good readings on screen and only flags the status.
  setError(): void {
    this.status = 'error';
  }
}
