import { vi } from 'vitest';

// Test-only fake MapLibre map covering the source, layer, and image surface the
// overlays use. Imported by *.test.ts files, never by production code.
export function createFakeMap() {
  const sources = new Map<
    string,
    {
      setData?: (data: unknown) => void;
      setCoordinates?: (coordinates: unknown) => void;
      setTiles?: (tiles: unknown) => void;
      data: unknown;
      maxzoom?: number;
      tiles?: unknown;
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
    removeImage: (id: string) => images.delete(id),
    updateImage: (id: string) => {
      updatedImages.push(id);
      images.add(id);
    },
    addSource: (
      id: string,
      spec: { type?: string; data?: unknown; maxzoom?: number; tiles?: unknown },
    ) => {
      // A real MapLibre source carries only its own type's mutator, so attach just that one: a
      // wrong-type call then throws in tests as in the browser instead of silently succeeding.
      const source: {
        setData?: (data: unknown) => void;
        setCoordinates?: (coordinates: unknown) => void;
        setTiles?: (tiles: unknown) => void;
        data: unknown;
        maxzoom?: number;
        tiles?: unknown;
      } = { data: spec.data, maxzoom: spec.maxzoom, tiles: spec.tiles };
      if (spec.type === 'geojson') {
        source.setData = (data: unknown) => {
          source.data = data;
        };
      } else if (spec.type === 'canvas' || spec.type === 'image') {
        source.setCoordinates = vi.fn();
      } else if (spec.type === 'raster' || spec.type === 'vector' || spec.type === 'raster-dem') {
        source.setTiles = vi.fn();
      }
      sources.set(id, source);
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
