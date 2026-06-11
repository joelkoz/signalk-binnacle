import type { Action } from 'svelte/action';

// Move focus to this element when it mounts, so a step revealed in place (a confirm prompt, a review
// form) lands the keyboard on the new control instead of leaving it on the now-removed trigger.
// preventScroll keeps the panel from jumping as focus lands.
export const focusOnMount: Action<HTMLElement> = (node) => {
  node.focus({ preventScroll: true });
};

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Keep Tab cycling inside a true modal (the MOB confirm). The slide-over panels are deliberately
// non-modal and do not use this; pair it with the dialog action, which handles Escape and restore.
export const focusTrap: Action<HTMLElement> = (node) => {
  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const focusables = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !node.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !node.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }
  node.addEventListener('keydown', onKeydown);
  return {
    destroy(): void {
      node.removeEventListener('keydown', onKeydown);
    },
  };
};
