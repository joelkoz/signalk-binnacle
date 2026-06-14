import {
  capitalize,
  isFiniteNumber,
  litersToVolume,
  type UnitsMode,
  volumeUnit,
} from '$shared/lib';
import type { DraftFlag, DraftFlagItem, DraftFuel } from './route-draft-client';

// Land first (a route crossing land is the worst case), then charted shallow water, then charted
// hazards, then fuel, then anything else. Same-kind flags keep the server's order under a stable sort.
const FLAG_ORDER: Record<DraftFlag['kind'], number> = {
  land: 0,
  shallow: 1,
  hazard: 2,
  fuel: 3,
  other: 4,
};

export function orderDraftFlags(flags: readonly DraftFlag[]): DraftFlag[] {
  return [...flags].sort((a, b) => FLAG_ORDER[a.kind] - FLAG_ORDER[b.kind]);
}

// A single leg can cross many charted point hazards (a busy river charts dozens), so collapse the
// hazard flags on each leg into one summary line plus a deduped, counted breakdown of the hazard
// types. Other kinds pass through unchanged: land and shallow sort before hazards and fuel and other
// after, so partitioning on FLAG_ORDER keeps the kind order with no insertion-position bookkeeping.
export function groupDraftFlags(flags: readonly DraftFlag[]): DraftFlagItem[] {
  const before: DraftFlagItem[] = [];
  const after: DraftFlagItem[] = [];
  const countsByLeg = new Map<number | undefined, Map<string, number>>();
  for (const flag of orderDraftFlags(flags)) {
    if (flag.kind === 'hazard') {
      let counts = countsByLeg.get(flag.leg);
      if (counts === undefined) {
        counts = new Map();
        countsByLeg.set(flag.leg, counts);
      }
      counts.set(flag.message, (counts.get(flag.message) ?? 0) + 1);
    } else if (FLAG_ORDER[flag.kind] < FLAG_ORDER.hazard) {
      before.push({ kind: flag.kind, message: flag.message });
    } else {
      after.push({ kind: flag.kind, message: flag.message });
    }
  }
  const groups = Array.from(countsByLeg, ([leg, counts]) => hazardGroup(leg, counts));
  return [...before, ...groups, ...after];
}

function hazardGroup(leg: number | undefined, counts: Map<string, number>): DraftFlagItem {
  let total = 0;
  for (const n of counts.values()) total += n;
  if (total === 1) {
    const [message] = counts.keys();
    return { kind: 'hazard', message };
  }
  const where = leg === undefined ? 'near the route' : `near leg ${leg + 1}`;
  const detail = Array.from(counts, ([message, n]) => {
    const label = hazardLabel(message);
    return n > 1 ? `${label} ×${n}` : label;
  });
  return {
    kind: 'hazard',
    message: `${total} charted hazards ${where}, verify on the chart`,
    detail,
  };
}

// The shared framing every hazard message carries ("Charted <type> within the leg corridor"). The
// per-leg summary already conveys it, so the breakdown strips it. Module scope to compile once.
const HAZARD_PREFIX = /^Charted /;
const HAZARD_SUFFIX = / within the leg corridor$/;

// Shorten a hazard message for the per-leg breakdown by dropping the shared framing above. When
// neither end matches, the full message is returned unchanged, so a server rewording degrades to the
// original line rather than a blank.
function hazardLabel(message: string): string {
  const stripped = message.replace(HAZARD_PREFIX, '').replace(HAZARD_SUFFIX, '');
  if (stripped === '' || stripped === message) return message;
  return capitalize(stripped);
}

// One display line for the server-computed fuel estimate, in the navigator's unit system. The numbers
// come from the plugin server-side; this never does burn math, only the unit conversion and phrasing.
export function formatDraftFuel(fuel: DraftFuel, mode: UnitsMode): string {
  const unit = volumeUnit(mode);
  const show = (liters: number) => Math.round(litersToVolume(liters, mode));
  const parts = [`needs ~${show(fuel.neededL)} ${unit}`];
  if (isFiniteNumber(fuel.aboardL)) parts.push(`~${show(fuel.aboardL)} ${unit} aboard`);
  if (isFiniteNumber(fuel.marginPct)) parts.push(`${Math.round(fuel.marginPct)}% margin`);
  const line = `Fuel: ${parts.join(', ')}.`;
  return fuel.derateNote ? `${line} ${fuel.derateNote}` : line;
}
