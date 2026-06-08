export type { AuthStatus } from './auth.svelte';
export { AuthController } from './auth.svelte';
export type { SignalKClient } from './client';
export { createSignalKClient } from './client';
export type { LatLon } from './geo-guards';
export {
  asNumber,
  isLatLon,
  isLonLat,
  type LonLat,
  latLonToLonLat,
  lonLatToLatLon,
} from './geo-guards';
export { serverOrigin, streamUrl } from './origin';
export type { SkPathKey } from './paths';
export { SK_PATHS } from './paths';
export {
  asKeyedObject,
  authInit,
  deleteResource,
  fetchKeyedResource,
  putResource,
  str,
  strArray,
} from './resource';
export { PathCell, SignalKStore } from './store.svelte';
export type {
  ActiveRoute,
  AisTargetState,
  ConnectionPhase,
  ConnectionState,
  Context,
  CourseCalculations,
  CourseInfo,
  CoursePoint,
  SKFrame,
  SubscribeEntry,
  SubscribePolicy,
} from './types';
export { SELF_CONTEXT } from './types';
