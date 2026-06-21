import type { ExpressionSpecification } from 'maplibre-gl';
import type { SymbolIconEntry } from '$entities/symbols';
import { featureCollection } from '$shared/map';
import { navaidClassify, navaidIconId } from './navaid-symbols';
import type { NotePoint } from './notes-client';
import { categoryRank, poiIconId } from './poi-categories';

// A record shaped like the source notes resource, for a filter's `match` conditions. The plotter
// search filter selects by id (where the record is unused), but a category filter keys off
// `properties.skIcon`, the path ActiveCaptain providers use, so expose it here too.
export function filterRecord(note: NotePoint): unknown {
  return {
    name: note.name,
    position: note.position,
    properties: note.skIcon ? { skIcon: note.skIcon } : {},
  };
}

// The registered map-image id for a note. Navaids resolve to a type- and side-specific
// symbol inferred from the name; every other category uses its disc.
function iconFor(note: NotePoint): string {
  if (note.category === 'navaid') return navaidIconId(navaidClassify(note.name));
  return poiIconId(note.category);
}

const CENTERED_OFFSET: [number, number] = [0, 0];

// Build the icon-offset as a match on the icon id. MapLibre coerces an array-valued GeoJSON property
// to a JSON string crossing to the worker, so a per-feature offset cannot ride on the feature as
// ['get', 'iconOffset']; the match keeps each provided symbol's anchor offset as a real LITERAL array
// in the style, and every centered category disc falls through to [0, 0].
function iconOffsetExpression(
  offsets: ReadonlyMap<string, readonly [number, number]>,
): ExpressionSpecification | [number, number] {
  if (offsets.size === 0) return CENTERED_OFFSET;
  const match: unknown[] = ['match', ['get', 'icon']];
  for (const [iconId, offset] of offsets) {
    match.push(iconId, ['literal', offset]);
  }
  match.push(['literal', CENTERED_OFFSET]);
  return match as ExpressionSpecification;
}

// One pass over the notes builds both the source data and the icon-offset match: each note resolves
// to a provided symbol or its built-in category disc, and a provided symbol with a non-zero anchor
// offset contributes one match arm keyed on its icon id.
export function buildRender(
  notes: readonly NotePoint[],
  managedIcon: (note: NotePoint) => SymbolIconEntry | undefined,
): { data: GeoJSON.FeatureCollection; iconOffset: ExpressionSpecification | [number, number] } {
  const offsets = new Map<string, readonly [number, number]>();
  const features = notes.map((note): GeoJSON.Feature => {
    const managed = managedIcon(note);
    if (managed && (managed.offset[0] !== 0 || managed.offset[1] !== 0)) {
      offsets.set(managed.iconId, managed.offset);
    }
    return {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [note.position.longitude, note.position.latitude],
      },
      properties: {
        id: note.id,
        name: note.name,
        category: note.category,
        rank: categoryRank(note.category),
        icon: managed?.iconId ?? iconFor(note),
        url: note.url ?? '',
        source: note.source ?? '',
        attribution: note.attribution ?? '',
      },
    };
  });
  return { data: featureCollection(features), iconOffset: iconOffsetExpression(offsets) };
}
