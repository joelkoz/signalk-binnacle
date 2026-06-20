import type { UnitsMode } from '$shared/lib';

// The units.get payload (plotter-extensions-api.md, "Unit preferences"). Signal K values are SI on
// the wire; this is what the user wants displayed, so an extension combines a path's meta.units
// with these preferences to choose conversions.
export interface UnitPreferences {
  speed: 'kn' | 'm/s' | 'km/h' | 'mph';
  distance: 'kilometer' | 'naut-mile';
  depth: 'm' | 'foot';
  length: 'm' | 'foot';
  temperature: 'C' | 'F';
}

// Map Binnacle's metric/imperial mode (already resolved from the server's unit preference in the
// units store, not a local toggle) to the spec vocabulary. Speed and distance are always reported as
// knots and nautical miles, which is what Binnacle itself displays, so a server set to a km/h or
// kilometer preset is not reflected here; only depth, length, and temperature follow the mode.
// Extensions combine these with each path's own meta.units. Forwarding the per-category targetUnit
// for speed and distance is a later refinement.
export function unitsForMode(mode: UnitsMode): UnitPreferences {
  const imperial = mode === 'imperial';
  return {
    speed: 'kn',
    distance: 'naut-mile',
    depth: imperial ? 'foot' : 'm',
    length: imperial ? 'foot' : 'm',
    temperature: imperial ? 'F' : 'C',
  };
}
