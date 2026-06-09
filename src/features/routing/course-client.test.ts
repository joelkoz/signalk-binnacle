import { afterEach, expect, it, vi } from 'vitest';
import { activateRoute, advancePoint, clearCourse, setDestination } from './course-client';

afterEach(() => vi.restoreAllMocks());
const ok = { ok: true, json: async () => ({}) } as Response;
const COURSE = '/signalk/v2/api/vessels/self/navigation/course';

it('activateRoute PUTs the href, pointIndex, and reverse', async () => {
  const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok);
  expect(await activateRoute('http://pi', 'tok', '/resources/routes/abc', 0, false)).toBe(true);
  expect(f.mock.calls[0][0]).toBe(`http://pi${COURSE}/activeRoute`);
  const init = f.mock.calls[0][1] as RequestInit;
  expect(init.method).toBe('PUT');
  expect(JSON.parse(init.body as string)).toEqual({
    href: '/resources/routes/abc',
    pointIndex: 0,
    reverse: false,
  });
});

it('setDestination PUTs the position to the destination endpoint', async () => {
  const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok);
  expect(await setDestination('http://pi', 'tok', { latitude: 42.5, longitude: -83.1 })).toBe(true);
  expect(f.mock.calls[0][0]).toBe(`http://pi${COURSE}/destination`);
  const init = f.mock.calls[0][1] as RequestInit;
  expect(init.method).toBe('PUT');
  expect(JSON.parse(init.body as string)).toEqual({
    position: { latitude: 42.5, longitude: -83.1 },
  });
});

it('advancePoint PUTs a signed increment', async () => {
  const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok);
  await advancePoint('http://pi', 'tok', 1);
  expect(f.mock.calls[0][0]).toBe(`http://pi${COURSE}/activeRoute/nextPoint`);
  expect(JSON.parse((f.mock.calls[0][1] as RequestInit).body as string)).toEqual({ value: 1 });
});

it('clearCourse DELETEs the course', async () => {
  const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok);
  await clearCourse('http://pi', 'tok');
  expect(f.mock.calls[0][0]).toBe(`http://pi${COURSE}`);
  expect((f.mock.calls[0][1] as RequestInit).method).toBe('DELETE');
});
