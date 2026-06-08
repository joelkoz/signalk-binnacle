import type { RasterOverlaySource } from '$shared/map';

// The OpenSeaMap seamark overlay: a transparent global raster layer of navigation aids (buoys,
// beacons, lights, light sectors, and harbors) derived from OpenStreetMap. It sits in the safety
// band, above charts and routes, so a hazard mark always draws over the chart picture. Two community
// hosts are listed as mirrors so MapLibre falls back if one is slow. It defaults hidden; the user
// enables it. Multicolor symbols dim but do not recolor at night, which keeps lateral-mark red and
// green legible, the one information that is wanted at night.
export const SEAMARK_SOURCES: RasterOverlaySource[] = [
  {
    id: 'seamark',
    title: 'OpenSeaMap seamarks',
    tiles: [
      'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png',
      'https://t1.openseamap.org/seamark/{z}/{x}/{y}.png',
    ],
    minzoom: 0,
    maxzoom: 18,
    attribution: '© OpenSeaMap contributors, ODbL',
  },
];
