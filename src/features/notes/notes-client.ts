import {
  categoryForSkIcon,
  type PoiCategory,
  type PoiType,
  poiCategoryForType,
} from '$entities/poi-icons';
import { fetchKeyedResource, str } from '$shared/signalk';

// A point-of-interest note from the Signal K resources API. Providers like
// signalk-crows-nest serve marinas, anchorages, and hazards as `notes`, scoped to a
// geographic query, which is why the fetch carries the current viewport bbox.
export interface NotePoint {
  id: string;
  name: string;
  position: { latitude: number; longitude: number };
  category: PoiCategory;
  // The provider's raw icon reference, kept alongside the derived category so a provided
  // symbol (signalk-symbol-manager) can resolve it to a custom marker.
  skIcon?: string;
  // Optional credit and link surfaced for the marker and its detail panel.
  url?: string;
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

// [west, south, east, north] in decimal degrees (GeoJSON / longitude-first order).
export type Bbox = [number, number, number, number];

const NOTES_PATH = '/signalk/v2/api/resources/notes';

// Map one keyed resource entry to a NotePoint, or undefined to skip it. An error payload
// ({state, statusCode, message}) has non-object values or no position, so it falls through here;
// only real notes with a position become markers.
function noteFromEntry(id: string, raw: unknown): NotePoint | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const note = raw as {
    name?: unknown;
    title?: unknown;
    url?: unknown;
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
  if (typeof lat !== 'number' || typeof lon !== 'number') return undefined;
  const props = note.properties ?? {};
  return {
    id,
    name: str(note.name) ?? str(note.title) ?? id,
    position: { latitude: lat, longitude: lon },
    category:
      poiCategoryForType(
        typeof props.crowsNest?.type === 'string' ? (props.crowsNest.type as PoiType) : undefined,
      ) ?? categoryForSkIcon(str(props.skIcon)),
    skIcon: str(props.skIcon),
    url: str(note.url),
    source: str(props.source),
    attribution: str(props.attribution),
  };
}

// Fetch notes within the viewport. The `provider` param is intentionally omitted so the
// server merges every notes provider (the default plus the POI providers); the bbox is a
// JSON array per the resources API schema. A provider whose results are query-scoped
// returns nothing without a bbox, so this must always carry one. A failed or unreachable
// fetch returns undefined so the overlay keeps the markers already shown rather than blanking
// them on a transient hiccup (a slow or rate-limited provider); a reachable area with no notes
// returns [].
export function fetchNotes(
  serverBase: string,
  token: string | undefined,
  bbox: Bbox,
): Promise<NotePoint[] | undefined> {
  const params = new URLSearchParams({ bbox: JSON.stringify(bbox) });
  return fetchKeyedResource(serverBase, [`${NOTES_PATH}?${params}`], token, noteFromEntry);
}
