import type { PoiType } from './notes-detail';
import { categoryForSkIcon, type PoiCategory, poiCategoryForType } from './poi-categories';

// A point-of-interest note from the Signal K resources API. Providers like
// signalk-crows-nest serve marinas, anchorages, and hazards as `notes`, scoped to a
// geographic query, which is why the fetch carries the current viewport bbox.
export interface NotePoint {
  id: string;
  name: string;
  position: { latitude: number; longitude: number };
  category: PoiCategory;
  // Optional detail surfaced in the marker popup.
  url?: string;
  description?: string;
  source?: string;
  attribution?: string;
}

// The marker reference handed to the app when a note is selected; enough to title the panel
// before its detail loads.
export interface NoteSelection {
  id: string;
  name: string;
  category: PoiCategory;
  attribution?: string;
  url?: string;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
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
      url?: unknown;
      description?: unknown;
      position?: { latitude?: unknown; longitude?: unknown };
      properties?: {
        skIcon?: unknown;
        source?: unknown;
        attribution?: unknown;
        crowsNest?: { type?: unknown };
      };
    };
    const lat = note.position?.latitude;
    const lon = note.position?.longitude;
    if (typeof lat !== 'number' || typeof lon !== 'number') continue;
    const props = note.properties ?? {};
    out.push({
      id,
      name: str(note.name) ?? str(note.title) ?? id,
      position: { latitude: lat, longitude: lon },
      category:
        poiCategoryForType(
          typeof props.crowsNest?.type === 'string' ? (props.crowsNest.type as PoiType) : undefined,
        ) ?? categoryForSkIcon(str(props.skIcon)),
      url: str(note.url),
      description: str(note.description),
      source: str(props.source),
      attribution: str(props.attribution),
    });
  }
  return out;
}
