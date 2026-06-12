import { postAnchorCommand } from './anchor-client';

// The HTTP client for the standard Signal K Anchor API, a PROPOSAL tracked by the weekly upstream
// watch: routes and bodies mirror the current text of the server repo's
// docs/develop/rest-api/proposed/anchor_api.md (endpoint vessels/self/navigation/anchor per the
// proposed-APIs index), and they get updated here when the proposal moves. No released server
// implements it yet, so callers gate on feature detection (see anchor-transport.ts). Same degrade
// contract as the plugin client: every call resolves to whether it succeeded and never throws.

const API_BASE = '/signalk/v2/api/vessels/self/navigation/anchor';

export function dropAnchorViaApi(base: string, token: string | undefined): Promise<boolean> {
  return postAnchorCommand(`${base}${API_BASE}/drop`, token);
}

export function raiseAnchorViaApi(base: string, token: string | undefined): Promise<boolean> {
  return postAnchorCommand(`${base}${API_BASE}/raise`, token);
}

export function setRadiusViaApi(
  base: string,
  token: string | undefined,
  radiusMeters: number,
): Promise<boolean> {
  return postAnchorCommand(`${base}${API_BASE}/radius`, token, { value: radiusMeters });
}

// Have the server compute the anchor position from the rode paid out and the depth at the anchor,
// a capability the plugin path has no equivalent for.
export function repositionAnchorViaApi(
  base: string,
  token: string | undefined,
  rodeLengthMeters: number,
  anchorDepthMeters: number,
): Promise<boolean> {
  return postAnchorCommand(`${base}${API_BASE}/reposition`, token, {
    rodeLength: rodeLengthMeters,
    anchorDepth: anchorDepthMeters,
  });
}
