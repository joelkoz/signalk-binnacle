import { vi } from 'vitest';

// Test-only fake MapLibre map covering the source, layer, and image surface the
// overlays use. Imported by *.test.ts files, never by production code.
export function createFakeMap() {
  const sources = new Map<string, { setData: (data: unknown) => void; data: unknown }>();
  const layers = new Set<string>();
  const images = new Set<string>();
  return {
    sources,
    layers,
    images,
    hasImage: (id: string) => images.has(id),
    addImage: (id: string) => images.add(id),
    addSource: (id: string, spec: { data?: unknown }) => {
      sources.set(id, {
        data: spec.data,
        setData(data: unknown) {
          this.data = data;
        },
      });
    },
    getSource: (id: string) => sources.get(id),
    getLayer: (id: string) => (layers.has(id) ? { id } : undefined),
    addLayer: (layer: { id: string }) => layers.add(layer.id),
    removeLayer: (id: string) => layers.delete(id),
    removeSource: (id: string) => sources.delete(id),
    setLayoutProperty: vi.fn(),
    setPaintProperty: vi.fn(),
  };
}

export type FakeMap = ReturnType<typeof createFakeMap>;
