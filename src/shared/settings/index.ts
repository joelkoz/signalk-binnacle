export type { MapView } from '$shared/geo';
export type { StorageLike, Thresholds, TrackSettings } from './persisted.svelte';
export {
  createMapView,
  createThresholds,
  createTrackSettings,
  DEFAULT_THRESHOLDS,
  isMapView,
  PersistedValue,
} from './persisted.svelte';
