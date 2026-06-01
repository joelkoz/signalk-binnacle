// The "no data" sentinel, shared so the status strip and these formatters agree.
export const PLACEHOLDER = '--';
const COORD_DECIMALS = 4;

// Display-edge formatting for decimal-degree coordinates. The store keeps position
// in decimal degrees (the one non-SI exception); these render it for the status strip.
function formatCoordinate(
  value: number | null | undefined,
  negative: string,
  positive: string,
): string {
  if (value == null) return PLACEHOLDER;
  const hemisphere = value < 0 ? negative : positive;
  return `${Math.abs(value).toFixed(COORD_DECIMALS)}° ${hemisphere}`;
}

export function formatLatitude(value: number | null | undefined): string {
  return formatCoordinate(value, 'S', 'N');
}

export function formatLongitude(value: number | null | undefined): string {
  return formatCoordinate(value, 'W', 'E');
}
