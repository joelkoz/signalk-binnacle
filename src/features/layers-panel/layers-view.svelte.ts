import type { LayerListItem, LayerManager } from '$shared/map';
import { clampReorderSlot } from './layer-category';

export class LayersView {
  items = $state<LayerListItem[]>([]);

  #manager: LayerManager;
  #byId = new Map<string, LayerListItem>();

  constructor(manager: LayerManager) {
    this.#manager = manager;
  }

  refresh(): void {
    this.items = this.#manager.layers();
    this.#byId = new Map(this.items.map((item) => [item.id, item]));
  }

  // A toggle can flip several rows at once (the weather fills are mutually exclusive), so rebuild
  // the list from the manager rather than mutating one item. A discrete toggle is not a per-pixel
  // stream, so a full refresh is fine here (unlike the opacity slider below).
  toggle(id: string, visible: boolean): void {
    this.#manager.toggle(id, visible);
    this.refresh();
  }

  setOpacity(id: string, opacity: number): void {
    this.#manager.setOpacity(id, opacity);
    const item = this.#byId.get(id);
    if (item) item.opacity = opacity;
  }

  // Move a layer to a new index in the top-to-bottom display order, then rebuild the list in
  // the new order. A reorder is a discrete drop, not a per-pixel stream, so a full refresh is
  // fine here (unlike the in-place opacity write above, which mutates one item). The target is
  // clamped here, in the one place every reorder funnels through, so no caller can move a row
  // outside its own category bucket; the panel clamps too, but only for its drop indicator and
  // keyboard announcement.
  reorder(id: string, toIndex: number): void {
    const movable = this.items.filter((item) => !item.pinned && !item.parent);
    this.#manager.reorder(id, clampReorderSlot(movable, id, toIndex));
    this.refresh();
  }
}
