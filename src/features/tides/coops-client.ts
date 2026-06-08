import type { CurrentEvent, TideEvent, TideStation } from '$entities/tides';

// NOAA CO-OPS, the US tide and tidal-current authority. Public domain, key-free, CORS-open. The
// metadata API lists stations; the datagetter returns predictions for one station.
const MDAPI = 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json';
const DATAGETTER = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';
// A 48-hour window so the next high and the next low are always present, even late in the day when
// today's remaining events are all the same kind.
const RANGE_HOURS = 48;

// Prediction times arrive as 'YYYY-MM-DD HH:MM' in the station's local time with no zone. We parse
// them as local time, which matches the station when the boat is in its timezone (the nearest
// station is by definition close), and is the time a mariner reads off the tide table.
function parseLocalTime(value: string): number {
  return new Date(value.replace(' ', 'T')).getTime();
}

// Today's local date as YYYYMMDD, the CO-OPS begin_date format. The window starts at local midnight
// so the tide curve keeps a few hours of context before now.
function localDateStamp(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}${month}${day}`;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`CO-OPS ${response.status}`);
  return response.json();
}

async function fetchStations(
  type: 'tidepredictions' | 'currentpredictions',
): Promise<TideStation[]> {
  const data = (await fetchJson(`${MDAPI}?type=${type}`)) as {
    stations?: Array<{ id: string; name: string; lat: number; lng: number }>;
  };
  return (data.stations ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    latitude: s.lat,
    longitude: s.lng,
  }));
}

export function fetchTideStations(): Promise<TideStation[]> {
  return fetchStations('tidepredictions');
}

export function fetchCurrentStations(): Promise<TideStation[]> {
  return fetchStations('currentpredictions');
}

export async function fetchTideEvents(stationId: string): Promise<TideEvent[]> {
  // interval=hilo returns just the high and low turning points; units=metric puts the height in
  // meters, which is already SI.
  const url = `${DATAGETTER}?product=predictions&interval=hilo&datum=MLLW&units=metric&time_zone=lst_ldt&format=json&begin_date=${localDateStamp()}&range=${RANGE_HOURS}&station=${stationId}`;
  const data = (await fetchJson(url)) as {
    predictions?: Array<{ t: string; v: string; type: string }>;
  };
  return (data.predictions ?? []).map((p) => ({
    timeMs: parseLocalTime(p.t),
    heightMeters: Number.parseFloat(p.v),
    kind: p.type === 'H' ? 'high' : 'low',
  }));
}

export async function fetchCurrentEvents(stationId: string): Promise<CurrentEvent[]> {
  // units=metric returns Velocity_Major in cm/s (not knots, and not m/s), so divide by 100 for SI
  // m/s. The set is the mean flood or ebb direction; slack has no direction and zero velocity.
  const url = `${DATAGETTER}?product=currents_predictions&units=metric&time_zone=lst_ldt&format=json&begin_date=${localDateStamp()}&range=${RANGE_HOURS}&interval=MAX_SLACK&station=${stationId}`;
  const data = (await fetchJson(url)) as {
    current_predictions?: {
      cp?: Array<{
        Type: string;
        Time: string;
        Velocity_Major: number;
        meanFloodDir?: number;
        meanEbbDir?: number;
      }>;
    };
  };
  const cp = data.current_predictions?.cp ?? [];
  return cp.map((c) => {
    const kind = c.Type === 'flood' ? 'flood' : c.Type === 'ebb' ? 'ebb' : 'slack';
    const directionDeg =
      kind === 'flood' ? c.meanFloodDir : kind === 'ebb' ? c.meanEbbDir : undefined;
    return {
      timeMs: parseLocalTime(c.Time),
      velocityMps: c.Velocity_Major / 100,
      directionDeg,
      kind,
    };
  });
}
