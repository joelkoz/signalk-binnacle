import type { LatLon } from '$shared/geo';
import { MarineRadarStore } from './marine-radar-store.svelte';
import { createPpiLayer, type PpiLayer } from './ppi-layer';
import { discoverRadars, spokesUrl } from './radar-client';
import { createRadarWorkerClient, type RadarWorkerClient } from './radar-worker-client';

export interface MarineRadarDeps {
  origin: string;
  getToken: () => string | undefined;
  getCenter: () => LatLon | undefined;
  radarAvailable: () => boolean;
}

const FLUSH_HZ = 15;

// Orchestrates the marine radar: detects a provider, opens the selected radar's spokes worker, and
// feeds frames to the ppi layer. Owns the worker lifecycle (a new pattern: no other controller owns a
// worker), so dispose() must tear it down, mirroring the Signal K client's dispose().
export function createMarineRadarController(deps: MarineRadarDeps) {
  const store = new MarineRadarStore();
  const layer: PpiLayer = createPpiLayer(store, deps.getCenter);
  let worker: RadarWorkerClient | undefined;

  async function openSelected(): Promise<void> {
    const provider = store.provider;
    const radar = store.selected;
    if (!provider || !radar) return;
    if (!worker) worker = createRadarWorkerClient();
    store.setStatus('connecting');
    const url = spokesUrl(deps.origin, provider, radar);
    await worker.open(url, provider, radar.spokes, radar.maxSpokeLen, FLUSH_HZ, (frame) => {
      layer.pushFrame(frame);
      store.setStatus('live');
    });
  }

  async function start(): Promise<void> {
    if (!deps.radarAvailable()) return;
    const discovered = await discoverRadars(deps.origin, deps.getToken());
    if (!discovered) return;
    store.setDiscovered(discovered.provider, discovered.radars);
    await openSelected();
  }

  function dispose(): void {
    void worker?.close();
    worker?.dispose();
    worker = undefined;
  }

  return { store, layer, start, dispose };
}
