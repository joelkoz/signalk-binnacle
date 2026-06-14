import { isFiniteNumber, litersToVolume, type UnitsMode, volumeUnit } from '$shared/lib';
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
// types. Every other flag kind passes through unchanged, and the kind order from orderDraftFlags is
// preserved by splicing the hazard groups back where the hazards sat.
export function groupDraftFlags(flags: readonly DraftFlag[]): DraftFlagItem[] {
  const ordered = orderDraftFlags(flags);
  const items: DraftFlagItem[] = [];
  const legOrder: (number | undefined)[] = [];
  const countsByLeg = new Map<number | undefined, Map<string, number>>();
  let hazardsAt = -1;
  for (const flag of ordered) {
    if (flag.kind !== 'hazard') {
      items.push({ kind: flag.kind, message: flag.message });
      continue;
    }
    if (hazardsAt < 0) hazardsAt = items.length;
    let counts = countsByLeg.get(flag.leg);
    if (counts === undefined) {
      counts = new Map();
      countsByLeg.set(flag.leg, counts);
      legOrder.push(flag.leg);
    }
    counts.set(flag.message, (counts.get(flag.message) ?? 0) + 1);
  }
  if (legOrder.length === 0) return items;
  const groups = legOrder.map((leg) =>
    hazardGroup(leg, countsByLeg.get(leg) as Map<string, number>),
  );
  items.splice(hazardsAt, 0, ...groups);
  return items;
}

function hazardGroup(leg: number | undefined, counts: Map<string, number>): DraftFlagItem {
  let total = 0;
  for (const n of counts.values()) total += n;
  if (total === 1) {
    const [message] = counts.keys();
    return { kind: 'hazard', message };
  }
  const where = leg === undefined ? 'near the route' : `near leg ${leg + 1}`;
  const detail = [...counts.entries()].map(([message, n]) => {
    const label = hazardLabel(message);
    return n > 1 ? `${label} ×${n}` : label;
  });
  return {
    kind: 'hazard',
    message: `${total} charted hazards ${where}, verify on the chart`,
    detail,
  };
}

// Shorten a hazard message for the per-leg breakdown by dropping the shared "Charted ... within the
// leg corridor" framing the summary already conveys. Falls back to the full message when it does not
// match, so a server rewording degrades gracefully rather than blanking the line.
function hazardLabel(message: string): string {
  const stripped = message.replace(/^Charted /, '').replace(/ within the leg corridor$/, '');
  if (stripped === '' || stripped === message) return message;
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
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
