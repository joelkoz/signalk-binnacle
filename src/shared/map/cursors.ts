// The chart cursor values live once as CSS custom properties in app.css (--cursor-grab,
// --cursor-grabbing, --cursor-crosshair), used by the MapLibre cursor rules and read here so the route
// editor can apply the same high-contrast shapes. Terra Draw only sets keyword cursors inline (it has
// no way to ask for a custom image), so its adapter maps each keyword to the matching custom property.

const KEYWORD_TO_VAR: Record<string, string | undefined> = {
  crosshair: '--cursor-crosshair',
  grab: '--cursor-grab',
  grabbing: '--cursor-grabbing',
  // A point drag in select mode reports "move"; an open hand reads as "this point is draggable".
  move: '--cursor-grab',
};

// The resolved variable values are constant for the page lifetime (the cursors are theme-independent),
// so cache the first read: Terra Draw calls setCursor on every pointer move, and getComputedStyle forces
// a synchronous style flush each time.
const resolved = new Map<string, string>();

// The high-contrast cursor value for a Terra Draw cursor keyword, or undefined when the keyword has no
// custom shape (let the stock adapter set the OS cursor, which for "pointer" already reads clearly).
// Reads the live CSS variable so the value has a single source.
export function chartCursorFor(keyword: string): string | undefined {
  const name = KEYWORD_TO_VAR[keyword];
  if (!name || typeof document === 'undefined') return undefined;
  let value = resolved.get(name);
  if (value === undefined) {
    value = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || keyword;
    resolved.set(name, value);
  }
  return value;
}
