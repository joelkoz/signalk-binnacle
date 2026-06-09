import type { AisTargets, AisTargetView } from '$entities/ais';
import type { OwnVessel } from '$entities/vessel';
import type { LatLon } from '$shared/geo';
import { computeCpa } from '$shared/nav';
import type { PersistedValue, Thresholds } from '$shared/settings';

export type Severity = 'danger' | 'warning' | 'clear';
export type CpaSource = 'provider' | 'computed';

export interface DangerContact {
  id: string;
  name?: string;
  position: LatLon;
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
  sogMps: number;
  cogRad: number;
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
    sogMps: own.sogMps,
    cogRad: own.cogRad,
  };
  const contacts: DangerContact[] = [];
  for (const t of targets) {
    let cpaMeters: number;
    let tcpaSeconds: number;
    let source: CpaSource;
    if (t.cpaMeters != null && t.tcpaSeconds != null) {
      // A TCPA at or below zero means the closest approach is now or already past, so the
      // target is no longer closing and is not a danger even at a small CPA. This matches the
      // computed branch, which also treats tcpa <= 0 as not closing, so the two CPA sources
      // apply the same gate.
      if (t.tcpaSeconds <= 0) continue;
      cpaMeters = t.cpaMeters;
      tcpaSeconds = t.tcpaSeconds;
      source = 'provider';
    } else {
      const r = computeCpa(ownK, {
        latitude: t.position.latitude,
        longitude: t.position.longitude,
        sogMps: t.sogMps ?? 0,
        cogRad: t.cogRad ?? 0,
      });
      if (!r.closing) continue;
      cpaMeters = r.cpaMeters;
      tcpaSeconds = r.tcpaSeconds;
      source = 'computed';
    }
    const severity = classify(cpaMeters, tcpaSeconds, thresholds);
    if (severity === 'clear') continue;
    contacts.push({
      id: t.id,
      name: t.name,
      position: t.position,
      cpaMeters,
      tcpaSeconds,
      severity,
      source,
    });
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

  // The worst-contact signature (id and severity) that was acknowledged. The alert is
  // suppressed only while the current worst contact still matches it, so a new or more
  // severe contact re-arms the alert automatically. Full mute lifecycle is Lookout step 4.
  #ackSignature = $state<string | null>(null);

  // Memoized so the O(targets) CPA loop runs once per real change, not once per read. The
  // assessment is read several times per frame (alarm, notifier, danger strip, overlay), and
  // the overlay reads it every animation frame; $derived recomputes only when traffic, the
  // own fix, or the thresholds actually change. The version read tracks the non-reactive Map.
  #assessment = $derived.by<Assessment>(() => {
    void this.#targets.version;
    const position = this.#vessel.position;
    const own = position
      ? { position, sogMps: this.#vessel.sogMps ?? 0, cogRad: this.#vessel.cogRad ?? 0 }
      : undefined;
    return assessContacts(own, this.#targets.list(), this.#thresholds.value);
  });

  constructor(vessel: OwnVessel, targets: AisTargets, thresholds: PersistedValue<Thresholds>) {
    this.#vessel = vessel;
    this.#targets = targets;
    this.#thresholds = thresholds;
  }

  get assessment(): Assessment {
    return this.#assessment;
  }

  // True when the current worst contact has been acknowledged and has not since changed.
  get suppressed(): boolean {
    const sig = this.#signature();
    return sig !== null && sig === this.#ackSignature;
  }

  acknowledge(): void {
    this.#ackSignature = this.#signature();
  }

  #signature(): string | null {
    const top = this.assessment.contacts[0];
    return top ? `${top.id}:${top.severity}` : null;
  }
}
