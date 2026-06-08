// A free hosted bathymetry service streamed as raster tiles and cached as the user pans. All
// sources start hidden; the user enables the one that covers their cruising area.
export interface StreamingChartSource {
  id: string;
  title: string;
  // MapLibre raster tile URL template(s): {z}/{x}/{y} for XYZ or WMTS, or a WMS GetMap request
  // using the {bbox-epsg-3857} token.
  tiles: string[];
  tileSize?: number;
  minzoom?: number;
  maxzoom?: number;
  // Optional coverage bounds [west, south, east, north] in WGS84 degrees for a regional source.
  bounds?: [number, number, number, number];
  attribution: string;
  // An optional parent source id: a facet of another chart (the data-quality overlay of the NOAA ENC
  // chart) nests under it in the Layers panel and only shows when the parent is on.
  parent?: string;
  // An optional named group: facets that share a group id render under one labeled group header in
  // the Layers panel. The NOAA ENC chart and its data-quality overlay share one group.
  group?: { id: string; title: string };
}

// The NOAA Maritime Chart Service renders S-52 chart symbology server-side and returns it as
// transparent raster tiles. The LAYERS list selects S-57 display categories (numbering from the
// service GetCapabilities): 0 to 7 and 10 are the chart itself, and 8 and 9 are data quality (the
// ZOC triangle-of-stars and low-accuracy markers), split into a separate overlay below so it toggles
// off without losing the chart. The shallow-water and overscale warning categories (11 and 12) are
// deliberately left out: 11 just duplicates the chart's depth-area shading, and 12 is the overscale
// crosshatch, both clutter on a not-for-navigation reference overlay. Each subset is its own WMS
// request, and the data-quality overlay defaults hidden, so the default view is the chart alone.
const NOAA_ENC_WMS =
  'https://gis.charttools.noaa.gov/arcgis/rest/services/MCS/NOAAChartDisplay/MapServer/exts/MaritimeChartService/WMSServer';

// A WMS 1.3.0 GetMap raster tile template: 256px EPSG:3857 PNG tiles with the {bbox-epsg-3857}
// token MapLibre substitutes per tile. Shared by the GEBCO, EMODnet, and NOAA ENC sources so the
// GetMap query shape lives in one place. (tileSize defaults to 256 in the overlay, so it is omitted
// below; only BlueTopo's 512 is load-bearing.)
const wmsTiles = (base: string, layers: string): string =>
  `${base}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=${layers}&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=true&STYLES=`;
const noaaEncSource = (
  id: string,
  title: string,
  layers: string,
  opts: { parent?: string; group?: { id: string; title: string } } = {},
): StreamingChartSource => ({
  id,
  title,
  tiles: [wmsTiles(NOAA_ENC_WMS, layers)],
  minzoom: 0,
  maxzoom: 18,
  bounds: [-180, -15, 180, 75],
  attribution: 'NOAA Office of Coast Survey, Electronic Navigational Charts (ENC)',
  ...(opts.parent ? { parent: opts.parent } : {}),
  ...(opts.group ? { group: opts.group } : {}),
});

// The two NOAA ENC facets (the chart and its data-quality overlay) share this group, so the Layers
// panel lists them under one "NOAA ENC (US)" header.
const NOAA_ENC_GROUP = { id: 'noaa-enc', title: 'NOAA ENC (US)' };

// Live-verified free services (2026-06-02), global first then regional. Every one carries a
// "not for navigation" constraint, so they are reference overlays, not the primary chart. Two
// traps kept exactly as verified: BlueTopo serves 512px PNG8 tiles, and the NOAA ENC is a full
// chart-display WMS whose LAYERS list selects S-57 display categories (see noaaEncSource above).
export const STREAMING_CHART_SOURCES: StreamingChartSource[] = [
  {
    id: 'depth-gebco',
    title: 'GEBCO bathymetry (global)',
    tiles: [wmsTiles('https://wms.gebco.net/mapserv', 'GEBCO_LATEST')],
    minzoom: 0,
    // GEBCO is a coarse ~450 m global grid; this cap keeps the WMS rendering crisp rather than
    // upscaling low tiles into a blur. For real inshore detail use BlueTopo, EMODnet, or the ENC.
    maxzoom: 12,
    attribution: 'GEBCO_2024 Grid, GEBCO Compilation Group (2024)',
  },
  {
    id: 'depth-emodnet',
    title: 'EMODnet bathymetry (Europe)',
    tiles: [wmsTiles('https://ows.emodnet-bathymetry.eu/wms', 'emodnet:mean_multicolour')],
    minzoom: 0,
    maxzoom: 12,
    bounds: [-73.125, 5.625, 45.0, 90.0],
    attribution: 'EMODnet Bathymetry Consortium (2022): EMODnet Digital Bathymetry (DTM)',
  },
  // Registration order is z-order, so the chart sits below its data-quality overlay. Both facets
  // declare the same group so the Layers panel lists them under one "NOAA ENC (US)" header.
  noaaEncSource('depth-noaa-enc', 'Base chart', '0,1,2,3,4,5,6,7,10', { group: NOAA_ENC_GROUP }),
  // A facet of the chart above, nested under it: the Zones of Confidence and low-accuracy markers.
  noaaEncSource('depth-noaa-enc-quality', 'Data quality (ZOC)', '8,9', {
    parent: 'depth-noaa-enc',
    group: NOAA_ENC_GROUP,
  }),
  {
    id: 'depth-bluetopo',
    title: 'BlueTopo bathymetry (US)',
    tiles: [
      'https://nowcoast.noaa.gov/geoserver/gwc/service/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=bluetopo:bathymetry&STYLE=&TILEMATRIXSET=EPSG:3857&TILEMATRIX=EPSG:3857:{z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png8',
    ],
    tileSize: 512,
    minzoom: 0,
    maxzoom: 16,
    bounds: [-138.0, -53.876, 17.046, 59.55],
    attribution: 'NOAA Office of Coast Survey, BlueTopo / National Bathymetric Source',
  },
];
