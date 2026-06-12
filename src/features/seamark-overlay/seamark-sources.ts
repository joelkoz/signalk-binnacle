import { createRasterOverlay, type OverlayModule, type RasterOverlaySource } from '$shared/map';

// The OpenSeaMap seamark overlay: a transparent global raster layer of navigation aids (buoys,
// beacons, lights, light sectors, and harbors) derived from OpenStreetMap. It sits in the safety
// band, above charts and routes, so a hazard mark always draws over the chart picture. Only the
// single canonical host is listed: MapLibre round-robins a tiles array by tile coordinate rather
// than failing over, so a second host that goes dark would blank half the tiles. It defaults
// hidden; the user enables it. As a raster it cannot be recolored, so at night-red it desaturates
// and dims with the other rasters (applyRasterTheme): the marks read by symbol shape and position
// rather than color, since preserving saturated green would break the night-red contract.
export const SEAMARK_SOURCES: RasterOverlaySource[] = [
  {
    id: 'seamark',
    title: 'OpenSeaMap seamarks',
    tiles: ['https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png'],
    minzoom: 0,
    maxzoom: 18,
    attribution: '© OpenSeaMap contributors, ODbL',
    category: 'nav-aids',
  },
];

// The seamarks draw in the safety band; the band lives in the slice so the composing widget does not
// hardcode it, matching depth-charts' createStreamingChartOverlay.
export function createSeamarkOverlay(source: RasterOverlaySource): OverlayModule {
  return createRasterOverlay(source, 'safety');
}
