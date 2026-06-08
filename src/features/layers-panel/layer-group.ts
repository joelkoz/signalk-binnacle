import type { ZBand } from '$shared/map';

// The Layers-panel section a layer falls under, by z-band: charts and depth at the base, the ocean
// fields (sea-surface temperature, sea ice) under their own heading, and everything else under
// overlays. The weather band's section is named "Ocean conditions", not "Weather", so it does not
// collide with the Forecast feature, which is the live weather mini-map opened from the status strip.
export function layerGroup(band: ZBand): string {
  if (band === 'basemap' || band === 'bathymetry') return 'Charts and Depth';
  if (band === 'weather') return 'Ocean conditions';
  return 'Overlays';
}
