import { installSentinels } from './sentinels';
import type { OverlayContext, OverlayModule } from './types';

interface OverlayState {
  visible: boolean;
  opacity: number;
}

export class LayerManager {
  #ctx: OverlayContext;
  #modules = new Map<string, OverlayModule>();
  #state = new Map<string, OverlayState>();

  constructor(ctx: OverlayContext) {
    this.#ctx = ctx;
  }

  async register(module: OverlayModule): Promise<void> {
    if (this.#modules.has(module.id)) {
      throw new Error(`duplicate overlay id: ${module.id}`);
    }
    this.#modules.set(module.id, module);
    const state = this.#state.get(module.id) ?? { visible: true, opacity: 1 };
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
  }

  setOpacity(id: string, opacity: number): void {
    const module = this.#modules.get(id);
    const state = this.#state.get(id);
    if (!module || !state) return;
    state.opacity = opacity;
    module.setOpacity?.(this.#ctx, opacity);
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
