import type { Action } from 'svelte/action';

const EPSILON_PX = 1;

// Mark a horizontal scroller with data-scroll-start and data-scroll-end while content actually
// extends past that edge, so an edge-fade mask can hint "more to scroll" without permanently
// truncating the last item: a fade that never lifts reads as a clipped label, not a hint. The
// attributes update on scroll, on resize, and on content changes (overlay pills register as
// their sources load). Observers are optional so the action is inert under the node test
// environment.
export const scrollEdges: Action<HTMLElement> = (node) => {
  const update = (): void => {
    const overflow = node.scrollWidth - node.clientWidth;
    const scrollable = overflow > EPSILON_PX;
    node.toggleAttribute('data-scroll-start', scrollable && node.scrollLeft > EPSILON_PX);
    node.toggleAttribute('data-scroll-end', scrollable && node.scrollLeft < overflow - EPSILON_PX);
  };
  update();
  node.addEventListener('scroll', update, { passive: true });
  const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update);
  resize?.observe(node);
  const mutate = typeof MutationObserver === 'undefined' ? undefined : new MutationObserver(update);
  mutate?.observe(node, { childList: true, subtree: true });
  return {
    destroy(): void {
      node.removeEventListener('scroll', update);
      resize?.disconnect();
      mutate?.disconnect();
    },
  };
};
