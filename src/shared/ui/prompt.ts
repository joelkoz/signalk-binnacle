// A dated fallback name (for example "Route 2026-06-14") so a saved item is never left unnamed,
// used to seed the NameEntry default and the draft-route save path.
export function defaultSaveName(kind: string): string {
  return `${kind} ${new Date().toISOString().slice(0, 10)}`;
}
