# Binnacle Foundation, Phase 5: AIS Targets and CPA/TCPA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Render other vessels (AIS) on the map as GPU symbols that rotate with course, age out when they go silent, and carry CPA and TCPA when a Signal K provider supplies it. Prove it end to end: subscribe `vessels.*`, route other-vessel deltas into the store separately from the own vessel, and draw each target in the traffic z-band.

**Architecture:** The worker learns the self vessel from the `hello` message, then routes each reconciled leaf by context: own-vessel leaves keep the existing fast path (the frame `self` record), and other-vessel leaves accumulate per context into a new frame `ais` map. The store keeps own-vessel as today and adds a plain (non-reactive) map of AIS targets, each a bag of latest path values plus a `lastUpdate` stamp, with a prune for stale targets. An `entities/ais` view interprets a target's raw paths into display units (position, COG, heading, name, ship type, CPA, TCPA), reusing the unit converters and a shared lat/lon guard hoisted from the vessel entity. A `features/ais-layer` overlay renders all targets as one GeoJSON symbol layer with `icon-rotate` bound to COG, prunes stale targets each frame, and lives in the `traffic` band so it draws under the own vessel. This realizes design spec sections 5.4.2 and 7.4 (AIS), with CPA/TCPA read from `navigation.closestApproach`.

**Tech Stack:** Svelte 5 runes, TypeScript, the existing `shared/signalk` worker and store, `shared/map` LayerManager, `maplibre-gl` 5.24. Biome, svelte-check, Vitest, Playwright, dependency-cruiser.

**Project rules:** Honors `CLAUDE.md`. American English, no em dashes, Oxford commas, default to no comments. One heavy command at a time on the Pi. Lead-driven implementation, never commit or push on red (the pre-commit and pre-push hooks enforce this). This phase ends with the `/cleanup` skill and a doc gate.

---

## Module boundary note

- `src/shared/signalk/` : hello capture, context routing, the `ais` frame field, batcher `putVessel`, store AIS storage and prune, and a hoisted `isLatLon`/`asNumber` guard module. Generic, imports only `shared`.
- `src/entities/ais/` : the `AisTargets` view interpreting raw targets. Imports `shared` only.
- `src/entities/vessel/` : refactored to use the hoisted guards (no behavior change).
- `src/features/ais-layer/` : the AIS overlay module plus its icon. Imports `entities` and `shared`.
- `src/widgets/chart-canvas/` : registers the AIS overlay and ticks its sync and prune.
- `src/app/App.svelte` : subscribes `vessels.*` and passes the store through.

dependency-cruiser stays green: imports flow down only.

---

## Files created or changed

- Create `src/shared/signalk/geo-guards.ts` and its test: `isLatLon`, `asNumber`.
- Modify `src/shared/signalk/types.ts` : add optional `ais` to `SKFrame`, add `AIS_PATHS`-relevant types if needed.
- Modify `src/shared/signalk/paths.ts` : add the AIS-relevant paths.
- Modify `src/shared/signalk/batcher.ts` and its test : add `putVessel(context, path, value)`, extend `onFlush` to `(self, ais, epoch)`.
- Modify `src/shared/signalk/connection.ts` : expose the raw first message so the worker can read `hello` (already forwards all messages via `onDelta`; no change needed, the worker detects hello).
- Modify `src/shared/signalk/worker-core.ts` and its test : capture `hello.self`, route leaves by context, build the `ais` frame field.
- Modify `src/shared/signalk/store.svelte.ts` and its test : add `aisTargets`, apply the `ais` frame field, add `pruneAis`.
- Modify `src/shared/signalk/index.ts` : export the new guards and AIS types.
- Create `src/entities/ais/ais-targets.svelte.ts` and its test, plus `index.ts`.
- Modify `src/entities/vessel/vessel.svelte.ts` : use the hoisted guards.
- Create `src/features/ais-layer/ais-icon.ts`, `ais-overlay.ts`, `ais-overlay.test.ts`, `index.ts`.
- Modify `src/widgets/chart-canvas/ChartCanvas.svelte` : register the AIS overlay, tick sync and prune.
- Modify `src/app/App.svelte` : add the `vessels.*` subscription.

---

## Task 1: Hoist the lat/lon and number guards to shared

**Files:** create `src/shared/signalk/geo-guards.ts`, `src/shared/signalk/geo-guards.test.ts`; modify `index.ts`, `src/entities/vessel/vessel.svelte.ts`.

- [ ] **Step 1: Failing test.** Create `geo-guards.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { asNumber, isLatLon } from './geo-guards';

describe('geo guards', () => {
  it('isLatLon accepts a lat/lon object', () => {
    expect(isLatLon({ latitude: 1, longitude: 2 })).toBe(true);
  });
  it('isLatLon rejects non-objects and partial shapes', () => {
    expect(isLatLon(null)).toBe(false);
    expect(isLatLon(5)).toBe(false);
    expect(isLatLon({ latitude: 1 })).toBe(false);
  });
  it('asNumber passes numbers through and rejects the rest', () => {
    expect(asNumber(3.5)).toBe(3.5);
    expect(asNumber('3.5')).toBeUndefined();
    expect(asNumber(null)).toBeUndefined();
    expect(asNumber(undefined)).toBeUndefined();
  });
});
```

- [ ] **Step 2:** Run `npx vitest run src/shared/signalk/geo-guards.test.ts`, expect FAIL.

- [ ] **Step 3: Implement.** Create `geo-guards.ts`:
```ts
export interface LatLon {
  latitude: number;
  longitude: number;
}

export function isLatLon(value: unknown): value is LatLon {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as LatLon).latitude === 'number' &&
    typeof (value as LatLon).longitude === 'number'
  );
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}
```

- [ ] **Step 4:** Run the test, expect PASS (3).

- [ ] **Step 5:** Export from `index.ts` (add to the existing named exports):
```ts
export { asNumber, isLatLon } from './geo-guards';
export type { LatLon } from './geo-guards';
```

- [ ] **Step 6:** Refactor `vessel.svelte.ts` to use them. Replace the private `#isLatLon`, `#number`, and the `LatLon` interface with imports:
```ts
import { metersPerSecondToKnots, radiansToDegrees } from '$shared/lib';
import { asNumber, isLatLon, type LatLon, SK_PATHS, type SignalKStore } from '$shared/signalk';
```
Re-export `LatLon` from `entities/vessel/index.ts` if external consumers used it (they import from `$entities/vessel`). Keep the getters; replace `this.#number(p)` with `asNumber(this.#raw(p))` and `this.#isLatLon(value)` with `isLatLon(value)`, keeping `#raw`.

- [ ] **Step 7:** `npm run check`, `npm run cruise`, `npm test`. All green. Commit `refactor(signalk): hoist lat/lon and number guards to shared`.

---

## Task 2: AIS paths

**Files:** modify `src/shared/signalk/paths.ts`.

- [ ] **Step 1:** Add the AIS-relevant paths to `SK_PATHS` (they are plain path strings; AIS targets carry the same `navigation.*` plus identity):
```ts
  closestApproach: 'navigation.closestApproach' as Path,
  navigationState: 'navigation.state' as Path,
  name: 'name' as Path,
  mmsi: 'mmsi' as Path,
  aisShipType: 'design.aisShipType' as Path,
```
Add them inside the existing `SK_PATHS` object literal.

- [ ] **Step 2:** `npm run check`. Commit `feat(signalk): add AIS-relevant paths`.

---

## Task 3: Batcher gains a per-vessel stream

**Files:** modify `src/shared/signalk/batcher.ts`, `batcher.test.ts`.

- [ ] **Step 1: Add a failing test** for `putVessel` to `batcher.test.ts`:
```ts
  it('accumulates per-vessel writes keyed by context, last write wins', () => {
    const batcher = new FrameBatcher();
    let captured: { ais: Map<string, Map<string, unknown>> } | undefined;
    batcher.onFlush = (_self, ais) => {
      captured = { ais };
    };
    batcher.putVessel('vessels.a', 'navigation.speedOverGround', 1);
    batcher.putVessel('vessels.a', 'navigation.speedOverGround', 2);
    batcher.putVessel('vessels.b', 'navigation.headingTrue', 0.5);
    vi.runAllTimers();
    expect(captured?.ais.get('vessels.a')?.get('navigation.speedOverGround')).toBe(2);
    expect(captured?.ais.get('vessels.b')?.get('navigation.headingTrue')).toBe(0.5);
  });
```
(The existing batcher tests pass `(self) => ...`; the new `onFlush` signature `(self, ais, epoch)` is backward compatible since extra args are ignored.)

- [ ] **Step 2:** Run, expect FAIL.

- [ ] **Step 3: Implement.** In `batcher.ts`, change `onFlush` to `(self, ais, epoch)`, add an `#ais` map, a `putVessel`, schedule on either stream, and clear both on flush:
```ts
import type { Value } from '@signalk/server-api';

type Schedule = (cb: (epoch: number) => void) => void;

const defaultSchedule: Schedule =
  typeof requestAnimationFrame === 'function'
    ? (cb) => {
        requestAnimationFrame(cb);
      }
    : (cb) => {
        setTimeout(() => cb(0), 16);
      };

export class FrameBatcher {
  onFlush?: (
    self: Record<string, Value>,
    ais: Map<string, Map<string, Value>>,
    epoch: number,
  ) => void;

  #self = new Map<string, Value>();
  #ais = new Map<string, Map<string, Value>>();
  #scheduled = false;
  #schedule: Schedule;

  constructor(schedule: Schedule = defaultSchedule) {
    this.#schedule = schedule;
  }

  put(path: string, value: Value): void {
    this.#self.set(path, value);
    this.#mark();
  }

  putVessel(context: string, path: string, value: Value): void {
    let vessel = this.#ais.get(context);
    if (!vessel) {
      vessel = new Map();
      this.#ais.set(context, vessel);
    }
    vessel.set(path, value);
    this.#mark();
  }

  #mark(): void {
    if (this.#scheduled) return;
    this.#scheduled = true;
    this.#schedule((epoch) => this.#flush(epoch));
  }

  #flush(epoch: number): void {
    this.#scheduled = false;
    if (this.#self.size === 0 && this.#ais.size === 0) return;
    const self = Object.fromEntries(this.#self);
    const ais = this.#ais;
    this.#self = new Map();
    this.#ais = new Map();
    this.onFlush?.(self, ais, epoch);
  }
}
```

- [ ] **Step 4:** Run `batcher.test.ts`, expect PASS (all, including the existing 3).

- [ ] **Step 5:** Commit `feat(signalk): batcher accumulates per-vessel writes`.

---

## Task 4: Frame and store carry AIS targets

**Files:** modify `types.ts`, `store.svelte.ts`, `store.svelte.test.ts`, `index.ts`.

- [ ] **Step 1: Extend the frame type.** In `types.ts` add to `SKFrame` (optional, so existing test frame literals still compile):
```ts
export interface SKFrame {
  self: Record<string, Value>;
  ais?: Record<string, Record<string, Value>>;
  connection: ConnectionState;
  epoch: number;
}

export interface AisTargetState {
  values: Map<string, Value>;
  lastUpdate: number;
}
```

- [ ] **Step 2: Failing store tests.** Add to `store.svelte.test.ts`:
```ts
  it('applies ais targets from the frame', () => {
    const store = new SignalKStore();
    store.applyFrame({
      self: {},
      ais: { 'vessels.a': { 'navigation.speedOverGround': 4 } },
      connection: { phase: 'open', attempt: 0, since: 0 },
      epoch: 5,
    });
    expect(store.aisTargets.get('vessels.a')?.values.get('navigation.speedOverGround')).toBe(4);
    expect(store.aisTargets.get('vessels.a')?.lastUpdate).toBe(5);
  });

  it('merges later ais updates and refreshes lastUpdate', () => {
    const store = new SignalKStore();
    const frame = (epoch: number, v: number) => ({
      self: {},
      ais: { 'vessels.a': { 'navigation.speedOverGround': v } },
      connection: { phase: 'open' as const, attempt: 0, since: 0 },
      epoch,
    });
    store.applyFrame(frame(1, 4));
    store.applyFrame(frame(2, 6));
    expect(store.aisTargets.get('vessels.a')?.values.get('navigation.speedOverGround')).toBe(6);
    expect(store.aisTargets.get('vessels.a')?.lastUpdate).toBe(2);
  });

  it('prunes targets older than the ttl', () => {
    const store = new SignalKStore();
    store.applyFrame({
      self: {},
      ais: { 'vessels.a': { name: 'A' }, 'vessels.b': { name: 'B' } },
      connection: { phase: 'open', attempt: 0, since: 0 },
      epoch: 1000,
    });
    store.applyFrame({
      self: {},
      ais: { 'vessels.b': { name: 'B' } },
      connection: { phase: 'open', attempt: 0, since: 0 },
      epoch: 400000,
    });
    const removed = store.pruneAis(400000, 360000);
    expect(removed).toBe(1);
    expect(store.aisTargets.has('vessels.a')).toBe(false);
    expect(store.aisTargets.has('vessels.b')).toBe(true);
  });
```

- [ ] **Step 3:** Run, expect FAIL.

- [ ] **Step 4: Implement** in `store.svelte.ts`. Add a plain (non-reactive, read each frame by the overlay) AIS map, merge logic, and prune:
```ts
import type { Value } from '@signalk/server-api';
import type { AisTargetState, ConnectionState, SKFrame } from './types';

export class PathCell {
  value = $state<Value | undefined>(undefined);
  receivedAt = $state(0);
}

export class SignalKStore {
  connection = $state<ConnectionState>({ phase: 'connecting', attempt: 0, since: 0 });
  readonly aisTargets = new Map<string, AisTargetState>();

  #cells = new Map<string, PathCell>();

  cell(path: string): PathCell {
    let cell = this.#cells.get(path);
    if (!cell) {
      cell = new PathCell();
      this.#cells.set(path, cell);
    }
    return cell;
  }

  applyFrame(frame: SKFrame): void {
    for (const path in frame.self) {
      const cell = this.cell(path);
      cell.value = frame.self[path];
      cell.receivedAt = frame.epoch;
    }
    if (frame.ais) {
      for (const context in frame.ais) {
        let target = this.aisTargets.get(context);
        if (!target) {
          target = { values: new Map(), lastUpdate: frame.epoch };
          this.aisTargets.set(context, target);
        }
        const incoming = frame.ais[context];
        for (const path in incoming) target.values.set(path, incoming[path]);
        target.lastUpdate = frame.epoch;
      }
    }
    this.connection = frame.connection;
  }

  pruneAis(now: number, ttlMs: number): number {
    let removed = 0;
    for (const [context, target] of this.aisTargets) {
      if (now - target.lastUpdate > ttlMs) {
        this.aisTargets.delete(context);
        removed += 1;
      }
    }
    return removed;
  }
}
```

- [ ] **Step 5:** Run `store.svelte.test.ts`, expect PASS (existing 4 plus 3 new).

- [ ] **Step 6:** Export `AisTargetState` from `index.ts`. `npm run check`, commit `feat(signalk): store holds and prunes AIS targets`.

---

## Task 5: Worker captures hello and routes by context

**Files:** modify `worker-core.ts`, `worker-core.test.ts`.

- [ ] **Step 1: Failing tests.** Add to `worker-core.test.ts`:
```ts
  it('routes own-vessel deltas to self and other vessels to ais', () => {
    const frames: SKFrame[] = [];
    const core = new WorkerCore();
    core.connect('ws://test', (f) => frames.push(f));
    const ws = FakeWebSocket.instances[0];
    ws.onopen?.();
    ws.onmessage?.({
      data: JSON.stringify({ name: 'sk', version: '1.0.0', self: 'vessels.self-urn' }),
    });
    ws.onmessage?.({
      data: JSON.stringify({
        context: 'vessels.self-urn',
        updates: [{ values: [{ path: 'navigation.speedOverGround', value: 5 }] }],
      }),
    });
    ws.onmessage?.({
      data: JSON.stringify({
        context: 'vessels.other',
        updates: [{ values: [{ path: 'navigation.speedOverGround', value: 9 }] }],
      }),
    });
    vi.runAllTimers();
    const frame = frames.at(-1);
    expect(frame?.self['navigation.speedOverGround']).toBe(5);
    expect(frame?.ais?.['vessels.other']?.['navigation.speedOverGround']).toBe(9);
    expect(frame?.ais?.['vessels.self-urn']).toBeUndefined();
  });

  it('treats vessels.self context as own vessel', () => {
    const frames: SKFrame[] = [];
    const core = new WorkerCore();
    core.connect('ws://test', (f) => frames.push(f));
    const ws = FakeWebSocket.instances[0];
    ws.onopen?.();
    ws.onmessage?.({
      data: JSON.stringify({
        context: 'vessels.self',
        updates: [{ values: [{ path: 'navigation.headingTrue', value: 1 }] }],
      }),
    });
    vi.runAllTimers();
    expect(frames.at(-1)?.self['navigation.headingTrue']).toBe(1);
  });
```

- [ ] **Step 2:** Run, expect FAIL.

- [ ] **Step 3: Implement.** In `worker-core.ts`: track `#self`, detect hello, route in `#ingest`, and build the `ais` field at flush:
```ts
import type { Context, Delta, Path } from '@signalk/server-api';
import { FrameBatcher } from './batcher';
import { SkConnection } from './connection';
import { reconcileDelta } from './reconcile';
import { SubscriptionRegistry } from './subscription-registry';
import type { ConnectionState, SKFrame, SubscribeEntry } from './types';

const SELF_CONTEXT = 'vessels.self';

interface Hello {
  self?: string;
  version?: string;
}

export class WorkerCore {
  #connection?: SkConnection;
  #registry?: SubscriptionRegistry;
  #batcher = new FrameBatcher();
  #onFrame?: (frame: SKFrame) => void;
  #connectionState: ConnectionState = { phase: 'connecting', attempt: 0, since: 0 };
  #selfContext?: string;

  connect(url: string, onFrame: (frame: SKFrame) => void): void {
    this.#onFrame = onFrame;
    this.#connection = new SkConnection(url, {
      onState: (state) => {
        this.#connectionState = state;
      },
      onDelta: (raw) => this.#ingest(raw),
      onOpen: () => this.#registry?.resubscribeAll(),
    });
    this.#registry = new SubscriptionRegistry((message) => this.#connection?.send(message));
    this.#batcher.onFlush = (self, ais, epoch) => {
      const aisRecord: Record<string, Record<string, unknown>> = {};
      for (const [context, values] of ais) {
        aisRecord[context] = Object.fromEntries(values);
      }
      this.#onFrame?.({
        self,
        ais: aisRecord as SKFrame['ais'],
        connection: this.#connectionState,
        epoch,
      });
    };
    this.#connection.connect();
  }

  subscribe(entries: SubscribeEntry[]): void {
    this.#registry?.add(entries);
  }

  unsubscribe(paths: Path[], context?: Context): void {
    this.#connection?.send({
      context: context ?? (SELF_CONTEXT as Context),
      unsubscribe: paths.map((path) => ({ path })),
    });
  }

  disconnect(): void {
    this.#connection?.disconnect();
  }

  #isSelf(context: string): boolean {
    return context === SELF_CONTEXT || context === this.#selfContext;
  }

  #ingest(raw: string): void {
    let message: Delta & Hello;
    try {
      message = JSON.parse(raw) as Delta & Hello;
    } catch {
      if (import.meta.env?.DEV) console.warn('[signalk] dropped a malformed delta frame');
      return;
    }
    if (!message.updates) {
      if (typeof message.self === 'string') this.#selfContext = message.self;
      return;
    }
    reconcileDelta(message, (write) => {
      if (this.#isSelf(write.context)) {
        this.#batcher.put(write.path, write.value);
      } else {
        this.#batcher.putVessel(write.context, write.path, write.value);
      }
    });
  }
}
```

- [ ] **Step 4:** Run `worker-core.test.ts`, expect PASS (existing 2 plus 2 new).

- [ ] **Step 5:** Commit `feat(signalk): capture hello self and route AIS by context`.

---

## Task 6: The AIS targets entity

**Files:** create `src/entities/ais/ais-targets.svelte.ts`, `ais-targets.svelte.test.ts`, `index.ts`.

- [ ] **Step 1: Failing test.** Create `ais-targets.svelte.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { SignalKStore } from '$shared/signalk';
import { AisTargets } from './ais-targets.svelte';

function frame(ais: Record<string, Record<string, unknown>>, epoch = 1) {
  return {
    self: {},
    ais: ais as Record<string, Record<string, never>>,
    connection: { phase: 'open' as const, attempt: 0, since: 0 },
    epoch,
  };
}

describe('AisTargets', () => {
  it('lists targets with converted display values', () => {
    const store = new SignalKStore();
    const ais = new AisTargets(store);
    store.applyFrame(
      frame({
        'vessels.urn:mrn:imo:mmsi:123': {
          'navigation.position': { latitude: 36, longitude: -121 },
          'navigation.courseOverGroundTrue': Math.PI,
          'navigation.speedOverGround': 1,
          name: 'OTHER',
        },
      }),
    );
    const list = ais.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('vessels.urn:mrn:imo:mmsi:123');
    expect(list[0].name).toBe('OTHER');
    expect(list[0].position).toEqual({ latitude: 36, longitude: -121 });
    expect(list[0].cogDegrees).toBeCloseTo(180, 6);
    expect(list[0].sogKnots).toBeCloseTo(1.943844, 5);
  });

  it('skips targets without a position', () => {
    const store = new SignalKStore();
    const ais = new AisTargets(store);
    store.applyFrame(frame({ 'vessels.x': { name: 'no pos' } }));
    expect(ais.list()).toHaveLength(0);
  });

  it('exposes closestApproach as cpa and tcpa', () => {
    const store = new SignalKStore();
    const ais = new AisTargets(store);
    store.applyFrame(
      frame({
        'vessels.y': {
          'navigation.position': { latitude: 0, longitude: 0 },
          'navigation.closestApproach': { distance: 926, timeTo: 600 },
        },
      }),
    );
    const target = ais.list()[0];
    expect(target.cpaMeters).toBe(926);
    expect(target.tcpaSeconds).toBe(600);
  });
});
```

- [ ] **Step 2:** Run, expect FAIL.

- [ ] **Step 3: Implement.** Create `ais-targets.svelte.ts`:
```ts
import { metersPerSecondToKnots, radiansToDegrees } from '$shared/lib';
import { asNumber, isLatLon, type LatLon, SK_PATHS, type SignalKStore } from '$shared/signalk';

export interface AisTargetView {
  id: string;
  name?: string;
  position: LatLon;
  cogDegrees?: number;
  headingDegrees?: number;
  sogKnots?: number;
  shipTypeId?: number;
  cpaMeters?: number;
  tcpaSeconds?: number;
}

export class AisTargets {
  #store: SignalKStore;

  constructor(store: SignalKStore) {
    this.#store = store;
  }

  list(): AisTargetView[] {
    const out: AisTargetView[] = [];
    for (const [id, target] of this.#store.aisTargets) {
      const position = target.values.get(SK_PATHS.position);
      if (!isLatLon(position)) continue;
      const name = target.values.get(SK_PATHS.name);
      const shipType = target.values.get(SK_PATHS.aisShipType);
      const approach = target.values.get(SK_PATHS.closestApproach);
      out.push({
        id,
        name: typeof name === 'string' ? name : undefined,
        position,
        cogDegrees: radiansToDegrees(asNumber(target.values.get(SK_PATHS.courseOverGroundTrue))),
        headingDegrees: radiansToDegrees(asNumber(target.values.get(SK_PATHS.headingTrue))),
        sogKnots: metersPerSecondToKnots(asNumber(target.values.get(SK_PATHS.speedOverGround))),
        shipTypeId: this.#shipTypeId(shipType),
        cpaMeters: this.#approachField(approach, 'distance'),
        tcpaSeconds: this.#approachField(approach, 'timeTo'),
      });
    }
    return out;
  }

  #shipTypeId(value: unknown): number | undefined {
    if (typeof value === 'object' && value !== null) {
      return asNumber((value as { id?: unknown }).id);
    }
    return undefined;
  }

  #approachField(value: unknown, field: 'distance' | 'timeTo'): number | undefined {
    if (typeof value === 'object' && value !== null) {
      return asNumber((value as Record<string, unknown>)[field]);
    }
    return undefined;
  }
}
```

- [ ] **Step 4:** Run, expect PASS (3). Create `index.ts`:
```ts
export { AisTargets } from './ais-targets.svelte';
export type { AisTargetView } from './ais-targets.svelte';
```

- [ ] **Step 5:** `npm run cruise`, commit `feat(ais): AisTargets entity view`.

---

## Task 7: The AIS overlay

**Files:** create `src/features/ais-layer/ais-icon.ts`, `ais-overlay.ts`, `ais-overlay.test.ts`, `index.ts`.

- [ ] **Step 1: The icon.** Create `ais-icon.ts` (a hollow triangle distinct from own vessel, cached once like the vessel icon):
```ts
export const AIS_ICON_ID = 'binnacle-ais';
const SIZE = 28;

let cached: ImageData | undefined;

// A hollow amber triangle for AIS targets, distinct from the filled own-vessel icon.
export function aisIconImage(): ImageData {
  if (cached) return cached;
  const data = new Uint8ClampedArray(SIZE * SIZE * 4);
  const cx = SIZE / 2;
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const t = y / SIZE;
      const halfWidth = (t * SIZE) / 2.6;
      const onEdge =
        y > 3 && Math.abs(Math.abs(x - cx) - halfWidth) <= 1.4 && Math.abs(x - cx) <= halfWidth + 1.4;
      const baseEdge = y >= SIZE - 3 && Math.abs(x - cx) <= halfWidth;
      if (onEdge || baseEdge) {
        const i = (y * SIZE + x) * 4;
        data[i] = 0xe6;
        data[i + 1] = 0xc1;
        data[i + 2] = 0x4e;
        data[i + 3] = 0xff;
      }
    }
  }
  cached = new ImageData(data, SIZE, SIZE);
  return cached;
}
```

- [ ] **Step 2: Failing overlay test.** Create `ais-overlay.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AisTargets } from '$entities/ais';
import type { OverlayContext } from '$shared/map';
import { SignalKStore } from '$shared/signalk';
import { createFakeMap } from '$shared/testing/fake-map';
import { createAisOverlay } from './ais-overlay';

class FakeImageData {
  constructor(
    public data: Uint8ClampedArray,
    public width: number,
    public height: number,
  ) {}
}

beforeEach(() => vi.stubGlobal('ImageData', FakeImageData));
afterEach(() => vi.unstubAllGlobals());

function ctxFor(map: ReturnType<typeof createFakeMap>): OverlayContext {
  return { map: map as never, beforeIdFor: () => undefined };
}

describe('ais overlay', () => {
  it('adds an image, a source, and a symbol layer in the traffic band', () => {
    const store = new SignalKStore();
    const overlay = createAisOverlay(new AisTargets(store), store);
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    expect(overlay.band).toBe('traffic');
    expect(map.images.size).toBe(1);
    expect(map.sources.size).toBe(1);
    expect(map.layers.size).toBe(1);
  });

  it('syncs one feature per positioned target', () => {
    const store = new SignalKStore();
    const overlay = createAisOverlay(new AisTargets(store), store);
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    store.applyFrame({
      self: {},
      ais: {
        'vessels.a': { 'navigation.position': { latitude: 1, longitude: 2 } },
        'vessels.b': { name: 'no pos' },
      },
      connection: { phase: 'open', attempt: 0, since: 0 },
      epoch: 1,
    });
    overlay.sync(ctxFor(map));
    const source = [...map.sources.values()][0];
    const fc = source.data as { features: unknown[] };
    expect(fc.features).toHaveLength(1);
  });
});
```

- [ ] **Step 3:** Run, expect FAIL.

- [ ] **Step 4: Implement.** Create `ais-overlay.ts` (mirrors the vessel overlay shape, but renders the whole list and exposes a `prune`):
```ts
import type { AisTargets } from '$entities/ais';
import type {
  GeoJSONSource,
  GeoJSONSourceSpecification,
  SymbolLayerSpecification,
} from 'maplibre-gl';
import type { OverlayContext, OverlayModule } from '$shared/map';
import type { SignalKStore } from '$shared/signalk';
import { AIS_ICON_ID, aisIconImage } from './ais-icon';

const SOURCE_ID = 'binnacle-ais';
const LAYER_ID = 'binnacle-ais-symbol';
const STALE_TTL_MS = 360_000;

interface AisOverlay extends OverlayModule {
  sync(ctx: OverlayContext): void;
}

export function createAisOverlay(targets: AisTargets, store: SignalKStore): AisOverlay {
  function featureCollection(): GeoJSON.FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: targets.list().map((target) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [target.position.longitude, target.position.latitude],
        },
        properties: {
          id: target.id,
          name: target.name ?? '',
          heading: target.headingDegrees ?? target.cogDegrees ?? 0,
        },
      })),
    };
  }

  return {
    id: 'ais',
    title: 'AIS targets',
    band: 'traffic',
    supportsOpacity: true,
    add(ctx) {
      if (!ctx.map.hasImage(AIS_ICON_ID)) {
        ctx.map.addImage(AIS_ICON_ID, aisIconImage());
      }
      const source: GeoJSONSourceSpecification = { type: 'geojson', data: featureCollection() };
      ctx.map.addSource(SOURCE_ID, source);
      const layer: SymbolLayerSpecification = {
        id: LAYER_ID,
        type: 'symbol',
        source: SOURCE_ID,
        layout: {
          'icon-image': AIS_ICON_ID,
          'icon-rotate': ['get', 'heading'],
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      };
      ctx.map.addLayer(layer, ctx.beforeIdFor('traffic'));
    },
    sync(ctx) {
      const now = store.aisNow?.() ?? performanceNow();
      store.pruneAis(now, STALE_TTL_MS);
      const source = ctx.map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
      source?.setData(featureCollection());
    },
    setVisible(ctx, visible) {
      ctx.map.setLayoutProperty(LAYER_ID, 'visibility', visible ? 'visible' : 'none');
    },
    setOpacity(ctx, opacity) {
      ctx.map.setPaintProperty(LAYER_ID, 'icon-opacity', opacity);
    },
    remove(ctx) {
      if (ctx.map.getLayer(LAYER_ID)) ctx.map.removeLayer(LAYER_ID);
      if (ctx.map.getSource(SOURCE_ID)) ctx.map.removeSource(SOURCE_ID);
    },
  };
}

function performanceNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : 0;
}
```
NOTE: the prune in `sync` must use a clock comparable to the frame `epoch`, which is the `requestAnimationFrame` timestamp (also `performance.now()` based). Since the worker stamps `epoch` from rAF, and the overlay sync runs on the main-thread rAF, both share the `performance.now()` timeline closely enough for a 6-minute TTL. Do NOT add a `store.aisNow` method; simplify the sync to:
```ts
    sync(ctx) {
      store.pruneAis(performanceNow(), STALE_TTL_MS);
      const source = ctx.map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
      source?.setData(featureCollection());
    },
```
(Remove the `store.aisNow?.()` reference; it does not exist.)

- [ ] **Step 5:** Run, expect PASS (2). Create `index.ts`:
```ts
export { createAisOverlay } from './ais-overlay';
```

- [ ] **Step 6:** `npm run cruise`, commit `feat(ais): AIS symbol overlay with aging`.

---

## Task 8: Wire AIS into the canvas and the shell

**Files:** modify `ChartCanvas.svelte`, `App.svelte`.

- [ ] **Step 1: Register the AIS overlay in `ChartCanvas.svelte`.** Import `AisTargets` and `createAisOverlay`, construct an `AisTargets(store)`, register the overlay after the vessel overlay, and call its `sync` in the rAF tick alongside the vessel overlay:
```ts
import { AisTargets } from '$entities/ais';
import { createAisOverlay } from '$features/ais-layer';
```
In the load handler, after registering the vessel overlay:
```ts
    const aisOverlay = createAisOverlay(new AisTargets(store), store);
    await manager.register(aisOverlay);
    if (destroyed) return;
```
And in the tick:
```ts
    const tick = () => {
      overlay.sync(ctx);
      aisOverlay.sync(ctx);
      frame = requestAnimationFrame(tick);
    };
```
Keep the `LayersView` creation after both overlays register so both appear in the panel.

- [ ] **Step 2: Subscribe `vessels.*` in `App.svelte`.** Add a second subscribe call in `onMount` after the self subscription:
```ts
    await client.raw.subscribe([
      { path: SK_PATHS.position, context: 'vessels.*' as never, policy: 'fixed', period: 5000 },
      { path: SK_PATHS.courseOverGroundTrue, context: 'vessels.*' as never, policy: 'fixed', period: 5000 },
      { path: SK_PATHS.speedOverGround, context: 'vessels.*' as never, policy: 'fixed', period: 5000 },
      { path: SK_PATHS.headingTrue, context: 'vessels.*' as never, policy: 'fixed', period: 5000 },
      { path: SK_PATHS.name, context: 'vessels.*' as never, policy: 'fixed', period: 5000 },
      { path: SK_PATHS.aisShipType, context: 'vessels.*' as never, policy: 'fixed', period: 5000 },
      { path: SK_PATHS.closestApproach, context: 'vessels.*' as never, policy: 'fixed', period: 5000 },
    ]);
```
The `SubscribeEntry.context` is typed `Context` (a branded string); use `'vessels.*' as Context` by importing the type, or keep the existing `as never` pattern already used for paths. Prefer importing `Context`:
```ts
import { createSignalKClient, SignalKStore, SK_PATHS, streamUrl, type Context } from '$shared/signalk';
```
and use `'vessels.*' as Context`. (Confirm `Context` is exported from the signalk index; it is re-exported via `types.ts`. If not exported from the barrel, add `export type { Context } from './types';` to `src/shared/signalk/index.ts`.)

- [ ] **Step 3:** `npm run check`, `npm run cruise`. Green.

- [ ] **Step 4:** Build and e2e (the smoke test still asserts only the stable chrome, which is unchanged). Commit `feat(app): subscribe vessels.* and render AIS targets`.

---

## Task 9: Full local gate

Run, one heavy command at a time, capturing each to a file and reading it back:
- [ ] `biome ci .`
- [ ] `npm run cruise` (new slices `entities/ais`, `features/ais-layer` import only down).
- [ ] `NODE_OPTIONS=--max-old-space-size=2048 npm run check`
- [ ] `NODE_OPTIONS=--max-old-space-size=2048 npm test`
- [ ] `NODE_OPTIONS=--max-old-space-size=2048 NODE_ENV=production npm run build`
- [ ] `NODE_OPTIONS=--max-old-space-size=2048 npm run test:e2e`

All green before committing.

---

## Task 10: Cleanup gate and phase close

- [ ] **Step 1:** Run `/cleanup` against the Phase 5 diff (inline lead audit is fine for this surface), brief on the style rules.
- [ ] **Step 2:** Fix every finding, including nit.
- [ ] **Step 3: Doc gate.** Add the Phase 5 CHANGELOG entry. Update the README status (AIS targets render with CPA/TCPA when a provider supplies it). Confirm CLAUDE.md still matches. Rebuild before quoting any bundle figure.
- [ ] **Step 4:** Re-run the full gate (Task 9). Commit and push (the pre-push hook re-verifies).
- [ ] **Step 5: Exit criteria.** AIS targets render on the map in the traffic band, rotate by course, age out after the TTL, and expose CPA and TCPA in the model; the worker routing, store, entity, and overlay are unit-tested; dependency-cruiser confirms the new slices' boundaries.

When all are true, Phase 5 is complete and Phase 6 (the shell and day/dusk/night-red theming) can begin.

---

## Self-review notes

- **Spec coverage:** implements the AIS portion of the design (section 5.4.2 mechanism and 7.4): subscribe `vessels.*` at a controlled rate, filter self via the hello, render targets as a GPU symbol layer rotating by COG in the traffic band, age out silent targets, and read CPA and TCPA from `navigation.closestApproach` when a provider populates it. Also folds in two deferred cleanup items: the hoisted lat/lon and number guards, and AIS-target eviction (addressing the earlier unbounded-growth note).
- **Deferred, recorded:** per-class AIS icon coloring (cargo, tanker, sailing) via a data-driven `icon-image` match, the danger-strip CPA/TCPA alarm UI (that is the active-safety CoPilot differentiator, a separate brainstorm), and AIS target selection and info popovers. Each is a clean later addition against the AisTargetView and the overlay.
- **Backward compatibility:** `SKFrame.ais` is optional, so every existing frame literal in the test suite still compiles. The batcher `onFlush` gains arguments but stays call-compatible with the existing `(self) => ...` tests.
- **Type and name consistency:** `AisTargetState`, `AisTargets`, `AisTargetView`, `createAisOverlay`, `AIS_ICON_ID`, `pruneAis`, `putVessel`, `isLatLon`, and `asNumber` are used identically across tasks. The store AIS map key is the full context string throughout.
- **Pi memory and verify-before-push:** every heavy command runs alone and the gate is read from files before any commit; the hooks enforce it.
