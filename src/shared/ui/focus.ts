import type { Action } from 'svelte/action';

// Move focus to this element when it mounts, so a step revealed in place (a confirm prompt, a review
// form) lands the keyboard on the new control instead of leaving it on the now-removed trigger.
// preventScroll keeps the panel from jumping as focus lands.
export const focusOnMount: Action<HTMLElement> = (node) => {
  node.focus({ preventScroll: true });
};
