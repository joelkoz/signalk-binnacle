import type { LayerManager } from '$shared/map';

interface LayerItem {
  id: string;
  title: string;
  visible: boolean;
  opacity: number;
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

  toggle(id: string, visible: boolean): void {
    this.#manager.toggle(id, visible);
    this.refresh();
  }

  setOpacity(id: string, opacity: number): void {
    this.#manager.setOpacity(id, opacity);
    this.refresh();
  }
}
