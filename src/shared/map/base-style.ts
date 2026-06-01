// The vector base map. MapLibre fetches this style JSON and its tiles, glyphs, and
// sprite. It is a free, keyless OpenStreetMap-derived vector style; the theme system
// recolors its background and water layers per theme via setPaintProperty. Signal K
// and NOAA charts layer on top. Offline operation comes from caching this source (a
// service-worker runtime cache plus an optional pre-downloaded PMTiles region), a
// later spec, not from removing it: a flat inline style yields a blank map.
const VECTOR_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

export function baseStyleUrl(): string {
  return VECTOR_STYLE_URL;
}
