# Binnacle: Signal K Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Authenticate Binnacle against a secured Signal K server via the device access-request flow, so the live WebSocket stream and the REST chart discovery return data instead of 401. Implements `docs/superpowers/specs/2026-05-31-binnacle-auth-design.md`.

**Architecture:** An `AuthController` in `shared/signalk` owns the access-request lifecycle and a persisted clientId plus token (via the `PersistedValue` helper). `streamUrl(token)` appends the token to the stream URL; `fetchCharts(base, token)` sends a Bearer header. `App.svelte` probes on mount, connects and fetches once authenticated (or unsecured), and renders an `AuthBanner` feature while a request is pending or denied. The worker stays free of auth policy: it opens whatever URL it is given.

**Tech Stack:** Svelte 5 runes, TypeScript, Vitest. `crypto.randomUUID()`. No new dependencies.

**Project rules:** Honors `CLAUDE.md`. American English, no em dashes, Oxford commas, default to no comments. One heavy command at a time on the Pi. Lead-driven, never commit or push on red (the `.githooks` gates enforce it). Ends with `/cleanup` and the full gate.

**Verified against the live server (signalk-server 2.x):**
- `POST /signalk/v1/access/requests` `{clientId, description}` returns `202` `{state:"PENDING", requestId, href:"/signalk/v1/requests/<id>"}`.
- `GET /signalk/v1/requests/<id>` returns `{state:"PENDING", accessRequest:null}` then `{state:"COMPLETED", accessRequest:{permission:"APPROVED", token:"<jwt>"}}` (or `permission:"DENIED"`).
- Token presentation: REST `Authorization: Bearer <token>`; WebSocket `...stream?...&token=<token>`.

---

## Module boundary note

- `src/shared/signalk/auth.svelte.ts`, `auth.svelte.test.ts`: the `AuthController`. Imports `$shared/settings` (same layer is not allowed; `settings` and `signalk` are both under `shared`, so this is an intra-shared import which dependency-cruiser permits). Add `AuthController`, `AuthStatus` to `src/shared/signalk/index.ts`.
- `src/shared/signalk/origin.ts`: `streamUrl(token?)`.
- `src/features/charts/charts-client.ts`: `fetchCharts(serverBase, token?)`.
- `src/features/auth-banner/AuthBanner.svelte`, `index.ts`: the banner feature.
- `src/app/App.svelte`: create the controller, probe, gate connect/fetch, render the banner.

dependency-cruiser stays green.

---

## Task 1: The AuthController (test-first)

**Files:** create `src/shared/signalk/auth.svelte.ts`, `auth.svelte.test.ts`; modify `src/shared/signalk/index.ts`.

- [ ] **Step 1: Failing test.** Create `auth.svelte.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.svelte';

function storage(seed: Record<string, string> = {}): Pick<Storage, 'getItem' | 'setItem'> {
  const map = new Map(Object.entries(seed));
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
}

function res(ok: boolean, body: unknown = {}): Response {
  return { ok, json: async () => body } as unknown as Response;
}

const BASE = 'http://sk.test';
const noSchedule = () => {};

describe('AuthController', () => {
  it('reports an unsecured server and needs no token', async () => {
    const fetchFn = vi.fn(async () => res(true, {}));
    const auth = new AuthController(BASE, { fetch: fetchFn, storage: storage(), schedule: noSchedule });
    await auth.probe();
    expect(auth.status).toBe('unsecured');
    expect(auth.token).toBeNull();
  });

  it('uses a stored token that still works', async () => {
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) =>
      res(Boolean(init?.headers), {}),
    );
    const auth = new AuthController(BASE, {
      fetch: fetchFn as unknown as typeof fetch,
      storage: storage({ 'binnacle:signalk-auth': JSON.stringify({ clientId: 'c1', token: 'tok' }) }),
      schedule: noSchedule,
    });
    await auth.probe();
    expect(auth.status).toBe('authenticated');
    expect(auth.token).toBe('tok');
  });

  it('requests access when secured with no usable token', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.endsWith('/access/requests')) return res(true, { href: '/signalk/v1/requests/r1' });
      return res(false, {}); // probe 401
    });
    const auth = new AuthController(BASE, {
      fetch: fetchFn as unknown as typeof fetch,
      storage: storage(),
      schedule: noSchedule,
    });
    await auth.probe();
    expect(auth.status).toBe('requesting');
    expect(fetchFn).toHaveBeenCalledWith(
      `${BASE}/signalk/v1/access/requests`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('stores the token and authenticates when the request is approved', async () => {
    const saved: string[] = [];
    const store = storage();
    const origSet = store.setItem;
    store.setItem = (k, v) => {
      saved.push(v);
      origSet(k, v);
    };
    const fetchFn = vi.fn(async (url: string) => {
      if (url.endsWith('/access/requests')) return res(true, { href: '/signalk/v1/requests/r1' });
      if (url.endsWith('/requests/r1'))
        return res(true, { state: 'COMPLETED', accessRequest: { permission: 'APPROVED', token: 'newtok' } });
      return res(false, {});
    });
    const auth = new AuthController(BASE, {
      fetch: fetchFn as unknown as typeof fetch,
      storage: store,
      schedule: noSchedule,
    });
    await auth.requestAccess();
    await auth.checkRequest();
    expect(auth.status).toBe('authenticated');
    expect(auth.token).toBe('newtok');
    expect(saved.some((v) => v.includes('newtok'))).toBe(true);
  });

  it('reports denied when the request is refused', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.endsWith('/access/requests')) return res(true, { href: '/signalk/v1/requests/r1' });
      if (url.endsWith('/requests/r1'))
        return res(true, { state: 'COMPLETED', accessRequest: { permission: 'DENIED' } });
      return res(false, {});
    });
    const auth = new AuthController(BASE, {
      fetch: fetchFn as unknown as typeof fetch,
      storage: storage(),
      schedule: noSchedule,
    });
    await auth.requestAccess();
    await auth.checkRequest();
    expect(auth.status).toBe('denied');
  });

  it('keeps a stable clientId across instances', () => {
    const store = storage();
    const a = new AuthController(BASE, { fetch: (async () => res(true)) as unknown as typeof fetch, storage: store, schedule: noSchedule });
    const b = new AuthController(BASE, { fetch: (async () => res(true)) as unknown as typeof fetch, storage: store, schedule: noSchedule });
    expect(a.clientId).toBe(b.clientId);
  });
});
```

- [ ] **Step 2:** Run `NODE_OPTIONS="--max-old-space-size=2048" npx vitest run src/shared/signalk/auth.svelte.test.ts`. Expect FAIL (no module).

- [ ] **Step 3: Implement.** Create `auth.svelte.ts`:
```ts
import { PersistedValue } from '$shared/settings';

export type AuthStatus = 'unknown' | 'unsecured' | 'authenticated' | 'requesting' | 'denied';

interface AuthIdentity {
  clientId: string;
  token: string | null;
}

interface AuthOptions {
  fetch?: typeof fetch;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  schedule?: (run: () => void, ms: number) => void;
  pollMs?: number;
}

const STORAGE_KEY = 'binnacle:signalk-auth';
const PROBE_PATH = '/signalk/v1/api/vessels/self';
const REQUEST_PATH = '/signalk/v1/access/requests';

function newClientId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `binnacle-${Math.floor(Date.now()).toString(36)}`;
}

export class AuthController {
  status = $state<AuthStatus>('unknown');
  token = $state<string | null>(null);

  #base: string;
  #fetch: typeof fetch;
  #schedule: (run: () => void, ms: number) => void;
  #pollMs: number;
  #identity: PersistedValue<AuthIdentity>;
  #href?: string;
  #stopped = false;

  constructor(base: string, opts: AuthOptions = {}) {
    this.#base = base;
    this.#fetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.#schedule = opts.schedule ?? ((run, ms) => void setTimeout(run, ms));
    this.#pollMs = opts.pollMs ?? 3000;
    this.#identity = new PersistedValue<AuthIdentity>(
      STORAGE_KEY,
      { clientId: newClientId(), token: null },
      opts.storage,
    );
    // A fresh default is generated each construction; persist it once so the id is stable.
    if (!this.#identity.value.clientId) {
      this.#identity.set({ clientId: newClientId(), token: null });
    } else {
      this.#identity.set(this.#identity.value);
    }
    this.token = this.#identity.value.token;
  }

  get clientId(): string {
    return this.#identity.value.clientId;
  }

  async probe(): Promise<void> {
    const anon = await this.#safeFetch(`${this.#base}${PROBE_PATH}`);
    if (anon?.ok) {
      this.status = 'unsecured';
      return;
    }
    const stored = this.#identity.value.token;
    if (stored) {
      const authed = await this.#safeFetch(`${this.#base}${PROBE_PATH}`, {
        headers: { Authorization: `Bearer ${stored}` },
      });
      if (authed?.ok) {
        this.token = stored;
        this.status = 'authenticated';
        return;
      }
      this.#store(null);
    }
    await this.requestAccess();
  }

  async requestAccess(): Promise<void> {
    this.status = 'requesting';
    const res = await this.#safeFetch(`${this.#base}${REQUEST_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: this.clientId, description: 'Binnacle chart plotter' }),
    });
    if (!res) return;
    const body = await this.#json(res);
    this.#href = typeof body.href === 'string' ? body.href : undefined;
    if (!this.#href) {
      this.status = 'denied';
      return;
    }
    this.#schedulePoll();
  }

  async checkRequest(): Promise<void> {
    if (!this.#href) return;
    const res = await this.#safeFetch(`${this.#base}${this.#href}`);
    if (!res?.ok) {
      this.#schedulePoll();
      return;
    }
    const body = await this.#json(res);
    if (body.state !== 'COMPLETED') {
      this.#schedulePoll();
      return;
    }
    const request = (body.accessRequest ?? {}) as { permission?: string; token?: string };
    if (request.permission === 'APPROVED' && typeof request.token === 'string') {
      this.#store(request.token);
      this.token = request.token;
      this.status = 'authenticated';
    } else {
      this.status = 'denied';
    }
  }

  stop(): void {
    this.#stopped = true;
  }

  #schedulePoll(): void {
    if (this.#stopped) return;
    this.#schedule(() => void this.checkRequest(), this.#pollMs);
  }

  #store(token: string | null): void {
    this.#identity.set({ ...this.#identity.value, token });
  }

  async #safeFetch(url: string, init?: RequestInit): Promise<Response | undefined> {
    try {
      return await this.#fetch(url, init);
    } catch {
      return undefined;
    }
  }

  async #json(res: Response): Promise<Record<string, unknown>> {
    try {
      return (await res.json()) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
}
```

- [ ] **Step 4:** Run, expect PASS (6). Add to `src/shared/signalk/index.ts`:
```ts
export { AuthController } from './auth.svelte';
export type { AuthStatus } from './auth.svelte';
```

- [ ] **Step 5:** `npm run cruise` (green), commit `feat(signalk): device access-request auth controller`.

---

## Task 2: Token into the stream and the chart fetch

**Files:** modify `src/shared/signalk/origin.ts`, `src/features/charts/charts-client.ts`, and their tests if present.

- [ ] **Step 1:** `origin.ts`: add an optional token to `streamUrl`:
```ts
export function streamUrl(token?: string): string {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const base = `${scheme}//${location.host}/signalk/v1/stream?subscribe=none`;
  return token ? `${base}&token=${encodeURIComponent(token)}` : base;
}
```
NOTE: `streamUrl()` previously returned the bare stream path and the connection appended `subscribe=none`. Check `connection.ts`: it calls `withQuery(this.#url, 'subscribe=none')`. To avoid a double `subscribe=none`, move that single source of truth: keep `subscribe=none` in `connection.ts` and have `streamUrl` only add the token. Concretely, instead of the above, keep `streamUrl` returning the base path plus optional token, and let `withQuery` add `subscribe=none`:
```ts
export function streamUrl(token?: string): string {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const base = `${scheme}//${location.host}/signalk/v1/stream`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}
```
`withQuery` already appends `&subscribe=none` when a `?` is present and `?subscribe=none` otherwise, so both forms work. Verify against `connection.ts`'s `withQuery`.

- [ ] **Step 2:** `charts-client.ts`: thread an optional token through to a Bearer header:
```ts
async function tryFetch(url: string, token?: string): Promise<SignalKChart[] | undefined> {
  try {
    const response = await fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
    if (!response.ok) {
      console.warn(`[charts] ${url} returned ${response.status}`);
      return undefined;
    }
    const body = (await response.json()) as Record<string, SignalKChart>;
    return Object.values(body);
  } catch {
    return undefined;
  }
}

export async function fetchCharts(serverBase: string, token?: string): Promise<SignalKChart[]> {
  const v2 = await tryFetch(`${serverBase}${V2}`, token);
  if (v2) return v2;
  const v1 = await tryFetch(`${serverBase}${V1}`, token);
  return v1 ?? [];
}
```

- [ ] **Step 3:** If `charts-client.test.ts` calls `fetchCharts(base)`, it still passes (token optional); add one test asserting the Bearer header is sent when a token is given. Run `npm test`, green. Commit `feat(signalk): present the auth token on the stream and chart fetch`.

---

## Task 3: The AuthBanner feature

**Files:** create `src/features/auth-banner/AuthBanner.svelte`, `index.ts`.

- [ ] **Step 1:** Create `AuthBanner.svelte`:
```svelte
<script lang="ts">
import type { AuthController } from '$shared/signalk';

interface Props {
  auth: AuthController;
}

const { auth }: Props = $props();
</script>

{#if auth.status === 'requesting'}
  <div class="auth-banner">
    Requesting access. Approve <strong>Binnacle</strong> in Signal K under Security, then Access
    Requests.
  </div>
{:else if auth.status === 'denied'}
  <div class="auth-banner denied">
    Access was denied.
    <button type="button" onclick={() => auth.requestAccess()}>Request again</button>
  </div>
{/if}

<style>
.auth-banner {
  padding: 0.5rem 1rem;
  font-size: 0.85rem;
  background: var(--surface-raised);
  color: var(--text);
  border-block-end: 1px solid var(--border);
}
.auth-banner.denied {
  color: var(--alarm);
}
.auth-banner button {
  font: inherit;
  margin-inline-start: 0.5rem;
  padding: 0.15rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--accent);
  cursor: pointer;
}
</style>
```

- [ ] **Step 2:** Create `index.ts`:
```ts
export { default as AuthBanner } from './AuthBanner.svelte';
```

- [ ] **Step 3:** `npm run check`, `npm run cruise`, green. Commit `feat(auth): access-request banner`.

---

## Task 4: Wire it into App.svelte

**Files:** modify `src/app/App.svelte`.

- [ ] **Step 1:** Import the controller and banner, create the controller, and gate the connect/subscribe and chart fetch on auth. Replace the imports and the `onMount` body:
  - Imports: add `AuthController` to the `$shared/signalk` import, `import { AuthBanner } from '$features/auth-banner';`, and `serverOrigin`.
  - Create: `const auth = new AuthController(serverOrigin());`
  - Pass the token to the chart fetch: `ChartCanvas` currently calls `fetchCharts(serverOrigin())` itself, so thread the token in. Pass `auth.token ?? undefined` as a new `chartsToken` prop to `ChartCanvas`, used in its `fetchCharts` call. (ChartCanvas builds its own map; give it the token as a prop.)
  - `onMount`:
    ```ts
    await auth.probe();
    if (auth.status !== 'unsecured' && auth.status !== 'authenticated') {
      // Wait for approval: poll status reactively. Connect once a token lands.
      await waitForAuth(auth);
    }
    const token = auth.token ?? undefined;
    await client.connect(streamUrl(token), (frame) => store.applyFrame(frame));
    // ...existing subscribe calls unchanged...
    ```
    where `waitForAuth` is a small local helper that resolves when `auth.status` becomes `authenticated` (or rejects/stops on `denied`). Implement it with a polling `$effect`-free promise:
    ```ts
    function waitForAuth(controller: AuthController): Promise<void> {
      return new Promise((resolve) => {
        const tick = () => {
          if (controller.status === 'authenticated' || controller.status === 'unsecured') resolve();
          else setTimeout(tick, 500);
        };
        tick();
      });
    }
    ```
  - Render `<AuthBanner {auth} />` at the top of the shell, above the chart host.
NOTE: ChartCanvas fetches charts inside its own `onMount`. The simplest correct wiring is to pass `token` to ChartCanvas as a prop and have it call `fetchCharts(serverOrigin(), token)`. Add a `chartsToken?: string` prop to ChartCanvas and thread it through. The stream token goes through `streamUrl(token)` in App.

- [ ] **Step 2:** `npm run check`. Green. Commit `feat(auth): gate the stream and charts on access`.

---

## Task 5: Full local gate

Run each heavy command alone, capture to a file, read it back:
- [ ] `biome ci .`
- [ ] `npm run cruise`
- [ ] `NODE_OPTIONS="--max-old-space-size=2048" npm run check`
- [ ] `NODE_OPTIONS="--max-old-space-size=2048" npm test`
- [ ] `NODE_OPTIONS="--max-old-space-size=2048" NODE_ENV=production npm run build`

All green.

---

## Task 6: Verify on the live server, cleanup, doc gate

- [ ] **Step 1:** Deploy (the SK server serves `public/` via the symlink, so a build is a deploy) and load the app in a browser. Expect the banner "Requesting access. Approve Binnacle in Signal K under Security." Approve it in the Signal K admin (Security to Access Requests). The banner clears, the stream connects with the token, SOG/COG populate, AIS appears, and charts load.
- [ ] **Step 2:** Run `/cleanup` on the diff, fix every finding including nit.
- [ ] **Step 3: Doc gate.** CHANGELOG "Unreleased" entry for auth. README note that Binnacle authenticates to a secured server via a one-time access request. Update `.remember` and the `project-status` memory.
- [ ] **Step 4:** Re-run the full gate, commit, and push (the pre-push hook re-verifies).
- [ ] **Step 5: Exit criteria.** On a secured server, Binnacle requests access, the operator approves once, the token persists, and live data plus charts load on every later reload with no further prompt. On an unsecured server, behavior is unchanged. The controller is unit-tested; dependency-cruiser is green; all gates pass.

---

## Self-review notes

- **Spec coverage:** implements the device access-request flow end to end: request, poll, store, present (Bearer on REST, `?token=` on the stream), with graceful unsecured and denied handling, all from the spec.
- **Placeholder scan:** every code step is complete. The two NOTE blocks resolve a real double-`subscribe=none` risk and the ChartCanvas token-threading, both deterministic.
- **Type and name consistency:** `AuthController`, `AuthStatus`, `probe`, `requestAccess`, `checkRequest`, `clientId`, `token`, `streamUrl(token)`, `fetchCharts(base, token)`, and `AuthBanner` are used identically across tasks and match the spec.
- **Boundary note:** `auth.svelte.ts` (in `shared/signalk`) importing `PersistedValue` from `shared/settings` is intra-`shared`, allowed by dependency-cruiser. Verified in Task 1.
- **Verify before push:** every heavy command runs alone and is read from a file; the hooks enforce green; one heavy command at a time respects the Pi budget.
