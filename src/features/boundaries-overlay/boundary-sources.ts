import { type RasterOverlaySource, wmsTiles } from '$shared/map';

// Maritime jurisdiction lines from Marine Regions (VLIZ), so a cruiser knows when a passage crosses
// into another country's waters: the maritime boundaries (the treaty and median lines between
// neighboring states), and the territorial sea at 12 nm where customs and clearance rules begin.
// They are independent toggles (you may want only the 12 nm line), both default hidden, and render
// as thin lines rather than full ocean fills. The eez_boundaries layer is the inter-state boundary
// set, not the 200 nm outer EEZ limit, so it is titled "Maritime boundaries", not "EEZ (200 nm)".
const MARINE_REGIONS_WMS = 'https://geo.vliz.be/geoserver/MarineRegions/wms';
const VLIZ_ATTRIBUTION = 'Flanders Marine Institute (VLIZ), marineregions.org, CC-BY';

export const BOUNDARY_SOURCES: RasterOverlaySource[] = [
  {
    id: 'bound-eez',
    title: 'Maritime boundaries',
    tiles: [wmsTiles(MARINE_REGIONS_WMS, 'eez_boundaries')],
    attribution: VLIZ_ATTRIBUTION,
  },
  {
    id: 'bound-12nm',
    title: 'Territorial sea (12 nm)',
    tiles: [wmsTiles(MARINE_REGIONS_WMS, 'eez_12nm')],
    attribution: VLIZ_ATTRIBUTION,
  },
];
