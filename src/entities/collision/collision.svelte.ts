import type { AisTargets, AisTargetView } from '$entities/ais';
import type { OwnVessel } from '$entities/vessel';
import { degreesToRadians, knotsToMetersPerSecond } from '$shared/lib';
import { computeCpa } from '$shared/nav';
import type { PersistedValue, Thresholds } from '$shared/settings';
import type { LatLon } from '$shared/signalk';

export type Severity = 'danger' | 'warning' | 'clear';
export type CpaSource = 'provider' | 'computed';

export interface DangerContact {
  id: string;
  name?: string;
  cpaMeters: number;
  tcpaSeconds: number;
  severity: Severity;
  source: CpaSource;
}

export interface Assessment {
  contacts: DangerContact[];
  worst: Severity;
}

interface OwnFix {
  position: LatLon;
  sogKnots: number;
  cogDegrees: number;
}

const SEVERITY_RANK: Record<Severity, number> = { danger: 0, warning: 1, clear: 2 };

function classify(cpaMeters: number, tcpaSeconds: number, t: Thresholds): Severity {
  if (cpaMeters <= t.dangerCpaMeters && tcpaSeconds <= t.dangerTcpaSeconds) return 'danger';
  if (cpaMeters <= t.warningCpaMeters && tcpaSeconds <= t.warningTcpaSeconds) return 'warning';
  return 'clear';
}

export function assessContacts(
  own: OwnFix | undefined,
  targets: AisTargetView[],
  thresholds: Thresholds,
): Assessment {
  if (!own) return { contacts: [], worst: 'clear' };
  const ownK = {
    latitude: own.position.latitude,
    longitude: own.position.longitude,
    sogMps: knotsToMetersPerSecond(own.sogKnots ?? 0),
    cogRad: degreesToRadians(own.cogDegrees ?? 0),
  };
  const contacts: DangerContact[] = [];
  for (const t of targets) {
    let cpaMeters: number;
    let tcpaSeconds: number;
    let source: CpaSource;
    if (t.cpaMeters != null && t.tcpaSeconds != null) {
      // A negative TCPA means the closest approach is in the past: the target is
      // opening or has passed, so it is not a danger even at a small CPA.
      if (t.tcpaSeconds < 0) continue;
      cpaMeters = t.cpaMeters;
      tcpaSeconds = t.tcpaSeconds;
      source = 'provider';
    } else {
      const r = computeCpa(ownK, {
        latitude: t.position.latitude,
        longitude: t.position.longitude,
        sogMps: knotsToMetersPerSecond(t.sogKnots ?? 0),
        cogRad: degreesToRadians(t.cogDegrees ?? 0),
      });
      if (!r.closing) continue;
      cpaMeters = r.cpaMeters;
      tcpaSeconds = r.tcpaSeconds;
      source = 'computed';
    }
    const severity = classify(cpaMeters, tcpaSeconds, thresholds);
    if (severity === 'clear') continue;
    contacts.push({ id: t.id, name: t.name, cpaMeters, tcpaSeconds, severity, source });
  }
  contacts.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.tcpaSeconds - b.tcpaSeconds,
  );
  const worst: Severity = contacts[0]?.severity ?? 'clear';
  return { contacts, worst };
}

export class CollisionAssessment {
  #vessel: OwnVessel;
  #targets: AisTargets;
  #thresholds: PersistedValue<Thresholds>;

  acknowledged = $state(false);

  constructor(vessel: OwnVessel, targets: AisTargets, thresholds: PersistedValue<Thresholds>) {
    this.#vessel = vessel;
    this.#targets = targets;
    this.#thresholds = thresholds;
  }

  get assessment(): Assessment {
    const position = this.#vessel.position;
    const own = position
      ? { position, sogKnots: this.#vessel.sogKnots ?? 0, cogDegrees: this.#vessel.cogDegrees ?? 0 }
      : undefined;
    return assessContacts(own, this.#targets.list(), this.#thresholds.value);
  }

  get worst(): Severity {
    return this.assessment.worst;
  }

  acknowledge(): void {
    this.acknowledged = true;
  }

  reset(): void {
    this.acknowledged = false;
  }
}
