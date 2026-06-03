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
  // A continuous ramp: a CSS gradient with low and high end labels.
  gradient?: string;
  lowLabel?: string;
  highLabel?: string;
  // Or discrete swatches, for the isobar line and the fixed radar palette.
  swatches?: LegendSwatch[];
  // An optional short footnote, for example the radar's resolution limit.
  note?: string;
}

const WIND_STOPS = [0, 5, 10, 15, 20, 26]; // m/s
const WAVE_STOPS = [0.5, 1, 2, 4, 6, 9]; // m
const PRECIP_STOPS = [0.2, 1, 2.5, 10, 25]; // mm/h
const CLOUD_STOPS = [0.25, 0.5, 0.75, 1]; // fraction

// Render a colormap stop opaque so the legend ramp is visible even where the field itself is
// translucent or fully transparent at the low end.
function opaque([r, g, b]: Rgba): string {
  return rgbaCss([r, g, b, 1]);
}

// A continuous-ramp legend: a left-to-right CSS gradient across the stops, plus the value at each
// end at the display unit.
function rampLegend(
  id: string,
  title: string,
  stops: number[],
  color: (value: number) => Rgba,
  label: (value: number) => string,
): WeatherLegend {
  const min = stops[0];
  const max = stops[stops.length - 1];
  const span = max - min || 1;
  const parts = stops.map((v) => `${opaque(color(v))} ${Math.round(((v - min) / span) * 100)}%`);
  return {
    id,
    title,
    gradient: `linear-gradient(to right, ${parts.join(', ')})`,
    lowLabel: label(min),
    highLabel: label(max),
  };
}

// The legend for a weather layer: a continuous ramp for the field and arrow layers, or discrete
// swatches for the isobars and the radar. Returns undefined for an unknown layer id.
export function weatherLegend(layerId: string, theme: Theme): WeatherLegend | undefined {
  switch (layerId) {
    case 'weather-wind':
      return rampLegend(
        layerId,
        'Wind (kn)',
        WIND_STOPS,
        (s) => windColor(s, theme),
        (s) => String(Math.round(metersPerSecondToKnots(s) ?? 0)),
      );
    case 'weather-pressure':
      return {
        id: layerId,
        title: 'Pressure',
        swatches: [
          { color: isobarColors(theme).line, label: `isobars, ${DEFAULT_INTERVAL_HPA} hPa` },
        ],
      };
    case 'weather-waves':
      return rampLegend(
        layerId,
        'Waves (m)',
        WAVE_STOPS,
        (h) => waveColor(h, theme),
        (h) => String(h),
      );
    case 'weather-precip':
      return rampLegend(
        layerId,
        'Rain (mm/h)',
        PRECIP_STOPS,
        (p) => precipColor(p, theme),
        (p) => String(p),
      );
    case 'weather-cloud':
      return rampLegend(
        layerId,
        'Cloud (%)',
        CLOUD_STOPS,
        (c) => cloudColor(c, theme),
        (c) => String(Math.round(c * 100)),
      );
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
        note: 'live radar, detail to ~zoom 11',
      };
    default:
      return undefined;
  }
}
