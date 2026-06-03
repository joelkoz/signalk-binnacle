import { metersPerSecondToKnots } from '$shared/lib';
import type { Theme } from '$shared/ui';
import { cloudColor } from './cloud-colormap';
import { type Rgba, rgbaCss } from './color-ramp';
import { precipColor } from './precip-colormap';
import { isobarColors } from './pressure-colors';
import { DEFAULT_INTERVAL_HPA } from './pressure-isobars';
import { waveColor } from './wave-colormap';
import { windColor } from './wind-colormap';

export interface LegendSwatch {
  color: string;
  label: string;
}

export interface WeatherLegend {
  id: string;
  title: string;
  swatches: LegendSwatch[];
}

const WIND_STOPS = [0, 5, 10, 15, 20, 26]; // m/s
const WAVE_STOPS = [0.5, 1, 2, 4, 6, 9]; // m
const PRECIP_STOPS = [0.2, 1, 2.5, 10, 25]; // mm/h
const CLOUD_STOPS = [0.25, 0.5, 0.75, 1]; // fraction

// Render a colormap stop opaque so the legend swatch is visible even where the field itself is
// translucent or fully transparent at the low end.
function opaque([r, g, b]: Rgba): string {
  return rgbaCss([r, g, b, 1]);
}

function ramp(
  stops: number[],
  color: (value: number) => Rgba,
  label: (value: number) => string,
): LegendSwatch[] {
  return stops.map((value) => ({ color: opaque(color(value)), label: label(value) }));
}

// The legend for a weather layer: a color ramp for the field and arrow layers, or a single line
// swatch for the isobars, with value labels at the display unit. Returns undefined for an unknown
// layer id.
export function weatherLegend(layerId: string, theme: Theme): WeatherLegend | undefined {
  switch (layerId) {
    case 'weather-wind':
      return {
        id: layerId,
        title: 'Wind (kn)',
        swatches: ramp(
          WIND_STOPS,
          (s) => windColor(s, theme),
          (s) => String(Math.round(metersPerSecondToKnots(s) ?? 0)),
        ),
      };
    case 'weather-pressure':
      return {
        id: layerId,
        title: 'Pressure',
        swatches: [
          { color: isobarColors(theme).line, label: `isobars, ${DEFAULT_INTERVAL_HPA} hPa` },
        ],
      };
    case 'weather-waves':
      return {
        id: layerId,
        title: 'Waves (m)',
        swatches: ramp(
          WAVE_STOPS,
          (h) => waveColor(h, theme),
          (h) => String(h),
        ),
      };
    case 'weather-precip':
      return {
        id: layerId,
        title: 'Rain (mm/h)',
        swatches: ramp(
          PRECIP_STOPS,
          (p) => precipColor(p, theme),
          (p) => String(p),
        ),
      };
    case 'weather-cloud':
      return {
        id: layerId,
        title: 'Cloud (%)',
        swatches: ramp(
          CLOUD_STOPS,
          (c) => cloudColor(c, theme),
          (c) => String(Math.round(c * 100)),
        ),
      };
    case 'weather-radar':
      // RainViewer's palette is fixed (not theme-dependent), so these are approximate fixed swatches
      // for its universal-blue intensity scale.
      return {
        id: layerId,
        title: 'Rain radar',
        swatches: [
          { color: 'rgb(120, 160, 230)', label: 'light' },
          { color: 'rgb(60, 170, 90)', label: 'moderate' },
          { color: 'rgb(230, 200, 60)', label: 'heavy' },
          { color: 'rgb(220, 70, 60)', label: 'intense' },
        ],
      };
    default:
      return undefined;
  }
}
