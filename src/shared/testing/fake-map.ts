import { vi } from 'vitest';

// Test-only fake MapLibre map covering the source, layer, and image surface the
// overlays use. Imported by *.test.ts files, never by production code.
export function createFakeMap() {
  const sources = new Map<
    string,
    {
      setData: (data: unknown) => void;
      setCoordinates: (coordinates: unknown) => void;
      data: unknown;
      maxzoom?: number;
    }
  >();
  const layers = new Set<string>();
  const images = new Set<string>();
  const updatedImages: string[] = [];
  return {
    sources,
    layers,
    images,
    updatedImages,
    hasImage: (id: string) => images.has(id),
    addImage: (id: string) => images.add(id),
    updateImage: (id: string) => {
      updatedImages.push(id);
      images.add(id);
    },
    addSource: (id: string, spec: { data?: unknown; maxzoom?: number }) => {
      sources.set(id, {
        data: spec.data,
        maxzoom: spec.maxzoom,
        setData(data: unknown) {
          this.data = data;
        },
        setCoordinates: vi.fn(),
      });
    },
    getSource: (id: string) => sources.get(id),
    isSourceLoaded: (id: string) => sources.has(id),
    getLayer: (id: string) => (layers.has(id) ? { id } : undefined),
    addLayer: (layer: { id: string }) => layers.add(layer.id),
    removeLayer: (id: string) => layers.delete(id),
    moveLayer: vi.fn(),
    removeSource: (id: string) => sources.delete(id),
    setLayerZoomRange: vi.fn(),
    setLayoutProperty: vi.fn(),
    setPaintProperty: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  };
}

export type FakeMap = ReturnType<typeof createFakeMap>;
