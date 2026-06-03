import type { WeatherStore } from '$entities/weather';
import { cloudFieldRgba } from './cloud-field';
import { type CanvasFactory, createFieldOverlay, type FieldOverlay } from './field-overlay';

// The cloud-cover overlay: the shared canvas field overlay bound to the cloud-cover field. Off by
// default, themed, redrawn only on grid, time, or theme change.
export function createCloudOverlay(store: WeatherStore, makeCanvas?: CanvasFactory): FieldOverlay {
  return createFieldOverlay(
    store,
    {
      id: 'weather-cloud',
      title: 'Cloud cover',
      sourceId: 'binnacle-weather-cloud-field',
      layerId: 'binnacle-weather-cloud-field-layer',
      fieldRgba: cloudFieldRgba,
    },
    makeCanvas,
  );
}
