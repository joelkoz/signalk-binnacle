import type { Theme } from '$shared/ui';
import type { Rgba } from './icon-raster';

export interface MapThemePaint {
  background: string;
  water: string;
  // Vector chart fills and lines, themed so a vector chart recolors with the app.
  land: string;
  landcover: string;
  road: string;
  boundary: string;
  // Base-map text labels (place, road, and water names). Readable on each theme's
  // background; a muted red at night so labels stay in the red band.
  label: string;
  // Collision-highlight rings: danger tracks the --alarm token per theme, warning is a
  // distinct, less-urgent hue (night-red keeps both in the red band, danger brighter).
  danger: string;
  warning: string;
  // Point-of-interest (notes) marker fill color.
  note: string;
  // The glyph drawn on a marker disc: a light contrast in day and dusk, a brighter red
  // at night so it reads on the disc without breaking the pure-red-on-black contract.
  markerGlyph: string;
  // Highlight ring around a selected marker. A distinct accent in day and dusk; at night
  // a light red that stays in the red band yet reads apart from the danger and warning hues.
  select: string;
  // Navaid (lateral mark) fills. IALA red/green in day and dusk; at night both collapse to
  // distinguishable red shades, because night-red forbids green, so the lateral side is read
  // from the symbol shape (cone vs can, triangle vs square) rather than color.
  navStarboard: string;
  navPort: string;
  // Light flare and lighthouse lantern: chart magenta in day and dusk, a light red at night.
  navLight: string;
  // Own-track speed ramp (slow to fast) and the solid-mode track color. Night-red is a
  // dark-to-bright red ramp so the brightest pixel stays low and no blue or green appears.
  trackSlow: string;
  trackMid: string;
  trackFast: string;
  trackSolid: string;
  ownVessel: Rgba;
  aisTarget: Rgba;
}

// The string-valued (color) keys of MapThemePaint, usable directly as a paint color.
export type MapColorKey = 'background' | 'water' | 'land' | 'landcover' | 'road' | 'boundary';

const PAINT: Record<Theme, MapThemePaint> = {
  day: {
    background: '#dfe4e8',
    water: '#a8c9e0',
    land: '#eae6dd',
    landcover: '#d6e6c8',
    road: '#c9c2b6',
    boundary: '#b6a98f',
    label: '#33414c',
    danger: '#c8401f',
    warning: '#e0a020',
    note: '#7a3fa0',
    markerGlyph: '#ffffff',
    select: '#ffb300',
    navStarboard: '#d8392f',
    navPort: '#1f9e54',
    navLight: '#c026d3',
    trackSlow: '#1a3a5a',
    trackMid: '#2c6da3',
    trackFast: '#6fb1e0',
    trackSolid: '#1f6fb2',
    ownVessel: { r: 0x1f, g: 0x6f, b: 0xb2, a: 0xff },
    aisTarget: { r: 0xe0, g: 0xa0, b: 0x20, a: 0xff },
  },
  dusk: {
    background: '#0a151f',
    water: '#10212e',
    land: '#16242f',
    landcover: '#152b24',
    road: '#2a3b48',
    boundary: '#3a4d5c',
    label: '#9fb4c6',
    danger: '#e0703a',
    warning: '#d9a441',
    note: '#9a6fc0',
    markerGlyph: '#eef3f6',
    select: '#ffc24d',
    navStarboard: '#e0573f',
    navPort: '#3fae6a',
    navLight: '#cf5bd9',
    trackSlow: '#22455f',
    trackMid: '#3f87bf',
    trackFast: '#84c0ea',
    trackSolid: '#4f9fd8',
    ownVessel: { r: 0x4f, g: 0x9f, b: 0xd8, a: 0xff },
    aisTarget: { r: 0xd9, g: 0xa4, b: 0x41, a: 0xff },
  },
  'night-red': {
    background: '#000000',
    water: '#140402',
    land: '#0c0301',
    landcover: '#0f0402',
    road: '#3a0c08',
    boundary: '#4a0f0a',
    label: '#9a3a2c',
    danger: '#ff6a5a',
    warning: '#a83a10',
    note: '#9a3020',
    markerGlyph: '#ff9a86',
    select: '#ffb39a',
    navStarboard: '#ff6a5a',
    navPort: '#8e2a22',
    navLight: '#ff9a86',
    trackSlow: '#3a0c08',
    trackMid: '#9a3020',
    trackFast: '#ff6a5a',
    trackSolid: '#9a3020',
    ownVessel: { r: 0xe0, g: 0x47, b: 0x3a, a: 0xff },
    aisTarget: { r: 0xb0, g: 0x6a, b: 0x10, a: 0xff },
  },
};

export function mapThemePaint(theme: Theme): MapThemePaint {
  return PAINT[theme];
}
