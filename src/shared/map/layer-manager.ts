import type { MapThemePaint } from './map-theme';
import { installSentinels, sentinelId } from './sentinels';
import { type OverlayContext, type OverlayModule, Z_ORDER, type ZBand } from './types';

export interface OverlayState {
  visible: boolean;
  opacity: number;
}

// Per-layer visibility and opacity, keyed by overlay id, for save and restore.
export type LayerSettings = Record<string, OverlayState>;

export interface LayerListItem {
  id: string;
  title: string;
  visible: boolean;
  opacity: number;
  supportsOpacity: boolean;
  // A pinned layer (own vessel, active alarms) is locked to the top and cannot be reordered.
  pinned: boolean;
  // The overlay's z-band, used by the panel to group charts and depth apart from live overlays.
  band: ZBand;
  // The parent overlay id when this is a sub-layer (the panel nests it under its parent).
  parent?: string;
  // The named group this layer is a facet of, surfaced so the panel can render one group header
  // above the group's facets. See OverlayModule.group.
  group?: { id: string; title: string };
  // The Layers-panel category this layer declares. See OverlayModule.category.
  category?: string;
}

export interface LayerManagerOptions {
  // Settings to restore on register (a layer absent here takes the visible default).
  saved?: LayerSettings;
  // Called with the full settings snapshot whenever a layer's state changes.
  onChange?: (settings: LayerSettings) => void;
  // Persisted bottom-to-top order of non-pinned overlay ids, and the callback to persist it.
  savedOrder?: string[];
  onOrderChange?: (order: string[]) => void;
  // Overlay ids pinned to the top of the stack, in bottom-to-top order, so the vessel and
  // active alarms can never be hidden beneath a chart. The core stays generic: the wiring
  // decides which ids are pinned rather than the manager hardcoding any feature.
  pinned?: string[];
  // Groups of overlay ids that are mutually exclusive: enabling one hides the others in its group.
  // The wiring decides the groups (the weather area fills) rather than the manager hardcoding any.
  exclusive?: string[][];
}

export class LayerManager {
  #ctx: OverlayContext;
  #modules = new Map<string, OverlayModule>();
  #state = new Map<string, OverlayState>();
  #saved: LayerSettings;
  #onChange?: (settings: LayerSettings) => void;
  // The explicit user order (bottom to top) of non-pinned overlays; seeds the effective order.
  #explicitOrder: string[];
  #onOrderChange?: (order: string[]) => void;
  #pinned: string[];
  #exclusive: string[][];

  constructor(ctx: OverlayContext, options: LayerManagerOptions = {}) {
    this.#ctx = ctx;
    this.#saved = options.saved ?? {};
    this.#onChange = options.onChange;
    this.#explicitOrder = options.savedOrder ? [...options.savedOrder] : [];
    this.#onOrderChange = options.onOrderChange;
    this.#pinned = options.pinned ?? [];
    this.#exclusive = options.exclusive ?? [];
  }

  async register(module: OverlayModule): Promise<void> {
    await this.#addModule(module);
    this.#applyOrder();
  }

  // Register many overlays as one batch, applying the stacking order a single time at the end
  // rather than after every module. The initial chart-plus-overlay load registers a dozen or more
  // modules, and a per-register restack is a moveLayer chain over every layer each time, so the
  // batch turns a quadratic load-time cost into one restack. The final order is identical to
  // registering the same modules in the same sequence one at a time.
  async registerAll(modules: OverlayModule[]): Promise<void> {
    for (const module of modules) {
      await this.#addModule(module);
    }
    this.#applyOrder();
  }

  // Add a single module (state restore, exclusion enforcement, add, visibility, and opacity)
  // without restacking. register and registerAll share this and own when #applyOrder runs.
  async #addModule(module: OverlayModule): Promise<void> {
    if (this.#modules.has(module.id)) {
      throw new Error(`duplicate overlay id: ${module.id}`);
    }
    this.#modules.set(module.id, module);
    const restored = this.#saved[module.id];
    const fallback = restored
      ? { ...restored }
      : { visible: module.defaultVisible ?? true, opacity: module.defaultOpacity ?? 1 };
    const state = this.#state.get(module.id) ?? fallback;
    // Enforce exclusion on restore too: a saved or legacy state with two members of an exclusive
    // group both visible would otherwise bypass the toggle-time rule. Keep the first registered.
    if (state.visible) {
      const group = this.#exclusive.find((g) => g.includes(module.id));
      if (group?.some((other) => other !== module.id && this.#state.get(other)?.visible)) {
        state.visible = false;
      }
    }
    this.#state.set(module.id, state);
    await module.add(this.#ctx);
    module.setVisible(this.#ctx, state.visible);
    module.setOpacity?.(this.#ctx, state.opacity);
  }

  unregister(id: string): void {
    const module = this.#modules.get(id);
    if (!module) return;
    module.remove(this.#ctx);
    this.#modules.delete(id);
  }

  toggle(id: string, visible: boolean): void {
    const module = this.#modules.get(id);
    const state = this.#state.get(id);
    if (!module || !state) return;
    // Enabling a member of an exclusive group hides the other members of that group.
    if (visible) {
      const group = this.#exclusive.find((g) => g.includes(id));
      for (const other of group ?? []) {
        if (other === id) continue;
        const om = this.#modules.get(other);
        const os = this.#state.get(other);
        if (om && os?.visible) {
          os.visible = false;
          om.setVisible(this.#ctx, false);
        }
      }
    }
    state.visible = visible;
    module.setVisible(this.#ctx, visible);
    // Turning a parent off hides its sub-layers, so a facet (the data-quality overlay) never lingers
    // on the map without the chart it annotates. The panel also disables a sub-layer's toggle while
    // its parent is off, so this only fires when the parent goes off with a child still on.
    if (!visible) {
      for (const [childId, child] of this.#modules) {
        if (child.parent !== id) continue;
        const childState = this.#state.get(childId);
        if (childState?.visible) {
          childState.visible = false;
          child.setVisible(this.#ctx, false);
        }
      }
    }
    this.#persist();
  }

  setOpacity(id: string, opacity: number): void {
    const module = this.#modules.get(id);
    const state = this.#state.get(id);
    if (!module || !state) return;
    state.opacity = opacity;
    module.setOpacity?.(this.#ctx, opacity);
    this.#persist();
  }

  // Move a non-pinned overlay to a new index in the non-pinned, top-to-bottom display order
  // (index 0 is the top of the map). Pinned layers are never moved or displaced.
  reorder(id: string, toIndex: number): void {
    if (this.#pinned.includes(id) || !this.#modules.has(id)) return;
    // A sub-layer is never reordered on its own; it stays directly above its parent.
    if (this.#modules.get(id)?.parent !== undefined) return;
    const topDown = this.#effectiveOrder()
      .filter((other) => !this.#pinned.includes(other) && !this.#isChild(other))
      .reverse();
    const from = topDown.indexOf(id);
    topDown.splice(from, 1);
    const clamped = Math.max(0, Math.min(toIndex, topDown.length));
    topDown.splice(clamped, 0, id);
    this.#explicitOrder = topDown.reverse();
    this.#applyOrder();
    this.#onOrderChange?.([...this.#explicitOrder]);
  }

  #persist(): void {
    if (!this.#onChange) return;
    const snapshot: LayerSettings = {};
    for (const [id, state] of this.#state) {
      snapshot[id] = { visible: state.visible, opacity: state.opacity };
    }
    this.#onChange(snapshot);
  }

  #isChild(id: string): boolean {
    return this.#modules.get(id)?.parent !== undefined;
  }

  // The effective stacking order, bottom to top: pinned overlays on top, the rest by the
  // saved explicit order, with any overlay missing from it slotted in at its band default.
  #effectiveOrder(): string[] {
    const bandRank = (id: string): number =>
      Z_ORDER.indexOf(this.#modules.get(id)?.band ?? 'basemap');
    const nonPinned = [...this.#modules.keys()].filter((id) => !this.#pinned.includes(id));
    // Order the top-level overlays only. A sub-layer is not positioned on its own: it is slotted
    // directly above its parent below, so it never drifts from the chart it annotates and never
    // becomes its own reorderable row.
    const topLevel = nonPinned.filter((id) => !this.#isChild(id));
    const seq = this.#explicitOrder.filter((id) => topLevel.includes(id));
    for (const id of topLevel) {
      if (seq.includes(id)) continue;
      const rank = bandRank(id);
      let at = seq.findIndex((other) => bandRank(other) > rank);
      if (at < 0) at = seq.length;
      seq.splice(at, 0, id);
    }
    for (const id of nonPinned) {
      const parent = this.#modules.get(id)?.parent;
      if (parent === undefined) continue;
      const at = seq.indexOf(parent);
      if (at >= 0) seq.splice(at + 1, 0, id);
      else seq.push(id);
    }
    const pinned = this.#pinned.filter((id) => this.#modules.has(id));
    return [...seq, ...pinned];
  }

  // Realize the effective order on the map by chaining moveLayer from the top down, anchoring
  // the whole overlay group just beneath the top sentinel so it stays above the base style.
  #applyOrder(): void {
    // Band insertion already yields the default order, so a restack only matters once a saved
    // order or a pin makes the desired order differ from the plain band sequence.
    if (!this.#explicitOrder.length && !this.#pinned.length) return;
    const desired: string[] = [];
    for (const id of this.#effectiveOrder()) {
      const module = this.#modules.get(id);
      if (!module) continue;
      for (const layerId of module.layerIds) {
        if (this.#ctx.map.getLayer(layerId)) desired.push(layerId);
      }
    }
    const anchor = sentinelId('overlay-top');
    let cursor = this.#ctx.map.getLayer(anchor) ? anchor : undefined;
    for (let k = desired.length - 1; k >= 0; k--) {
      this.#ctx.map.moveLayer(desired[k], cursor);
      cursor = desired[k];
    }
  }

  // Broadcast a theme change to every overlay that recolors itself, so each slice owns
  // the theming of its own layers instead of the widget reaching into them by id.
  applyTheme(paint: MapThemePaint): void {
    for (const module of this.#modules.values()) {
      module.applyTheme?.(this.#ctx, paint);
    }
  }

  // The entry point for a full base-style swap: it re-adds every overlay onto the fresh style.
  // No in-app action swaps the base style yet (theme changes recolor in place), so this is forward
  // scaffolding for that path, exercised by tests and ready for when a style swap lands.
  async reattachAll(): Promise<void> {
    // A base-style swap wipes the sentinel layers too, so restore them before
    // re-adding overlays or every beforeId would point at a missing layer.
    installSentinels(this.#ctx.map);
    for (const [id, module] of this.#modules) {
      const state = this.#state.get(id) ?? { visible: true, opacity: 1 };
      await (module.reattach ?? module.add).call(module, this.#ctx);
      module.setVisible(this.#ctx, state.visible);
      module.setOpacity?.(this.#ctx, state.opacity);
    }
    this.#applyOrder();
  }

  // The layer list for the panel, top of the map first, so the panel's top row is the top layer.
  layers(): LayerListItem[] {
    return this.#effectiveOrder()
      .reverse()
      .flatMap((id) => {
        const module = this.#modules.get(id);
        if (!module) return [];
        const state = this.#state.get(id) ?? { visible: true, opacity: 1 };
        return [
          {
            id,
            title: module.title,
            visible: state.visible,
            opacity: state.opacity,
            supportsOpacity: module.supportsOpacity,
            pinned: this.#pinned.includes(id),
            band: module.band,
            parent: module.parent,
            group: module.group,
            category: module.category,
          },
        ];
      });
  }
}
