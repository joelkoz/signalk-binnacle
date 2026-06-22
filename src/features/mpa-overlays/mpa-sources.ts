import {
  arcgisExportTiles,
  createSafetyOverlay,
  type OverlayModule,
  type RasterOverlaySource,
  wmsTiles,
} from '$shared/map';

// Marine protected and regulated areas, so a cruiser sees no-anchor and protected zones before
// dropping the hook. EMODnet Human Activities covers EU seas (marine protected areas, with Natura
// 2000 nested under it as a facet); the NOAA MPA Inventory covers US waters from the same host as the
// NOAA chart. The two authorities cover different regions, so they are not grouped together. All
// default hidden.
const EMODNET_HA_WMS = 'https://ows.emodnet-humanactivities.eu/wms';
const EMODNET_MPA_GROUP = { id: 'emodnet-mpa', title: 'Protected areas (EU)' };
const NOAA_MPA_SERVER =
  'https://gis.charttools.noaa.gov/arcgis/rest/services/survey_priorities2_national/MPA_Inventory_Separates/MapServer';

export const MPA_SOURCES: RasterOverlaySource[] = [
  {
    id: 'mpa-emodnet',
    title: 'Marine protected areas',
    tiles: [wmsTiles(EMODNET_HA_WMS, 'marineprotectedareas')],
    attribution: 'EMODnet Human Activities',
    group: EMODNET_MPA_GROUP,
    category: 'areas',
  },
  {
    id: 'mpa-natura2000',
    title: 'Natura 2000',
    tiles: [wmsTiles(EMODNET_HA_WMS, 'natura2000areas')],
    attribution: 'EMODnet Human Activities',
    parent: 'mpa-emodnet',
    group: EMODNET_MPA_GROUP,
  },
  {
    id: 'mpa-noaa',
    title: 'NOAA MPA inventory (US)',
    tiles: [arcgisExportTiles(NOAA_MPA_SERVER)],
    bounds: [-180, 15, -60, 75],
    attribution: 'NOAA National Marine Protected Areas Center',
    category: 'areas',
  },
];

// The protected-area overlays draw in the safety band, bound through the shared createSafetyOverlay
// so the band is not re-spelled per slice.
export function createMpaOverlay(source: RasterOverlaySource): OverlayModule {
  return createSafetyOverlay(source);
}
