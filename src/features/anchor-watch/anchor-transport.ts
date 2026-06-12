import type { LatLon } from '$shared/geo';
import {
  dropAnchorViaApi,
  raiseAnchorViaApi,
  repositionAnchorViaApi,
  setRadiusViaApi,
} from './anchor-api-client';
import {
  dropAnchorOnServer,
  putServerAnchorPosition,
  raiseServerAnchor,
  setServerRadius,
} from './anchor-client';

// The server-side anchor action chain, resolved once per connection: the standard Anchor API when
// the features endpoint advertises it, otherwise the anchoralarm plugin, whose presence is still
// detected by the drop attempt itself (a false from drop means degrade to the client-side watch,
// unchanged). Every method keeps the boolean degrade contract of the underlying clients.

export type AnchorTransportKind = 'standard' | 'plugin' | 'none';

export interface AnchorTransport {
  kind: AnchorTransportKind;
  drop(radiusMeters: number): Promise<boolean>;
  raise(): Promise<boolean>;
  setRadius(radiusMeters: number): Promise<boolean>;
  setPosition(position: LatLon): Promise<boolean>;
  // Standard API only: compute the anchor position from rode length and anchor depth. The plugin
  // path has no equivalent, so consumers must feature-check before offering it.
  reposition?(rodeLengthMeters: number, anchorDepthMeters: number): Promise<boolean>;
}

const refuse = () => Promise.resolve(false);

// The inert transport for before the features answer arrives (or after the caller has given up on
// the server entirely): every action reports failure, so callers degrade to the client-side watch.
export const NO_ANCHOR_TRANSPORT: AnchorTransport = {
  kind: 'none',
  drop: refuse,
  raise: refuse,
  setRadius: refuse,
  setPosition: refuse,
};

export function resolveAnchorTransport(
  base: string,
  token: string | undefined,
  opts: { standardApiAvailable: boolean },
): AnchorTransport {
  if (!opts.standardApiAvailable) {
    return {
      kind: 'plugin',
      drop: (radiusMeters) => dropAnchorOnServer(base, token, radiusMeters),
      raise: () => raiseServerAnchor(base, token),
      setRadius: (radiusMeters) => setServerRadius(base, token, radiusMeters),
      setPosition: (position) => putServerAnchorPosition(base, token, position),
    };
  }
  return {
    kind: 'standard',
    async drop(radiusMeters) {
      if (!(await dropAnchorViaApi(base, token))) return false;
      // The proposal's drop takes no body, so the watch radius is a second POST. Its failure does
      // not fail the drop: the server watch is already active, and a false here would start a
      // duplicate client watch under it; the navigator can re-set the radius from the panel.
      await setRadiusViaApi(base, token, radiusMeters);
      return true;
    },
    raise: () => raiseAnchorViaApi(base, token),
    setRadius: (radiusMeters) => setRadiusViaApi(base, token, radiusMeters),
    // The proposal defines no position-correction route. The v1 PUT on the standard anchor path is
    // what the anchoralarm plugin handles today; an implementation without that handler answers
    // non-OK and this degrades to false like any other call.
    setPosition: (position) => putServerAnchorPosition(base, token, position),
    reposition: (rodeLengthMeters, anchorDepthMeters) =>
      repositionAnchorViaApi(base, token, rodeLengthMeters, anchorDepthMeters),
  };
}
