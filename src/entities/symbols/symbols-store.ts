import { withTimeout } from '$shared/lib';
import { authInit, type SkSymbol } from '$shared/signalk';
import { SymbolIconRegistry } from './icon-registry';
import { type RasterizeSymbol, rasterizeSymbolSvg } from './symbol-raster';

// Two or more symbols carry the same unqualified id, so per the provider's override semantics
// it resolves to nothing and the consumer's built-in stays.
const AMBIGUOUS = Symbol('ambiguous');

// The fetched symbol set with alias and role lookup. Constructed only when the symbols
// resource type answered (fetchSymbols returned a list); on a stock server no store exists and
// every consumer keeps its built-in icons. Also loads and caches the symbols' SVG asset text,
// shared across the per-overlay icon registries so a symbol both features use fetches once.
export class SymbolsStore {
  #symbols: readonly SkSymbol[] = [];
  readonly rasterize: RasterizeSymbol;
  readonly #base: string;
  #token: string | undefined;
  readonly #byQualified = new Map<string, SkSymbol>();
  readonly #byId = new Map<string, SkSymbol | typeof AMBIGUOUS>();
  readonly #svgTexts = new Map<string, Promise<string | undefined>>();

  constructor(
    base: string,
    token: string | undefined,
    symbols: readonly SkSymbol[] = [],
    rasterize: RasterizeSymbol = rasterizeSymbolSvg,
  ) {
    this.#base = base;
    this.#token = token;
    this.rasterize = rasterize;
    this.setSymbols(symbols);
  }

  // The asset fetches authenticate with whatever token is current; set when access resolves,
  // since the store is constructed before auth for the same reason setSymbols exists.
  setAuth(token: string | undefined): void {
    this.#token = token;
  }

  // Replace the symbol set. The store is constructed empty before auth resolves (the chart mounts
  // immediately; the symbols fetch needs credentials), then filled when the fetch lands, so the
  // overlays hold one stable store reference and resolve against whatever is known at render time.
  setSymbols(symbols: readonly SkSymbol[]): void {
    this.#symbols = symbols;
    this.#byQualified.clear();
    this.#byId.clear();
    for (const symbol of symbols) {
      for (const alias of symbol.aliases) {
        this.#byQualified.set(alias, symbol);
        const id = alias.slice(alias.indexOf(':') + 1);
        const existing = this.#byId.get(id);
        if (existing && existing !== symbol) this.#byId.set(id, AMBIGUOUS);
        else this.#byId.set(id, symbol);
      }
    }
  }

  // Resolve a symbol reference per the provider's documented semantics: `default:id` always
  // falls back to the consumer's built-in, a qualified `namespace:id` matches exactly, and an
  // unqualified id matches only when exactly one provided symbol carries it (which is what lets
  // a provided symbol override a consumer built-in of the same id). A declared role list must
  // include the requested role; a symbol declaring no roles claims nothing, so it is not
  // excluded from any.
  resolve(idOrAlias: string, role?: string): SkSymbol | undefined {
    const symbol = this.lookup(idOrAlias);
    if (!symbol) return undefined;
    if (role && symbol.roles.length > 0 && !symbol.roles.includes(role)) return undefined;
    return symbol;
  }

  get symbols(): readonly SkSymbol[] {
    return this.#symbols;
  }

  forRole(role: string): SkSymbol[] {
    return this.#symbols.filter((symbol) => symbol.roles.includes(role));
  }

  createIconRegistry(): SymbolIconRegistry {
    return new SymbolIconRegistry(this);
  }

  // The symbol's SVG text, fetched once per uuid and cached (theme re-rasters reuse it). The
  // asset url is server-relative per the provider docs, but an absolute url passes through.
  svgText(symbol: SkSymbol): Promise<string | undefined> {
    const cached = this.#svgTexts.get(symbol.uuid);
    if (cached) return cached;
    const url = /^https?:/.test(symbol.url) ? symbol.url : `${this.#base}${symbol.url}`;
    const loading = this.loadSvgText(url);
    this.#svgTexts.set(symbol.uuid, loading);
    // A transient failure (an expired token, a flaky link) must not be negative-cached for the
    // session: dropping the entry lets the next consumer retry, while a success stays cached.
    void loading.then((text) => {
      if (text === undefined) this.#svgTexts.delete(symbol.uuid);
    });
    return loading;
  }

  private async loadSvgText(url: string): Promise<string | undefined> {
    try {
      const response = await fetch(url, withTimeout(authInit(this.#token)));
      if (!response.ok) return undefined;
      const text = await response.text();
      // A 200 that is not SVG (a proxy error page, a misrouted asset) must not reach the
      // rasterizer as a symbol.
      return text.includes('<svg') ? text : undefined;
    } catch {
      return undefined;
    }
  }

  private lookup(idOrAlias: string): SkSymbol | undefined {
    if (idOrAlias.startsWith('default:')) return undefined;
    if (idOrAlias.includes(':')) return this.#byQualified.get(idOrAlias);
    const hit = this.#byId.get(idOrAlias);
    return hit === AMBIGUOUS ? undefined : hit;
  }
}
