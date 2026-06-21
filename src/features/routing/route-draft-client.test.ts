import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubFetch } from '$shared/testing/fetch-stub';
import { type DraftRouteRequest, draftRoute, ROUTE_DRAFT_PATH } from './route-draft-client';
import {
  ROUTE_DRAFT_PLUGIN_ID,
  ROUTE_DRAFT_PLUGIN_MIN_VERSION,
  routeDraftAvailable,
} from './route-draft-parse';

afterEach(() => vi.unstubAllGlobals());

const BASE = 'http://pi';
const TOKEN = 'tok';

const REQ: DraftRouteRequest = {
  prompt: 'Marina del Rey to Catalina Island',
  from: { latitude: 33.97, longitude: -118.45 },
  bounds: [-120, 32, -117, 35],
  units: 'metric',
};

const GOOD_WPS = [
  { latitude: 33.97, longitude: -118.45, name: 'Start' },
  { latitude: 33.35, longitude: -118.32, name: 'Avalon' },
];

const GOOD_BODY = {
  ok: true,
  waypoints: GOOD_WPS,
  name: 'Catalina run',
  note: 'Straightforward passage, watch kelp beds near Avalon.',
  destination: { name: 'Avalon', latitude: 33.35, longitude: -118.32 },
  confidence: 'high',
  fuel: { neededL: 40, aboardL: 60, marginPct: 20 },
  flags: [{ wp: 1, kind: 'fuel', message: 'Fuel available at Avalon dock.' }],
};

describe('draftRoute request', () => {
  it('POSTs to the correct URL with the bearer token and JSON body', async () => {
    const mock = stubFetch({ ok: true, body: GOOD_BODY });
    await draftRoute(BASE, TOKEN, REQ);
    const [url, init] = mock.mock.calls[0];
    expect(url).toContain('/api/route-draft');
    expect(url).toBe(`${BASE}${ROUTE_DRAFT_PATH}`);
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit & { headers: Record<string, string> }).headers.Authorization).toBe(
      `Bearer ${TOKEN}`,
    );
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent.prompt).toBe(REQ.prompt);
    expect(sent.from.latitude).toBe(REQ.from.latitude);
  });

  it('sends the full DraftRouteRequest body', async () => {
    const mock = stubFetch({ ok: true, body: GOOD_BODY });
    await draftRoute(BASE, TOKEN, REQ);
    const sent = JSON.parse((mock.mock.calls[0][1] as RequestInit).body as string);
    expect(sent.bounds).toEqual(REQ.bounds);
    expect(sent.units).toBe('metric');
  });
});

describe('draftRoute success parsing', () => {
  it('maps waypoints to the Waypoint shape (position object, optional name)', async () => {
    stubFetch({ ok: true, body: GOOD_BODY });
    const result = await draftRoute(BASE, TOKEN, REQ);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.route.waypoints).toHaveLength(2);
    expect(result.route.waypoints[0].position).toEqual({ latitude: 33.97, longitude: -118.45 });
    expect(result.route.waypoints[0].name).toBe('Start');
  });

  it('copies name, note, destination, confidence, fuel, and flags through', async () => {
    stubFetch({ ok: true, body: GOOD_BODY });
    const result = await draftRoute(BASE, TOKEN, REQ);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { route } = result;
    expect(route.name).toBe('Catalina run');
    expect(route.note).toContain('kelp');
    expect(route.destination?.name).toBe('Avalon');
    expect(route.confidence).toBe('high');
    expect(route.fuel?.neededL).toBe(40);
    expect(route.flags).toHaveLength(1);
    expect(route.flags?.[0].kind).toBe('fuel');
  });
});

describe('draftRoute error paths from ok:false body', () => {
  const okFalseBody = (error: string) => ({ ok: false, error, message: `error: ${error}` });

  it.each([
    ['budget'],
    ['no-route'],
    ['model-error'],
    ['unauthorized'],
    ['bad-request'],
  ] as const)('maps ok:false error %s through', async (code) => {
    stubFetch({ ok: true, body: okFalseBody(code) });
    const result = await draftRoute(BASE, TOKEN, REQ);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe(code);
  });

  it('falls back to model-error for unknown ok:false codes', async () => {
    stubFetch({ ok: true, body: { ok: false, error: 'some-new-code' } });
    const result = await draftRoute(BASE, TOKEN, REQ);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('model-error');
  });
});

describe('draftRoute HTTP error paths', () => {
  it('returns unauthorized on 401', async () => {
    stubFetch({ ok: false, status: 401 });
    const result = await draftRoute(BASE, TOKEN, REQ);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('unauthorized');
  });

  it('returns unauthorized on 403', async () => {
    stubFetch({ ok: false, status: 403 });
    const result = await draftRoute(BASE, TOKEN, REQ);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('unauthorized');
  });

  it('returns unreachable on 5xx', async () => {
    stubFetch({ ok: false, status: 503 });
    const result = await draftRoute(BASE, TOKEN, REQ);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('unreachable');
  });

  it('returns bad-request on 4xx (non-auth)', async () => {
    stubFetch({ ok: false, status: 400 });
    const result = await draftRoute(BASE, TOKEN, REQ);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('bad-request');
  });

  it('reads ok:false body code from a non-ok response when the code is known', async () => {
    stubFetch({ ok: false, status: 422, body: { ok: false, error: 'budget' } });
    const result = await draftRoute(BASE, TOKEN, REQ);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('budget');
  });
});

describe('draftRoute network and parse failures', () => {
  it('returns unreachable when fetch rejects (network down)', async () => {
    stubFetch('reject');
    const result = await draftRoute(BASE, TOKEN, REQ);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('unreachable');
  });

  it('returns unreachable on unparseable JSON body', async () => {
    const mock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('bad json');
      },
    })) as unknown as typeof fetch;
    vi.stubGlobal('fetch', mock);
    const result = await draftRoute(BASE, TOKEN, REQ);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('unreachable');
  });

  it('returns timeout when the AbortSignal fires a TimeoutError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const err = new DOMException('signal timed out', 'TimeoutError');
        throw err;
      }),
    );
    const result = await draftRoute(BASE, TOKEN, REQ);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('timeout');
  });
});

describe('draftRoute shape validation', () => {
  const badShapeBody = (wps: unknown) => ({ ok: true, waypoints: wps, note: '' });

  it('rejects fewer than 2 waypoints', async () => {
    stubFetch({ ok: true, body: badShapeBody([GOOD_WPS[0]]) });
    const result = await draftRoute(BASE, TOKEN, REQ);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('no-route');
  });

  it('rejects waypoints with out-of-range latitude', async () => {
    stubFetch({
      ok: true,
      body: badShapeBody([
        { latitude: 91, longitude: 0 },
        { latitude: 0, longitude: 0 },
      ]),
    });
    const result = await draftRoute(BASE, TOKEN, REQ);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('no-route');
  });

  it('rejects waypoints with out-of-range longitude', async () => {
    stubFetch({
      ok: true,
      body: badShapeBody([
        { latitude: 0, longitude: -181 },
        { latitude: 0, longitude: 0 },
      ]),
    });
    const result = await draftRoute(BASE, TOKEN, REQ);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('no-route');
  });

  it('rejects string coordinates', async () => {
    stubFetch({
      ok: true,
      body: badShapeBody([
        { latitude: '33.97', longitude: -118.45 },
        { latitude: 0, longitude: 0 },
      ]),
    });
    const result = await draftRoute(BASE, TOKEN, REQ);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('no-route');
  });

  it('rejects lat/lng-aliased keys', async () => {
    stubFetch({
      ok: true,
      body: badShapeBody([
        { lat: 33.97, lng: -118.45 },
        { lat: 0, lng: 0 },
      ]),
    });
    const result = await draftRoute(BASE, TOKEN, REQ);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('no-route');
  });

  it('rejects lon alias', async () => {
    stubFetch({
      ok: true,
      body: badShapeBody([
        { latitude: 33.97, lon: -118.45 },
        { latitude: 0, longitude: 0 },
      ]),
    });
    const result = await draftRoute(BASE, TOKEN, REQ);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('no-route');
  });

  it('drops flags whose wp index is out of range', async () => {
    const body = {
      ...GOOD_BODY,
      flags: [
        { wp: 0, kind: 'fuel', message: 'ok flag' },
        { wp: 99, kind: 'other', message: 'out of range' },
      ],
    };
    stubFetch({ ok: true, body });
    const result = await draftRoute(BASE, TOKEN, REQ);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.route.flags).toHaveLength(1);
    expect(result.route.flags?.[0].wp).toBe(0);
  });

  it('drops flags whose leg index is out of range', async () => {
    const body = {
      ...GOOD_BODY,
      flags: [
        { leg: 0, kind: 'land', message: 'valid leg' },
        { leg: 5, kind: 'land', message: 'too far' },
      ],
    };
    stubFetch({ ok: true, body });
    const result = await draftRoute(BASE, TOKEN, REQ);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.route.flags).toHaveLength(1);
    expect(result.route.flags?.[0].leg).toBe(0);
  });
});

describe('draftRoute trust-boundary validation', () => {
  it('does not throw and drops a null or non-object flag element', async () => {
    stubFetch({ ok: true, body: { ...GOOD_BODY, flags: [null, 'text', 42] } });
    const result = await draftRoute(BASE, TOKEN, REQ);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.route.flags).toBeUndefined();
  });

  it('drops a flag with an unknown kind', async () => {
    stubFetch({ ok: true, body: { ...GOOD_BODY, flags: [{ kind: 'bogus', message: 'x' }] } });
    const result = await draftRoute(BASE, TOKEN, REQ);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.route.flags).toBeUndefined();
  });

  it('drops a flag with a non-string message', async () => {
    stubFetch({ ok: true, body: { ...GOOD_BODY, flags: [{ kind: 'fuel', message: 42 }] } });
    const result = await draftRoute(BASE, TOKEN, REQ);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.route.flags).toBeUndefined();
  });

  it('keeps only the valid flags from a mixed array', async () => {
    stubFetch({
      ok: true,
      body: {
        ...GOOD_BODY,
        flags: [null, { wp: 1, kind: 'fuel', message: 'keep' }, { kind: 'nope', message: 'drop' }],
      },
    });
    const result = await draftRoute(BASE, TOKEN, REQ);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.route.flags).toHaveLength(1);
    expect(result.route.flags?.[0].message).toBe('keep');
  });

  it('drops a fuel object whose neededL is not a finite number', async () => {
    stubFetch({ ok: true, body: { ...GOOD_BODY, fuel: { neededL: 'lots', aboardL: 60 } } });
    const result = await draftRoute(BASE, TOKEN, REQ);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.route.fuel).toBeUndefined();
  });

  it('drops a fuel object that is missing neededL', async () => {
    stubFetch({ ok: true, body: { ...GOOD_BODY, fuel: { aboardL: 60 } } });
    const result = await draftRoute(BASE, TOKEN, REQ);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.route.fuel).toBeUndefined();
  });

  it('keeps a destination that has a name, carrying only the name', async () => {
    stubFetch({
      ok: true,
      body: { ...GOOD_BODY, destination: { name: 'Avalon', latitude: 33.35, longitude: -118.32 } },
    });
    const result = await draftRoute(BASE, TOKEN, REQ);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.route.destination).toEqual({ name: 'Avalon' });
  });

  it('drops a destination with no name', async () => {
    stubFetch({
      ok: true,
      body: { ...GOOD_BODY, destination: { latitude: 33.35, longitude: -118.32 } },
    });
    const result = await draftRoute(BASE, TOKEN, REQ);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.route.destination).toBeUndefined();
  });
});

describe('draftRoute optimize fields', () => {
  const seed = [
    { latitude: 1, longitude: 2 },
    { latitude: 3, longitude: 4 },
  ];

  it('forwards an optional route array on the request body', async () => {
    const mock = stubFetch({ ok: true, body: { ...GOOD_BODY, optimized: true } });
    await draftRoute(BASE, TOKEN, { ...REQ, route: seed });
    const sent = JSON.parse((mock.mock.calls[0][1] as RequestInit).body as string);
    expect(sent.route).toEqual(seed);
  });

  it('reports the optimized marker on a successful response', async () => {
    stubFetch({ ok: true, body: { ...GOOD_BODY, optimized: true } });
    const result = await draftRoute(BASE, TOKEN, REQ);
    expect(result.ok && result.optimized).toBe(true);
  });

  it('leaves optimized falsy when the response omits the marker', async () => {
    stubFetch({ ok: true, body: GOOD_BODY });
    const result = await draftRoute(BASE, TOKEN, REQ);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.optimized).toBeFalsy();
  });
});

describe('routeDraftAvailable', () => {
  const plugins = (version: string) =>
    new Map([[ROUTE_DRAFT_PLUGIN_ID, version]]) as ReadonlyMap<string, string>;

  it('returns true when the plugin is present at the minimum version', () => {
    expect(routeDraftAvailable(plugins(ROUTE_DRAFT_PLUGIN_MIN_VERSION))).toBe(true);
  });

  it('returns true when the plugin version is above the minimum', () => {
    expect(routeDraftAvailable(plugins('1.0.0'))).toBe(true);
  });

  it('returns false when the plugin version is below the minimum', () => {
    expect(routeDraftAvailable(plugins('0.5.9'))).toBe(false);
  });

  it('returns false when the plugin is absent', () => {
    expect(routeDraftAvailable(new Map() as ReadonlyMap<string, string>)).toBe(false);
  });

  it('returns false when plugins is undefined', () => {
    expect(routeDraftAvailable(undefined)).toBe(false);
  });

  it('returns false when the version string is empty', () => {
    expect(routeDraftAvailable(plugins(''))).toBe(false);
  });
});
