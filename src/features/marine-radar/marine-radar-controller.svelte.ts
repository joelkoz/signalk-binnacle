import type { LatLon } from '$shared/geo';
import { MarineRadarStore } from './marine-radar-store.svelte';
import { createPpiLayer, type PpiLayer } from './ppi-layer';
import {
  type ControlWrite,
  capabilitiesFromControls,
  discoverRadars,
  fetchCapabilities,
  spokesUrl,
  writeControl,
} from './radar-client';
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

// Orchestrates the marine radar: discovers radars on the Signal K v2 radar API, opens the selected
// radar's spoke worker, and feeds frames to the ppi layer. Owns the worker lifecycle (a new pattern: no
// other controller owns a worker), so dispose() must tear it down, mirroring the Signal K client's dispose().
export function createMarineRadarController(deps: MarineRadarDeps) {
  const store = new MarineRadarStore();
  const layer: PpiLayer = createPpiLayer(store, deps.getCenter);
  let worker: RadarWorkerClient | undefined;
  let starting = false;

  async function openSelected(): Promise<void> {
    const radar = store.selected;
    if (!radar) return;
    // The control definitions ride alongside the picture. When a provider does not serve
    // /capabilities, fall back to the controls the radar reported at discovery so the panel still
    // shows them rather than collapsing to value-only.
    void fetchCapabilities(deps.origin, deps.getToken(), radar.id).then((caps) => {
      store.setCapabilities(caps?.controls ?? capabilitiesFromControls(radar));
    });
    if (!worker) worker = createRadarWorkerClient();
    store.setStatus('connecting');
    await worker.open(
      spokesUrl(deps.origin, radar),
      radar.spokesPerRevolution,
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
    // no-op. The radar spoke stream is a separate WebSocket independent of the Signal K stream, so once
    // a radar is discovered a Signal K reconnect must not re-probe and re-open it (a needless flap).
    if (starting || store.radars.length > 0 || !deps.radarAvailable()) return;
    starting = true;
    try {
      const radars = await discoverRadars(deps.origin, deps.getToken());
      if (radars.length === 0) return;
      store.setDiscovered(radars);
      await openSelected();
    } finally {
      starting = false;
    }
  }

  function selectRadar(id: string): void {
    store.select(id);
    void openSelected();
  }

  // Write a control back to the radar and update the value optimistically. A 401/403 means the session
  // token is read-only, which the panel surfaces; the displayed value is reconciled from the radar's
  // own reported control state on the next discovery (a stream reconcile is a follow-up).
  async function setControl(controlId: string, write: ControlWrite): Promise<void> {
    // Optimistic update: a manual value also takes the control out of auto; an auto write just flips
    // the auto flag and leaves the last value showing until the radar reports a new one.
    if ('value' in write) {
      store.setControlValue(controlId, write.value);
      store.setControlAuto(controlId, false);
    } else {
      store.setControlAuto(controlId, write.auto);
    }
    const radar = store.selected;
    if (!radar) return;
    const { ok, status } = await writeControl(
      deps.origin,
      deps.getToken(),
      radar.id,
      controlId,
      write,
    );
    if (ok) store.setControlsForbidden(false);
    else if (status === 401 || status === 403) store.setControlsForbidden(true);
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
