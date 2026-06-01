<script lang="ts">
import { onDestroy, onMount } from 'svelte';
import { AisTargets } from '$entities/ais';
import { CollisionAssessment } from '$entities/collision';
import { OwnVessel } from '$entities/vessel';
import { AuthBanner } from '$features/auth-banner';
import { LayersPanel, type LayersView } from '$features/layers-panel';
import { DangerStrip } from '$features/lookout';
import { ThemeToggle } from '$features/theme-toggle';
import { formatLatitude, formatLongitude, PLACEHOLDER } from '$shared/lib';
import { OnlineStatus, registerPwa } from '$shared/pwa';
import { createThresholds } from '$shared/settings';
import type { Context } from '$shared/signalk';
import {
  AuthController,
  createSignalKClient,
  SignalKStore,
  SK_PATHS,
  serverOrigin,
  streamUrl,
} from '$shared/signalk';
import { createThemeController } from '$shared/ui';
import { ChartCanvas } from '$widgets/chart-canvas';

const ALL_VESSELS = 'vessels.*' as Context;

const store = new SignalKStore();
const vessel = new OwnVessel(store);
const client = createSignalKClient();
const auth = new AuthController(serverOrigin());
const net = new OnlineStatus();
const collision = new CollisionAssessment(vessel, new AisTargets(store), createThresholds());

let layersView = $state<LayersView | undefined>();
let recolorMap: ((theme: string) => void) | undefined;
let chartsToken = $state<string | undefined>();
let mapView = $state<{ lat: number; lon: number; zoom: number } | undefined>();
let updateReady = $state(false);
const pwa = registerPwa(() => (updateReady = true));

const theme = createThemeController((next) => recolorMap?.(next));

const CONNECTION_LABELS: Record<string, string> = {
  open: 'Connected',
  connecting: 'Connecting',
  reconnecting: 'Reconnecting',
  closed: 'Not connected',
};

const connectionLabel = $derived(CONNECTION_LABELS[store.connection.phase] ?? 'Not connected');

const fmt = (value: number | undefined, digits: number) =>
  value === undefined ? PLACEHOLDER : value.toFixed(digits);

let accessTimer: ReturnType<typeof setTimeout> | undefined;

// Resolve once the server is open to us: either unsecured or an approved token. A
// denied or still-pending request never resolves, so the stream stays disconnected
// until the user re-requests; the pending timer is cleared on destroy.
function waitForAccess(): Promise<void> {
  return new Promise((resolve) => {
    const tick = () => {
      if (auth.status === 'authenticated' || auth.status === 'unsecured') resolve();
      else accessTimer = setTimeout(tick, 500);
    };
    tick();
  });
}

onMount(async () => {
  await auth.probe();
  await waitForAccess();
  const token = auth.token ?? undefined;
  chartsToken = token;
  await client.connect(streamUrl(token), (frame) => store.applyFrame(frame));
  await client.raw.subscribe([
    { path: SK_PATHS.headingTrue, policy: 'instant', minPeriod: 200 },
    { path: SK_PATHS.position, policy: 'instant', minPeriod: 1000 },
    { path: SK_PATHS.courseOverGroundTrue, policy: 'instant', minPeriod: 1000 },
    { path: SK_PATHS.speedOverGround, policy: 'instant', minPeriod: 1000 },
  ]);
  await client.raw.subscribe([
    { path: SK_PATHS.position, context: ALL_VESSELS, policy: 'fixed', period: 5000 },
    { path: SK_PATHS.courseOverGroundTrue, context: ALL_VESSELS, policy: 'fixed', period: 5000 },
    { path: SK_PATHS.speedOverGround, context: ALL_VESSELS, policy: 'fixed', period: 5000 },
    { path: SK_PATHS.headingTrue, context: ALL_VESSELS, policy: 'fixed', period: 5000 },
    { path: SK_PATHS.name, context: ALL_VESSELS, policy: 'fixed', period: 5000 },
    { path: SK_PATHS.aisShipType, context: ALL_VESSELS, policy: 'fixed', period: 5000 },
    { path: SK_PATHS.closestApproach, context: ALL_VESSELS, policy: 'fixed', period: 5000 },
  ]);
});

onDestroy(() => {
  if (accessTimer) clearTimeout(accessTimer);
  auth.stop();
  net.dispose();
  void client.disconnect();
});
</script>

<main class="binnacle-shell">
  <header class="topbar">
    <span class="brand">Binnacle <span class="version">v{__APP_VERSION__}</span></span>
    <span class="topbar-actions">
      {#if updateReady}
        <button type="button" class="update" onclick={() => pwa.update()}>Update</button>
      {/if}
      <ThemeToggle controller={theme} />
    </span>
  </header>
  <section class="chart-host" aria-label="Chart">
    <ChartCanvas
      {store}
      {vessel}
      {chartsToken}
      onReady={(view) => (layersView = view)}
      onMapReady={(recolor) => {
        recolorMap = recolor;
        recolor(theme.theme);
      }}
      onViewChange={(view) => (mapView = view)}
    />
    <div class="banner-slot">
      <AuthBanner {auth} />
    </div>
    {#if layersView}
      <LayersPanel view={layersView} />
    {/if}
    <div class="danger-slot">
      <DangerStrip {collision} />
    </div>
  </section>
  <footer class="status-strip">
    <span class="status" role="status" aria-live="polite">{connectionLabel}</span>
    {#if !net.online}
      <span class="readout offline" role="status" aria-live="polite">Offline</span>
    {/if}
    <span class="readout">SOG <b>{fmt(vessel.sogKnots, 1)}</b> kn</span>
    <span class="readout">COG <b>{fmt(vessel.cogDegrees, 0)}</b>&deg;</span>
    <span class="spacer"></span>
    <span class="readout">Center</span>
    <span class="readout"><b>{formatLatitude(mapView?.lat)}</b></span>
    <span class="readout"><b>{formatLongitude(mapView?.lon)}</b></span>
    <span class="readout">z<b>{mapView ? mapView.zoom.toFixed(1) : PLACEHOLDER}</b></span>
  </footer>
</main>

<style>
.binnacle-shell {
  display: grid;
  grid-template-rows: auto 1fr auto;
  block-size: 100vh;
  margin: 0;
  font-family: var(--font-ui);
  background: var(--surface);
  color: var(--text);
}
.banner-slot {
  position: absolute;
  inset-block-start: 0;
  inset-inline: 0;
  z-index: 1;
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 1rem;
  border-block-end: 1px solid var(--border);
}
.topbar-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.update {
  font: inherit;
  font-size: 0.8rem;
  padding: 0.3rem 0.7rem;
  border: 1px solid var(--accent);
  border-radius: 999px;
  background: var(--accent);
  color: var(--surface-raised);
  cursor: pointer;
}
.brand {
  font-weight: 600;
}
.version {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 400;
  color: var(--text-muted);
}
.chart-host {
  position: relative;
}
.danger-slot {
  position: absolute;
  inset-block-end: 0.75rem;
  inset-inline: 0.75rem;
  display: flex;
  justify-content: center;
  pointer-events: none;
  z-index: 1;
}
.danger-slot :global(.danger-strip) {
  pointer-events: auto;
}
.status-strip {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 0.5rem 1rem;
  border-block-start: 1px solid var(--border);
  color: var(--text-muted);
}
.spacer {
  margin-inline-start: auto;
}
.offline {
  color: var(--alarm);
}
.readout b {
  color: var(--text);
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
</style>
