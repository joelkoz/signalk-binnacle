import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  capabilitiesFromControls,
  discoverRadars,
  fetchCapabilities,
  spokesUrl,
  writeControl,
} from './radar-client';
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

function capabilitiesResponse(controls: Record<string, unknown>): () => Promise<Response> {
  return async () => new Response(JSON.stringify({ controls }), { status: 200 });
}

describe('fetchCapabilities', () => {
  it('parses the object-keyed capabilities map into control definitions', async () => {
    // The radar API serves `controls` as an object keyed by control id, each carrying a `dataType`
    // and flat minValue/maxValue/stepValue/units, with `hasAuto` for an automatic mode.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        capabilitiesResponse({
          gain: {
            id: 4,
            name: 'Gain',
            dataType: 'number',
            minValue: 0,
            maxValue: 100,
            stepValue: 1,
            hasAuto: true,
          },
          rain: { id: 6, name: 'Rain Clutter', dataType: 'number', minValue: 0, maxValue: 100 },
        }),
      ),
    );
    const caps = await fetchCapabilities('http://boat.local', undefined, 'nav1034A');
    expect(caps?.controls.map((c) => c.id)).toEqual(['gain', 'rain']);
    const gain = caps?.controls.find((c) => c.id === 'gain');
    expect(gain?.type).toBe('number');
    expect(gain?.range).toEqual({ min: 0, max: 100, step: 1 });
    expect(gain?.modes).toEqual(['auto', 'manual']);
    expect(caps?.controls.find((c) => c.id === 'rain')?.modes).toBeUndefined();
  });

  it('parses an enum control from descriptions, restricted to validValues', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        capabilitiesResponse({
          mode: {
            id: 1,
            name: 'Mode',
            dataType: 'enum',
            descriptions: { '0': 'Harbor', '1': 'Offshore', '2': 'Bird' },
            validValues: [0, 1],
          },
        }),
      ),
    );
    const caps = await fetchCapabilities('http://boat.local', undefined, 'nav1034A');
    const mode = caps?.controls.find((c) => c.id === 'mode');
    expect(mode?.type).toBe('enum');
    expect(mode?.values).toEqual([
      { value: 0, label: 'Harbor' },
      { value: 1, label: 'Offshore' },
    ]);
  });

  it('skips controls whose dataType has no widget (sector, button, string)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        capabilitiesResponse({
          gain: { id: 4, name: 'Gain', dataType: 'number', minValue: 0, maxValue: 100 },
          noTransmit: {
            id: 35,
            name: 'No Transmit',
            dataType: 'sector',
            minValue: -3.14,
            maxValue: 3.14,
          },
          clear: { id: 15, name: 'Clear trails', dataType: 'button' },
          label: { id: 53, name: 'Custom name', dataType: 'string' },
        }),
      ),
    );
    const caps = await fetchCapabilities('http://boat.local', undefined, 'nav1034A');
    expect(caps?.controls.map((c) => c.id)).toEqual(['gain']);
  });

  it('marks an isReadOnly control read-only', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        capabilitiesResponse({
          txTime: {
            id: 47,
            name: 'Transmit time',
            dataType: 'number',
            minValue: 0,
            maxValue: 100,
            isReadOnly: true,
          },
        }),
      ),
    );
    const caps = await fetchCapabilities('http://boat.local', undefined, 'nav1034A');
    expect(caps?.controls[0].readOnly).toBe(true);
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
        capabilitiesResponse({
          gain: { id: 4, name: 'Gain', dataType: 'number', minValue: 'x', maxValue: 100 },
        }),
      ),
    );
    const caps = await fetchCapabilities('http://boat.local', undefined, 'nav1034A');
    expect(caps?.controls[0].range).toBeUndefined();
  });
});

describe('capabilitiesFromControls', () => {
  it('synthesizes numeric control definitions from a discovery, with auto where reported', () => {
    const defs = capabilitiesFromControls({
      ...radar,
      controls: { gain: { value: 28, auto: true }, sea: { value: 10 } },
    });
    expect(defs.map((d) => d.id)).toEqual(['gain', 'sea']);
    expect(defs.every((d) => d.type === 'number')).toBe(true);
    expect(defs.find((d) => d.id === 'gain')?.modes).toEqual(['auto', 'manual']);
    expect(defs.find((d) => d.id === 'sea')?.modes).toBeUndefined();
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
    const result = await writeControl('http://boat.local', undefined, 'nav1034A', 'gain', {
      value: 50,
    });
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(capturedUrl).toBe(`http://boat.local${RADARS_PATH}/nav1034A/controls/gain`);
    expect(capturedBody).toEqual({ value: 50 });
  });

  it('PUTs { auto } with no value so the server does not drop the auto flag', async () => {
    let capturedBody: unknown;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        capturedBody = JSON.parse(init.body as string);
        return new Response('', { status: 200 });
      }),
    );
    await writeControl('http://boat.local', undefined, 'nav1034A', 'gain', { auto: true });
    expect(capturedBody).toEqual({ auto: true });
  });

  it('returns ok false and the status code on a 403', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 403 })),
    );
    const result = await writeControl('http://boat.local', 'tok', 'nav1034A', 'gain', {
      value: 50,
    });
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
    const result = await writeControl('http://boat.local', undefined, 'nav1034A', 'gain', {
      value: 50,
    });
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
    await writeControl('http://boat.local', undefined, 'nav1034A', 'sector/blank', { value: 10 });
    expect(capturedUrl).toContain('sector%2Fblank');
  });
});
