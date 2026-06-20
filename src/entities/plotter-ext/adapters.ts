import type { WidgetSize } from '$shared/signalk';
import type { UnitPreferences } from './units-adapter';

// Capability adapters the host store needs but cannot reach from the entities layer (they live in
// widgets and features). App.svelte builds them over the chart commands, the Signal K client and
// store, the units store, and the resource clients, and injects them. Keeping them as interfaces
// keeps the host store host-agnostic and unit testable with fakes.

export interface MapView {
  center: [number, number];
  zoom: number;
  bounds: [number, number, number, number];
}

export interface MapAdapter {
  getView(): MapView | undefined;
  center(position: [number, number], zoom?: number): void;
  fitBounds(bounds: [number, number, number, number]): void;
}

export interface SignalKValue {
  value: unknown;
  timestamp?: string;
  $source?: string;
}

export interface SignalKAdapter {
  // Ensure the host's multiplexed upstream subscription covers these paths.
  ensurePaths(paths: readonly string[]): void;
  // The latest known value for a path, or undefined if none has arrived.
  read(path: string): SignalKValue | undefined;
  // Resolves to the server's PUT response body on success (which may be empty for a 204), and
  // rejects on a non-2xx response or a transport failure so the extension sees a real error.
  put(path: string, value: unknown): Promise<unknown>;
}

export interface ResourcesAdapter {
  list(type: string, query?: Record<string, unknown>): Promise<unknown>;
}

export type UnitsProvider = () => UnitPreferences;

export interface HostAdapters {
  map: MapAdapter;
  signalk: SignalKAdapter;
  resources: ResourcesAdapter;
  units: UnitsProvider;
}

// One extension context the host runs: a placed widget, an open panel, or a background runtime.
export type ContextKind = 'widget' | 'panel' | 'background';

export interface ExtContext {
  kind: ContextKind;
  extensionId: string;
  // The contribution's manifest-local id (widget id, panel id, or background id).
  id: string;
  // A widget placement's stable instance id; null for panels and background runtimes.
  instanceId: string | null;
  // For a configuration panel, the widget instance and manifest-local id it configures.
  targetInstance: string | null;
  targetWidget: string | null;
}

// A placed widget instance in the on-chart layout. Persisted so a layout survives a reload.
export interface WidgetPlacement {
  instanceId: string;
  extensionId: string;
  widgetId: string;
  area: string;
  // Top-left cell the widget occupies in the area's 2x2 grid, [col, row] with col,row in {0,1}.
  cell: [number, number];
  size: WidgetSize;
}
