// How long an AIS target may go without an update before it is pruned from the store
// (store.pruneAis). Anchored Class A and slow Class B vessels nominally report every 180 s, so a
// TTL at that interval flaps anchored traffic off and on; 420 s tolerates two missed slow-rate
// reports before a target is treated as gone.
export const AIS_STALE_TTL_MS = 420_000;

// Staleness changes on a minutes scale, so prune on this coarse cadence, and from a timer rather
// than the render path: rendering pauses in a hidden tab while the collision math keeps consuming
// the store, so an expiry tied to rendering would feed it stale targets.
export const AIS_PRUNE_INTERVAL_MS = 5_000;
