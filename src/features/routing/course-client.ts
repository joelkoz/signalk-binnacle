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
