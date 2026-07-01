// A dated fallback name (for example "Route 2026-06-14") so a saved item is never left unnamed,
// used to seed the NameEntry default and the draft-route save path.
export function defaultSaveName(kind: string): string {
  return `${kind} ${new Date().toISOString().slice(0, 10)}`;
}

// The name to save under from what the user typed into a NameEntry: the trimmed input, or the dated
// fallback when it is left blank. Shared by the routes and tracks save-name flows.
export function resolveSaveName(value: string, kind: string): string {
  return value.trim() || defaultSaveName(kind);
}
