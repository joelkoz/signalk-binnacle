import type { LatLon } from '$shared/geo';
import { withTimeout } from '$shared/lib';
import { authInit, putResource } from '$shared/signalk';

// The HTTP client for the signalk-anchoralarm-plugin. Every call returns whether it succeeded and
// never throws: a missing plugin, a 401, or a dead network all come back false, and the caller
// degrades to the client-side watch (the closestApproach pattern). There is no separate presence
// probe: the drop attempt itself is the detection.

const PLUGIN_BASE = '/plugins/anchoralarm';

async function post(url: string, token: string | undefined, body: unknown): Promise<boolean> {
  try {
    const response = await fetch(
      url,
      withTimeout(
        authInit(token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
      ),
    );
    return response.ok;
  } catch {
    return false;
  }
}

// Drop the anchor at the vessel's current position with the given watch radius. On success the
// plugin starts watching server-side and its state arrives back over the stream.
export function dropAnchorOnServer(
  base: string,
  token: string | undefined,
  radiusMeters: number,
): Promise<boolean> {
  return post(`${base}${PLUGIN_BASE}/dropAnchor`, token, { radius: radiusMeters });
}

export function setServerRadius(
  base: string,
  token: string | undefined,
  radiusMeters: number,
): Promise<boolean> {
  return post(`${base}${PLUGIN_BASE}/setRadius`, token, { radius: radiusMeters });
}

export function raiseServerAnchor(base: string, token: string | undefined): Promise<boolean> {
  return post(`${base}${PLUGIN_BASE}/raiseAnchor`, token, {});
}

// Correct the drop point after a drag-to-adjust on the chart, via the plugin's PUT handler on the
// standard path.
export function putServerAnchorPosition(
  base: string,
  token: string | undefined,
  position: LatLon,
): Promise<boolean> {
  return putResource(`${base}/signalk/v1/api/vessels/self/navigation/anchor/position`, token, {
    value: { latitude: position.latitude, longitude: position.longitude },
  });
}
