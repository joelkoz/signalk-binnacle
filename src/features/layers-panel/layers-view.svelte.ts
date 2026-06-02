import type { LayerManager } from '$shared/map';

interface LayerItem {
  id: string;
  title: string;
  visible: boolean;
  opacity: number;
  supportsOpacity: boolean;
}

export class LayersView {
  items = $state<LayerItem[]>([]);

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
}
