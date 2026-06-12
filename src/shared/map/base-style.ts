import type { StyleSpecification } from 'maplibre-gl';
import { mapThemePaint } from './map-theme';

// The vector base map. MapLibre fetches this style JSON and its tiles, glyphs, and
// sprite. It is a free, keyless OpenStreetMap-derived vector style; the theme system
// recolors its background and water layers per theme via setPaintProperty. Signal K
// and NOAA charts layer on top. Offline operation comes from caching this source (a
// service-worker runtime cache plus an optional pre-downloaded PMTiles region), a
// later spec, not from removing it: a flat inline style yields a blank map.
const VECTOR_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const GLYPHS_URL = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

export function baseStyleUrl(): string {
  return VECTOR_STYLE_URL;
}

// The last-resort base when the style JSON itself is unreachable (plain http at sea, where no
// service worker can cache it): one water-colored background so the map can finish its first
// render and fire 'load', which is what mounts every overlay, including the charts served from
// the IndexedDB block cache. This is a runtime fallback for a failed fetch, not a replacement
// for the vector base (see above). The glyphs URL must be declared even though it is unreachable
// here: adding any symbol layer with a text-field throws without one, while a failed glyph fetch
// just renders no text. The background color matches the day theme's water; the recolor pass
// themes it like any base background layer.
export function fallbackBaseStyle(): StyleSpecification {
  return {
    version: 8,
    name: 'binnacle-offline-fallback',
    glyphs: GLYPHS_URL,
    sources: {},
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': mapThemePaint('day').water },
      },
    ],
  };
}
