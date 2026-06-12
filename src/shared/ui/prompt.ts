// Prompt for a name to save a route or track under, seeding a "<Kind> YYYY-MM-DD" default. Returns
// the trimmed entry, the default when left blank, or undefined when the user cancels. Shared so the
// Routes and Tracks panels do not each re-implement the same prompt and default.
export function promptSaveName(kind: string): string | undefined {
  const fallback = `${kind} ${new Date().toISOString().slice(0, 10)}`;
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
