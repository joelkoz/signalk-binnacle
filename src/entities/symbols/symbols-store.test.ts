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
  it('resolves a qualified alias exactly', () => {
    const flag = sym({ aliases: ['custom:flag', 'fsk:dive-site'] });
    const store = new SymbolsStore('http://pi', undefined, [flag]);
    expect(store.resolve('custom:flag')).toBe(flag);
    expect(store.resolve('fsk:dive-site')).toBe(flag);
    expect(store.resolve('fsk:other')).toBeUndefined();
  });

  it('resolves an unqualified id when exactly one symbol carries it', () => {
    const flag = sym({});
    const store = new SymbolsStore('http://pi', undefined, [flag]);
    expect(store.resolve('flag')).toBe(flag);
  });

  it('returns undefined for an ambiguous unqualified id', () => {
    const a = sym({ uuid: 'a', aliases: ['custom:anchor'] });
    const b = sym({ uuid: 'b', aliases: ['fsk:anchor'] });
    const store = new SymbolsStore('http://pi', undefined, [a, b]);
    expect(store.resolve('anchor')).toBeUndefined();
    expect(store.resolve('custom:anchor')).toBe(a);
    expect(store.resolve('fsk:anchor')).toBe(b);
  });

  it('one symbol carrying the same id in two namespaces is not ambiguous', () => {
    const flag = sym({ aliases: ['custom:flag', 'fsk:flag'] });
    const store = new SymbolsStore('http://pi', undefined, [flag]);
    expect(store.resolve('flag')).toBe(flag);
  });

  it('default:id always falls back to the built-in (returns undefined)', () => {
    const store = new SymbolsStore('http://pi', undefined, [sym({})]);
    expect(store.resolve('default:flag')).toBeUndefined();
  });

  it('filters by role when the symbol declares roles', () => {
    const noteOnly = sym({ roles: ['note'] });
    const store = new SymbolsStore('http://pi', undefined, [noteOnly]);
    expect(store.resolve('flag', 'note')).toBe(noteOnly);
    expect(store.resolve('flag', 'waypoint')).toBeUndefined();
  });

  it('a symbol with no declared roles matches any role', () => {
    const store = new SymbolsStore('http://pi', undefined, [sym({})]);
    expect(store.resolve('flag', 'waypoint')).toBeDefined();
  });

  it('forRole lists only symbols declaring that role', () => {
    const note = sym({ uuid: 'n', aliases: ['custom:n'], roles: ['note'] });
    const both = sym({ uuid: 'b', aliases: ['custom:b'], roles: ['note', 'waypoint'] });
    const none = sym({ uuid: 'x', aliases: ['custom:x'] });
    const store = new SymbolsStore('http://pi', undefined, [note, both, none]);
    expect(store.forRole('note')).toEqual([note, both]);
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
