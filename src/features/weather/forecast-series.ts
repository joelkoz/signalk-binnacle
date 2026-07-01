import type { WeatherGrid } from '$entities/weather';
import {
  formatFixed,
  formatPressureOr,
  HOUR_MS,
  PA_PER_HPA,
  pressureUnit,
  type UnitsMode,
} from '$shared/lib';
import type { PointConditions } from './signalk-weather';
import {
  conditionsFromReadout,
  PRESSURE_TREND_WINDOW_MS,
  pressureTrendPa,
  readoutAt,
} from './weather-readout';

// The number of forecast rows the conditions panel shows.
const FORECAST_STEPS = 6;
// The spacing between free-grid forecast rows, so the panel shows a 6-hourly cadence rather than
// every grid step.
const FREE_STEP_MS = 6 * HOUR_MS;

// The 3-hour window used for the barometric tendency label, expressed in hours for the display string.
const PRESSURE_TREND_WINDOW_H = PRESSURE_TREND_WINDOW_MS / HOUR_MS;

// The free-grid forecast at a point: up to FORECAST_STEPS rows starting at the selected time, spaced
// at least FREE_STEP_MS apart. Empty when there is no grid.
function freeForecast(
  grid: WeatherGrid | undefined,
  lat: number,
  lon: number,
  selectedTime: number,
): PointConditions[] {
  if (!grid) return [];
  const out: PointConditions[] = [];
  let lastMs = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < grid.times.length && out.length < FORECAST_STEPS; i++) {
    const t = grid.times[i];
    if (t < selectedTime || t - lastMs < FREE_STEP_MS) continue;
    const r = readoutAt(grid, lon, lat, i);
    if (!r) continue;
    out.push(conditionsFromReadout(r, t));
    lastMs = t;
  }
  return out;
}

// The merged forecast rows plus the window they span. The provider series wins when it carries rows
// at or after the target time; otherwise the free grid answers. An empty or fully-past provider
// series must not suppress the free-grid forecast. horizonH is the window the rows actually span,
// so the cadence (6-hourly free, provider-defined otherwise) never has to be guessed from the times.
export function pickForecast(
  grid: WeatherGrid | undefined,
  parsedSeries: PointConditions[] | undefined,
  parsedPos: [number, number] | undefined,
  selectedTime: number,
  targetMs: number,
  hasProvider: boolean,
): { rows: PointConditions[]; horizonH: number } {
  const rows = pickRows(grid, parsedSeries, parsedPos, selectedTime, targetMs, hasProvider);
  const horizonH =
    rows.length > 0
      ? Math.max(1, Math.round((rows[rows.length - 1].timeMs - targetMs) / HOUR_MS))
      : 0;
  return { rows, horizonH };
}

function pickRows(
  grid: WeatherGrid | undefined,
  parsedSeries: PointConditions[] | undefined,
  parsedPos: [number, number] | undefined,
  selectedTime: number,
  targetMs: number,
  hasProvider: boolean,
): PointConditions[] {
  if (hasProvider && parsedSeries) {
    const rows = parsedSeries
      .filter((c) => !Number.isNaN(c.timeMs) && c.timeMs >= targetMs)
      .slice(0, FORECAST_STEPS);
    if (rows.length > 0) return rows;
  }
  if (!parsedPos) return [];
  const [lat, lon] = parsedPos;
  return freeForecast(grid, lat, lon, selectedTime);
}

// The barometric tendency phrased the way a sailor decides by it, derived from the trailing 3-hour
// delta computed from the free grid. Undefined when the series does not reach a full window back.
export function tendencyText(
  grid: WeatherGrid | undefined,
  parsedPos: [number, number] | undefined,
  targetMs: number,
  mode: UnitsMode,
): string | undefined {
  if (!parsedPos || !grid) return undefined;
  const [lat, lon] = parsedPos;
  const dPa = pressureTrendPa(grid, lon, lat, targetMs);
  if (dPa === undefined) return undefined;
  const dHpa = dPa / PA_PER_HPA;
  if (Math.abs(dHpa) < 0.5) return 'steady';
  const word = dHpa > 0 ? 'rising' : 'falling';
  // Metric keeps a tenth of a hectopascal: formatPressureOr's whole hPa would round a real
  // 0.7 hPa/3 h trend up to 1. Imperial uses the formatter's hundredths of inHg.
  const value =
    mode === 'imperial'
      ? formatPressureOr(Math.abs(dPa), 'imperial')
      : formatFixed(Math.abs(dHpa), 1);
  return `${word} ${value} ${pressureUnit(mode)}/${PRESSURE_TREND_WINDOW_H} h`;
}
