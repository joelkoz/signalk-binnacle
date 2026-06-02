import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrackPoint } from '$entities/track';
import { deleteTrack, fetchSavedTracks, saveTrack } from './tracks-client';

const p = (lat: number, lon: number, gap?: boolean): TrackPoint => ({
  lat,
  lon,
  t: 0,
  sog: 1,
  gap,
});

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('fetchSavedTracks', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('parses a keyed object of MultiLineString features into segments', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        t1: {
          type: 'Feature',
          geometry: {
            type: 'MultiLineString',
            coordinates: [
              [
                [-83.5, 42.6],
                [-83.4, 42.7],
              ],
              [
                [-83.3, 42.8],
                [-83.2, 42.9],
              ],
            ],
          },
          properties: { name: 'Day 1' },
        },
        err: { state: 'FAILED', statusCode: 404 },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const tracks = await fetchSavedTracks('http://pi', 'tok');
    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({ id: 't1', name: 'Day 1' });
    expect(tracks[0].points).toHaveLength(2);
    expect(tracks[0].points[0][0]).toMatchObject({ lat: 42.6, lon: -83.5 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/signalk/v2/api/resources/tracks');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok' });
  });

  it('falls back to v1 when v2 is not ok and parses a LineString as one segment', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(404, {}))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          t1: {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [
                [0, 0],
                [1, 1],
              ],
            },
            properties: { name: 'Leg' },
          },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const tracks = await fetchSavedTracks('http://pi');
    expect(tracks).toHaveLength(1);
    expect(tracks[0].points).toHaveLength(1);
    expect(fetchMock.mock.calls[1][0]).toContain('/signalk/v1/api/resources/tracks');
  });

  it('returns an empty list on an error response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(500, {})));
    expect(await fetchSavedTracks('http://pi')).toEqual([]);
  });
});

describe('saveTrack', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('PUTs a MultiLineString feature split at gaps and returns true', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);
    const points = [p(42.6, -83.5), p(42.7, -83.4), p(42.8, -83.3, true), p(42.9, -83.2)];
    const ok = await saveTrack('http://pi', 'tok', 'abc', 'Day 1', points);
    expect(ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://pi/signalk/v2/api/resources/tracks/abc');
    expect((init as RequestInit).method).toBe('PUT');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.geometry.type).toBe('MultiLineString');
    expect(body.geometry.coordinates).toEqual([
      [
        [-83.5, 42.6],
        [-83.4, 42.7],
      ],
      [
        [-83.3, 42.8],
        [-83.2, 42.9],
      ],
    ]);
    expect(body.properties).toMatchObject({ name: 'Day 1', source: 'binnacle' });
  });

  it('returns false on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(403, {})));
    expect(await saveTrack('http://pi', 't', 'id', 'n', [p(0, 0), p(1, 1)])).toBe(false);
  });

  it('returns false when the fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')));
    expect(await saveTrack('http://pi', 't', 'id', 'n', [p(0, 0), p(1, 1)])).toBe(false);
  });
});

describe('deleteTrack', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('DELETEs the track and returns true', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);
    expect(await deleteTrack('http://pi', 'tok', 'abc')).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://pi/signalk/v2/api/resources/tracks/abc');
    expect((init as RequestInit).method).toBe('DELETE');
  });

  it('returns false on an error response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(404, {})));
    expect(await deleteTrack('http://pi', 't', 'id')).toBe(false);
  });
});
