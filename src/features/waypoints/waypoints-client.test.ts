import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Waypoint } from '$entities/waypoint';
import { deleteWaypoint, fetchWaypoints, saveWaypoint } from './waypoints-client';

afterEach(() => vi.restoreAllMocks());

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

const WAYPOINT_BODY = {
  name: 'W',
  feature: {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [1, 2] },
    properties: {},
  },
};

describe('fetchWaypoints', () => {
  it('reads v2 and parses the keyed object into waypoints', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ 'id-1': WAYPOINT_BODY }));
    const waypoints = await fetchWaypoints('http://pi', 'tok');
    expect(fetchMock.mock.calls[0][0]).toContain('/signalk/v2/api/resources/waypoints');
    expect(waypoints?.[0]?.id).toBe('id-1');
    expect(waypoints?.[0]?.position).toEqual({ latitude: 2, longitude: 1 });
  });

  it('returns undefined when both v2 and v1 are unreachable, so the list is not blanked', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, false));
    expect(await fetchWaypoints('http://pi')).toBeUndefined();
  });

  it('falls back to v1 when v2 is not ok', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({}, false))
      .mockResolvedValueOnce(jsonResponse({ 'id-1': WAYPOINT_BODY }));
    const waypoints = await fetchWaypoints('http://pi');
    expect(fetchMock.mock.calls[1][0]).toContain('/signalk/v1/api/resources/waypoints');
    expect(waypoints).toHaveLength(1);
  });

  it('skips malformed entries instead of failing the list', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ good: WAYPOINT_BODY, bad: { name: 'no feature' } }),
    );
    const waypoints = await fetchWaypoints('http://pi');
    expect(waypoints?.map((w) => w.id)).toEqual(['good']);
  });
});

describe('saveWaypoint', () => {
  it('PUTs a GeoJSON waypoint body to the waypoint id and returns ok', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, true));
    const waypoint: Waypoint = {
      id: 'abc',
      name: 'W',
      position: { latitude: 2, longitude: 1 },
      description: 'D',
    };
    const ok = await saveWaypoint('http://pi', 'tok', waypoint);
    expect(ok).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe('http://pi/signalk/v2/api/resources/waypoints/abc');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('PUT');
    const sent = JSON.parse(init.body as string);
    expect(sent.name).toBe('W');
    expect(sent.description).toBe('D');
    expect(sent.feature.geometry.coordinates).toEqual([1, 2]);
  });
});

describe('deleteWaypoint', () => {
  it('DELETEs the waypoint id and returns ok', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, true));
    const ok = await deleteWaypoint('http://pi', 'tok', 'abc');
    expect(ok).toBe(true);
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('DELETE');
  });
});
