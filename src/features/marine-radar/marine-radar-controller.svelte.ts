import type { LatLon } from '$shared/geo';
import { MarineRadarStore } from './marine-radar-store.svelte';
import { createPpiLayer, type PpiLayer } from './ppi-layer';
import { discoverRadars, spokesUrl, writeControl } from './radar-client';
import { createRadarWorkerClient, type RadarWorkerClient } from './radar-worker-client';

export interface MarineRadarDeps {
  origin: string;
  getToken: () => string | undefined;
  getCenter: () => LatLon | undefined;
  radarAvailable: () => boolean;
}

// The worker flushes integrated frames at this rate (a worker timer, never requestAnimationFrame, so a
// backgrounded tab keeps sweeping). Faster than the eye needs; the spokes integrate continuously between.
const FLUSH_HZ = 15;

// Orchestrates the marine radar: detects a provider, opens the selected radar's spokes worker, and
// feeds frames to the ppi layer. Owns the worker lifecycle (a new pattern: no other controller owns a
// worker), so dispose() must tear it down, mirroring the Signal K client's dispose().
export function createMarineRadarController(deps: MarineRadarDeps) {
  const store = new MarineRadarStore();
  const layer: PpiLayer = createPpiLayer(store, deps.getCenter);
  let worker: RadarWorkerClient | undefined;
  let starting = false;

  async function openSelected(): Promise<void> {
    const provider = store.provider;
    const radar = store.selected;
    if (!provider || !radar) return;
    if (!worker) worker = createRadarWorkerClient();
    store.setStatus('connecting');
    const url = spokesUrl(deps.origin, provider, radar);
    await worker.open(
      url,
      provider,
      radar.spokes,
      radar.maxSpokeLen,
      FLUSH_HZ,
      (frame) => {
        layer.pushFrame(frame);
        store.setStatus('live');
      },
      (status) => {
        store.setStatus(status === 'open' ? 'connecting' : 'error');
      },
    );
  }

  async function start(): Promise<void> {
    // Two reactive effects (connect and reconnect) call start(); the guard makes concurrent calls a
    // no-op. The radar spokes stream is a separate WebSocket independent of the Signal K stream, so
    // once a radar is discovered a Signal K reconnect must not re-probe and re-open it (a needless flap).
    if (starting || store.radars.length > 0 || !deps.radarAvailable()) return;
    starting = true;
    try {
      const discovered = await discoverRadars(deps.origin, deps.getToken());
      if (!discovered) return;
      store.setDiscovered(discovered.provider, discovered.radars);
      await openSelected();
    } finally {
      starting = false;
    }
  }

  function selectRadar(id: string): void {
    store.select(id);
    void openSelected();
  }

  // Write a control back to the radar and update the value optimistically. writeControl logs a failed
  // write. v1 is optimistic-only: reconciling the displayed value from the radar's own reported control
  // state is a follow-up (mayara streams it on a separate channel the core delta worker does not carry).
  async function setControl(controlId: string, value: number, units?: string): Promise<void> {
    store.setControlValue(controlId, value);
    const radar = store.selected;
    const provider = store.provider;
    if (!radar || !provider) return;
    await writeControl(deps.origin, deps.getToken(), provider, radar.id, controlId, value, units);
  }

  async function dispose(): Promise<void> {
    if (!worker) return;
    // Await the clean close (a WebSocket close frame) before terminate(); otherwise terminate kills the
    // Comlink message and the provider sees an abrupt drop.
    await worker.close();
    worker.dispose();
    worker = undefined;
  }

  return { store, layer, start, dispose, selectRadar, setControl };
}
