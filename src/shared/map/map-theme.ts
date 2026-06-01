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
  // Collision-highlight rings: danger tracks the --alarm token per theme, warning is a
  // distinct, less-urgent hue (night-red keeps both in the red band, danger brighter).
  danger: string;
  warning: string;
  // Point-of-interest (notes) marker color.
  note: string;
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
    danger: '#c8401f',
    warning: '#e0a020',
    note: '#7a3fa0',
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
    danger: '#e0703a',
    warning: '#d9a441',
    note: '#9a6fc0',
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
    danger: '#ff6a5a',
    warning: '#a83a10',
    note: '#9a3020',
    ownVessel: { r: 0xe0, g: 0x47, b: 0x3a, a: 0xff },
    aisTarget: { r: 0xb0, g: 0x6a, b: 0x10, a: 0xff },
  },
};

export function mapThemePaint(theme: Theme): MapThemePaint {
  return PAINT[theme];
}
