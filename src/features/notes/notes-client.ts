// A point-of-interest note from the Signal K resources API. Providers like
// signalk-crows-nest serve marinas, anchorages, and hazards as `notes`, scoped to a
// geographic query, which is why the fetch carries the current viewport bbox.
export interface NotePoint {
  id: string;
  name: string;
  position: { latitude: number; longitude: number };
}

// [west, south, east, north] in decimal degrees (GeoJSON / longitude-first order).
export type Bbox = [number, number, number, number];

const NOTES_PATH = '/signalk/v2/api/resources/notes';

// Fetch notes within the viewport. The `provider` param is intentionally omitted so the
// server merges every notes provider (the default plus the POI providers); the bbox is a
// JSON array per the resources API schema. A provider whose results are query-scoped
// returns nothing without a bbox, so this must always carry one.
export async function fetchNotes(
  serverBase: string,
  token: string | undefined,
  bbox: Bbox,
): Promise<NotePoint[]> {
  const params = new URLSearchParams({ bbox: JSON.stringify(bbox) });
  const init = token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;
  let body: unknown;
  try {
    const response = await fetch(`${serverBase}${NOTES_PATH}?${params}`, init);
    if (!response.ok) return [];
    body = await response.json();
  } catch {
    return [];
  }
  if (!body || typeof body !== 'object') return [];
  const out: NotePoint[] = [];
  for (const [id, raw] of Object.entries(body as Record<string, unknown>)) {
    // An error payload ({state, statusCode, message}) has non-object values, which fall
    // through here; only real notes with a position become markers.
    if (!raw || typeof raw !== 'object') continue;
    const note = raw as {
      name?: unknown;
      title?: unknown;
      position?: { latitude?: unknown; longitude?: unknown };
    };
    const lat = note.position?.latitude;
    const lon = note.position?.longitude;
    if (typeof lat !== 'number' || typeof lon !== 'number') continue;
    const name =
      typeof note.name === 'string' ? note.name : typeof note.title === 'string' ? note.title : id;
    out.push({ id, name, position: { latitude: lat, longitude: lon } });
  }
  return out;
}
