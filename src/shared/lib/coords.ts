const PLACEHOLDER = '--';

// Display-edge formatting for decimal-degree coordinates. The store keeps position
// in decimal degrees (the one non-SI exception); these render it for the status strip.
export function formatLatitude(value: number | null | undefined): string {
  if (value == null) return PLACEHOLDER;
  const hemisphere = value < 0 ? 'S' : 'N';
  return `${Math.abs(value).toFixed(4)}° ${hemisphere}`;
}

export function formatLongitude(value: number | null | undefined): string {
  if (value == null) return PLACEHOLDER;
  const hemisphere = value < 0 ? 'W' : 'E';
  return `${Math.abs(value).toFixed(4)}° ${hemisphere}`;
}
