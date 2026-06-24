import { afterEach, describe, expect, it, vi } from 'vitest';
import { discoverRadars, spokesUrl, writeControl } from './radar-client';
import type { RadarInfo } from './radar-types';

afterEach(() => vi.restoreAllMocks());

const radar: RadarInfo = {
  id: 'nav1034A',
  name: 'Halo',
  spokes: 2048,
  maxSpokeLen: 1024,
  spokeDataUrl: 'ws://boat.local/signalk/v2/api/vessels/self/radars/nav1034A/spokes',
  legend: { pixels: [] },
};

describe('discoverRadars', () => {
  it('returns mayara radars from the v2 object-map discovery', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/signalk/v2/api/vessels/self/radars')) {
          return new Response(
            JSON.stringify({
              nav1034A: {
                id: 'nav1034A',
                name: 'Halo',
                spokes: 2048,
                maxSpokeLen: 1024,
                legend: { pixels: [] },
              },
            }),
            { status: 200 },
          );
        }
        return new Response('', { status: 404 });
      }),
    );
    const out = await discoverRadars('', undefined);
    expect(out?.provider).toBe('mayara');
    expect(out?.radars[0].id).toBe('nav1034A');
  });

  it('falls back to the wdantuma plugin path when mayara 404s', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/plugins/radar-sk/v1/api/radars')) {
          return new Response(
            JSON.stringify({
              r0: {
                id: 'r0',
                name: 'Garmin',
                spokes: 1024,
                maxSpokeLen: 512,
                streamUrl: 'http://localhost:3001/v1/api/stream/r0',
                legend: { pixels: [] },
              },
            }),
            { status: 200 },
          );
        }
        return new Response('', { status: 404 });
      }),
    );
    const out = await discoverRadars('', undefined);
    expect(out?.provider).toBe('wdantuma');
    expect(out?.radars[0].streamUrl).toContain('stream/r0');
  });

  it('returns undefined when neither provider answers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    );
    expect(await discoverRadars('', undefined)).toBeUndefined();
  });

  it('does not probe the wdantuma fallback when mayara answers with no radars', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url);
        // mayara present (HTTP 200) but lists no radars; wdantuma would 404 if probed.
        if (url.includes('/signalk/v2/api/vessels/self/radars')) {
          return new Response('{}', { status: 200 });
        }
        return new Response('', { status: 404 });
      }),
    );
    expect(await discoverRadars('', undefined)).toBeUndefined();
    expect(urls.some((u) => u.includes('/plugins/radar-sk/'))).toBe(false);
  });
});

describe('spokesUrl', () => {
  it('uses spokeDataUrl when present', () => {
    expect(spokesUrl('', 'mayara', radar)).toBe(radar.spokeDataUrl);
  });

  it('swaps http to ws for a wdantuma streamUrl', () => {
    const w: RadarInfo = {
      ...radar,
      spokeDataUrl: undefined,
      streamUrl: 'http://localhost:3001/v1/api/stream/r0',
    };
    expect(spokesUrl('', 'wdantuma', w)).toBe('ws://localhost:3001/v1/api/stream/r0');
  });
});

describe('writeControl', () => {
  it('PUTs the single-id path, then the doubled-id path on 404', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        return new Response('', {
          status: url.endsWith('/gain') && calls.length === 1 ? 404 : 200,
        });
      }),
    );
    const ok = await writeControl('', undefined, 'mayara', 'nav1034A', 'gain', 50, 'percent');
    expect(ok).toBe(true);
    expect(calls[0]).toContain('/radars/nav1034A/controls/gain');
    expect(calls[1]).toContain('/radars/nav1034A/controls/nav1034A/gain');
  });
});
