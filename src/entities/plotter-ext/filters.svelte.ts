import { passesFilters, type ResourceFilter } from './match';

// The host's active display filters, one per (extension, resource type). resources.setFilter
// replaces an extension's filter for a type; resources.clearFilter removes it; filters from
// multiple extensions compose by intersection. Filters are not persisted across host reloads.
// Overlays consult `passes()` before rendering; the host surfaces `chips` to the user and emits
// `filters.changed` through the injected callback.

export interface FilterChip {
  key: string;
  extensionId: string;
  type: string;
  label?: string;
}

interface FilterEntry {
  extensionId: string;
  type: string;
  filter: ResourceFilter;
}

// Extension ids (plugin ids) and resource types never contain a pipe, so a pipe joins them into an
// unambiguous composite chip key.
const SEP = '|';
const keyOf = (extensionId: string, type: string) => `${extensionId}${SEP}${type}`;

export class PlotterExtFilters {
  // Reassigned (not mutated) on every change so Svelte reactivity fires for overlay consumers.
  #entries = $state(new Map<string, FilterEntry>());
  // A monotonic change counter, bumped on every mutation. Imperative overlays (which sync outside a
  // reactive scope) poll it to re-render filtered display when a filter changes but the map has not
  // moved, mirroring the store version the route and waypoint overlays consult.
  #version = 0;
  readonly #onChange?: (extensionId: string, type: string, active: boolean) => void;

  constructor(onChange?: (extensionId: string, type: string, active: boolean) => void) {
    this.#onChange = onChange;
  }

  setFilter(extensionId: string, type: string, filter: ResourceFilter): void {
    const next = new Map(this.#entries);
    next.set(keyOf(extensionId, type), { extensionId, type, filter });
    this.#entries = next;
    this.#version += 1;
    this.#onChange?.(extensionId, type, true);
  }

  clearFilter(extensionId: string, type: string): void {
    const key = keyOf(extensionId, type);
    if (!this.#entries.has(key)) return;
    const next = new Map(this.#entries);
    next.delete(key);
    this.#entries = next;
    this.#version += 1;
    this.#onChange?.(extensionId, type, false);
  }

  // Drop every filter an extension owns, used when its providing plugin is disabled. Notifies once
  // per affected resource type so each surfaces as cleared.
  removeExtension(extensionId: string): void {
    const cleared: string[] = [];
    const next = new Map(this.#entries);
    for (const [key, entry] of this.#entries) {
      if (entry.extensionId === extensionId) {
        next.delete(key);
        cleared.push(entry.type);
      }
    }
    if (cleared.length === 0) return;
    this.#entries = next;
    this.#version += 1;
    for (const type of cleared) this.#onChange?.(extensionId, type, false);
  }

  // The change counter, for imperative consumers that re-render when it differs from the last seen.
  get version(): number {
    return this.#version;
  }

  // The active filters for one resource type, across all extensions.
  forType(type: string): ResourceFilter[] {
    const out: ResourceFilter[] = [];
    for (const entry of this.#entries.values()) {
      if (entry.type === type) out.push(entry.filter);
    }
    return out;
  }

  // Whether a resource of the given type survives the composed active filters for that type. A type
  // with no active filter displays everything.
  passes(type: string, id: string, record: unknown): boolean {
    return passesFilters(id, record, this.forType(type));
  }

  // Whether any filter is active for a resource type, so an overlay can skip filtering work
  // entirely when none is.
  hasFilter(type: string): boolean {
    return this.forType(type).length > 0;
  }

  get chips(): FilterChip[] {
    return [...this.#entries.entries()].map(([key, entry]) => ({
      key,
      extensionId: entry.extensionId,
      type: entry.type,
      label: entry.filter.label,
    }));
  }
}
