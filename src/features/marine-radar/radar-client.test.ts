import { afterEach, describe, expect, it, vi } from 'vitest';
import { discoverRadars, fetchCapabilities, spokesUrl, writeControl } from './radar-client';
import type { RadarInfo } from './radar-types';

afterEach(() => vi.restoreAllMocks());

const RADARS_PATH = '/signalk/v2/api/vessels/self/radars';

const radar: RadarInfo = {
  id: 'nav1034A',
  name: 'Halo',
  brand: 'Navico',
  status: 'transmit',
  spokesPerRevolution: 2048,
  maxSpokeLen: 1024,
  range: 926,
  controls: { gain: { value: 50 }, rain: { value: 10, auto: false } },
  legend: [{ color: '#00ff00', label: 'weak', minValue: 0, maxValue: 63 }],
  streamUrl: 'ws://boat.local/signalk/v2/api/vessels/self/radars/nav1034A/stream',
};

describe('discoverRadars', () => {
  it('returns the parsed array on a 200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify([
              {
                id: 'nav1034A',
                name: 'Halo',
                brand: 'Navico',
                status: 'transmit',
                spokesPerRevolution: 2048,
                maxSpokeLen: 1024,
                range: 926,
                controls: { gain: { value: 50 } },
              },
            ]),
            { status: 200 },
          ),
      ),
    );
    const result = await discoverRadars('http://boat.local', undefined);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('nav1034A');
    expect(result[0].name).toBe('Halo');
    expect(result[0].status).toBe('transmit');
    expect(result[0].spokesPerRevolution).toBe(2048);
    expect(result[0].maxSpokeLen).toBe(1024);
    expect(result[0].controls.gain?.value).toBe(50);
  });

  it('returns [] on a 404 (no provider installed)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    );
    expect(await discoverRadars('http://boat.local', undefined)).toEqual([]);
  });

  it('returns [] on a 403 auth refusal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 403 })),
    );
    expect(await discoverRadars('http://boat.local', undefined)).toEqual([]);
  });

  it('returns [] when fetch throws (network error)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('network failure');
      }),
    );
    expect(await discoverRadars('http://boat.local', undefined)).toEqual([]);
  });

  it('returns [] when the body is not an array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify({ nav1034A: { id: 'nav1034A' } }), { status: 200 }),
      ),
    );
    expect(await discoverRadars('http://boat.local', undefined)).toEqual([]);
  });

  it('skips entries that have no id field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify([
              { name: 'no-id', status: 'off', spokesPerRevolution: 2048, maxSpokeLen: 1024 },
              {
                id: 'good',
                name: 'Good',
                status: 'standby',
                spokesPerRevolution: 2048,
                maxSpokeLen: 1024,
                range: 0,
                controls: {},
              },
            ]),
            { status: 200 },
          ),
      ),
    );
    const result = await discoverRadars('http://boat.local', undefined);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('good');
  });

  it('hits the v2 radars path', async () => {
    let capturedUrl = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        capturedUrl = url;
        return new Response(JSON.stringify([]), { status: 200 });
      }),
    );
    await discoverRadars('http://boat.local', undefined);
    expect(capturedUrl).toBe(`http://boat.local${RADARS_PATH}`);
  });

  it('drops legend entries that have no color', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify([
              {
                id: 'r',
                name: 'R',
                status: 'transmit',
                spokesPerRevolution: 2048,
                maxSpokeLen: 1024,
                range: 0,
                controls: {},
                legend: [{ label: 'no color' }, { color: '#00ff00', label: 'weak' }],
              },
            ]),
            { status: 200 },
          ),
      ),
    );
    const result = await discoverRadars('http://boat.local', undefined);
    expect(result[0].legend).toEqual([
      { color: '#00ff00', label: 'weak', minValue: undefined, maxValue: undefined },
    ]);
  });
});

describe('spokesUrl', () => {
  it('uses streamUrl when present, rewriting http to ws', () => {
    const r: RadarInfo = {
      ...radar,
      streamUrl: 'http://boat.local/signalk/v2/api/vessels/self/radars/nav1034A/stream',
    };
    expect(spokesUrl('http://boat.local', r)).toBe(
      'ws://boat.local/signalk/v2/api/vessels/self/radars/nav1034A/stream',
    );
  });

  it('preserves a streamUrl that is already a ws:// URL', () => {
    expect(spokesUrl('http://boat.local', radar)).toBe(radar.streamUrl);
  });

  it('falls back to the built-in /stream path when streamUrl is absent', () => {
    const r: RadarInfo = { ...radar, streamUrl: undefined };
    expect(spokesUrl('http://boat.local', r)).toBe(`ws://boat.local${RADARS_PATH}/nav1034A/stream`);
  });

  it('reuses the origin scheme for the built-in path', () => {
    const r: RadarInfo = { ...radar, streamUrl: undefined };
    // origin uses http, so the built-in path starts with http before replacement
    const url = spokesUrl('http://boat.local', r);
    expect(url.startsWith('ws://')).toBe(true);
  });
});

describe('fetchCapabilities', () => {
  it('returns parsed controls on a 200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              controls: [
                { id: 'gain', name: 'Gain', type: 'number', range: { min: 0, max: 100 } },
                { id: 'rain', name: 'Rain Clutter', type: 'number', range: { min: 0, max: 100 } },
              ],
            }),
            { status: 200 },
          ),
      ),
    );
    const caps = await fetchCapabilities('http://boat.local', undefined, 'nav1034A');
    expect(caps?.controls).toHaveLength(2);
    expect(caps?.controls[0].id).toBe('gain');
    expect(caps?.controls[0].type).toBe('number');
  });

  it('returns undefined on a 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    );
    expect(await fetchCapabilities('http://boat.local', undefined, 'nav1034A')).toBeUndefined();
  });

  it('returns undefined when fetch throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('network failure');
      }),
    );
    expect(await fetchCapabilities('http://boat.local', undefined, 'nav1034A')).toBeUndefined();
  });

  it('collapses a malformed control range to undefined', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              controls: [{ id: 'gain', name: 'Gain', type: 'number', range: { min: 'x' } }],
            }),
            { status: 200 },
          ),
      ),
    );
    const caps = await fetchCapabilities('http://boat.local', undefined, 'nav1034A');
    expect(caps?.controls[0].range).toBeUndefined();
  });
});

describe('writeControl', () => {
  it('PUTs { value } to the single control path and returns ok true on 200', async () => {
    let capturedUrl = '';
    let capturedBody: unknown;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        capturedUrl = url;
        capturedBody = JSON.parse(init.body as string);
        return new Response('', { status: 200 });
      }),
    );
    const result = await writeControl('http://boat.local', undefined, 'nav1034A', 'gain', 50);
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(capturedUrl).toBe(`http://boat.local${RADARS_PATH}/nav1034A/controls/gain`);
    expect(capturedBody).toEqual({ value: 50 });
  });

  it('returns ok false and the status code on a 403', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 403 })),
    );
    const result = await writeControl('http://boat.local', 'tok', 'nav1034A', 'gain', 50);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
  });

  it('returns ok false and status 0 on a network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('network failure');
      }),
    );
    const result = await writeControl('http://boat.local', undefined, 'nav1034A', 'gain', 50);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(0);
  });

  it('URL-encodes a control id that contains a slash', async () => {
    let capturedUrl = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        capturedUrl = url;
        return new Response('', { status: 200 });
      }),
    );
    await writeControl('http://boat.local', undefined, 'nav1034A', 'sector/blank', 10);
    expect(capturedUrl).toContain('sector%2Fblank');
  });
});
