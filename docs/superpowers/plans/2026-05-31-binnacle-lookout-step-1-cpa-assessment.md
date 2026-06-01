# Binnacle Lookout, Step 1: CPA/TCPA Math and the Collision Assessment

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build the data foundation of Lookout: pure, test-first CPA/TCPA math in `shared/nav`, a configurable threshold settings store in `shared/settings`, and a `CollisionAssessment` entity that ranks AIS contacts by danger (provider value preferred, computed fallback). No UI yet; this step is fully unit-tested headless logic the later steps render.

**Architecture:** `shared/nav/cpa.ts` is a pure function over SI inputs. `shared/settings/persisted.svelte.ts` is a generic localStorage-backed runes value, with a `lookout-thresholds` instance. `entities/collision/collision.svelte.ts` reads the `OwnVessel` and `AisTargets` entities plus the thresholds and exposes ranked `DangerContact`s, the worst severity, and an `acknowledged` flag. This is the first of six Lookout steps from `docs/superpowers/specs/2026-05-31-binnacle-lookout-design.md`.

**Tech Stack:** TypeScript, Svelte 5 runes (`$state`, `$derived`), Vitest. Units from `$shared/lib`. No new dependencies.

**Project rules:** Honors `CLAUDE.md`. American English, no em dashes, Oxford commas, default to no comments. One heavy command at a time on the Pi (`NODE_OPTIONS="--max-old-space-size=2048"`). Lead-driven, never commit or push on red (the `.githooks` pre-commit and pre-push gates enforce it). Ends with the `/cleanup` skill and the full gate.

---

## Module boundary note

- `src/shared/nav/cpa.ts`, `cpa.test.ts`, `src/shared/nav/index.ts`: new `shared/nav` segment. Pure, imports nothing above `shared`.
- `src/shared/settings/persisted.svelte.ts`, `persisted.svelte.test.ts`, `src/shared/settings/index.ts`: new `shared/settings` segment. Imports nothing above `shared`.
- `src/entities/collision/collision.svelte.ts`, `collision.svelte.test.ts`, `src/entities/collision/index.ts`: new `entities/collision` slice. Imports `$entities/vessel`, `$entities/ais`, `$shared/nav`, `$shared/settings`, `$shared/lib` (all same-layer or downward). Cross-entity imports of `$entities/vessel` and `$entities/ais` are allowed: dependency-cruiser forbids cross-FEATURE internals, not cross-entity use of public indexes.

dependency-cruiser must stay green.

---

## Reference: existing signatures this step builds on

- `OwnVessel` (`$entities/vessel`): `position?: LatLon {latitude, longitude}` (degrees), `sogKnots?: number`, `cogDegrees?: number`, `headingDegrees?: number`.
- `AisTargets.list()` (`$entities/ais`) returns `AisTargetView[]`: `{ id, name?, position: LatLon, cogDegrees?, sogKnots?, cpaMeters?, tcpaSeconds?, shipTypeId? }`. The `cpaMeters`/`tcpaSeconds` here are the provider's `navigation.closestApproach` values when present.
- `$shared/lib` exports `metersPerSecondToKnots`, `metersToNauticalMiles`, `radiansToDegrees` (and inverses are NOT present; this step needs knots->m/s and degrees->radians, added locally as tiny pure helpers or inline, since the assessment works in SI).
- The store's AIS changes bump `store.aisVersion` (used by overlays as a dirty-check; the assessment will read the same signal so it recomputes only when AIS changes).

NOTE on units: `AisTargetView` exposes `sogKnots` and `cogDegrees` (display units), not raw SI. The CPA math needs m/s and radians. Convert at the assessment boundary: `knots * 0.514444 -> m/s`, `degrees * Math.PI / 180 -> radians`. Define these two constants in `collision.svelte.ts` (or a tiny `$shared/lib` addition) rather than re-deriving inline.

---

## Task 1: CPA/TCPA math

**Files:** create `src/shared/nav/cpa.ts`, `src/shared/nav/cpa.test.ts`, `src/shared/nav/index.ts`.

- [ ] **Step 1: Failing test.** Create `cpa.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { computeCpa } from './cpa';

// Helper: own vessel at the equator/prime meridian, stationary unless stated.
const own = { latitude: 0, longitude: 0, sogMps: 0, cogRad: 0 };

describe('computeCpa', () => {
  it('a target closing head-on reports the meeting point and time', () => {
    // Target 1852 m due north (0.01667 deg lat ~ 1 nm), steaming due south at 5 m/s,
    // own vessel stationary. They meet at the own position in 1852/5 = 370.4 s, cpa ~ 0.
    const target = { latitude: 1852 / 111320, longitude: 0, sogMps: 5, cogRad: Math.PI };
    const r = computeCpa(own, target);
    expect(r.closing).toBe(true);
    expect(r.tcpaSeconds).toBeGreaterThan(360);
    expect(r.tcpaSeconds).toBeLessThan(381);
    expect(r.cpaMeters).toBeLessThan(20);
  });

  it('a target steaming away is not closing', () => {
    const target = { latitude: 1852 / 111320, longitude: 0, sogMps: 5, cogRad: 0 };
    const r = computeCpa(own, target);
    expect(r.closing).toBe(false);
  });

  it('a parallel target on a constant offset keeps its beam distance', () => {
    // Target 926 m due east, both steaming due north at 5 m/s: range stays ~926 m, never closes.
    const movingOwn = { latitude: 0, longitude: 0, sogMps: 5, cogRad: 0 };
    const target = { latitude: 0, longitude: 926 / 111320, sogMps: 5, cogRad: 0 };
    const r = computeCpa(movingOwn, target);
    expect(r.cpaMeters).toBeGreaterThan(900);
    expect(r.cpaMeters).toBeLessThan(952);
  });
});
```

- [ ] **Step 2:** Run `NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/shared/nav/cpa.test.ts`. Expect FAIL (no module).

- [ ] **Step 3: Implement.** Create `cpa.ts`:
```ts
export interface Kinematics {
  latitude: number;
  longitude: number;
  sogMps: number;
  cogRad: number;
}

export interface CpaResult {
  cpaMeters: number;
  tcpaSeconds: number;
  closing: boolean;
}

const METERS_PER_DEG_LAT = 111_320;

// Local east-north projection around the own vessel. Accurate within the few
// nautical miles that matter for collision; large separations are not the use case.
function toLocalMeters(origin: Kinematics, point: Kinematics): [number, number] {
  const east = (point.longitude - origin.longitude) * METERS_PER_DEG_LAT * Math.cos((origin.latitude * Math.PI) / 180);
  const north = (point.latitude - origin.latitude) * METERS_PER_DEG_LAT;
  return [east, north];
}

function velocity(k: Kinematics): [number, number] {
  // Course is measured clockwise from north, so east = sin, north = cos.
  return [k.sogMps * Math.sin(k.cogRad), k.sogMps * Math.cos(k.cogRad)];
}

export function computeCpa(own: Kinematics, target: Kinematics): CpaResult {
  const [rx, ry] = toLocalMeters(own, target);
  const [ovx, ovy] = velocity(own);
  const [tvx, tvy] = velocity(target);
  const dvx = tvx - ovx;
  const dvy = tvy - ovy;
  const dv2 = dvx * dvx + dvy * dvy;
  const rangeNow = Math.hypot(rx, ry);
  if (dv2 === 0) {
    // No relative motion: range is constant and they never close.
    return { cpaMeters: rangeNow, tcpaSeconds: 0, closing: false };
  }
  const tcpa = -(rx * dvx + ry * dvy) / dv2;
  if (tcpa <= 0) {
    // CPA is in the past (opening or already passed).
    return { cpaMeters: rangeNow, tcpaSeconds: 0, closing: false };
  }
  const cx = rx + dvx * tcpa;
  const cy = ry + dvy * tcpa;
  return { cpaMeters: Math.hypot(cx, cy), tcpaSeconds: tcpa, closing: true };
}
```

- [ ] **Step 4:** Run the test. Expect PASS (3). Create `src/shared/nav/index.ts`:
```ts
export { computeCpa } from './cpa';
export type { CpaResult, Kinematics } from './cpa';
```

- [ ] **Step 5:** `npm run cruise` (green), then commit `feat(nav): pure CPA and TCPA computation`.

---

## Task 2: Persisted settings helper and the threshold store

**Files:** create `src/shared/settings/persisted.svelte.ts`, `persisted.svelte.test.ts`, `src/shared/settings/index.ts`.

- [ ] **Step 1: Failing test.** Create `persisted.svelte.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { PersistedValue } from './persisted.svelte';

describe('PersistedValue', () => {
  it('uses the default when storage is empty', () => {
    const store = new Map<string, string>();
    const p = new PersistedValue('k', { a: 1 }, fakeStorage(store));
    expect(p.value).toEqual({ a: 1 });
  });

  it('restores a persisted value', () => {
    const store = new Map<string, string>([['k', JSON.stringify({ a: 9 })]]);
    const p = new PersistedValue('k', { a: 1 }, fakeStorage(store));
    expect(p.value).toEqual({ a: 9 });
  });

  it('set persists and updates', () => {
    const store = new Map<string, string>();
    const p = new PersistedValue('k', { a: 1 }, fakeStorage(store));
    p.set({ a: 2 });
    expect(p.value).toEqual({ a: 2 });
    expect(JSON.parse(store.get('k') as string)).toEqual({ a: 2 });
  });

  it('falls back to the default on malformed JSON', () => {
    const store = new Map<string, string>([['k', 'not json']]);
    const p = new PersistedValue('k', { a: 1 }, fakeStorage(store));
    expect(p.value).toEqual({ a: 1 });
  });
});

function fakeStorage(map: Map<string, string>): Pick<Storage, 'getItem' | 'setItem'> {
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, v),
  };
}
```

- [ ] **Step 2:** Run, expect FAIL.

- [ ] **Step 3: Implement.** Create `persisted.svelte.ts`:
```ts
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function resolveStorage(injected?: StorageLike): StorageLike | undefined {
  if (injected) return injected;
  return typeof localStorage !== 'undefined' ? localStorage : undefined;
}

// A reactive value persisted to localStorage as JSON, with a default and a storage
// injection seam for tests. Mirrors the theme controller's persistence shape.
export class PersistedValue<T> {
  value = $state<T>(undefined as unknown as T);

  #key: string;
  #storage: StorageLike | undefined;

  constructor(key: string, fallback: T, storage?: StorageLike) {
    this.#key = key;
    this.#storage = resolveStorage(storage);
    this.value = this.#read(fallback);
  }

  set(next: T): void {
    this.value = next;
    this.#storage?.setItem(this.#key, JSON.stringify(next));
  }

  #read(fallback: T): T {
    const raw = this.#storage?.getItem(this.#key);
    if (raw == null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
}
```

- [ ] **Step 4:** Run, expect PASS (4).

- [ ] **Step 5:** Add the threshold types and factory to `persisted.svelte.ts` (same file, below the class):
```ts
export interface Thresholds {
  dangerCpaMeters: number;
  dangerTcpaSeconds: number;
  warningCpaMeters: number;
  warningTcpaSeconds: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  dangerCpaMeters: 926, // 0.5 nm
  dangerTcpaSeconds: 600, // 10 min
  warningCpaMeters: 1852, // 1 nm
  warningTcpaSeconds: 1200, // 20 min
};

export function createThresholds(storage?: StorageLike): PersistedValue<Thresholds> {
  return new PersistedValue('binnacle:lookout-thresholds', DEFAULT_THRESHOLDS, storage);
}
```

- [ ] **Step 6:** Create `src/shared/settings/index.ts`:
```ts
export { createThresholds, DEFAULT_THRESHOLDS, PersistedValue } from './persisted.svelte';
export type { Thresholds } from './persisted.svelte';
```

- [ ] **Step 7:** `npm run check`, `npm run cruise` (green), commit `feat(settings): persisted value helper and Lookout thresholds`.

---

## Task 3: The collision assessment entity

**Files:** create `src/entities/collision/collision.svelte.ts`, `collision.svelte.test.ts`, `src/entities/collision/index.ts`.

- [ ] **Step 1: Failing test.** Create `collision.svelte.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { AisTargetView } from '$entities/ais';
import { DEFAULT_THRESHOLDS } from '$shared/settings';
import { assessContacts } from './collision.svelte';

const ownStationary = { position: { latitude: 0, longitude: 0 }, sogKnots: 0, cogDegrees: 0 };

function target(partial: Partial<AisTargetView>): AisTargetView {
  return { id: 't', position: { latitude: 0, longitude: 0 }, ...partial };
}

describe('assessContacts', () => {
  it('returns no dangers without an own position', () => {
    const r = assessContacts(undefined, [target({})], DEFAULT_THRESHOLDS);
    expect(r.contacts).toHaveLength(0);
    expect(r.worst).toBe('clear');
  });

  it('prefers the provider CPA/TCPA when present and flags the source', () => {
    const t = target({ id: 'p', cpaMeters: 100, tcpaSeconds: 120 });
    const r = assessContacts(ownStationary, [t], DEFAULT_THRESHOLDS);
    expect(r.contacts[0].source).toBe('provider');
    expect(r.contacts[0].severity).toBe('danger');
    expect(r.worst).toBe('danger');
  });

  it('computes CPA/TCPA when the provider value is absent and flags it computed', () => {
    // 1 nm due north closing south at ~10 kn: well inside the danger band.
    const t = target({ id: 'c', position: { latitude: 1852 / 111320, longitude: 0 }, sogKnots: 10, cogDegrees: 180 });
    const r = assessContacts(ownStationary, [t], DEFAULT_THRESHOLDS);
    expect(r.contacts[0].source).toBe('computed');
    expect(['danger', 'warning']).toContain(r.contacts[0].severity);
  });

  it('classifies a distant opening target as clear and drops it', () => {
    const t = target({ id: 'o', position: { latitude: 0.2, longitude: 0 }, sogKnots: 10, cogDegrees: 0 });
    const r = assessContacts(ownStationary, [t], DEFAULT_THRESHOLDS);
    expect(r.contacts.every((c) => c.severity !== 'clear')).toBe(true);
    expect(r.worst).toBe('clear');
  });

  it('ranks danger before warning', () => {
    const danger = target({ id: 'd', cpaMeters: 100, tcpaSeconds: 60 });
    const warn = target({ id: 'w', cpaMeters: 1500, tcpaSeconds: 900 });
    const r = assessContacts(ownStationary, [warn, danger], DEFAULT_THRESHOLDS);
    expect(r.contacts[0].id).toBe('d');
  });
});
```

- [ ] **Step 2:** Run, expect FAIL.

- [ ] **Step 3: Implement the pure assessment function.** Create `collision.svelte.ts`:
```ts
import type { AisTargetView } from '$entities/ais';
import type { OwnVessel } from '$entities/vessel';
import type { LatLon } from '$shared/signalk';
import { computeCpa } from '$shared/nav';
import type { Thresholds } from '$shared/settings';

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

const KNOTS_TO_MPS = 0.514444;
const DEG_TO_RAD = Math.PI / 180;
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
    sogMps: (own.sogKnots ?? 0) * KNOTS_TO_MPS,
    cogRad: (own.cogDegrees ?? 0) * DEG_TO_RAD,
  };
  const contacts: DangerContact[] = [];
  for (const t of targets) {
    let cpaMeters: number;
    let tcpaSeconds: number;
    let source: CpaSource;
    if (t.cpaMeters != null && t.tcpaSeconds != null) {
      cpaMeters = t.cpaMeters;
      tcpaSeconds = t.tcpaSeconds;
      source = 'provider';
    } else {
      const r = computeCpa(ownK, {
        latitude: t.position.latitude,
        longitude: t.position.longitude,
        sogMps: (t.sogKnots ?? 0) * KNOTS_TO_MPS,
        cogRad: (t.cogDegrees ?? 0) * DEG_TO_RAD,
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
  contacts.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.tcpaSeconds - b.tcpaSeconds);
  const worst: Severity = contacts[0]?.severity ?? 'clear';
  return { contacts, worst };
}
```

- [ ] **Step 4:** Run, expect PASS (5).

- [ ] **Step 5: Add the reactive store wrapper** to `collision.svelte.ts` (below the pure function). It binds the entities and thresholds into a `$derived` assessment plus a UI-managed `acknowledged` flag:
```ts
import { AisTargets } from '$entities/ais';
import type { PersistedValue } from '$shared/settings';

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
```
NOTE: `assessment` reads `OwnVessel` and `AisTargets.list()`, both of which read reactive store cells, so a component using `assessment` inside its own `$derived`/template recomputes when the store changes. There is no separate dirty-check here; the later overlay step (Lookout step 3) adds the `aisVersion` guard for the GPU layer where it matters.

- [ ] **Step 6:** Create `src/entities/collision/index.ts`:
```ts
export { assessContacts, CollisionAssessment } from './collision.svelte';
export type { Assessment, CpaSource, DangerContact, Severity } from './collision.svelte';
```

- [ ] **Step 7:** `npm run check`, `npm run cruise` (green), commit `feat(collision): ranked CPA/TCPA assessment entity`.

---

## Task 4: Full local gate

Run each heavy command alone, capture to a file, read it back:
- [ ] `biome ci .`
- [ ] `npm run cruise`
- [ ] `NODE_OPTIONS="--max-old-space-size=2048" npm run check`
- [ ] `NODE_OPTIONS="--max-old-space-size=2048" npm test`
- [ ] `NODE_OPTIONS="--max-old-space-size=2048" NODE_ENV=production npm run build`

All green before committing.

---

## Task 5: Cleanup gate and step close

- [ ] **Step 1:** Run `/cleanup` against this step's diff (inline lead audit), brief on the style rules. Look specifically for: duplicated unit constants (the knots/deg conversions should live in one place), any non-pure logic that crept into `cpa.ts`, and missing edge-case handling (zero closing speed, missing target course).
- [ ] **Step 2:** Fix every finding, including nit.
- [ ] **Step 3: Doc gate.** Add a CHANGELOG "Unreleased" entry for the Lookout data layer (CPA/TCPA math, thresholds, assessment). No README status change yet (Lookout is not user-visible until step 2 lands the strip); note in the CHANGELOG that this is the first slice of the Lookout feature.
- [ ] **Step 4:** Re-run the full gate (Task 4). Commit and push (the pre-push hook re-verifies).
- [ ] **Step 5: Exit criteria.** `computeCpa` is pure and unit-tested across closing, opening, and parallel cases; thresholds persist and default sensibly; `assessContacts` prefers provider values, computes the fallback, classifies, drops clear/opening targets, and ranks danger first; `CollisionAssessment` exposes a reactive `assessment`, `worst`, and `acknowledged`; dependency-cruiser confirms the new `shared/nav`, `shared/settings`, and `entities/collision` boundaries; all gates green.

When all are true, Lookout step 1 is complete. Step 2 (the danger strip widget mounted in the shell, theme-aware, with acknowledge/mute) follows, consuming `CollisionAssessment`.

---

## Self-review notes

- **Spec coverage:** implements build-order step 1 of the Lookout spec: the CPA/TCPA math (provider-preferred is realized in `assessContacts`, the computed fallback in `computeCpa`), the configurable thresholds (persisted, with defaults), and the ranked assessment entity. The UI, overlay, audio, and notifications are later steps, intentionally not here.
- **Placeholder scan:** every code step shows complete code; the two NOTE blocks describe real design choices (unit conversion location, no separate dirty-check at the entity level), not deferrals.
- **Type and name consistency:** `Kinematics`, `CpaResult`, `computeCpa`, `Thresholds`, `DEFAULT_THRESHOLDS`, `createThresholds`, `PersistedValue`, `assessContacts`, `Assessment`, `DangerContact`, `Severity`, `CpaSource`, and `CollisionAssessment` are used identically across tasks and match the spec's names.
- **Boundary note:** `entities/collision` importing `$entities/vessel` and `$entities/ais` is cross-entity via their public indexes, which dependency-cruiser allows (it forbids cross-feature internals, not cross-entity public use). Verified in Task 4.
- **Verify before push:** every heavy command runs alone and is read from a file before any commit; the hooks enforce green; one heavy command at a time respects the Pi budget.
