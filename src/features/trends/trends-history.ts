import {
  fetchHistoryValuesAcrossProviders,
  type HistoryProviders,
  type HistoryValues,
} from '$shared/signalk';
import { TREND_METRICS, type TrendKey, type TrendSeries } from './trend-metrics';

export const TREND_WINDOW_SECONDS = 24 * 60 * 60;
export const TREND_RESOLUTION_SECONDS = 300;

export interface TrendHistory {
  series: ReadonlyMap<TrendKey, TrendSeries>;
  provider: string | undefined;
}

interface Deps {
  fetchValues: typeof fetchHistoryValuesAcrossProviders;
}

// One combined query hydrates every metric (the providers union timestamps across paths), mapped
// back to per-metric series. Undefined means the query failed outright; an empty series per
// metric just means the boat has no samples for it, which the panel states per chart.
export async function loadTrendHistory(
  origin: string,
  token: string | undefined,
  providers: HistoryProviders,
  deps: Deps = { fetchValues: fetchHistoryValuesAcrossProviders },
): Promise<TrendHistory | undefined> {
  const got = await deps.fetchValues(origin, token, providers, {
    paths: TREND_METRICS.map((metric) => `${metric.path}:${metric.aggregate}`),
    durationSeconds: TREND_WINDOW_SECONDS,
    resolutionSeconds: TREND_RESOLUTION_SECONDS,
  });
  if (!got) return undefined;
  return { series: toSeries(got.values), provider: got.provider };
}

function toSeries(values: HistoryValues): Map<TrendKey, TrendSeries> {
  const out = new Map<TrendKey, TrendSeries>();
  for (const metric of TREND_METRICS) {
    const column = values.columns.findIndex((c) => c.path === metric.path);
    if (column < 0) {
      out.set(metric.key, { times: [], values: [] });
      continue;
    }
    const times: number[] = [];
    const series: Array<number | null> = [];
    for (const row of values.rows) {
      const ms = Date.parse(row[0]);
      if (!Number.isFinite(ms)) continue;
      const cell = row[column + 1];
      times.push(ms / 1000);
      series.push(typeof cell === 'number' && Number.isFinite(cell) ? cell : null);
    }
    out.set(metric.key, { times, values: series });
  }
  return out;
}
