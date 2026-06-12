// The service worker's runtime caching table, extracted from vite.config.ts so the matchers are
// unit-testable pure functions. The build serializes these into the generated worker; nothing
// here may touch browser globals. Layering: the worker caches byte-level GET assets (tiles,
// styles, WMS images) and only exists over trusted https; parsed application data (weather
// grids, tides, notes, PMTiles blocks) is cached in IndexedDB by app code, which also works
// over the plain-http boat LAN. The worker never touches /signalk/v1/api/ or /signalk/v2/api/
// (auth-bearing, mutation-carrying), and every entry pins statuses to [200]: caching opaque
// (status 0) responses would burn quota at roughly 7 MB of padding per entry.

const DAY_SECONDS = 60 * 60 * 24;
const TWO_HOURS_SECONDS = 60 * 60 * 2;

interface MatchContext {
  url: URL;
  sameOrigin: boolean;
}

// The cross-origin overlay tile and WMS hosts Binnacle renders (NOAA ENC and MPA, GEBCO, the two
// EMODnet services, BlueTopo via nowcoast, Marine Regions boundaries, OpenSeaMap seamarks, and
// NASA GIBS). WMS GetMap responses cache by their full URL; GIBS bakes the date into the path, so
// its entries are immutable. One shared cache with a 7 day TTL bounds chart-edition staleness.
export const OVERLAY_TILE_HOSTS: ReadonlySet<string> = new Set([
  'gis.charttools.noaa.gov',
  'nowcoast.noaa.gov',
  'wms.gebco.net',
  'ows.emodnet-bathymetry.eu',
  'ows.emodnet-humanactivities.eu',
  'geo.vliz.be',
  'tiles.openseamap.org',
  'gibs.earthdata.nasa.gov',
]);

// Raster chart tiles served by any Signal K charts plugin (@signalk/charts-plugin and kin) at
// /charts/<id>/{z}/{x}/{y}, tolerating @2x and an extension. Same-origin only.
export const CHART_TILE_PATH = /^\/charts\/[^/]+\/\d+\/\d+\/\d+(?:@2x)?(?:\.\w+)?$/;

export const isBasemapStyle = ({ url }: MatchContext): boolean =>
  url.origin === 'https://tiles.openfreemap.org' && url.pathname.startsWith('/styles/');

export const isBasemapAsset = ({ url }: MatchContext): boolean =>
  url.origin === 'https://tiles.openfreemap.org';

export const isChartTile = ({ url, sameOrigin }: MatchContext): boolean =>
  sameOrigin && CHART_TILE_PATH.test(url.pathname);

export const isOverlayTile = ({ url }: MatchContext): boolean =>
  OVERLAY_TILE_HOSTS.has(url.hostname);

export const isCoopsRequest = ({ url }: MatchContext): boolean =>
  url.hostname === 'api.tidesandcurrents.noaa.gov';

export const isOpenMeteo = ({ url }: MatchContext): boolean =>
  url.hostname.endsWith('open-meteo.com');

export const isRadarIndex = ({ url }: MatchContext): boolean =>
  url.hostname.endsWith('rainviewer.com') && url.pathname.endsWith('.json');

export const isRadarTile = ({ url }: MatchContext): boolean =>
  url.hostname.endsWith('rainviewer.com') && url.pathname.endsWith('.png');

// PMTiles archives are deliberately ABSENT: their range requests answer 206, which the Cache API
// refuses to store, so a worker route can never cache them. They are cached as aligned blocks in
// IndexedDB by the pmtiles protocol layer instead, which also covers plain-http contexts.
export const runtimeCaching = [
  {
    // The base style document: serve the last one instantly, refresh behind, so a rotated
    // OpenFreeMap planet build cannot pin a style whose tile references have aged out.
    urlPattern: isBasemapStyle,
    handler: 'StaleWhileRevalidate',
    options: {
      cacheName: 'binnacle-basemap-style',
      expiration: { maxEntries: 4, maxAgeSeconds: 7 * DAY_SECONDS },
      cacheableResponse: { statuses: [200] },
    },
  },
  {
    // The online vector base map (tiles, glyphs, sprite): cache what the navigator has viewed.
    urlPattern: isBasemapAsset,
    handler: 'CacheFirst',
    options: {
      cacheName: 'binnacle-basemap',
      expiration: {
        maxEntries: 4000,
        maxAgeSeconds: 30 * DAY_SECONDS,
        purgeOnQuotaError: true,
      },
      cacheableResponse: { statuses: [200] },
    },
  },
  {
    // Raster chart tiles from any Signal K charts plugin: viewed chart areas render offline.
    urlPattern: isChartTile,
    handler: 'CacheFirst',
    options: {
      cacheName: 'binnacle-chart-tiles',
      expiration: {
        maxEntries: 2000,
        maxAgeSeconds: 30 * DAY_SECONDS,
        purgeOnQuotaError: true,
      },
      cacheableResponse: { statuses: [200] },
    },
  },
  {
    urlPattern: isOverlayTile,
    handler: 'CacheFirst',
    options: {
      cacheName: 'binnacle-overlay-tiles',
      expiration: {
        maxEntries: 1500,
        maxAgeSeconds: 7 * DAY_SECONDS,
        purgeOnQuotaError: true,
      },
      cacheableResponse: { statuses: [200] },
    },
  },
  {
    // CO-OPS tide and current predictions: forecasts stay correct offline for the cached day.
    urlPattern: isCoopsRequest,
    handler: 'NetworkFirst',
    options: {
      cacheName: 'binnacle-tides',
      networkTimeoutSeconds: 8,
      expiration: { maxEntries: 32, maxAgeSeconds: 36 * 60 * 60 },
      cacheableResponse: { statuses: [200] },
    },
  },
  {
    // Open-Meteo forecast and marine data: prefer fresh, fall back to the last fetch offline.
    urlPattern: isOpenMeteo,
    handler: 'NetworkFirst',
    options: {
      cacheName: 'binnacle-weather',
      networkTimeoutSeconds: 8,
      expiration: { maxEntries: 64, maxAgeSeconds: 6 * 60 * 60 },
      cacheableResponse: { statuses: [200] },
    },
  },
  {
    // RainViewer radar frame index: prefer fresh frames, fall back to the last list offline.
    urlPattern: isRadarIndex,
    handler: 'NetworkFirst',
    options: {
      cacheName: 'binnacle-radar-index',
      networkTimeoutSeconds: 6,
      expiration: { maxEntries: 4, maxAgeSeconds: TWO_HOURS_SECONDS },
      cacheableResponse: { statuses: [200] },
    },
  },
  {
    // RainViewer radar tiles: each frame's tiles are immutable (the timestamp is in the path),
    // so cache them for offline and repeat use. The window is short because frames roll.
    urlPattern: isRadarTile,
    handler: 'CacheFirst',
    options: {
      cacheName: 'binnacle-radar-tiles',
      expiration: { maxEntries: 600, maxAgeSeconds: TWO_HOURS_SECONDS },
      cacheableResponse: { statuses: [200] },
    },
  },
];
