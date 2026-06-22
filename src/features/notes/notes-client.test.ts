import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse } from '$shared/testing/fetch-stub';
import { fetchNotes } from './notes-client';

describe('fetchNotes', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('requests with a bbox and no provider, and parses positioned notes with detail', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        a: {
          name: 'Harbor Marina',
          position: { latitude: 42.6, longitude: -83.5 },
          url: 'https://example/poi/1',
          properties: {
            skIcon: 'marina',
            source: 'activecaptain',
            attribution: 'Data from Garmin ActiveCaptain',
          },
        },
        b: {
          title: 'Quiet Cove',
          position: { latitude: 42.7, longitude: -83.4 },
          properties: { skIcon: 'anchorage' },
        },
        c: { name: 'No position here', properties: { skIcon: 'hazard' } },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const notes = (await fetchNotes('http://pi', 'tok', [-84, 42, -83, 43])) ?? [];
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatchObject({
      id: 'a',
      name: 'Harbor Marina',
      position: { latitude: 42.6, longitude: -83.5 },
      category: 'marina',
      skIcon: 'marina',
      url: 'https://example/poi/1',
      source: 'activecaptain',
      attribution: 'Data from Garmin ActiveCaptain',
    });
    // name falls back to title; category from skIcon.
    expect(notes[1]).toMatchObject({ name: 'Quiet Cove', category: 'anchorage' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/signalk/v2/api/resources/notes?');
    expect(url).toContain('bbox=');
    expect(url).not.toContain('provider=');
    expect((init as RequestInit).headers).toEqual({ Authorization: 'Bearer tok' });
  });

  it('returns undefined on an error response so the overlay keeps its markers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(400, { state: 'FAILED' })));
    expect(await fetchNotes('http://pi', undefined, [0, 0, 1, 1])).toBeUndefined();
  });

  it('returns undefined when the fetch throws so the overlay keeps its markers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')));
    expect(await fetchNotes('http://pi', undefined, [0, 0, 1, 1])).toBeUndefined();
  });

  it('returns an empty list for a reachable area with no notes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, {})));
    expect(await fetchNotes('http://pi', undefined, [0, 0, 1, 1])).toEqual([]);
  });
});
