import type { Path } from './types';

// Signal K is SI: angles in radians, speed in m/s, depth in meters, temperature
// in Kelvin. navigation.position is the exception: decimal degrees. Only the paths the
// app actually subscribes to or reads live here; instrument paths (depth, wind, STW) join
// when the instrument widgets that consume them land.
export const SK_PATHS = {
  position: 'navigation.position',
  headingTrue: 'navigation.headingTrue',
  courseOverGroundTrue: 'navigation.courseOverGroundTrue',
  speedOverGround: 'navigation.speedOverGround',
  closestApproach: 'navigation.closestApproach',
  name: 'name',
  aisShipType: 'design.aisShipType',
} as const satisfies Record<string, Path>;

export type SkPathKey = keyof typeof SK_PATHS;
