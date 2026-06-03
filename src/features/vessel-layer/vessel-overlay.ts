import type { OwnVessel } from '$entities/vessel';
import { radiansToBearing } from '$shared/lib';
import { createSymbolOverlay, type Rgba, type SymbolOverlay } from '$shared/map';
import { VESSEL_ICON_ID, vesselIconImage } from './vessel-icon';

const SOURCE_ID = 'binnacle-own-vessel';
const LAYER_ID = 'binnacle-own-vessel-symbol';
const DEFAULT_COLOR: Rgba = { r: 0x1f, g: 0x6f, b: 0xb2, a: 0xff };

// The overlay id. The chart pins this on top so a chart or traffic can never hide the boat; exported
// so the pinned list references the same constant instead of a literal that could drift on a rename.
export const OWN_VESSEL_OVERLAY_ID = 'own-vessel';

function emptyCollection(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

export function createVesselOverlay(vessel: OwnVessel): SymbolOverlay {
  let lastLon: number | undefined;
  let lastLat: number | undefined;
  let lastHeading: number | undefined;

  // Heading drives icon-rotate (degrees), falling back to course over ground, then north.
  const resolveHeading = (): number =>
    radiansToBearing(vessel.headingRad) ?? radiansToBearing(vessel.cogRad) ?? 0;

  function featureCollection(): GeoJSON.FeatureCollection {
    const position = vessel.position;
    if (!position) return emptyCollection();
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [position.longitude, position.latitude] },
          properties: { heading: resolveHeading() },
        },
      ],
    };
  }

  function shouldRefresh(): boolean {
    const position = vessel.position;
    const lon = position?.longitude;
    const lat = position?.latitude;
    const heading = position ? resolveHeading() : undefined;
    if (lon === lastLon && lat === lastLat && heading === lastHeading) return false;
    lastLon = lon;
    lastLat = lat;
    lastHeading = heading;
    return true;
  }

  return createSymbolOverlay({
    id: OWN_VESSEL_OVERLAY_ID,
    title: 'Own vessel',
    band: 'vessel',
    sourceId: SOURCE_ID,
    layerId: LAYER_ID,
    iconId: VESSEL_ICON_ID,
    iconImage: vesselIconImage,
    pixelRatio: 2,
    defaultColor: DEFAULT_COLOR,
    paintColor: (paint) => paint.ownVessel,
    features: featureCollection,
    shouldRefresh,
  });
}
