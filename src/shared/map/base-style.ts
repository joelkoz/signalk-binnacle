import type { StyleSpecification } from 'maplibre-gl';

// A bundled, offline base style. Vessels are offline, so the base map must not
// depend on a CDN. With no vector tiles bundled yet (a later spec), this is a
// flat background that the theme recolors; the real map content is the Signal K
// charts layered on top. The background color is overridden per theme at runtime.
export function baseStyle(): StyleSpecification {
  return {
    version: 8,
    name: 'Binnacle Base',
    sources: {},
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': '#dfe4e8' },
      },
    ],
  };
}
