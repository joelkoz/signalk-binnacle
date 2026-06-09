import type { LatLon } from '$shared/geo';
import type { CourseCalculations, CourseInfo } from '$shared/signalk';
import { authInit, deleteResource, putResource } from '$shared/signalk';

const COURSE = '/signalk/v2/api/vessels/self/navigation/course';

export function activateRoute(
  base: string,
  token: string | undefined,
  href: string,
  pointIndex = 0,
  reverse = false,
): Promise<boolean> {
  return putResource(`${base}${COURSE}/activeRoute`, token, { href, pointIndex, reverse });
}

// Set a single-point destination ("go to here"): the v2 Course API replaces any active route with a
// course straight to this position. Mirrors activateRoute but targets a position, not a route href.
export function setDestination(
  base: string,
  token: string | undefined,
  position: LatLon,
): Promise<boolean> {
  return putResource(`${base}${COURSE}/destination`, token, { position });
}

export function advancePoint(
  base: string,
  token: string | undefined,
  value: number,
): Promise<boolean> {
  return putResource(`${base}${COURSE}/activeRoute/nextPoint`, token, { value });
}

export function clearCourse(base: string, token: string | undefined): Promise<boolean> {
  return deleteResource(`${base}${COURSE}`, token);
}

// One-time hydration: v2 course paths are not in the v1 full model, so the stream sends nothing
// until the next change. Read the current snapshot once when a course becomes active.
export async function hydrateCourse(
  base: string,
  token: string | undefined,
): Promise<{ info?: CourseInfo; calc?: CourseCalculations }> {
  const read = async <T>(path: string): Promise<T | undefined> => {
    try {
      const res = await fetch(`${base}${COURSE}${path}`, authInit(token));
      return res.ok ? ((await res.json()) as T) : undefined;
    } catch {
      return undefined;
    }
  };
  const [info, calc] = await Promise.all([
    read<CourseInfo>(''),
    read<CourseCalculations>('/calcValues'),
  ]);
  return { info, calc };
}
