import { litersToVolume, type UnitsMode, volumeUnit } from '$shared/lib';
import type { DraftFlag, DraftFuel } from './route-draft-client';

// Land first (a route crossing land is the worst case), then coarse-bathymetry deep-water warnings,
// then fuel, then anything else. Same-kind flags keep the server's order under a stable sort.
const FLAG_ORDER: Record<DraftFlag['kind'], number> = {
  land: 0,
  'deep-water-only': 1,
  fuel: 2,
  other: 3,
};

export function orderDraftFlags(flags: readonly DraftFlag[]): DraftFlag[] {
  return [...flags].sort((a, b) => FLAG_ORDER[a.kind] - FLAG_ORDER[b.kind]);
}

// One display line for the server-computed fuel estimate, in the navigator's unit system. The numbers
// are the companion's; this never does burn math, only the unit conversion and the phrasing.
export function formatDraftFuel(fuel: DraftFuel, mode: UnitsMode): string {
  const unit = volumeUnit(mode);
  const show = (liters: number) => Math.round(litersToVolume(liters, mode));
  const parts = [`needs ~${show(fuel.neededL)} ${unit}`];
  if (typeof fuel.aboardL === 'number') parts.push(`~${show(fuel.aboardL)} ${unit} aboard`);
  if (typeof fuel.marginPct === 'number') parts.push(`${Math.round(fuel.marginPct)}% margin`);
  const line = `Fuel: ${parts.join(', ')}.`;
  return fuel.derateNote ? `${line} ${fuel.derateNote}` : line;
}
