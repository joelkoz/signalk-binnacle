import type { AisTargetView } from '$entities/ais';
import type { DangerContact, Severity } from '$entities/collision';
import type { LatLon } from '$shared/geo';
import { haversineMeters, rhumbBearingRad } from '$shared/nav';

export type AisSort = 'range' | 'cpa' | 'name';

export interface AisListRow {
  id: string;
  // The display name: the vessel's reported name, or its MMSI from the context id.
  label: string;
  position: LatLon;
  rangeMeters?: number;
  bearingRad?: number;
  sogMps?: number;
  cpaMeters?: number;
  tcpaSeconds?: number;
  // The lookout's grading for this contact, when it considers it a risk.
  severity?: Severity;
}

// 'vessels.urn:mrn:imo:mmsi:368000000' reads as '368000000'; an unrecognized id passes through.
export function shortVesselId(id: string): string {
  const lastColon = id.lastIndexOf(':');
  return lastColon >= 0 ? id.slice(lastColon + 1) : id;
}

// Sort comparators put targets with no value for the key last, so the unknowns do not bury the
// nearest or most pressing contacts.
function byOptional(a: number | undefined, b: number | undefined): number {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return a - b;
}

export function buildAisRows(
  targets: readonly AisTargetView[],
  own: LatLon | undefined,
  contacts: readonly DangerContact[],
  sort: AisSort,
): AisListRow[] {
  // The lookout's grading per contact id, so a risky target reads in its severity color here too.
  const severities = new Map<string, Severity>();
  for (const contact of contacts) severities.set(contact.id, contact.severity);
  const rows = targets.map<AisListRow>((target) => ({
    id: target.id,
    label: target.name || shortVesselId(target.id),
    position: target.position,
    rangeMeters: own
      ? haversineMeters(
          own.latitude,
          own.longitude,
          target.position.latitude,
          target.position.longitude,
        )
      : undefined,
    bearingRad: own ? rhumbBearingRad(own, target.position) : undefined,
    sogMps: target.sogMps,
    cpaMeters: target.cpaMeters,
    tcpaSeconds: target.tcpaSeconds,
    severity: severities.get(target.id),
  }));
  if (sort === 'name') rows.sort((a, b) => a.label.localeCompare(b.label));
  else if (sort === 'cpa') rows.sort((a, b) => byOptional(a.cpaMeters, b.cpaMeters));
  else rows.sort((a, b) => byOptional(a.rangeMeters, b.rangeMeters));
  return rows;
}
