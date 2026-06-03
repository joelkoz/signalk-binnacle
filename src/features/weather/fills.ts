// The weather area-fill layer ids. These are mutually exclusive (one fill at a time): the
// LayerManager enforces it and the Weather menu groups them. Wind and pressure are combinable
// overlays, not fills. One source of truth so the menu grouping and the exclusion never drift.
export const WEATHER_FILL_IDS: string[] = [
  'weather-waves',
  'weather-precip',
  'weather-cloud',
  'weather-radar',
];
