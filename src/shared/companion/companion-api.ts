/** The one place the webapp builds the companion plugin api base. Both companion webapp clients (the
 * prewarm client here and the PMTiles chart-management client) call companionApiUrl(origin, path), so
 * the base path is spelled once. base is always the server origin; the caller owns the rest of the path. */

export const COMPANION_API_PATH = '/plugins/signalk-binnacle-companion/api';

export function companionApiUrl(origin: string, path: string): string {
  return `${origin}${COMPANION_API_PATH}${path}`;
}
