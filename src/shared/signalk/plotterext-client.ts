import { fetchKeyedResource, str, strArray } from './resource';

// The Plotter Extensions API (plotter-extensions-api.md, version "1"). A Signal K server plugin
// contributes optional chartplotter features (widgets, panels, buttons, headless background
// runtimes) by registering a `plotterExtensions` resource provider. This module fetches and
// structurally validates those manifests; host policy (capability gating, per-entry version
// pruning) lives in `$entities/plotter-ext`. The shapes are mirrored here rather than imported
// from a server-api package so browser and worker code never pulls in Node types.

export type WidgetSize = '1x1' | '2x1' | '1x2' | '2x2';
const WIDGET_SIZES: ReadonlySet<string> = new Set<string>(['1x1', '2x1', '1x2', '2x2']);

export type Lifecycle = 'onOpen' | 'keepAlive' | 'whileEnabled';
const LIFECYCLES: ReadonlySet<string> = new Set<string>(['onOpen', 'keepAlive', 'whileEnabled']);

export interface WidgetContribution {
  id: string;
  title: string;
  type: 'iframe';
  url: string;
  size: WidgetSize;
  configPanel?: string;
  lifecycle?: Lifecycle;
  apiVersion?: string;
}

export interface PanelContribution {
  id: string;
  title: string;
  type: 'iframe';
  url: string;
  lifecycle?: Lifecycle;
  apiVersion?: string;
}

export type ButtonAction =
  | { type: 'openPanel'; panel: string }
  | { type: 'togglePanel'; panel: string }
  | { type: 'sendMessage'; topic: string; params?: unknown };

export interface ButtonContribution {
  id: string;
  title: string;
  slot: string;
  icon?: string;
  // Reserved for the symbols-resource integration; carried through but not yet rendered.
  symbol?: string;
  action: ButtonAction;
  apiVersion?: string;
}

export interface BackgroundContribution {
  id: string;
  title?: string;
  type: 'iframe';
  url: string;
  lifecycle?: Lifecycle;
  apiVersion?: string;
}

// A parsed, structurally valid extension manifest keyed by its extension id (the providing
// plugin id by convention). Unknown manifest sections and fields are ignored per the spec.
export interface PlotterExtension {
  id: string;
  name: string;
  description?: string;
  version?: string;
  apiVersion: string;
  requires: string[];
  optional: string[];
  widgets: WidgetContribution[];
  panels: PanelContribution[];
  buttons: ButtonContribution[];
  background: BackgroundContribution[];
}

const PLOTTEREXT_PATH = '/signalk/v2/api/resources/plotterExtensions';

function lifecycleOf(value: unknown): Lifecycle | undefined {
  const s = str(value);
  return s && LIFECYCLES.has(s) ? (s as Lifecycle) : undefined;
}

function widgetFromEntry(raw: unknown): WidgetContribution | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const e = raw as Record<string, unknown>;
  const id = str(e.id);
  const title = str(e.title);
  const url = str(e.url);
  const size = str(e.size);
  if (!id || !title || e.type !== 'iframe' || !url) return undefined;
  if (!size || !WIDGET_SIZES.has(size)) return undefined;
  return {
    id,
    title,
    type: 'iframe',
    url,
    size: size as WidgetSize,
    configPanel: str(e.configPanel),
    lifecycle: lifecycleOf(e.lifecycle),
    apiVersion: str(e.apiVersion),
  };
}

function panelFromEntry(raw: unknown): PanelContribution | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const e = raw as Record<string, unknown>;
  const id = str(e.id);
  const title = str(e.title);
  const url = str(e.url);
  if (!id || !title || e.type !== 'iframe' || !url) return undefined;
  return {
    id,
    title,
    type: 'iframe',
    url,
    lifecycle: lifecycleOf(e.lifecycle),
    apiVersion: str(e.apiVersion),
  };
}

function actionFromEntry(raw: unknown): ButtonAction | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const e = raw as Record<string, unknown>;
  if (e.type === 'openPanel' || e.type === 'togglePanel') {
    const panel = str(e.panel);
    return panel ? { type: e.type, panel } : undefined;
  }
  if (e.type === 'sendMessage') {
    const topic = str(e.topic);
    return topic ? { type: 'sendMessage', topic, params: e.params } : undefined;
  }
  return undefined;
}

function buttonFromEntry(raw: unknown): ButtonContribution | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const e = raw as Record<string, unknown>;
  const id = str(e.id);
  const title = str(e.title);
  const slot = str(e.slot);
  const action = actionFromEntry(e.action);
  if (!id || !title || !slot || !action) return undefined;
  return {
    id,
    title,
    slot,
    icon: str(e.icon),
    symbol: str(e.symbol),
    action,
    apiVersion: str(e.apiVersion),
  };
}

function backgroundFromEntry(raw: unknown): BackgroundContribution | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const e = raw as Record<string, unknown>;
  const id = str(e.id);
  const url = str(e.url);
  if (!id || e.type !== 'iframe' || !url) return undefined;
  return {
    id,
    title: str(e.title),
    type: 'iframe',
    url,
    lifecycle: lifecycleOf(e.lifecycle),
    apiVersion: str(e.apiVersion),
  };
}

function contributions<T>(value: unknown, parse: (raw: unknown) => T | undefined): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const raw of value) {
    const parsed = parse(raw);
    if (parsed) out.push(parsed);
  }
  return out;
}

function manifestFromEntry(id: string, raw: unknown): PlotterExtension | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const e = raw as Record<string, unknown>;
  const name = str(e.name);
  const apiVersion = str(e.apiVersion);
  // name and apiVersion are required manifest fields; an entry missing either is not a manifest.
  if (!name || !apiVersion) return undefined;
  return {
    id,
    name,
    description: str(e.description),
    version: str(e.version),
    apiVersion,
    requires: strArray(e.requires) ?? [],
    optional: strArray(e.optional) ?? [],
    widgets: contributions(e.widgets, widgetFromEntry),
    panels: contributions(e.panels, panelFromEntry),
    buttons: contributions(e.buttons, buttonFromEntry),
    background: contributions(e.background, backgroundFromEntry),
  };
}

// Fetch the declared plotter extensions. Undefined (a 404 from a stock server with no
// plotterExtensions provider, or a transport failure) is the degrade signal: the host renders
// nothing and the app behaves exactly as it does today. A reachable but empty server returns [].
export function fetchPlotterExtensions(
  base: string,
  token?: string,
): Promise<PlotterExtension[] | undefined> {
  return fetchKeyedResource(base, [PLOTTEREXT_PATH], token, manifestFromEntry);
}
