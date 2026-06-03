import type { ZBand } from '$shared/map';

// The Layers-panel section a layer falls under, by z-band: charts and depth at the base, the weather
// field and overlay layers under their own group, and everything else under overlays.
export function layerGroup(band: ZBand): string {
  if (band === 'basemap' || band === 'bathymetry') return 'Charts and Depth';
  if (band === 'weather') return 'Weather';
  return 'Overlays';
}
