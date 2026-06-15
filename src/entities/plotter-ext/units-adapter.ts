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

// Map Binnacle's coarse metric/imperial mode to the spec vocabulary. Speed and distance follow the
// marine convention (knots and nautical miles) in both modes, which is what Binnacle itself
// displays; the mode drives depth, length, and temperature. A future refinement can read the
// server's per-category unit preset for finer control; extensions tolerate either since they
// combine these with each path's own meta.units.
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
