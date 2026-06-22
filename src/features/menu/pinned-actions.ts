import type { MenuItem } from './menu-item';

// The bar's default pinned set: Center, Follow, and Charts (the layers action). The single source of
// the default, imported by the composition root for the persisted-value fallback.
export const DEFAULT_PINNED: readonly string[] = ['center', 'follow', 'layers'];

// The pinned actions in canonical (registry) order. Iterating the registry (not the id list) yields a
// stable order regardless of pin sequence and inherently drops an id with no matching action (a
// removed, renamed, or newer-version action synced down). A non-array input (a corrupt or
// hand-edited stored document, which never passes through the import validator) resolves to empty, so
// this never throws.
export function resolvePinned(items: MenuItem[], pinnedIds: unknown): MenuItem[] {
  const ids = new Set(Array.isArray(pinnedIds) ? (pinnedIds as string[]) : []);
  return items.filter((item) => ids.has(item.id));
}
