// Whether the user has asked for reduced motion. Used to make programmatic camera transitions
// instant, the JavaScript counterpart to the CSS prefers-reduced-motion handling that already
// neutralizes declarative transitions and animations.
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}
