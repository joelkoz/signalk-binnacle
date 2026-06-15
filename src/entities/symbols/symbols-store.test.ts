import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SkSymbol } from '$shared/signalk';
import { SymbolsStore } from './symbols-store';

function sym(overrides: Partial<SkSymbol>): SkSymbol {
  return {
    uuid: 'u1',
    aliases: ['custom:flag'],
    name: 'Flag',
    url: '/signalk/symbol-manager/symbols/u1.svg',
    roles: [],
    ...overrides,
  };
}

describe('SymbolsStore resolve', () => {
  it('resolves any qualified alias regardless of namespace, since the image is shared', () => {
    const flag = sym({ aliases: ['custom:flag', 'fsk:dive-site'] });
    const store = new SymbolsStore('http://pi', undefined, [flag]);
    expect(store.resolve('custom:flag')).toBe(flag);
    // A foreign vendor alias another app stored still renders the same shared symbol.
    expect(store.resolve('fsk:dive-site')).toBe(flag);
  });

  it('treats the binnacle namespace as the host built-in table for bare and default refs', () => {
    const dive = sym({ uuid: 'd', aliases: ['binnacle:dive-site'], roles: ['waypoint'] });
    const store = new SymbolsStore('http://pi', undefined, [dive]);
    expect(store.resolve('binnacle:dive-site')).toBe(dive); // explicit
    expect(store.resolve('dive-site')).toBe(dive); // bare id -> host built-in
    expect(store.resolve('default:dive-site')).toBe(dive); // explicit built-in -> host table
  });

  it('does not resolve a bare id against a custom symbol (custom is reached qualified)', () => {
    const flag = sym({ aliases: ['custom:flag'] });
    const store = new SymbolsStore('http://pi', undefined, [flag]);
    expect(store.resolve('custom:flag')).toBe(flag);
    expect(store.resolve('flag')).toBeUndefined();
  });

  it('renders an exact foreign alias but never substitutes for an absent reference', () => {
    const foreign = sym({ uuid: 'f', aliases: ['fsk:marina', 'garmin:Marina'] });
    const store = new SymbolsStore('http://pi', undefined, [foreign]);
    expect(store.resolve('fsk:marina')).toBe(foreign); // exact foreign alias renders
    expect(store.resolve('marina')).toBeUndefined(); // bare -> binnacle:marina -> none
    expect(store.resolve('opencpn:marina')).toBeUndefined(); // no such alias, no substitution
  });

  it('default:id resolves only within the host table, never a provider override', () => {
    // A custom dive-flag must not satisfy default:dive-flag; only binnacle:dive-flag would.
    const store = new SymbolsStore('http://pi', undefined, [
      sym({ aliases: ['custom:dive-flag'] }),
    ]);
    expect(store.resolve('default:dive-flag')).toBeUndefined();
  });

  it('filters by role when the symbol declares roles', () => {
    const noteOnly = sym({ aliases: ['binnacle:flag'], roles: ['note'] });
    const store = new SymbolsStore('http://pi', undefined, [noteOnly]);
    expect(store.resolve('flag', 'note')).toBe(noteOnly);
    expect(store.resolve('flag', 'waypoint')).toBeUndefined();
  });

  it('a symbol with no declared roles matches any role', () => {
    const store = new SymbolsStore('http://pi', undefined, [sym({ aliases: ['binnacle:flag'] })]);
    expect(store.resolve('flag', 'waypoint')).toBeDefined();
  });

  it('forRole offers only binnacle/custom symbols declaring that role', () => {
    const note = sym({ uuid: 'n', aliases: ['custom:n'], roles: ['note'] });
    const both = sym({ uuid: 'b', aliases: ['binnacle:b'], roles: ['note', 'waypoint'] });
    const none = sym({ uuid: 'x', aliases: ['custom:x'] });
    const foreign = sym({ uuid: 'f', aliases: ['fsk:wp'], roles: ['waypoint'] });
    const store = new SymbolsStore('http://pi', undefined, [note, both, none, foreign]);
    expect(store.forRole('note')).toEqual([note, both]);
    // foreign declares 'waypoint' but is not adopted (fsk), so it is not offered.
    expect(store.forRole('waypoint')).toEqual([both]);
  });
});

describe('SymbolsStore svgText', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fetches the server-relative asset with auth and caches it per uuid', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '<svg xmlns="http://www.w3.org/2000/svg"/>',
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
    const symbol = sym({});
    const store = new SymbolsStore('http://pi', 'tok', [symbol]);
    expect(await store.svgText(symbol)).toContain('<svg');
    expect(await store.svgText(symbol)).toContain('<svg');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://pi/signalk/symbol-manager/symbols/u1.svg');
    expect((init as RequestInit).headers).toEqual({ Authorization: 'Bearer tok' });
  });

  it('returns undefined for a non-OK response, a non-SVG body, or a thrown fetch', async () => {
    const symbol = sym({});
    const freshText = (): Promise<string | undefined> =>
      new SymbolsStore('http://pi', undefined, [symbol]).svgText(symbol);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false } as unknown as Response));
    expect(await freshText()).toBeUndefined();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: async () => '<html>nope</html>' } as never),
    );
    expect(await freshText()).toBeUndefined();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')));
    expect(await freshText()).toBeUndefined();
  });

  it('passes an absolute asset url through unchanged', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, text: async () => '<svg/>' } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
    const symbol = sym({ url: 'https://cdn.example/flag.svg' });
    await new SymbolsStore('http://pi', undefined, [symbol]).svgText(symbol);
    expect(fetchMock.mock.calls[0][0]).toBe('https://cdn.example/flag.svg');
  });
});
