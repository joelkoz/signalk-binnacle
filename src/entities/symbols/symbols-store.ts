import { withTimeout } from '$shared/lib';
import { authInit, type SkSymbol } from '$shared/signalk';
import { SymbolIconRegistry } from './icon-registry';
import { type RasterizeSymbol, rasterizeSymbolSvg } from './symbol-raster';

// Binnacle's own vendor namespace, the user-symbol namespace, and the reserved built-in namespace.
// Rendering and offering are split: a stored reference in ANY namespace renders as named (the
// symbol image is shared across apps), while the host built-in table and the icon pickers stay
// scoped. The host built-in table IS the `binnacle:` namespace in the shared library, so a bare id
// and an explicit `default:<id>` both resolve to `binnacle:<id>`. The pickers offer only `binnacle`
// and `custom` symbols. See the Symbols API resolution rules.
export const BINNACLE_NS = 'binnacle';
export const CUSTOM_NS = 'custom';
const DEFAULT_NS = 'default';

// The fetched symbol set with alias and role lookup. Constructed only when the symbols
// resource type answered (fetchSymbols returned a list); on a stock server no store exists and
// every consumer keeps its built-in icons. Also loads and caches the symbols' SVG asset text,
// shared across the per-overlay icon registries so a symbol both features use fetches once.
export class SymbolsStore {
  #symbols: readonly SkSymbol[] = [];
  readonly rasterize: RasterizeSymbol;
  readonly #base: string;
  #token: string | undefined;
  // Every alias of every namespace, so a reference stored by any app renders as named.
  readonly #byRef = new Map<string, SkSymbol>();
  // Symbols carrying at least one adopted (binnacle/custom) alias, for the role-filtered pickers.
  #adopted: readonly SkSymbol[] = [];
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
    this.#byRef.clear();
    const adopted: SkSymbol[] = [];
    for (const symbol of symbols) {
      let isAdopted = false;
      for (const alias of symbol.aliases) {
        // Index every alias of every namespace. A reference another app stored (fsk:dive-site, a
        // plugin's my-plugin:icon, ...) must render as named: the image is shared, and only the
        // host built-in table and the pickers are namespace-scoped. `namespace:id` is globally
        // unique per the spec, so first-wins is enough.
        if (!this.#byRef.has(alias)) this.#byRef.set(alias, symbol);
        const colon = alias.indexOf(':');
        const namespace = colon === -1 ? '' : alias.slice(0, colon);
        if (namespace === BINNACLE_NS || namespace === CUSTOM_NS) isAdopted = true;
      }
      if (isAdopted) adopted.push(symbol);
    }
    this.#adopted = adopted;
  }

  // Resolve a stored symbol reference. A qualified `namespace:id` (in ANY namespace) matches the
  // symbol carrying that exact alias and renders as named, with no substitution when absent. A
  // bare id and an explicit `default:<id>` both resolve within the host built-in table, which is
  // the `binnacle:` namespace, so a Binnacle waypoint icon survives even when another app stored
  // `default:dive-site`. A declared role list must include the requested role; a symbol declaring
  // no roles claims nothing, so it is not excluded from any.
  resolve(idOrAlias: string, role?: string): SkSymbol | undefined {
    const symbol = this.#lookup(idOrAlias);
    if (!symbol) return undefined;
    if (role && symbol.roles.length > 0 && !symbol.roles.includes(role)) return undefined;
    return symbol;
  }

  get symbols(): readonly SkSymbol[] {
    return this.#symbols;
  }

  // Adopted symbols (binnacle/custom) declaring the given role, for the icon pickers.
  forRole(role: string): SkSymbol[] {
    return this.#adopted.filter((symbol) => symbol.roles.includes(role));
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
    const loading = this.#loadSvgText(url);
    this.#svgTexts.set(symbol.uuid, loading);
    // A transient failure (an expired token, a flaky link) must not be negative-cached for the
    // session: dropping the entry lets the next consumer retry, while a success stays cached.
    void loading
      .then((text) => {
        if (text === undefined) this.#svgTexts.delete(symbol.uuid);
      })
      .catch(() => this.#svgTexts.delete(symbol.uuid));
    return loading;
  }

  async #loadSvgText(url: string): Promise<string | undefined> {
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

  #lookup(idOrAlias: string): SkSymbol | undefined {
    const colon = idOrAlias.indexOf(':');
    // Bare id: the host built-in table is the `binnacle:` namespace.
    if (colon === -1) return this.#byRef.get(`${BINNACLE_NS}:${idOrAlias}`);
    const namespace = idOrAlias.slice(0, colon);
    // Explicit built-in: the host table only, never a provider override the user rejected.
    if (namespace === DEFAULT_NS) {
      return this.#byRef.get(`${BINNACLE_NS}:${idOrAlias.slice(colon + 1)}`);
    }
    // Any other qualified alias renders as named when present in the shared library.
    return this.#byRef.get(idOrAlias);
  }
}
