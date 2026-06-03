import type { RadarData } from '$entities/weather';

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
  try {
    const response = await fetchFn(MAPS_URL, { credentials: 'omit' });
    if (!response.ok) return undefined;
    const body = (await response.json()) as RainViewerMaps;
    if (!body.host || !body.radar) return undefined;
    const raw = [...(body.radar.past ?? []), ...(body.radar.nowcast ?? [])];
    const frames = raw
      .map((f) => ({ time: f.time * 1000, path: f.path }))
      .sort((a, b) => a.time - b.time);
    if (frames.length === 0) return undefined;
    return { host: body.host, frames };
  } catch {
    return undefined;
  }
}
