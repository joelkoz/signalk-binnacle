import type { Theme } from '$shared/ui';

export interface MapThemePaint {
  background: string;
  water: string;
}

const PAINT: Record<Theme, MapThemePaint> = {
  day: { background: '#aecbe0', water: '#a8c9e0' },
  dusk: { background: '#0a151f', water: '#10212e' },
  'night-red': { background: '#000000', water: '#140402' },
};

export function mapThemePaint(theme: Theme): MapThemePaint {
  return PAINT[theme];
}
