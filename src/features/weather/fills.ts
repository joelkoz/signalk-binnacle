// The canonical weather layer ids, one source of truth so the overlays, the legend, the panel
// grouping, and the mutually-exclusive fill set never drift. These strings are persisted in the
// saved layer settings, so they must stay stable.
export const WEATHER_LAYER_IDS = {
  wind: 'weather-wind',
  pressure: 'weather-pressure',
  waves: 'weather-waves',
  precip: 'weather-precip',
  cloud: 'weather-cloud',
  radar: 'weather-radar',
} as const;

// The weather area-fill layer ids. These are mutually exclusive (one fill at a time): the
// LayerManager enforces it and the Weather panel groups them. Wind and pressure are combinable
// overlays, not fills.
export const WEATHER_FILL_IDS: string[] = [
  WEATHER_LAYER_IDS.waves,
  WEATHER_LAYER_IDS.precip,
  WEATHER_LAYER_IDS.cloud,
  WEATHER_LAYER_IDS.radar,
];
