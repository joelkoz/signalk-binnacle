import type { Path } from '@signalk/server-api';

// Signal K is SI: angles in radians, speed in m/s, depth in meters, temperature
// in Kelvin. navigation.position is the exception: decimal degrees.
export const SK_PATHS = {
  position: 'navigation.position' as Path,
  headingTrue: 'navigation.headingTrue' as Path,
  headingMagnetic: 'navigation.headingMagnetic' as Path,
  courseOverGroundTrue: 'navigation.courseOverGroundTrue' as Path,
  speedOverGround: 'navigation.speedOverGround' as Path,
  speedThroughWater: 'navigation.speedThroughWater' as Path,
  depthBelowTransducer: 'environment.depth.belowTransducer' as Path,
  windSpeedApparent: 'environment.wind.speedApparent' as Path,
  windAngleApparent: 'environment.wind.angleApparent' as Path,
} as const;

export type SkPathKey = keyof typeof SK_PATHS;
