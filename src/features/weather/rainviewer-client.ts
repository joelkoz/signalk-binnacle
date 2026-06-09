import type { RadarData } from '$entities/weather';
import { fetchJsonOrUndefined } from '$shared/lib';

const MAPS_URL = 'https://api.rainviewer.com/public/weather-maps.json';

interface RainViewerMaps {
  host?: string;
  radar?: {
    past?: Array<{ time: number; path: string }>;
    nowcast?: Array<{ time: number; path: string }>;
  };
}

// Fetch the RainViewer radar frame index (past plus nowcast). Best-effort: returns undefined on any
// failure so the radar layer degrades quietly. Times are converted to ms; frames are ascending.
export async function fetchRadar(
  fetchFn: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<RadarData | undefined> {
  const body = await fetchJsonOrUndefined<RainViewerMaps>(
    MAPS_URL,
    { credentials: 'omit' },
    fetchFn,
  );
  if (body === undefined) return undefined;
  if (!body.host || !body.radar) return undefined;
  const raw = [...(body.radar.past ?? []), ...(body.radar.nowcast ?? [])];
  const frames = raw
    .map((f) => ({ time: f.time * 1000, path: f.path }))
    .sort((a, b) => a.time - b.time);
  if (frames.length === 0) return undefined;
  return { host: body.host, frames };
}
