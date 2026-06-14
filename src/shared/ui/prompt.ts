// A dated fallback name (for example "Route 2026-06-14") so a saved item is never left unnamed,
// shared by the prompt default and the draft-route save path.
export function defaultSaveName(kind: string): string {
  return `${kind} ${new Date().toISOString().slice(0, 10)}`;
}

// Prompt for a name to save a route or track under, seeding a "<Kind> YYYY-MM-DD" default. Returns
// the trimmed entry, the default when left blank, or undefined when the user cancels. Shared so the
// Routes and Tracks panels do not each re-implement the same prompt and default.
export function promptSaveName(kind: string): string | undefined {
  const fallback = defaultSaveName(kind);
  const name = window.prompt(`Save ${kind.toLowerCase()} as`, fallback);
  if (name === null) return undefined;
  return name.trim() || fallback;
}

// Prompt to rename something, seeded with its current name. Returns the trimmed new name, or
// undefined when cancelled or emptied (renaming to nothing is a cancel, not a clear).
export function promptRename(kind: string, current: string): string | undefined {
  const name = window.prompt(`Rename ${kind.toLowerCase()} to`, current);
  if (name === null) return undefined;
  return name.trim() || undefined;
}
