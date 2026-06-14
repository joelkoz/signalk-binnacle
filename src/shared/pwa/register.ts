import { registerSW } from 'virtual:pwa-register';

export interface PwaController {
  update: () => void;
}

// One-time migration: the old 'binnacle-pmtiles' worker cache was provably inert (PMTiles range
// reads answer 206, which the Cache API refuses to store), so any orphan it left is deleted.
// PMTiles caching lives in the IndexedDB block cache now. cleanupOutdatedCaches only sweeps the
// precache, so app code owns this deletion.
function deleteOrphanCaches(): void {
  if (typeof caches === 'undefined') return;
  caches.delete('binnacle-pmtiles').catch(() => {
    // Best-effort: a failure leaves a dead cache behind, nothing more.
  });
}

// Registers the service worker (prompt mode). onNeedRefresh fires when a new build is waiting so the
// UI can offer a reload, and update(true) activates it. On plain http (no secure context) registerSW
// no-ops, so this degrades cleanly. A registration error in a secure context is logged rather than
// swallowed, so a genuine HTTPS failure is observable instead of silently invisible.
export function registerPwa(onNeedRefresh?: () => void): PwaController {
  deleteOrphanCaches();
  // Ask the browser not to evict this origin's storage under pressure: the tile and chart caches
  // are the offline navigation data. Browsers may decline silently; that is fine.
  void navigator.storage?.persist?.().catch(() => undefined);
  const updateSW = registerSW({
    onNeedRefresh: () => onNeedRefresh?.(),
    onRegisterError: (error) => {
      // An untrusted server certificate makes the browser refuse to register a service worker, even
      // after the user clicks through the page warning, so offline caching stays off (the app itself
      // works fully). The match is a heuristic on the browser's non-standard error text; a miss just
      // falls through to the generic warning below.
      const message = error instanceof Error ? error.message : String(error);
      if (/certificate|ssl/i.test(message)) {
        console.info(
          '[pwa] Offline caching is off: this browser does not trust the server certificate. Install the Signal K server certificate as a trusted root to enable offline use.',
        );
        return;
      }
      console.warn('[pwa] service worker registration failed', error);
    },
  });
  return { update: () => void updateSW(true) };
}
