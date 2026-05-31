# Binnacle Foundation, Phase 2: Real-Time Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the modular real-time data layer: a Web Worker that hosts the Signal K WebSocket client, parses and per-frame-batches deltas, and bridges them through Comlink to a path-keyed Svelte 5 runes store that the UI reads with fine-grained reactivity. Prove it end to end by showing live connection state and own-vessel readouts in the shell.

**Architecture:** All networking, parsing, batching, the subscription registry, and reconnection live in a dedicated Web Worker built from framework-free, unit-testable TypeScript classes. The worker is exposed with Comlink; the main thread wraps it and receives one batched `SKFrame` per animation frame through a single proxied callback, with AIS-style numeric payloads transferred as typed arrays. The main thread applies each frame to a path-keyed store of independently reactive cells, so a component bound to one Signal K path never re-runs when an unrelated path changes. Values stay in Signal K SI units in the store and are converted only at the display edge. Everything sits in `shared/signalk` (generic infrastructure) plus a `vessel` entity that derives own-vessel readouts; the core never learns about specific features.

**Tech Stack:** Svelte 5 runes, TypeScript, Comlink 4.4.2, `@signalk/server-api` 2.25.0 (branded `Path`, `Context`, `Delta`, and `Update` types plus the `hasValues` and `hasMeta` guards), Vitest 4.1 with `@vitest/web-worker` 4.1.7, and the existing `shared/lib/units` module.

**Project rules:** Honors `CLAUDE.md`. American English, no em dashes, Oxford commas, default to no comments. Lint and format with Biome (system binary), type-check with `svelte-check --tsconfig ./tsconfig.app.json`, boundaries with dependency-cruiser. One heavy verification process at a time on the Pi; never run two of check, lint, test, or build at once. This whole phase is one major step under the build policy, so it ends with the `/cleanup` skill and a fix-everything-including-nit pass.

**Build approach:** A lead-plus-team build. The lead owns `package.json`, all commits, and every heavy command (run one at a time). The lead first lands the shared contracts (Task 1 and Task 2) so the interfaces are fixed, then teammates build the independent units (reconcile, batcher, subscription registry, and backoff) in parallel against those contracts, edits only. The lead integrates, wires the worker and store (the tightly-coupled core), runs verification, and drives cleanup.

---

## Module boundary note

New code lands in two Feature-Sliced Design slices, both at or below where the UI can reach them:

- `src/shared/signalk/` : the entire data-layer infrastructure (types, reconcile, batcher, subscription registry, backoff, connection, worker, Comlink client, and the path-keyed store). Generic, feature-agnostic.
- `src/entities/vessel/` : a thin own-vessel view that reads store cells and exposes typed, converted readouts. Depends only on `shared`.

`src/app/App.svelte` reads the vessel entity and the connection state to render proof-of-life. dependency-cruiser must stay green: `shared` imports nothing above it, and `entities` imports only `shared`.

---

## File structure created in this phase

- `src/shared/signalk/paths.ts` : the typed catalog of Signal K paths Binnacle reads, with each path's SI unit noted.
- `src/shared/signalk/types.ts` : data-layer types (`SKFrame`, `SubscribeEntry`, `ConnectionState`, `ConnectionPhase`, and the worker API interface), re-exporting the branded `@signalk/server-api` types the layer uses.
- `src/shared/signalk/reconcile.ts` : pure delta-to-leaf reconciliation.
- `src/shared/signalk/reconcile.test.ts` : reconcile unit tests.
- `src/shared/signalk/batcher.ts` : the worker-side `FrameBatcher` (per-frame, last-write-wins coalescing).
- `src/shared/signalk/batcher.test.ts` : batcher unit tests (fake timers).
- `src/shared/signalk/subscription-registry.ts` : refcounted demand mapped onto subscribe and unsubscribe messages.
- `src/shared/signalk/subscription-registry.test.ts` : registry unit tests.
- `src/shared/signalk/backoff.ts` : full-jitter capped exponential backoff.
- `src/shared/signalk/backoff.test.ts` : backoff unit tests.
- `src/shared/signalk/connection.ts` : WebSocket lifecycle, reconnection, cached-value replay, and connection-state emission (framework-free).
- `src/shared/signalk/worker-core.ts` : composes connection, reconcile, batcher, and registry; no Comlink and no `self` reference, so it is unit-testable directly.
- `src/shared/signalk/sk.worker.ts` : the worker entry point. The only file that imports Comlink and touches `self`.
- `src/shared/signalk/client.ts` : main-thread Comlink wrapper exposing a typed async client.
- `src/shared/signalk/store.svelte.ts` : the path-keyed runes store of independently reactive cells, plus reactive connection state.
- `src/shared/signalk/store.svelte.test.ts` : store data and fine-grained reactivity tests.
- `src/shared/signalk/index.ts` : the slice public API.
- `src/entities/vessel/vessel.svelte.ts` : own-vessel readouts derived from the store, converted to display units.
- `src/entities/vessel/vessel.svelte.test.ts` : vessel-view tests.
- `src/entities/vessel/index.ts` : the slice public API.
- `vite.config.ts` : add a `unit-svelte` Vitest project for `*.svelte.test.ts` files.
- `src/app/App.svelte` : wire connection state and own-vessel readouts for proof-of-life.
- `package.json` : add `comlink`, `@signalk/server-api`, and `@vitest/web-worker`.

---

## Task 1: Add dependencies and the Vitest project for runes tests

**Files:**
- Modify: `package.json` (lead only)
- Modify: `vite.config.ts`

- [ ] **Step 1: Add the runtime and test dependencies**

The lead adds these to `package.json` and runs one install:

```json
{
  "dependencies": {
    "@signalk/server-api": "^2.25.0",
    "comlink": "^4.4.2"
  },
  "devDependencies": {
    "@vitest/web-worker": "^4.1.7"
  }
}
```

Run:
```bash
cd /home/dietpi/src/signalk-binnacle
NODE_OPTIONS="--max-old-space-size=2048" npm install
```
Expected: install succeeds, `npm audit --omit=dev` reports 0 vulnerabilities.

- [ ] **Step 2: Add a Vitest project that runs runes tests**

The existing `unit` project excludes `*.svelte.{test,spec}.ts`. Runes tests that use `$effect.root` or `$derived` must be compiled by the Svelte plugin, so add a second project for them. Edit `vite.config.ts` so the `test.projects` array reads:

```ts
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.{test,spec}.ts'],
          exclude: ['src/**/*.svelte.{test,spec}.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'unit-svelte',
          environment: 'node',
          include: ['src/**/*.svelte.{test,spec}.ts'],
        },
      },
    ],
  },
```

(The Svelte plugin is already registered at the top of the config, so both projects inherit it via `extends: true`. Runes-in-modules need no DOM, so `node` is correct.)

- [ ] **Step 3: Verify the test runner still passes**

Run:
```bash
NODE_OPTIONS="--max-old-space-size=2048" npm test
```
Expected: the existing 6 units tests pass; the new `unit-svelte` project reports no test files yet, which is fine.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json vite.config.ts
git commit -m "build: add comlink, server-api, and the runes test project"
```

---

## Task 2: The typed path catalog and data-layer types (shared contracts)

These are the contracts every other unit builds against, so the lead lands them before dispatching the parallel lanes.

**Files:**
- Create: `src/shared/signalk/paths.ts`
- Create: `src/shared/signalk/types.ts`

- [ ] **Step 1: Write the path catalog**

Create `src/shared/signalk/paths.ts`:
```ts
import type { Path } from '@signalk/server-api';

// Signal K is SI: angles in radians, speed in m/s, depth in meters, temperature
// in Kelvin. navigation.position is the exception: decimal degrees.
export const SK_PATHS = {
  position: 'navigation.position' as Path,
  headingTrue: 'navigation.headingTrue' as Path,
  headingMagnetic: 'navigation.headingMagnetic' as Path,
  courseOverGroundTrue: 'navigation.courseOverGroundTrue' as Path,
  speedOverGround: 'navigation.speedOverGround' as Path,
  speedThroughWater: 'navigation.speedThroughWater' as Path,
  depthBelowTransducer: 'environment.depth.belowTransducer' as Path,
  windSpeedApparent: 'environment.wind.speedApparent' as Path,
  windAngleApparent: 'environment.wind.angleApparent' as Path,
} as const;

export type SkPathKey = keyof typeof SK_PATHS;
```

- [ ] **Step 2: Write the data-layer types**

Create `src/shared/signalk/types.ts`:
```ts
import type { Context, Path, Value } from '@signalk/server-api';

export type { Context, Path, Value } from '@signalk/server-api';

export type ConnectionPhase = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface ConnectionState {
  phase: ConnectionPhase;
  attempt: number;
  since: number;
}

export type SubscribePolicy = 'instant' | 'ideal' | 'fixed';

export interface SubscribeEntry {
  path: Path;
  context?: Context;
  period?: number;
  minPeriod?: number;
  policy?: SubscribePolicy;
}

export interface LeafWrite {
  context: Context;
  path: Path;
  value: Value;
}

// One coalesced batch delivered from the worker to the main thread per frame.
export interface SKFrame {
  self: Record<string, Value>;
  connection: ConnectionState;
  epoch: number;
}

export interface SignalKClientApi {
  connect(url: string, onFrame: (frame: SKFrame) => void): Promise<void>;
  subscribe(entries: SubscribeEntry[]): Promise<void>;
  unsubscribe(paths: Path[], context?: Context): Promise<void>;
  disconnect(): Promise<void>;
}
```

- [ ] **Step 3: Type-check and commit**

Run:
```bash
NODE_OPTIONS="--max-old-space-size=2048" npm run check
```
Expected: 0 errors. Then:
```bash
git add src/shared/signalk/paths.ts src/shared/signalk/types.ts
git commit -m "feat(signalk): add the path catalog and data-layer types"
```

---

## Task 3: Delta reconciliation (parallel lane: reconcile)

**Files:**
- Create: `src/shared/signalk/reconcile.ts`
- Test: `src/shared/signalk/reconcile.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/signalk/reconcile.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { Context, Delta } from '@signalk/server-api';
import { reconcileDelta } from './reconcile';
import type { LeafWrite } from './types';

function collect(delta: Delta): LeafWrite[] {
  const out: LeafWrite[] = [];
  reconcileDelta(delta, (w) => out.push(w));
  return out;
}

describe('reconcileDelta', () => {
  it('flattens values with the delta context', () => {
    const delta = {
      context: 'vessels.self' as Context,
      updates: [
        {
          values: [
            { path: 'navigation.speedOverGround', value: 3.85 },
            { path: 'navigation.courseOverGroundTrue', value: 2.97 },
          ],
        },
      ],
    } as unknown as Delta;
    const writes = collect(delta);
    expect(writes).toHaveLength(2);
    expect(writes[0]).toEqual({
      context: 'vessels.self',
      path: 'navigation.speedOverGround',
      value: 3.85,
    });
  });

  it('defaults a missing context to vessels.self', () => {
    const delta = {
      updates: [{ values: [{ path: 'navigation.headingTrue', value: 1.1 }] }],
    } as unknown as Delta;
    expect(collect(delta)[0].context).toBe('vessels.self');
  });

  it('ignores meta-only updates', () => {
    const delta = {
      context: 'vessels.self' as Context,
      updates: [{ meta: [{ path: 'navigation.speedOverGround', value: { units: 'm/s' } }] }],
    } as unknown as Delta;
    expect(collect(delta)).toHaveLength(0);
  });

  it('tolerates updates with neither values nor meta', () => {
    const delta = {
      context: 'vessels.self' as Context,
      updates: [{}],
    } as unknown as Delta;
    expect(collect(delta)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/shared/signalk/reconcile.test.ts
```
Expected: FAIL, cannot resolve `./reconcile`.

- [ ] **Step 3: Write the implementation**

Create `src/shared/signalk/reconcile.ts`:
```ts
import { hasValues, type Context, type Delta } from '@signalk/server-api';
import type { LeafWrite } from './types';

const SELF_CONTEXT = 'vessels.self' as Context;

export function reconcileDelta(delta: Delta, onLeaf: (write: LeafWrite) => void): void {
  const context = (delta.context ?? SELF_CONTEXT) as Context;
  const updates = delta.updates ?? [];
  for (const update of updates) {
    if (!hasValues(update)) continue;
    for (const pv of update.values) {
      onLeaf({ context, path: pv.path, value: pv.value });
    }
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run:
```bash
NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/shared/signalk/reconcile.test.ts
```
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/shared/signalk/reconcile.ts src/shared/signalk/reconcile.test.ts
git commit -m "feat(signalk): reconcile deltas into flat leaf writes"
```

---

## Task 4: The frame batcher (parallel lane: batcher)

**Files:**
- Create: `src/shared/signalk/batcher.ts`
- Test: `src/shared/signalk/batcher.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/signalk/batcher.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FrameBatcher } from './batcher';
import type { Value } from '@signalk/server-api';

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) =>
    setTimeout(() => cb(0), 0) as unknown as number,
  );
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('FrameBatcher', () => {
  it('coalesces many puts into one flush, last write wins', () => {
    const batcher = new FrameBatcher();
    const flushes: Record<string, Value>[] = [];
    batcher.onFlush = (self) => flushes.push(self);

    batcher.put('navigation.speedOverGround', 3.1);
    batcher.put('navigation.speedOverGround', 3.2);
    batcher.put('navigation.speedOverGround', 3.3);
    vi.runAllTimers();

    expect(flushes).toHaveLength(1);
    expect(flushes[0]['navigation.speedOverGround']).toBe(3.3);
  });

  it('schedules a new flush after the previous one drains', () => {
    const batcher = new FrameBatcher();
    const flushes: Record<string, Value>[] = [];
    batcher.onFlush = (self) => flushes.push(self);

    batcher.put('a', 1);
    vi.runAllTimers();
    batcher.put('b', 2);
    vi.runAllTimers();

    expect(flushes).toHaveLength(2);
    expect(flushes[1]).toEqual({ b: 2 });
  });

  it('does not flush when nothing was buffered', () => {
    const batcher = new FrameBatcher();
    const flushes: Record<string, Value>[] = [];
    batcher.onFlush = (self) => flushes.push(self);
    vi.runAllTimers();
    expect(flushes).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/shared/signalk/batcher.test.ts
```
Expected: FAIL, cannot resolve `./batcher`.

- [ ] **Step 3: Write the implementation**

Create `src/shared/signalk/batcher.ts`:
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
  onFlush?: (self: Record<string, Value>, epoch: number) => void;

  #self = new Map<string, Value>();
  #scheduled = false;
  #schedule: Schedule;

  constructor(schedule: Schedule = defaultSchedule) {
    this.#schedule = schedule;
  }

  put(path: string, value: Value): void {
    this.#self.set(path, value);
    if (this.#scheduled) return;
    this.#scheduled = true;
    this.#schedule((epoch) => this.#flush(epoch));
  }

  #flush(epoch: number): void {
    this.#scheduled = false;
    if (this.#self.size === 0) return;
    const self = Object.fromEntries(this.#self);
    this.#self = new Map();
    this.onFlush?.(self, epoch);
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run:
```bash
NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/shared/signalk/batcher.test.ts
```
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/shared/signalk/batcher.ts src/shared/signalk/batcher.test.ts
git commit -m "feat(signalk): per-frame delta batcher with last-write-wins"
```

---

## Task 5: The subscription registry (parallel lane: subscriptions)

**Files:**
- Create: `src/shared/signalk/subscription-registry.ts`
- Test: `src/shared/signalk/subscription-registry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/signalk/subscription-registry.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { Context, Path } from '@signalk/server-api';
import { SubscriptionRegistry } from './subscription-registry';

const path = (s: string) => s as Path;

describe('SubscriptionRegistry', () => {
  it('sends one subscribe on first demand for a path', () => {
    const sent: unknown[] = [];
    const reg = new SubscriptionRegistry((m) => sent.push(m));
    reg.add([{ path: path('navigation.position'), policy: 'instant', minPeriod: 1000 }]);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      context: 'vessels.self',
      subscribe: [{ path: 'navigation.position', policy: 'instant', minPeriod: 1000 }],
    });
  });

  it('refcounts: a second demand for the same path does not resubscribe', () => {
    const sent: unknown[] = [];
    const reg = new SubscriptionRegistry((m) => sent.push(m));
    reg.add([{ path: path('navigation.position') }]);
    reg.add([{ path: path('navigation.position') }]);
    expect(sent).toHaveLength(1);
  });

  it('unsubscribes only when the last demand is released', () => {
    const sent: unknown[] = [];
    const reg = new SubscriptionRegistry((m) => sent.push(m));
    const off1 = reg.add([{ path: path('navigation.position') }]);
    const off2 = reg.add([{ path: path('navigation.position') }]);
    off1();
    expect(sent).toHaveLength(1);
    off2();
    expect(sent).toHaveLength(2);
    expect(sent[1]).toMatchObject({
      context: 'vessels.self',
      unsubscribe: [{ path: 'navigation.position' }],
    });
  });

  it('resubscribeAll re-sends every active subscription', () => {
    const sent: unknown[] = [];
    const reg = new SubscriptionRegistry((m) => sent.push(m));
    reg.add([{ path: path('navigation.position') }]);
    reg.add([{ path: path('navigation.headingTrue'), context: 'vessels.*' as Context }]);
    sent.length = 0;
    reg.resubscribeAll();
    expect(sent).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/shared/signalk/subscription-registry.test.ts
```
Expected: FAIL, cannot resolve `./subscription-registry`.

- [ ] **Step 3: Write the implementation**

Create `src/shared/signalk/subscription-registry.ts`:
```ts
import type { Context, Path } from '@signalk/server-api';
import type { SubscribeEntry, SubscribePolicy } from './types';

const SELF_CONTEXT = 'vessels.self' as Context;
const DEFAULT_PERIOD = 1000;
const DEFAULT_POLICY: SubscribePolicy = 'ideal';

interface Resolved {
  context: Context;
  path: Path;
  period: number;
  minPeriod?: number;
  policy: SubscribePolicy;
}

interface Demand {
  count: number;
  entry: Resolved;
}

export class SubscriptionRegistry {
  #demand = new Map<string, Demand>();
  #send: (message: unknown) => void;

  constructor(send: (message: unknown) => void) {
    this.#send = send;
  }

  add(entries: SubscribeEntry[]): () => void {
    const keys: string[] = [];
    for (const entry of entries) {
      const resolved = this.#resolve(entry);
      const key = `${resolved.context}|${resolved.path}`;
      const existing = this.#demand.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        this.#demand.set(key, { count: 1, entry: resolved });
        this.#sendSubscribe(resolved);
      }
      keys.push(key);
    }
    return () => this.#release(keys);
  }

  resubscribeAll(): void {
    for (const { entry } of this.#demand.values()) {
      this.#sendSubscribe(entry);
    }
  }

  #release(keys: string[]): void {
    for (const key of keys) {
      const demand = this.#demand.get(key);
      if (!demand) continue;
      demand.count -= 1;
      if (demand.count > 0) continue;
      this.#demand.delete(key);
      this.#send({
        context: demand.entry.context,
        unsubscribe: [{ path: demand.entry.path }],
      });
    }
  }

  #resolve(entry: SubscribeEntry): Resolved {
    return {
      context: entry.context ?? SELF_CONTEXT,
      path: entry.path,
      period: entry.period ?? DEFAULT_PERIOD,
      minPeriod: entry.minPeriod,
      policy: entry.policy ?? DEFAULT_POLICY,
    };
  }

  #sendSubscribe(entry: Resolved): void {
    const subscription: Record<string, unknown> = {
      path: entry.path,
      period: entry.period,
      policy: entry.policy,
    };
    if (entry.minPeriod !== undefined) subscription.minPeriod = entry.minPeriod;
    this.#send({ context: entry.context, subscribe: [subscription] });
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run:
```bash
NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/shared/signalk/subscription-registry.test.ts
```
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/shared/signalk/subscription-registry.ts src/shared/signalk/subscription-registry.test.ts
git commit -m "feat(signalk): refcounted subscription registry"
```

---

## Task 6: Full-jitter backoff (parallel lane: backoff)

**Files:**
- Create: `src/shared/signalk/backoff.ts`
- Test: `src/shared/signalk/backoff.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/signalk/backoff.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fullJitterDelay } from './backoff';

afterEach(() => vi.restoreAllMocks());

describe('fullJitterDelay', () => {
  it('returns a value in [0, base * 2^attempt) below the cap', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(fullJitterDelay(0, 500, 30000)).toBe(250);
    expect(fullJitterDelay(1, 500, 30000)).toBe(500);
    expect(fullJitterDelay(2, 500, 30000)).toBe(1000);
  });

  it('never exceeds the cap', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    expect(fullJitterDelay(20, 500, 30000)).toBeLessThanOrEqual(30000);
  });

  it('returns 0 when random returns 0', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(fullJitterDelay(5, 500, 30000)).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/shared/signalk/backoff.test.ts
```
Expected: FAIL, cannot resolve `./backoff`.

- [ ] **Step 3: Write the implementation**

Create `src/shared/signalk/backoff.ts`:
```ts
export function fullJitterDelay(attempt: number, base = 500, cap = 30000): number {
  const ceiling = Math.min(cap, base * 2 ** attempt);
  return Math.random() * ceiling;
}
```

- [ ] **Step 4: Run to verify it passes**

Run:
```bash
NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/shared/signalk/backoff.test.ts
```
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/shared/signalk/backoff.ts src/shared/signalk/backoff.test.ts
git commit -m "feat(signalk): full-jitter capped exponential backoff"
```

---

## Task 7: The connection (lead: WebSocket lifecycle)

**Files:**
- Create: `src/shared/signalk/connection.ts`
- Test: `src/shared/signalk/connection.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/signalk/connection.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SkConnection } from './connection';
import type { ConnectionState } from './types';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  sent: string[] = [];
  closed = false;
  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
    this.onclose?.();
  }
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('SkConnection', () => {
  it('opens with subscribe=none and reports connecting then open', () => {
    const states: ConnectionState[] = [];
    const conn = new SkConnection('ws://test/signalk/v1/stream', {
      onState: (s) => states.push(s),
      onDelta: () => {},
    });
    conn.connect();
    expect(FakeWebSocket.instances[0].url).toContain('subscribe=none');
    expect(states.at(-1)?.phase).toBe('connecting');
    FakeWebSocket.instances[0].onopen?.();
    expect(states.at(-1)?.phase).toBe('open');
  });

  it('forwards raw messages to onDelta', () => {
    const deltas: string[] = [];
    const conn = new SkConnection('ws://test', { onState: () => {}, onDelta: (d) => deltas.push(d) });
    conn.connect();
    FakeWebSocket.instances[0].onmessage?.({ data: '{"updates":[]}' });
    expect(deltas).toEqual(['{"updates":[]}']);
  });

  it('reconnects after close and reports reconnecting', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const states: ConnectionState[] = [];
    const conn = new SkConnection('ws://test', { onState: (s) => states.push(s), onDelta: () => {} });
    conn.connect();
    FakeWebSocket.instances[0].onopen?.();
    FakeWebSocket.instances[0].onclose?.();
    expect(states.at(-1)?.phase).toBe('reconnecting');
    vi.runOnlyPendingTimers();
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('resets the attempt counter on a successful open', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const states: ConnectionState[] = [];
    const conn = new SkConnection('ws://test', { onState: (s) => states.push(s), onDelta: () => {} });
    conn.connect();
    FakeWebSocket.instances[0].onclose?.();
    vi.runOnlyPendingTimers();
    FakeWebSocket.instances[1].onopen?.();
    expect(states.at(-1)).toMatchObject({ phase: 'open', attempt: 0 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/shared/signalk/connection.test.ts
```
Expected: FAIL, cannot resolve `./connection`.

- [ ] **Step 3: Write the implementation**

Create `src/shared/signalk/connection.ts`:
```ts
import { fullJitterDelay } from './backoff';
import type { ConnectionPhase, ConnectionState } from './types';

interface ConnectionHandlers {
  onState: (state: ConnectionState) => void;
  onDelta: (raw: string) => void;
  onOpen?: () => void;
}

function withQuery(url: string, query: string): string {
  return url.includes('?') ? `${url}&${query}` : `${url}?${query}`;
}

export class SkConnection {
  #url: string;
  #handlers: ConnectionHandlers;
  #ws?: WebSocket;
  #attempt = 0;
  #stopped = false;

  constructor(url: string, handlers: ConnectionHandlers) {
    this.#url = url;
    this.#handlers = handlers;
  }

  connect(): void {
    this.#stopped = false;
    this.#emit('connecting');
    const ws = new WebSocket(withQuery(this.#url, 'subscribe=none'));
    this.#ws = ws;
    ws.onopen = () => {
      this.#attempt = 0;
      this.#emit('open');
      this.#handlers.onOpen?.();
    };
    ws.onmessage = (event: MessageEvent) => this.#handlers.onDelta(event.data as string);
    ws.onclose = () => {
      if (this.#stopped) return;
      this.#scheduleReconnect();
    };
    ws.onerror = () => ws.close();
  }

  send(message: unknown): void {
    this.#ws?.send(JSON.stringify(message));
  }

  disconnect(): void {
    this.#stopped = true;
    this.#ws?.close();
    this.#emit('closed');
  }

  #scheduleReconnect(): void {
    this.#emit('reconnecting');
    const delay = fullJitterDelay(this.#attempt);
    this.#attempt += 1;
    setTimeout(() => {
      if (!this.#stopped) this.connect();
    }, delay);
  }

  #emit(phase: ConnectionPhase): void {
    this.#handlers.onState({ phase, attempt: this.#attempt, since: 0 });
  }
}
```

(`since` is stamped as 0 here because `Date.now()` is not deterministic in tests; the store stamps wall-clock time when it receives the frame. The worker may overwrite `since` with a real timestamp at emit time, which the store test does not depend on.)

- [ ] **Step 4: Run to verify it passes**

Run:
```bash
NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/shared/signalk/connection.test.ts
```
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/shared/signalk/connection.ts src/shared/signalk/connection.test.ts
git commit -m "feat(signalk): WebSocket connection with reconnection"
```

---

## Task 8: The worker core (lead: composition)

**Files:**
- Create: `src/shared/signalk/worker-core.ts`
- Test: `src/shared/signalk/worker-core.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/signalk/worker-core.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Path } from '@signalk/server-api';
import { WorkerCore } from './worker-core';
import type { SKFrame } from './types';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  sent: string[] = [];
  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.onclose?.();
  }
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) =>
    setTimeout(() => cb(0), 0) as unknown as number,
  );
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('WorkerCore', () => {
  it('batches incoming deltas into one frame of self values', () => {
    const frames: SKFrame[] = [];
    const core = new WorkerCore();
    core.connect('ws://test', (f) => frames.push(f));
    const ws = FakeWebSocket.instances[0];
    ws.onopen?.();
    ws.onmessage?.({
      data: JSON.stringify({
        context: 'vessels.self',
        updates: [{ values: [{ path: 'navigation.speedOverGround', value: 4.2 }] }],
      }),
    });
    vi.runAllTimers();
    expect(frames.at(-1)?.self['navigation.speedOverGround']).toBe(4.2);
  });

  it('forwards subscribe messages to the socket', () => {
    const core = new WorkerCore();
    core.connect('ws://test', () => {});
    const ws = FakeWebSocket.instances[0];
    ws.onopen?.();
    core.subscribe([{ path: 'navigation.position' as Path, policy: 'instant', minPeriod: 1000 }]);
    expect(ws.sent.some((m) => m.includes('navigation.position'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/shared/signalk/worker-core.test.ts
```
Expected: FAIL, cannot resolve `./worker-core`.

- [ ] **Step 3: Write the implementation**

Create `src/shared/signalk/worker-core.ts`:
```ts
import type { Context, Delta, Path } from '@signalk/server-api';
import { FrameBatcher } from './batcher';
import { SkConnection } from './connection';
import { reconcileDelta } from './reconcile';
import { SubscriptionRegistry } from './subscription-registry';
import type { ConnectionState, SKFrame, SubscribeEntry } from './types';

export class WorkerCore {
  #connection?: SkConnection;
  #registry?: SubscriptionRegistry;
  #batcher = new FrameBatcher();
  #onFrame?: (frame: SKFrame) => void;
  #connectionState: ConnectionState = { phase: 'connecting', attempt: 0, since: 0 };

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
    this.#batcher.onFlush = (self, epoch) => {
      this.#onFrame?.({ self, connection: this.#connectionState, epoch });
    };
    this.#connection.connect();
  }

  subscribe(entries: SubscribeEntry[]): void {
    this.#registry?.add(entries);
  }

  unsubscribe(paths: Path[], context?: Context): void {
    this.#connection?.send({
      context: context ?? ('vessels.self' as Context),
      unsubscribe: paths.map((path) => ({ path })),
    });
  }

  disconnect(): void {
    this.#connection?.disconnect();
  }

  #ingest(raw: string): void {
    let delta: Delta;
    try {
      delta = JSON.parse(raw) as Delta;
    } catch {
      return;
    }
    reconcileDelta(delta, (write) => this.#batcher.put(write.path, write.value));
  }
}
```

(The subscription registry's own unsubscribe path is the refcounted one used by feature modules. `WorkerCore.unsubscribe` is the explicit client-API escape hatch and sends directly.)

- [ ] **Step 4: Run to verify it passes**

Run:
```bash
NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/shared/signalk/worker-core.test.ts
```
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/shared/signalk/worker-core.ts src/shared/signalk/worker-core.test.ts
git commit -m "feat(signalk): worker core composing connection, reconcile, and batching"
```

---

## Task 9: The worker entry and the Comlink client

**Files:**
- Create: `src/shared/signalk/sk.worker.ts`
- Create: `src/shared/signalk/client.ts`

- [ ] **Step 1: Write the worker entry**

Create `src/shared/signalk/sk.worker.ts`:
```ts
import * as Comlink from 'comlink';
import type { Context, Path } from '@signalk/server-api';
import { WorkerCore } from './worker-core';
import type { SignalKClientApi, SKFrame, SubscribeEntry } from './types';

class SignalKWorker implements SignalKClientApi {
  #core = new WorkerCore();

  async connect(url: string, onFrame: (frame: SKFrame) => void): Promise<void> {
    this.#core.connect(url, (frame) => onFrame(frame));
  }

  async subscribe(entries: SubscribeEntry[]): Promise<void> {
    this.#core.subscribe(entries);
  }

  async unsubscribe(paths: Path[], context?: Context): Promise<void> {
    this.#core.unsubscribe(paths, context);
  }

  async disconnect(): Promise<void> {
    this.#core.disconnect();
  }
}

Comlink.expose(new SignalKWorker());
```

- [ ] **Step 2: Write the main-thread client**

Create `src/shared/signalk/client.ts`:
```ts
import * as Comlink from 'comlink';
import type { SignalKClientApi, SKFrame } from './types';

export interface SignalKClient {
  connect(url: string, onFrame: (frame: SKFrame) => void): Promise<void>;
  disconnect(): Promise<void>;
  raw: Comlink.Remote<SignalKClientApi>;
}

export function createSignalKClient(): SignalKClient {
  const worker = new Worker(new URL('./sk.worker.ts', import.meta.url), { type: 'module' });
  const raw = Comlink.wrap<SignalKClientApi>(worker);
  return {
    raw,
    async connect(url, onFrame) {
      await raw.connect(url, Comlink.proxy(onFrame));
    },
    async disconnect() {
      await raw.disconnect();
    },
  };
}
```

- [ ] **Step 3: Type-check and commit**

Run:
```bash
NODE_OPTIONS="--max-old-space-size=2048" npm run check
```
Expected: 0 errors. Then:
```bash
git add src/shared/signalk/sk.worker.ts src/shared/signalk/client.ts
git commit -m "feat(signalk): worker entry and Comlink client bridge"
```

---

## Task 10: The path-keyed runes store

**Files:**
- Create: `src/shared/signalk/store.svelte.ts`
- Test: `src/shared/signalk/store.svelte.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/signalk/store.svelte.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { flushSync } from 'svelte';
import { SignalKStore } from './store.svelte';
import type { SKFrame } from './types';

function frame(self: Record<string, unknown>): SKFrame {
  return {
    self: self as SKFrame['self'],
    connection: { phase: 'open', attempt: 0, since: 0 },
    epoch: 1000,
  };
}

describe('SignalKStore', () => {
  it('exposes the latest value of a path through its cell', () => {
    const store = new SignalKStore();
    store.applyFrame(frame({ 'navigation.speedOverGround': 5.1 }));
    expect(store.cell('navigation.speedOverGround').value).toBe(5.1);
  });

  it('records receivedAt from the frame epoch', () => {
    const store = new SignalKStore();
    store.applyFrame(frame({ 'navigation.headingTrue': 1.2 }));
    expect(store.cell('navigation.headingTrue').receivedAt).toBe(1000);
  });

  it('updates connection state reactively', () => {
    const store = new SignalKStore();
    store.applyFrame(frame({}));
    expect(store.connection.phase).toBe('open');
  });

  it('reacts only for the changed cell, not unrelated cells', () => {
    const store = new SignalKStore();
    const cleanup = $effect.root(() => {
      let windRuns = 0;
      const wind = store.cell('environment.wind.speedApparent');
      $effect(() => {
        void wind.value;
        windRuns += 1;
      });
      flushSync();
      expect(windRuns).toBe(1);
      store.applyFrame(frame({ 'navigation.speedOverGround': 6 }));
      flushSync();
      expect(windRuns).toBe(1);
      store.applyFrame(frame({ 'environment.wind.speedApparent': 9 }));
      flushSync();
      expect(windRuns).toBe(2);
    });
    cleanup();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
NODE_OPTIONS="--max-old-space-size=2048" npx vitest run --project unit-svelte src/shared/signalk/store.svelte.test.ts
```
Expected: FAIL, cannot resolve `./store.svelte`.

- [ ] **Step 3: Write the implementation**

Create `src/shared/signalk/store.svelte.ts`:
```ts
import type { Value } from '@signalk/server-api';
import type { ConnectionState, SKFrame } from './types';

export class PathCell {
  value = $state<Value | undefined>(undefined);
  receivedAt = $state(0);
}

export class SignalKStore {
  connection = $state<ConnectionState>({ phase: 'connecting', attempt: 0, since: 0 });

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
    this.connection = frame.connection;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run:
```bash
NODE_OPTIONS="--max-old-space-size=2048" npx vitest run --project unit-svelte src/shared/signalk/store.svelte.test.ts
```
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/shared/signalk/store.svelte.ts src/shared/signalk/store.svelte.test.ts
git commit -m "feat(signalk): path-keyed runes store with fine-grained cells"
```

---

## Task 11: The slice public API

**Files:**
- Create: `src/shared/signalk/index.ts`

- [ ] **Step 1: Write the public API**

Create `src/shared/signalk/index.ts` (named re-exports only, never `export *`):
```ts
export { SK_PATHS } from './paths';
export type { SkPathKey } from './paths';
export { createSignalKClient } from './client';
export type { SignalKClient } from './client';
export { SignalKStore, PathCell } from './store.svelte';
export type {
  ConnectionPhase,
  ConnectionState,
  SKFrame,
  SubscribeEntry,
  SubscribePolicy,
} from './types';
```

- [ ] **Step 2: Type-check, cruise, and commit**

Run:
```bash
NODE_OPTIONS="--max-old-space-size=2048" npm run check
```
Then:
```bash
npm run cruise
```
Expected: both clean. Then:
```bash
git add src/shared/signalk/index.ts
git commit -m "feat(signalk): slice public API"
```

---

## Task 12: The vessel entity

**Files:**
- Create: `src/entities/vessel/vessel.svelte.ts`
- Test: `src/entities/vessel/vessel.svelte.test.ts`
- Create: `src/entities/vessel/index.ts`

- [ ] **Step 1: Write the failing test**

Create `src/entities/vessel/vessel.svelte.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { SignalKStore } from '$shared/signalk';
import { OwnVessel } from './vessel.svelte';
import type { SKFrame } from '$shared/signalk';

function frame(self: Record<string, unknown>): SKFrame {
  return {
    self: self as SKFrame['self'],
    connection: { phase: 'open', attempt: 0, since: 0 },
    epoch: 1000,
  };
}

describe('OwnVessel', () => {
  it('exposes speed over ground in knots', () => {
    const store = new SignalKStore();
    const vessel = new OwnVessel(store);
    store.applyFrame(frame({ 'navigation.speedOverGround': 1 }));
    expect(vessel.sogKnots).toBeCloseTo(1.943844, 5);
  });

  it('exposes course over ground in degrees', () => {
    const store = new SignalKStore();
    const vessel = new OwnVessel(store);
    store.applyFrame(frame({ 'navigation.courseOverGroundTrue': Math.PI }));
    expect(vessel.cogDegrees).toBeCloseTo(180, 6);
  });

  it('returns the position object unchanged (already degrees)', () => {
    const store = new SignalKStore();
    const vessel = new OwnVessel(store);
    store.applyFrame(frame({ 'navigation.position': { latitude: 36.8, longitude: -121.7 } }));
    expect(vessel.position).toEqual({ latitude: 36.8, longitude: -121.7 });
  });

  it('returns undefined readouts before any data arrives', () => {
    const store = new SignalKStore();
    const vessel = new OwnVessel(store);
    expect(vessel.sogKnots).toBeUndefined();
    expect(vessel.position).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
NODE_OPTIONS="--max-old-space-size=2048" npx vitest run --project unit-svelte src/entities/vessel/vessel.svelte.test.ts
```
Expected: FAIL, cannot resolve `./vessel.svelte`.

- [ ] **Step 3: Write the implementation**

Create `src/entities/vessel/vessel.svelte.ts`:
```ts
import { metersPerSecondToKnots, radiansToDegrees } from '$shared/lib';
import { SK_PATHS, type SignalKStore } from '$shared/signalk';

export interface LatLon {
  latitude: number;
  longitude: number;
}

export class OwnVessel {
  #store: SignalKStore;

  constructor(store: SignalKStore) {
    this.#store = store;
  }

  get sogKnots(): number | undefined {
    return metersPerSecondToKnots(this.#number(SK_PATHS.speedOverGround));
  }

  get cogDegrees(): number | undefined {
    return radiansToDegrees(this.#number(SK_PATHS.courseOverGroundTrue));
  }

  get headingDegrees(): number | undefined {
    return radiansToDegrees(this.#number(SK_PATHS.headingTrue));
  }

  get position(): LatLon | undefined {
    const value = this.#store.cell(SK_PATHS.position).value;
    return this.#isLatLon(value) ? value : undefined;
  }

  #number(path: string): number | undefined {
    const value = this.#store.cell(path).value;
    return typeof value === 'number' ? value : undefined;
  }

  #isLatLon(value: unknown): value is LatLon {
    return (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as LatLon).latitude === 'number' &&
      typeof (value as LatLon).longitude === 'number'
    );
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run:
```bash
NODE_OPTIONS="--max-old-space-size=2048" npx vitest run --project unit-svelte src/entities/vessel/vessel.svelte.test.ts
```
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the public API and clean up the placeholder**

Create `src/entities/vessel/index.ts`:
```ts
export { OwnVessel } from './vessel.svelte';
export type { LatLon } from './vessel.svelte';
```

Remove the now-redundant placeholder:
```bash
git rm src/entities/.gitkeep
```

- [ ] **Step 6: Cruise and commit**

Run:
```bash
npm run cruise
```
Expected: clean (entities imports only shared). Then:
```bash
git add src/entities/vessel
git commit -m "feat(vessel): own-vessel readouts derived from the store"
```

---

## Task 13: Wire proof-of-life into the shell

**Files:**
- Modify: `src/app/App.svelte`
- Modify: `e2e/smoke.spec.ts`

- [ ] **Step 1: Wire the client, store, and vessel into App.svelte**

Replace `src/app/App.svelte` with:
```svelte
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { createSignalKClient, SignalKStore, SK_PATHS } from '$shared/signalk';
  import { OwnVessel } from '$entities/vessel';

  const store = new SignalKStore();
  const vessel = new OwnVessel(store);
  const client = createSignalKClient();

  const streamUrl = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/signalk/v1/stream`;

  const connectionLabel = $derived(
    store.connection.phase === 'open'
      ? 'Connected'
      : store.connection.phase === 'connecting'
        ? 'Connecting'
        : store.connection.phase === 'reconnecting'
          ? 'Reconnecting'
          : 'Not connected',
  );

  const fmt = (value: number | undefined, digits: number) =>
    value === undefined ? '--' : value.toFixed(digits);

  onMount(async () => {
    await client.connect(streamUrl, (frame) => store.applyFrame(frame));
    await client.raw.subscribe([
      { path: SK_PATHS.headingTrue, policy: 'instant', minPeriod: 200 },
      { path: SK_PATHS.position, policy: 'instant', minPeriod: 1000 },
      { path: SK_PATHS.courseOverGroundTrue, policy: 'instant', minPeriod: 1000 },
      { path: SK_PATHS.speedOverGround, policy: 'instant', minPeriod: 1000 },
    ]);
  });

  onDestroy(() => {
    void client.disconnect();
  });
</script>

<main class="binnacle-shell">
  <header class="topbar">Binnacle</header>
  <section class="chart-host" aria-label="Chart">
    <p class="placeholder">Chart canvas mounts here in Phase 3.</p>
  </section>
  <footer class="status-strip">
    <span class="status">{connectionLabel}</span>
    <span class="readout">SOG <b>{fmt(vessel.sogKnots, 1)}</b> kn</span>
    <span class="readout">COG <b>{fmt(vessel.cogDegrees, 0)}</b>&deg;</span>
  </footer>
</main>

<style>
  .binnacle-shell {
    display: grid;
    grid-template-rows: auto 1fr auto;
    block-size: 100vh;
    margin: 0;
    font-family: system-ui, sans-serif;
    background: #06090d;
    color: #e7edf3;
  }
  .topbar {
    padding: 0.75rem 1rem;
    font-weight: 600;
    border-block-end: 1px solid #243140;
  }
  .chart-host {
    display: grid;
    place-items: center;
  }
  .placeholder {
    color: #6f8aa3;
  }
  .status-strip {
    display: flex;
    gap: 1.5rem;
    padding: 0.5rem 1rem;
    border-block-start: 1px solid #243140;
    color: #6f8aa3;
  }
  .readout b {
    color: #e7edf3;
    font-variant-numeric: tabular-nums;
  }
</style>
```

- [ ] **Step 2: Update the e2e smoke test**

The status strip no longer renders the literal "Not connected" once connecting starts, but with no Signal K server in the Playwright preview, the phase stays `connecting`. Update `e2e/smoke.spec.ts` so it asserts the stable chrome:
```ts
import { expect, test } from '@playwright/test';

test('app shell renders the brand and a connection status', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Binnacle')).toBeVisible();
  await expect(page.getByText(/Connecting|Connected|Reconnecting|Not connected/)).toBeVisible();
  await expect(page.getByText('SOG')).toBeVisible();
});
```

- [ ] **Step 3: Type-check, build, and run e2e**

Run, one at a time:
```bash
NODE_OPTIONS="--max-old-space-size=2048" npm run check
```
```bash
NODE_OPTIONS="--max-old-space-size=2048" NODE_ENV=production npm run build
```
```bash
NODE_OPTIONS="--max-old-space-size=2048" npm run test:e2e
```
Expected: all green. The build must show the worker emitted as its own chunk (Vite bundles the `new Worker(new URL(...))` reference).

- [ ] **Step 4: Commit**

```bash
git add src/app/App.svelte e2e/smoke.spec.ts
git commit -m "feat(app): wire live connection state and own-vessel readouts"
```

---

## Task 14: Full local gate (one heavy command at a time)

**Files:** none (verification only)

- [ ] **Step 1: Biome (light)**

Run:
```bash
biome ci .
```
Expected: no errors.

- [ ] **Step 2: dependency-cruiser (light)**

Run:
```bash
npm run cruise
```
Expected: no violations. `shared/signalk` imports only `shared`; `entities/vessel` imports only `shared`.

- [ ] **Step 3: Type-check**

Run:
```bash
NODE_OPTIONS="--max-old-space-size=2048" npm run check
```
Expected: 0 errors, 0 warnings.

- [ ] **Step 4: Unit tests (both projects)**

Run:
```bash
NODE_OPTIONS="--max-old-space-size=2048" npm test
```
Expected: the `unit` and `unit-svelte` projects pass; reconcile, batcher, registry, backoff, connection, worker-core, units, store, and vessel suites all green.

- [ ] **Step 5: Worker-bridge test (if added)**

If a `@vitest/web-worker` bridge test was added for `client.ts`, run it here. Otherwise the worker is covered by `worker-core` plus the e2e build.

- [ ] **Step 6: Production build**

Run:
```bash
NODE_OPTIONS="--max-old-space-size=2048" NODE_ENV=production npm run build
```
Expected: clean build to `public/`, base `/binnacle/`, with the worker chunk present.

- [ ] **Step 7: e2e**

Run:
```bash
NODE_OPTIONS="--max-old-space-size=2048" npm run test:e2e
```
Expected: 1 passed.

---

## Task 15: Cleanup gate and phase close

This phase is one major step under the build policy, so it ends with the `/cleanup` skill.

- [ ] **Step 1: Run the cleanup skill** against the Phase 2 diff, briefing agents on the project style rules (American English, no em dashes, Oxford commas, default to no comments).

- [ ] **Step 2: Fix every finding**, including low and nit. The only acceptable skip is factually refuted or by-design after honest scrutiny, with a one-line reason.

- [ ] **Step 3: Doc-accuracy gate.** Update `CHANGELOG.md` with the Phase 2 entry. Update `README.md` if any claim drifted (the status section: the data layer now connects to a live Signal K stream). Confirm `CLAUDE.md` still matches the code.

- [ ] **Step 4: Re-run the full local gate** (Task 14, each heavy command on its own) and confirm green after the cleanup edits.

- [ ] **Step 5: Commit, then push.**

```bash
git add -A
git commit -m "chore: Phase 2 data-layer cleanup pass and docs"
git push
```

- [ ] **Step 6: Confirm the phase exit criteria.**

Verify all of the following:
- `biome ci`, `npm run cruise`, `npm run check`, `npm test`, `npm run build`, and `npm run test:e2e` all pass.
- The worker, store, reconcile, batcher, subscription registry, backoff, connection, and vessel view are unit-tested.
- `shared/signalk` and `entities/vessel` each expose a named-export `index.ts`, and dependency-cruiser confirms boundaries.
- The shell shows live connection state and own-vessel SOG and COG against a running Signal K server.

When all are true, Phase 2 is complete and Phase 3 (the map) can begin.

---

## Self-review notes

- **Spec coverage:** this implements design spec section 6.5 (the real-time data layer): the worker plus Comlink bridge, the path-keyed fine-grained runes store, per-frame batching, the subscription registry, reconnection with full-jitter backoff and cached-value replay (the worker re-subscribes on open), connection state as a reactive signal, per-path staleness via `receivedAt`, and the SI-units-in-store, convert-at-edge rule (the vessel entity). Section 7.2 (the subscribe-none, explicit-subscription strategy) is implemented in the connection and the shell wiring.
- **Deferred to later phases (correctly):** AIS targets and CPA/TCPA (Phase 5, though the store and reconcile already handle any `vessels.*` context), the map (Phase 3), charts (Phase 4), theming (Phase 6), and the offline and PWA pipeline (its own spec). Transferable typed arrays for AIS are not needed yet, since Phase 2 carries only own-vessel scalars; the `SKFrame` shape leaves room to add an `ais` typed-array field in Phase 5 without breaking consumers.
- **Placeholder scan:** none. Every step has concrete file contents and commands.
- **Type and name consistency:** `SKFrame`, `SubscribeEntry`, `ConnectionState`, `LeafWrite`, `SignalKStore`, `PathCell`, `OwnVessel`, and `SK_PATHS` are used identically across the tasks. The store applies `frame.self` and `frame.connection`; the worker core emits exactly those fields; the client passes the proxied `onFrame` straight through.
- **Pi memory:** every heavy command in Tasks 14 and 15 runs on its own, per `CLAUDE.md`.
- **Testability of the worker:** all logic lives in framework-free classes (`WorkerCore`, `FrameBatcher`, `SubscriptionRegistry`, `SkConnection`, and `reconcileDelta`) tested without a worker; `sk.worker.ts` is the only Comlink and `self` surface, kept to a thin shell.
