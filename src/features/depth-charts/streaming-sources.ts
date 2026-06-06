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
}

// The NOAA Maritime Chart Service renders S-52 chart symbology server-side and returns it as
// transparent raster tiles. The LAYERS list selects S-57 display categories (numbering from the
// service GetCapabilities): 0 to 7 and 10 are the chart itself, 8 and 9 are data quality (the ZOC
// triangle-of-stars and low-accuracy markers), and 11 and 12 are the shallow-water and overscale
// warning patterns. The categories are split across separate overlays below so the metadata ones
// toggle off without losing the chart. Each subset is its own WMS request, so each enabled overlay
// is its own fetch; the two metadata overlays default hidden, so the default view is the chart alone.
const NOAA_ENC_WMS =
  'https://gis.charttools.noaa.gov/arcgis/rest/services/MCS/NOAAChartDisplay/MapServer/exts/MaritimeChartService/WMSServer';
const noaaEncTiles = (layers: string): string =>
  `${NOAA_ENC_WMS}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=${layers}&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=true&STYLES=`;
const noaaEncSource = (id: string, title: string, layers: string): StreamingChartSource => ({
  id,
  title,
  tiles: [noaaEncTiles(layers)],
  tileSize: 256,
  minzoom: 0,
  maxzoom: 18,
  bounds: [-180, -15, 180, 75],
  attribution: 'NOAA Office of Coast Survey, Electronic Navigational Charts (ENC)',
});

// Live-verified free services (2026-06-02), global first then regional. Every one carries a
// "not for navigation" constraint, so they are reference overlays, not the primary chart. Two
// traps kept exactly as verified: BlueTopo serves 512px PNG8 tiles, and the NOAA ENC is a full
// chart-display WMS whose LAYERS list selects S-57 display categories (see noaaEncSource above).
export const STREAMING_CHART_SOURCES: StreamingChartSource[] = [
  {
    id: 'depth-gebco',
    title: 'GEBCO global bathymetry',
    tiles: [
      'https://wms.gebco.net/mapserv?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=GEBCO_LATEST&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=true&STYLES=',
    ],
    tileSize: 256,
    minzoom: 0,
    // GEBCO is a coarse ~450 m global grid; this cap keeps the WMS rendering crisp rather than
    // upscaling low tiles into a blur. For real inshore detail use BlueTopo, EMODnet, or the ENC.
    maxzoom: 12,
    attribution: 'GEBCO_2024 Grid, GEBCO Compilation Group (2024)',
  },
  {
    id: 'depth-emodnet',
    title: 'EMODnet bathymetry (Europe)',
    tiles: [
      'https://ows.emodnet-bathymetry.eu/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=emodnet:mean_multicolour&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=true&STYLES=',
    ],
    tileSize: 256,
    minzoom: 0,
    maxzoom: 12,
    bounds: [-73.125, 5.625, 45.0, 90.0],
    attribution: 'EMODnet Bathymetry Consortium (2022): EMODnet Digital Bathymetry (DTM)',
  },
  // Registration order is z-order, so the chart sits below its data-quality and warning overlays.
  noaaEncSource('depth-noaa-enc', 'NOAA ENC chart (US)', '0,1,2,3,4,5,6,7,10'),
  noaaEncSource('depth-noaa-enc-quality', 'NOAA ENC data quality', '8,9'),
  noaaEncSource('depth-noaa-enc-warnings', 'NOAA ENC shallow/overscale', '11,12'),
  {
    id: 'depth-bluetopo',
    title: 'NOAA BlueTopo bathymetry (US)',
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
