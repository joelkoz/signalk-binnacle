import { isRecord, uuidv4 } from '$shared/lib';
import { PersistedValue } from '$shared/settings';
import type { PlotterExtension, WidgetContribution } from '$shared/signalk';
import type { ExtContext, HostAdapters, WidgetPlacement } from './adapters';
import { PlotterExtFilters } from './filters.svelte';
import type { ResourceFilter } from './match';
import { ExtRelay, type HostBusConnection } from './relay';
import { PlotterExtState, type StateScope } from './state-store';

// The host orchestration store. It loads the offerable extensions, owns the on-chart widget layout
// and the open-panel UI state, builds the per-context host API method handlers, and delegates event
// routing and the Signal K relay to a non-reactive ExtRelay. It is host-agnostic: everything it
// cannot reach from the entities layer arrives as injected adapters, so it is unit testable with
// fakes and the Svelte components only have to wire iframes and the bus to it.

export type ExtMethodHandler = (params: unknown) => unknown | Promise<unknown>;

const PLACEMENTS_KEY = 'binnacle:plotterext:layout';

function asRecord(params: unknown): Record<string, unknown> {
  return isRecord(params) ? params : {};
}

function isResourceFilter(value: unknown): value is ResourceFilter {
  if (!value || typeof value !== 'object') return false;
  const mode = (value as { mode?: unknown }).mode;
  return mode === 'include' || mode === 'exclude';
}

export class PlotterExtHost {
  readonly #adapters: HostAdapters;
  readonly #state: PlotterExtState;
  readonly #filters: PlotterExtFilters;
  readonly #placementStore: PersistedValue<WidgetPlacement[]>;

  // The offerable extensions, the placed widgets, the open drawer panel, the open config dialog, and
  // the open add-widget picker (an anchor area chosen via the chart context menu).
  extensions = $state<PlotterExtension[]>([]);
  placements = $state<WidgetPlacement[]>([]);
  picker = $state<{ area: string } | null>(null);
  openPanel = $state<{ extensionId: string; panelId: string } | null>(null);
  configDialog = $state<{
    extensionId: string;
    panelId?: string;
    targetInstance: string;
    targetWidget: string;
  } | null>(null);

  #known = new Set<string>();
  readonly #relay: ExtRelay;

  constructor(
    adapters: HostAdapters,
    opts: {
      state?: PlotterExtState;
      filters?: PlotterExtFilters;
      placements?: PersistedValue<WidgetPlacement[]>;
    } = {},
  ) {
    this.#adapters = adapters;
    this.#relay = new ExtRelay(adapters.signalk);
    this.#state = opts.state ?? new PlotterExtState();
    this.#filters =
      opts.filters ??
      new PlotterExtFilters((extensionId, type, active) =>
        this.#relay.publishFilters(extensionId, type, active),
      );
    this.#placementStore =
      opts.placements ?? new PersistedValue<WidgetPlacement[]>(PLACEMENTS_KEY, []);
    this.placements = this.#placementStore.value;
  }

  get filters(): PlotterExtFilters {
    return this.#filters;
  }

  // Replace the offerable extension set. Placements whose widget no longer exists are dropped, an
  // open panel or config dialog owned by a departed extension is closed, and its filters cleared.
  load(list: PlotterExtension[]): void {
    this.extensions = list;
    const present = new Set(list.map((e) => e.id));
    const widgetKeys = new Set<string>();
    for (const e of list) for (const w of e.widgets) widgetKeys.add(`${e.id}/${w.id}`);
    const kept = this.placements.filter((p) => widgetKeys.has(`${p.extensionId}/${p.widgetId}`));
    if (kept.length !== this.placements.length) this.#setPlacements(kept);
    if (this.openPanel && !present.has(this.openPanel.extensionId)) this.openPanel = null;
    if (this.configDialog && !present.has(this.configDialog.extensionId)) this.configDialog = null;
    for (const id of this.#known) if (!present.has(id)) this.#filters.removeExtension(id);
    this.#known = present;
  }

  widgetDef(extensionId: string, widgetId: string): WidgetContribution | undefined {
    return this.extensions
      .find((e) => e.id === extensionId)
      ?.widgets.find((w) => w.id === widgetId);
  }

  #setPlacements(next: WidgetPlacement[]): void {
    this.placements = next;
    this.#placementStore.set(next);
  }

  placeWidget(
    extensionId: string,
    widgetId: string,
    area: string,
    cell: [number, number],
  ): WidgetPlacement | undefined {
    const def = this.widgetDef(extensionId, widgetId);
    if (!def) return undefined;
    const placement: WidgetPlacement = {
      instanceId: uuidv4(),
      extensionId,
      widgetId,
      area,
      cell,
      size: def.size,
    };
    this.#setPlacements([...this.placements, placement]);
    return placement;
  }

  removePlacement(instanceId: string): void {
    const placement = this.placements.find((p) => p.instanceId === instanceId);
    if (!placement) return;
    this.#setPlacements(this.placements.filter((p) => p.instanceId !== instanceId));
    this.#state.removeInstance(placement.extensionId, instanceId);
    if (this.configDialog?.targetInstance === instanceId) this.configDialog = null;
  }

  // Add-widget picker control, opened from the chart context menu for a chosen anchor area.
  openPicker(area: string): void {
    this.picker = { area };
  }

  closePicker(): void {
    this.picker = null;
  }

  // Panel drawer control.
  openPanelById(extensionId: string, panelId: string): void {
    this.openPanel = { extensionId, panelId };
  }

  togglePanel(extensionId: string, panelId: string): void {
    const open = this.openPanel;
    this.openPanel =
      open && open.extensionId === extensionId && open.panelId === panelId
        ? null
        : { extensionId, panelId };
  }

  closePanel(): void {
    this.openPanel = null;
  }

  // Config dialog control, driven by a widget's long-press (ui.openConfigPanel) or the host's own
  // gesture-independent affordance. A widget with no configPanel still gets a remove-only dialog.
  openConfig(extensionId: string, instanceId: string, widgetId: string): void {
    const def = this.widgetDef(extensionId, widgetId);
    this.configDialog = {
      extensionId,
      panelId: def?.configPanel,
      targetInstance: instanceId,
      targetWidget: widgetId,
    };
  }

  toggleConfig(extensionId: string, instanceId: string, widgetId: string): void {
    if (this.configDialog?.targetInstance === instanceId) this.configDialog = null;
    else this.openConfig(extensionId, instanceId, widgetId);
  }

  closeConfig(): void {
    this.configDialog = null;
  }

  // Flattened toolbar buttons across extensions, with their owning extension id.
  get buttons(): Array<{ extensionId: string; button: PlotterExtension['buttons'][number] }> {
    return this.extensions.flatMap((e) =>
      e.buttons.map((button) => ({ extensionId: e.id, button })),
    );
  }

  dispatchButton(extensionId: string, action: PlotterExtension['buttons'][number]['action']): void {
    if (action.type === 'openPanel') this.openPanelById(extensionId, action.panel);
    else if (action.type === 'togglePanel') this.togglePanel(extensionId, action.panel);
    else if (action.type === 'sendMessage') this.publishTopic(action.topic, action.params);
  }

  #scopeFor(
    context: ExtContext,
    scope?: StateScope,
  ): { scope: StateScope; instanceId: string | null } {
    const instanceId = context.kind === 'widget' ? context.instanceId : context.targetInstance;
    const resolved: StateScope = scope ?? (instanceId ? 'instance' : 'extension');
    return { scope: resolved, instanceId };
  }

  // Build the host API method handlers for one context. Called by the component before it creates
  // the HostConnection; the handlers close over the context, never the connection (which does not
  // exist yet), so per-context subscriptions are keyed by the context object.
  handlersFor(context: ExtContext): Record<string, ExtMethodHandler> {
    const ext = context.extensionId;
    const withWidget = (fn: (instanceId: string) => void): Record<string, never> => {
      if (context.kind === 'widget' && context.instanceId) fn(context.instanceId);
      return {};
    };
    return {
      'state.get': (params) => {
        const { scope, keys } = asRecord(params) as { scope?: StateScope; keys?: string[] };
        const resolved = this.#scopeFor(context, scope);
        return { values: this.#state.get(ext, resolved.scope, resolved.instanceId, keys) };
      },
      'state.set': (params) => {
        const { scope, values } = asRecord(params) as {
          scope?: StateScope;
          values?: Record<string, unknown>;
        };
        const resolved = this.#scopeFor(context, scope);
        const keys = this.#state.set(ext, resolved.scope, resolved.instanceId, values ?? {});
        this.#relay.publishState(ext, resolved.scope, resolved.instanceId, keys);
        return {};
      },
      'signalk.subscribe': (params) => {
        const paths = (asRecord(params).paths as string[] | undefined) ?? [];
        return this.#relay.addSubscription(context, paths);
      },
      'signalk.unsubscribe': (params) => {
        const id = asRecord(params).subscriptionId as string | undefined;
        this.#relay.removeSubscription(id);
        return {};
      },
      'signalk.put': (params) => {
        const { path, value } = asRecord(params) as { path?: string; value?: unknown };
        return this.#adapters.signalk.put(path ?? '', value);
      },
      'units.get': () => ({ units: this.#adapters.units() }),
      'resources.list': (params) => {
        const { type, query } = asRecord(params) as {
          type?: string;
          query?: Record<string, unknown>;
        };
        return this.#adapters.resources.list(type ?? '', query);
      },
      'resources.setFilter': (params) => {
        const { type, filter } = asRecord(params) as { type?: string; filter?: unknown };
        // The filter arrives unvalidated from the extension; reject a malformed object rather than
        // store it, since the match engine dereferences filter.match and filter.ids on every record.
        if (type && isResourceFilter(filter)) this.#filters.setFilter(ext, type, filter);
        return {};
      },
      'resources.clearFilter': (params) => {
        const type = asRecord(params).type as string | undefined;
        if (type) this.#filters.clearFilter(ext, type);
        return {};
      },
      'map.getView': () => {
        const view = this.#adapters.map.getView();
        if (!view) throw new Error('map view unavailable');
        return view;
      },
      'map.center': (params) => {
        const { position, zoom } = asRecord(params) as {
          position?: [number, number];
          zoom?: number;
        };
        if (position) this.#adapters.map.center(position, zoom);
        return {};
      },
      'map.fitBounds': (params) => {
        const bounds = asRecord(params).bounds as [number, number, number, number] | undefined;
        if (bounds) this.#adapters.map.fitBounds(bounds);
        return {};
      },
      'ui.openPanel': (params) => {
        const panel = asRecord(params).panel as string | undefined;
        if (panel) this.openPanelById(ext, panel);
        return {};
      },
      'ui.togglePanel': (params) => {
        const panel = asRecord(params).panel as string | undefined;
        if (panel) this.togglePanel(ext, panel);
        return {};
      },
      'ui.closePanel': () => {
        if (context.kind === 'panel') {
          if (context.targetInstance) this.closeConfig();
          else this.closePanel();
        }
        return {};
      },
      'ui.openConfigPanel': () =>
        withWidget((instanceId) => this.openConfig(ext, instanceId, context.id)),
      'ui.toggleConfigPanel': () =>
        withWidget((instanceId) => this.toggleConfig(ext, instanceId, context.id)),
    };
  }

  // Connection lifecycle and the Signal K relay live on the non-reactive ExtRelay; these are thin
  // pass-throughs so the component wiring (ExtIframe, PlotterExtHostView) and the host's own
  // dispatchButton stay unchanged.
  register(conn: HostBusConnection, context: ExtContext): void {
    this.#relay.register(conn, context);
  }

  unregister(conn: HostBusConnection): void {
    this.#relay.unregister(conn);
  }

  publishTopic(topic: string, params?: unknown): void {
    this.#relay.publishTopic(topic, params);
  }

  pumpSignalK(): void {
    this.#relay.pumpSignalK();
  }

  startRelay(intervalMs = 500): void {
    this.#relay.startRelay(intervalMs);
  }

  stopRelay(): void {
    this.#relay.stopRelay();
  }
}
