import type { LatLon } from '$shared/geo';
import { MarineRadarStore } from './marine-radar-store.svelte';
import { createPpiLayer, type PpiLayer } from './ppi-layer';
import { discoverRadars, spokesUrl, writeControl } from './radar-client';
import { controlValueFromDelta } from './radar-controls-model';
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
    if (!deps.radarAvailable()) return;
    const discovered = await discoverRadars(deps.origin, deps.getToken());
    if (!discovered) return;
    store.setDiscovered(discovered.provider, discovered.radars);
    await openSelected();
  }

  function selectRadar(id: string): void {
    store.select(id);
    void openSelected();
  }

  // Write a control back to the radar and update the value optimistically. A failed write is logged,
  // not silently dropped. v1 is optimistic-only: reconciling the displayed value from the radar's own
  // reported control state is a follow-up (see applyControlDelta).
  async function setControl(controlId: string, value: number, units?: string): Promise<void> {
    store.setControlValue(controlId, value);
    const radar = store.selected;
    if (!radar) return;
    const ok = await writeControl(deps.origin, deps.getToken(), radar.id, controlId, value, units);
    if (!ok) console.warn(`[marine-radar] control write failed: ${controlId}`);
  }

  // Reconcile a control value from a Signal K delta on radars.{id}.controls.{name}. This is the ready
  // seam for the stream reconcile, but it is NOT wired in v1: mayara streams control values on a
  // separate channel that the core delta worker does not carry, so bridging it (a worker change) needs
  // a live provider to verify. Until then the controls are optimistic. Covered by its own unit test.
  function applyControlDelta(path: string, value: number): void {
    const parsed = controlValueFromDelta(path, value);
    if (parsed && parsed.radarId === store.selectedId) {
      store.setControlValue(parsed.controlId, value);
    }
  }

  function dispose(): void {
    void worker?.close();
    worker?.dispose();
    worker = undefined;
  }

  return { store, layer, start, dispose, selectRadar, setControl, applyControlDelta };
}
