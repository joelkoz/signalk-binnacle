import type { MapThemePaint } from './map-theme';
import { installSentinels } from './sentinels';
import type { OverlayContext, OverlayModule } from './types';

export interface OverlayState {
  visible: boolean;
  opacity: number;
}

// Per-layer visibility and opacity, keyed by overlay id, for save and restore.
export type LayerSettings = Record<string, OverlayState>;

interface LayerManagerOptions {
  // Settings to restore on register (a layer absent here takes the visible default).
  saved?: LayerSettings;
  // Called with the full settings snapshot whenever a layer's state changes.
  onChange?: (settings: LayerSettings) => void;
}

export class LayerManager {
  #ctx: OverlayContext;
  #modules = new Map<string, OverlayModule>();
  #state = new Map<string, OverlayState>();
  #saved: LayerSettings;
  #onChange?: (settings: LayerSettings) => void;

  constructor(ctx: OverlayContext, options: LayerManagerOptions = {}) {
    this.#ctx = ctx;
    this.#saved = options.saved ?? {};
    this.#onChange = options.onChange;
  }

  async register(module: OverlayModule): Promise<void> {
    if (this.#modules.has(module.id)) {
      throw new Error(`duplicate overlay id: ${module.id}`);
    }
    this.#modules.set(module.id, module);
    const restored = this.#saved[module.id];
    const fallback = restored ? { ...restored } : { visible: true, opacity: 1 };
    const state = this.#state.get(module.id) ?? fallback;
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
    state.visible = visible;
    module.setVisible(this.#ctx, visible);
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

  #persist(): void {
    if (!this.#onChange) return;
    const snapshot: LayerSettings = {};
    for (const [id, state] of this.#state) {
      snapshot[id] = { visible: state.visible, opacity: state.opacity };
    }
    this.#onChange(snapshot);
  }

  // Broadcast a theme change to every overlay that recolors itself, so each slice owns
  // the theming of its own layers instead of the widget reaching into them by id.
  applyTheme(paint: MapThemePaint): void {
    for (const module of this.#modules.values()) {
      module.applyTheme?.(this.#ctx, paint);
    }
  }

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
  }

  layers(): Array<{
    id: string;
    title: string;
    visible: boolean;
    opacity: number;
    supportsOpacity: boolean;
  }> {
    return [...this.#modules.values()].map((module) => {
      const state = this.#state.get(module.id) ?? { visible: true, opacity: 1 };
      return {
        id: module.id,
        title: module.title,
        visible: state.visible,
        opacity: state.opacity,
        supportsOpacity: module.supportsOpacity,
      };
    });
  }
}
