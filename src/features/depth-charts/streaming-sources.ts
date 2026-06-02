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

// Live-verified free services (2026-06-02), global first then regional. Every one carries a
// "not for navigation" constraint, so they are reference overlays, not the primary chart. Two
// traps kept exactly as verified: BlueTopo serves 512px PNG8 tiles, and NOAA ENC is a full
// chart-display WMS that needs the whole S-57 category stack, not a single depth layer.
export const STREAMING_CHART_SOURCES: StreamingChartSource[] = [
  {
    id: 'depth-gebco',
    title: 'GEBCO global bathymetry',
    tiles: [
      'https://wms.gebco.net/mapserv?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=GEBCO_LATEST&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=true&STYLES=',
    ],
    tileSize: 256,
    minzoom: 0,
    maxzoom: 9,
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
  {
    id: 'depth-noaa-enc',
    title: 'NOAA ENC chart (US)',
    tiles: [
      'https://gis.charttools.noaa.gov/arcgis/rest/services/MCS/NOAAChartDisplay/MapServer/exts/MaritimeChartService/WMSServer?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=0,1,2,3,4,5,6,7,8,9,10,11,12&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=true&STYLES=',
    ],
    tileSize: 256,
    minzoom: 0,
    maxzoom: 18,
    bounds: [-180, -15, 180, 75],
    attribution: 'NOAA Office of Coast Survey, Electronic Navigational Charts (ENC)',
  },
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
