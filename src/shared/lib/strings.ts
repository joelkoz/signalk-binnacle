// Capitalize the first character of a string, leaving the rest unchanged. An empty string passes through.
export function capitalize(s: string): string {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
