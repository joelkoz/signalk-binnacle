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

  // Mutate the one changed item in place rather than rebuilding the whole array, so a slider
  // drag (a stream of oninput events) does not reallocate the list on every pixel. $state is
  // deeply reactive, so the in-place field write still updates the UI.
  toggle(id: string, visible: boolean): void {
    this.#manager.toggle(id, visible);
    const item = this.items.find((i) => i.id === id);
    if (item) item.visible = visible;
  }

  setOpacity(id: string, opacity: number): void {
    this.#manager.setOpacity(id, opacity);
    const item = this.items.find((i) => i.id === id);
    if (item) item.opacity = opacity;
  }

  // Move a layer to a new index in the top-to-bottom display order, then rebuild the list in
  // the new order. A reorder is a discrete drop, not a per-pixel stream, so a full refresh is
  // fine here (unlike the in-place toggle and opacity writes above).
  reorder(id: string, toIndex: number): void {
    this.#manager.reorder(id, toIndex);
    this.refresh();
  }
}
