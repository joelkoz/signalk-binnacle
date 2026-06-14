import type { Map as MapLibreMap } from 'maplibre-gl';
import { TerraDraw } from 'terra-draw';
import { describe, expect, it, vi } from 'vitest';
import type { Waypoint } from '$entities/route';
import { createRouteEditor, drawFeatureToWaypoints, routeToStoreFeature } from './route-edit';

vi.mock('terra-draw-maplibre-gl-adapter', () => ({
  TerraDrawMapLibreGLAdapter: class {},
}));

vi.mock('terra-draw', () => {
  interface StoreFeature {
    id?: string | number;
    type: 'Feature';
    properties: Record<string, unknown>;
    geometry: { type: string; coordinates: number[][] };
  }
  class FakeTerraDraw {
    static instances: FakeTerraDraw[] = [];
    features: StoreFeature[] = [];
    #listeners: Array<() => void> = [];
    #nextId = 1;
    #clock = 1000;
    constructor() {
      FakeTerraDraw.instances.push(this);
    }
    on(event: string, cb: () => void): void {
      if (event === 'change') this.#listeners.push(cb);
    }
    start(): void {}
    stop(): void {}
    setMode(): void {}
    updateModeOptions(): void {}
    getSnapshot(): StoreFeature[] {
      return [...this.features];
    }
    addFeatures(features: StoreFeature[]): void {
      for (const f of features) {
        this.features.push({
          ...f,
          id: this.#nextId++,
          properties: { ...f.properties, createdAt: this.#clock, updatedAt: this.#clock },
        });
        this.#clock += 1;
      }
      this.#emit();
    }
    removeFeatures(ids: Array<string | number>): void {
      this.features = this.features.filter((f) => f.id == null || !ids.includes(f.id));
      this.#emit();
    }
    // Test helpers, mirroring what a select-mode drag and a fresh linestring tap do to the store.
    mutateLine(coordinates: number[][]): void {
      const line = this.features[0];
      line.geometry.coordinates = coordinates;
      line.properties.updatedAt = this.#clock;
      this.#clock += 1;
      this.#emit();
    }
    addLine(coordinates: number[][]): void {
      this.addFeatures([
        {
          type: 'Feature',
          properties: { mode: 'linestring' },
          geometry: { type: 'LineString', coordinates },
        },
      ]);
    }
    #emit(): void {
      for (const cb of [...this.#listeners]) cb();
    }
  }
  return {
    TerraDraw: FakeTerraDraw,
    TerraDrawLineStringMode: class {},
    TerraDrawPointMode: class {},
    TerraDrawSelectMode: class {},
  } as unknown as typeof import('terra-draw');
});

interface FakeDraw {
  features: Array<{
    id?: string | number;
    properties: Record<string, unknown>;
    geometry: { type: string; coordinates: number[][] };
  }>;
  mutateLine(coordinates: number[][]): void;
  addLine(coordinates: number[][]): void;
}

function lastInstance(): FakeDraw {
  const instances = (TerraDraw as unknown as { instances: FakeDraw[] }).instances;
  return instances[instances.length - 1];
}

function startEditor(waypoints: Waypoint[]): { draw: FakeDraw; emitted: Waypoint[][] } {
  const emitted: Waypoint[][] = [];
  const editor = createRouteEditor({
    map: {} as MapLibreMap,
    theme: 'day',
    onChange: (next) => emitted.push(next),
  });
  editor.start({ id: 'r', name: 'R', waypoints });
  return { draw: lastInstance(), emitted };
}

describe('route-edit converters', () => {
  it('routeToStoreFeature emits a linestring Feature in [lon, lat] with mode linestring', () => {
    const f = routeToStoreFeature({
      id: 'r',
      name: 'R',
      waypoints: [
        { position: { latitude: 0, longitude: 0 } },
        { position: { latitude: 0, longitude: 1 } },
      ],
    });
    expect(f.properties?.mode).toBe('linestring');
    expect((f.geometry as GeoJSON.LineString).coordinates[1]).toEqual([1, 0]);
  });

  it('drawFeatureToWaypoints reads a linestring Feature back to waypoints', () => {
    const wps = drawFeatureToWaypoints({
      type: 'Feature',
      properties: { mode: 'linestring' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [0, 0],
          [2, 1],
        ],
      },
    });
    expect(wps).toEqual([
      { position: { latitude: 0, longitude: 0 } },
      { position: { latitude: 1, longitude: 2 } },
    ]);
  });
});

describe('createRouteEditor name reconciliation', () => {
  const named: Waypoint[] = [
    { position: { latitude: 0, longitude: 0 }, name: 'Alpha' },
    { position: { latitude: 1, longitude: 1 }, name: 'Bravo' },
    { position: { latitude: 2, longitude: 2 }, name: 'Charlie' },
  ];

  it('keeps every name when nothing moved', () => {
    const { emitted } = startEditor(named);
    expect(emitted.at(-1)?.map((w) => w.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('dragging one middle waypoint keeps the other two names', () => {
    const { draw, emitted } = startEditor(named);
    draw.mutateLine([
      [0, 0],
      [1.5, 1.2],
      [2, 2],
    ]);
    const result = emitted.at(-1);
    expect(result?.map((w) => w.name)).toEqual(['Alpha', undefined, 'Charlie']);
    expect(result?.[1].position).toEqual({ latitude: 1.2, longitude: 1.5 });
  });

  it('inserting a midpoint keeps all names on the right points', () => {
    const { draw, emitted } = startEditor(named);
    draw.mutateLine([
      [0, 0],
      [0.5, 0.5],
      [1, 1],
      [2, 2],
    ]);
    expect(emitted.at(-1)?.map((w) => w.name)).toEqual(['Alpha', undefined, 'Bravo', 'Charlie']);
  });

  it('sequential edits stay sticky: names reconcile against the last emitted set', () => {
    const { draw, emitted } = startEditor(named);
    draw.mutateLine([
      [0, 0],
      [0.5, 0.5],
      [1, 1],
      [2, 2],
    ]);
    draw.mutateLine([
      [0, 0],
      [0.6, 0.4],
      [1, 1],
      [2, 2],
    ]);
    expect(emitted.at(-1)?.map((w) => w.name)).toEqual(['Alpha', undefined, 'Bravo', 'Charlie']);
  });

  it('a route visiting the same point twice consumes remembered names in order', () => {
    const revisits: Waypoint[] = [
      { position: { latitude: 0, longitude: 0 }, name: 'Out' },
      { position: { latitude: 1, longitude: 1 }, name: 'Mark' },
      { position: { latitude: 0, longitude: 0 }, name: 'Home' },
    ];
    const { emitted } = startEditor(revisits);
    expect(emitted.at(-1)?.map((w) => w.name)).toEqual(['Out', 'Mark', 'Home']);
  });
});

describe('createRouteEditor working-line pruning', () => {
  it('keeps the most recently created linestring and removes the extras from the store', async () => {
    const { draw, emitted } = startEditor([
      { position: { latitude: 0, longitude: 0 } },
      { position: { latitude: 1, longitude: 1 } },
    ]);
    draw.addLine([
      [5, 5],
      [6, 6],
    ]);
    // read() returns the working line synchronously, but the extra is pruned in a microtask so the
    // removal never runs inside Terra Draw's own commit; flush it before asserting the store shrank.
    expect(emitted.at(-1)).toEqual([
      { position: { latitude: 5, longitude: 5 } },
      { position: { latitude: 6, longitude: 6 } },
    ]);
    // The store still holds both lines synchronously: the prune did not run inside the change handler
    // (doing so mid-commit is what crashed Terra Draw on the second waypoint).
    expect(draw.features).toHaveLength(2);
    await Promise.resolve();
    expect(draw.features).toHaveLength(1);
    expect(draw.features[0].geometry.coordinates).toEqual([
      [5, 5],
      [6, 6],
    ]);
  });

  it('the deferred removal change does not emit a duplicate waypoint set', async () => {
    const { draw, emitted } = startEditor([
      { position: { latitude: 0, longitude: 0 } },
      { position: { latitude: 1, longitude: 1 } },
    ]);
    const before = emitted.length;
    draw.addLine([
      [5, 5],
      [6, 6],
    ]);
    // One emit for the tap; the microtask prune's nested change is suppressed, so still one after.
    expect(emitted.length).toBe(before + 1);
    await Promise.resolve();
    expect(emitted.length).toBe(before + 1);
  });
});
