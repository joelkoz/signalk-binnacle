import type { PlotterExtension } from '$shared/signalk';

// Host policy for the Plotter Extensions API. The wire shapes and structural parsing live in
// `$shared/signalk` (plotterext-client); this module owns what Binnacle, as a host, advertises
// and which manifests it is willing to offer. See plotter-extensions-api.md.

// The extension API major version this host implements.
export const API_VERSION = '1';

// Capability identifiers Binnacle advertises in the handshake. A capability is advertised only
// when its feature is wired, so this list grows phase by phase; an extension whose `requires`
// names a capability not in this set is not offered.
export type HostCapability =
  | 'widgets'
  | 'panels.iframe'
  | 'background.iframe'
  | 'buttons'
  | 'signalk.stream'
  | 'signalk.put'
  | 'units'
  | 'map'
  | 'resources'
  | 'resources.filter'
  | 'ui';

export const HOST_CAPABILITIES: readonly HostCapability[] = [
  'widgets',
  'panels.iframe',
  'background.iframe',
  'buttons',
  'signalk.stream',
  'signalk.put',
  'units',
  'map',
  'resources',
  'resources.filter',
  'ui',
];

function majorOf(apiVersion: string): number | undefined {
  const n = Number.parseInt(apiVersion, 10);
  return Number.isFinite(n) ? n : undefined;
}

// Whether the host should offer a manifest at all: its API major version must not exceed the
// host's, and every `requires` capability must be supported. Unknown ids in `optional` are
// ignored (the extension runs without them); unknown ids in `requires` make it incompatible.
export function isOfferable(
  manifest: PlotterExtension,
  capabilities: readonly string[] = HOST_CAPABILITIES,
  apiVersion: string = API_VERSION,
): boolean {
  const host = majorOf(apiVersion);
  const want = majorOf(manifest.apiVersion);
  if (host === undefined || want === undefined || want > host) return false;
  const caps = new Set(capabilities);
  return manifest.requires.every((cap) => caps.has(cap));
}

function entryOfferable(apiVersion: string | undefined, host: number): boolean {
  if (apiVersion === undefined) return true;
  const want = majorOf(apiVersion);
  return want !== undefined && want <= host;
}

// Drop the contributions that target a newer host API than this host implements, keeping the
// rest. A contribution may declare its own `apiVersion` when it needs a newer host API than the
// manifest baseline; the host silently omits those it cannot satisfy.
export function pruneExtension(
  manifest: PlotterExtension,
  apiVersion: string = API_VERSION,
): PlotterExtension {
  const host = majorOf(apiVersion) ?? 0;
  return {
    ...manifest,
    widgets: manifest.widgets.filter((c) => entryOfferable(c.apiVersion, host)),
    panels: manifest.panels.filter((c) => entryOfferable(c.apiVersion, host)),
    buttons: manifest.buttons.filter((c) => entryOfferable(c.apiVersion, host)),
    background: manifest.background.filter((c) => entryOfferable(c.apiVersion, host)),
  };
}

// The manifests this host will offer, gated by version and required capabilities and pruned of
// contributions that target a newer host API. Input is the structurally valid list from
// fetchPlotterExtensions; output is what the host instantiates.
export function offerableExtensions(
  list: readonly PlotterExtension[],
  capabilities: readonly string[] = HOST_CAPABILITIES,
  apiVersion: string = API_VERSION,
): PlotterExtension[] {
  return list
    .filter((m) => isOfferable(m, capabilities, apiVersion))
    .map((m) => pruneExtension(m, apiVersion));
}
