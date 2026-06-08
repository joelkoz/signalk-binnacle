import { DAY_MS } from '$shared/lib';

// NASA GIBS daily layers are addressed by date in the tile path. Use yesterday in UTC, which is
// reliably published: a same-day request often 404s while the day is still being processed. The date
// is resolved once when the catalog is built and baked into the tile URL, so it refreshes on the next
// app load. A stale date just yields blank tiles, which degrades gracefully for a reference overlay.
export function gibsDate(): string {
  return new Date(Date.now() - DAY_MS).toISOString().slice(0, 10);
}
