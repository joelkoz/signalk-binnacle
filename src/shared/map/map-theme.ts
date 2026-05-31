import type { Theme } from '$shared/ui';
import type { Rgba } from './icon-raster';

export interface MapThemePaint {
  background: string;
  water: string;
  ownVessel: Rgba;
  aisTarget: Rgba;
}

const PAINT: Record<Theme, MapThemePaint> = {
  day: {
    background: '#aecbe0',
    water: '#a8c9e0',
    ownVessel: { r: 0x1f, g: 0x6f, b: 0xb2, a: 0xff },
    aisTarget: { r: 0xe0, g: 0xa0, b: 0x20, a: 0xff },
  },
  dusk: {
    background: '#0a151f',
    water: '#10212e',
    ownVessel: { r: 0x4f, g: 0x9f, b: 0xd8, a: 0xff },
    aisTarget: { r: 0xd9, g: 0xa4, b: 0x41, a: 0xff },
  },
  'night-red': {
    background: '#000000',
    water: '#140402',
    ownVessel: { r: 0xe0, g: 0x47, b: 0x3a, a: 0xff },
    aisTarget: { r: 0xb0, g: 0x6a, b: 0x10, a: 0xff },
  },
};

export function mapThemePaint(theme: Theme): MapThemePaint {
  return PAINT[theme];
}
