import type { Path } from './types';

// Signal K is SI: angles in radians, speed in m/s, depth in meters, temperature
// in Kelvin. navigation.position is the exception: decimal degrees.
export const SK_PATHS = {
  position: 'navigation.position',
  headingTrue: 'navigation.headingTrue',
  headingMagnetic: 'navigation.headingMagnetic',
  courseOverGroundTrue: 'navigation.courseOverGroundTrue',
  speedOverGround: 'navigation.speedOverGround',
  speedThroughWater: 'navigation.speedThroughWater',
  depthBelowTransducer: 'environment.depth.belowTransducer',
  windSpeedApparent: 'environment.wind.speedApparent',
  windAngleApparent: 'environment.wind.angleApparent',
  closestApproach: 'navigation.closestApproach',
  navigationState: 'navigation.state',
  name: 'name',
  mmsi: 'mmsi',
  aisShipType: 'design.aisShipType',
} as const satisfies Record<string, Path>;

export type SkPathKey = keyof typeof SK_PATHS;
