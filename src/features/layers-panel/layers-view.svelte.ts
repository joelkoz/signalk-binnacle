import type { LayerListItem, LayerManager } from '$shared/map';

export class LayersView {
  items = $state<LayerListItem[]>([]);

  #manager: LayerManager;

  constructor(manager: LayerManager) {
    this.#manager = manager;
  }

  refresh(): void {
    this.items = this.#manager.layers();
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
    const item = this.items.find((i) => i.id === id);
    if (item) item.opacity = opacity;
  }

  // Move a layer to a new index in the top-to-bottom display order, then rebuild the list in
  // the new order. A reorder is a discrete drop, not a per-pixel stream, so a full refresh is
  // fine here (unlike the in-place opacity write above, which mutates one item).
  reorder(id: string, toIndex: number): void {
    this.#manager.reorder(id, toIndex);
    this.refresh();
  }
}
