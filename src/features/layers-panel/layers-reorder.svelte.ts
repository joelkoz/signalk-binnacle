import { clampReorderSlot } from './layer-category';
import type { LayersView } from './layers-view.svelte';

export interface LayerReorder {
  // The id being dragged, so a row can render its dragging state.
  readonly dragId: string | null;
  // Announced politely after a keyboard reorder, so a screen-reader user hears the new z-order.
  readonly reorderAnnouncement: string;
  // Which edge, if any, a row should draw the drop indicator on.
  indicatorFor(id: string): { before: boolean; after: boolean };
  handlePointerDown(id: string, event: PointerEvent): void;
  handleKeydown(id: string, event: KeyboardEvent): void;
}

// The imperative pointer-and-keyboard drag-reorder controller for the Layers panel. It owns the
// drag state and the window listeners, addressing rows by their index in the movable list (the
// non-pinned, non-child rows), and commits a drop through view.reorder. getListEl is a getter so the
// controller always reads the panel's current list element rather than capturing a stale ref.
export function createLayerReorder(
  getView: () => LayersView,
  getListEl: () => HTMLUListElement | undefined,
): LayerReorder {
  // The LayersView is a stable instance, so resolve it once; its items getter stays reactive below.
  const view = getView();
  // The movable rows: the same non-pinned, non-child rows the panel addresses by index. Derived from
  // view.items here so the controller resolves a row's index and category span without the panel
  // threading the list in.
  const movable = $derived(view.items.filter((item) => !item.pinned && !item.parent));

  // The non-pinned id being dragged, and the insertion slot it would land in. The slot is an
  // index in the movable list with the dragged row removed, matching view.reorder's contract.
  let dragId = $state<string | null>(null);
  let dropSlot = $state<number | null>(null);

  // The movable rows minus the one being dragged, computed once per drag frame rather than
  // re-filtered for every row inside indicatorFor.
  const remaining = $derived(
    dragId === null ? movable : movable.filter((item) => item.id !== dragId),
  );

  // Announced politely after a keyboard reorder, so a screen-reader user hears the new z-order rather
  // than only the refocused handle re-reading its label.
  let reorderAnnouncement = $state('');

  function movableIndex(id: string): number {
    return movable.findIndex((item) => item.id === id);
  }

  // Translate an insertion slot (movable list, dragged row removed) into the id of the row it
  // renders against, plus which edge, so a LayerRow can draw the drop indicator.
  function indicatorFor(id: string): { before: boolean; after: boolean } {
    if (dragId === null || dropSlot === null || id === dragId) {
      return { before: false, after: false };
    }
    const rowIndex = remaining.findIndex((item) => item.id === id);
    if (rowIndex < 0) return { before: false, after: false };
    if (dropSlot === remaining.length) {
      return { before: false, after: rowIndex === remaining.length - 1 };
    }
    return { before: rowIndex === dropSlot, after: false };
  }

  function handlePointerDown(id: string, event: PointerEvent): void {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    event.preventDefault();
    dragId = id;
    dropSlot = movableIndex(id);
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);

    // Measure each non-dragged row's vertical midpoint once at drag start, re-measuring only when
    // the list scrolls mid-drag, so a pointermove costs no layout read or reflow. Collapsed-category
    // rows stay in the DOM (hidden), so they measure as a zero midpoint and never become a drop
    // target, while still holding their movable index, so the slot the pointer resolves to is a
    // valid movable index.
    const measureMidpoints = (): number[] => {
      const listEl = getListEl();
      return listEl
        ? [...listEl.querySelectorAll<HTMLElement>('[data-layer-row]')]
            .filter((el) => el.dataset.layerRow !== id)
            .map((el) => {
              const rect = el.getBoundingClientRect();
              return rect.top + rect.height / 2;
            })
        : [];
    };
    let midpoints = measureMidpoints();

    // The slot is the first midpoint the pointer is above, matching view.reorder's contract, then
    // clamped to the row's own category span so the drop indicator never points outside the visible
    // category (view.reorder clamps again as the unforgeable backstop).
    const slotFromPointer = (clientY: number): number => {
      let slot = midpoints.length;
      for (let i = 0; i < midpoints.length; i++) {
        if (clientY < midpoints[i]) {
          slot = i;
          break;
        }
      }
      return clampReorderSlot(movable, id, slot);
    };

    // One AbortController tears down all the listeners on drop or cancel, so the teardown
    // lives in a single place rather than being repeated per handler.
    const drag = new AbortController();
    const { signal } = drag;
    getListEl()?.addEventListener(
      'scroll',
      () => {
        midpoints = measureMidpoints();
      },
      { signal, passive: true },
    );
    const finish = (commit: boolean): void => {
      drag.abort();
      handle.releasePointerCapture(event.pointerId);
      if (commit && dragId !== null && dropSlot !== null) view.reorder(dragId, dropSlot);
      dragId = null;
      dropSlot = null;
    };
    handle.addEventListener(
      'pointermove',
      (move) => {
        dropSlot = slotFromPointer(move.clientY);
      },
      { signal },
    );
    handle.addEventListener('pointerup', () => finish(true), { signal });
    handle.addEventListener('pointercancel', () => finish(false), { signal });
  }

  function handleKeydown(id: string, event: KeyboardEvent): void {
    const from = movableIndex(id);
    if (from < 0) return;
    let to = from;
    if (event.key === 'ArrowUp') to = from - 1;
    else if (event.key === 'ArrowDown') to = from + 1;
    else return;
    event.preventDefault();
    if (to < 0 || to >= movable.length) return;
    // Hold the move inside the row's own category: a clamp back to the current slot means the row
    // is already at its bucket edge, so there is nothing to move or announce.
    to = clampReorderSlot(movable, id, to);
    if (to === from) return;
    const title = movable[from]?.title ?? 'Layer';
    view.reorder(id, to);
    reorderAnnouncement = `Moved ${title} to position ${to + 1} of ${movable.length}.`;
    // Keep focus on the moved handle as it follows the row to its new position.
    requestAnimationFrame(() => {
      const moved = getListEl()?.querySelector<HTMLElement>(
        `[data-layer-row="${CSS.escape(id)}"] .handle`,
      );
      moved?.focus();
    });
  }

  return {
    get dragId() {
      return dragId;
    },
    get reorderAnnouncement() {
      return reorderAnnouncement;
    },
    indicatorFor,
    handlePointerDown,
    handleKeydown,
  };
}
