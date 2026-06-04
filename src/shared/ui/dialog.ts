import type { Action } from 'svelte/action';

// A dismissible overlay panel behavior: Escape closes it, and focus returns to whatever was focused
// when it opened (typically the control that opened it) once it closes. Deliberately light, with no
// focus trap, because these panels are non-modal: the chart stays live underneath.
//
// Open panels are tracked in a stack so a single Escape closes only the topmost (most recently
// opened) one. The note and weather panels can be open at the same time, so without the stack one
// Escape would close both. One shared window listener serves every open panel.
const openDialogs: Array<() => void> = [];

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  openDialogs[openDialogs.length - 1]?.();
}

export const dialog: Action<HTMLElement, () => void> = (_node, onClose) => {
  let close = onClose;
  const restoreTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const entry = (): void => close();

  openDialogs.push(entry);
  if (openDialogs.length === 1) window.addEventListener('keydown', onKeydown);

  return {
    update(next: () => void): void {
      close = next;
    },
    destroy(): void {
      const index = openDialogs.indexOf(entry);
      if (index >= 0) openDialogs.splice(index, 1);
      if (openDialogs.length === 0) window.removeEventListener('keydown', onKeydown);
      restoreTo?.focus();
    },
  };
};
