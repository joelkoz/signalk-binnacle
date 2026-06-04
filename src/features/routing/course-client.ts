import type { CourseCalculations, CourseInfo } from '$shared/signalk';
import { authInit } from '$shared/signalk';

const COURSE = '/signalk/v2/api/vessels/self/navigation/course';

async function put(url: string, token: string | undefined, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(
      url,
      authInit(token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
    return res.ok;
  } catch {
    return false;
  }
}

export function activateRoute(
  base: string,
  token: string | undefined,
  href: string,
  pointIndex = 0,
  reverse = false,
): Promise<boolean> {
  return put(`${base}${COURSE}/activeRoute`, token, { href, pointIndex, reverse });
}

export function advancePoint(
  base: string,
  token: string | undefined,
  value: number,
): Promise<boolean> {
  return put(`${base}${COURSE}/activeRoute/nextPoint`, token, { value });
}

export async function clearCourse(base: string, token: string | undefined): Promise<boolean> {
  try {
    const res = await fetch(`${base}${COURSE}`, authInit(token, { method: 'DELETE' }));
    return res.ok;
  } catch {
    return false;
  }
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
