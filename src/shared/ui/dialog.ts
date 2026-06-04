import type { Action } from 'svelte/action';

// A dismissible overlay panel behavior: Escape closes it, and focus returns to whatever was focused
// when it opened (typically the control that opened it) once it closes. Deliberately light, with no
// focus trap, because these panels are non-modal: the chart stays live underneath.
export const dialog: Action<HTMLElement, () => void> = (_node, onClose) => {
  let close = onClose;
  const restoreTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') close();
  }
  window.addEventListener('keydown', onKeydown);

  return {
    update(next: () => void): void {
      close = next;
    },
    destroy(): void {
      window.removeEventListener('keydown', onKeydown);
      restoreTo?.focus();
    },
  };
};
