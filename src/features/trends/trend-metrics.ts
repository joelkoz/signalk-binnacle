import { SK_PATHS } from '$shared/signalk';

// The fixed metric set the Trends panel graphs. History queries ask per-bucket aggregates that
// match how a sailor reads each one: wind by its max (the gust is the decision number), the
// rest by average. Values stay SI here; the charts convert at the display edge.
export interface TrendMetric {
  key: 'depth' | 'wind' | 'pressure' | 'sog';
  path: string;
  aggregate: 'average' | 'max';
  label: string;
}

export const TREND_METRICS: readonly TrendMetric[] = [
  { key: 'depth', path: SK_PATHS.depthBelowTransducer, aggregate: 'average', label: 'Depth' },
  { key: 'wind', path: SK_PATHS.windSpeedApparent, aggregate: 'max', label: 'Wind (apparent)' },
  { key: 'pressure', path: SK_PATHS.outsidePressure, aggregate: 'average', label: 'Pressure' },
  { key: 'sog', path: SK_PATHS.speedOverGround, aggregate: 'average', label: 'Speed' },
];

// One aligned series: times in epoch seconds (the uPlot convention), values SI or null for a gap.
export interface TrendSeries {
  times: readonly number[];
  values: ReadonlyArray<number | null>;
}

export type TrendKey = TrendMetric['key'];
