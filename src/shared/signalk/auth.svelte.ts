import { PersistedValue } from '$shared/settings';
import { jsonOr } from './resource';

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
// Stop polling an unanswered access request (or retrying a POST that keeps failing in
// transit) after this many attempts (about 10 min at the default 3 s interval) so a
// never-approved request is not an unbounded loop.
const MAX_POLL_ATTEMPTS = 200;

// A short, recognizable client id (binnacle-<8 hex>) so the Signal K access-requests list shows a
// name the user recognizes, not a bare UUID. crypto.randomUUID needs a secure context, so fall
// back to a random hex string where it is absent.
function newClientId(): string {
  const short =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.floor(Math.random() * 0xffffffff)
          .toString(16)
          .padStart(8, '0');
  return `binnacle-${short}`;
}

export class AuthController {
  status = $state<AuthStatus>('unknown');
  token = $state<string | null>(null);
  // True once an authenticated session has had a write refused (401/403): the granted token is
  // read-only. A later successful write clears it. Drives the read-only banner and its upgrade action.
  writeBlocked = $state(false);
  // True while a read/write upgrade request is pending admin approval. The existing read token stays
  // live throughout, so the chart keeps updating while the navigator waits for the new grant.
  upgrading = $state(false);

  #base: string;
  #fetch: typeof fetch;
  #schedule: (run: () => void, ms: number) => void;
  #pollMs: number;
  #identity: PersistedValue<AuthIdentity>;
  #href?: string;
  #stopped = false;
  #pollAttempts = 0;
  #pollScheduled = false;
  #checking = false;
  #watching = false;
  #upgradeHref?: string;
  #upgradeClientId?: string;
  #upgradeAttempts = 0;
  #upgradeScheduled = false;

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
    // Persist a first-run identity, and upgrade a legacy bare-UUID clientId to the recognizable
    // binnacle- form (keeping any token), so the access-requests list shows a known name.
    const stored = this.#identity.value;
    const clientId = stored.clientId.startsWith('binnacle-') ? stored.clientId : newClientId();
    if (!this.#identity.fromStorage || clientId !== stored.clientId) {
      this.#identity.set({ clientId, token: stored.token });
    }
    this.token = this.#identity.value.token;
  }

  get clientId(): string {
    return this.#identity.value.clientId;
  }

  // The client id of a pending read/write upgrade request, so the banner names the request the admin
  // actually sees (a fresh id), not the old persisted one. Undefined when no upgrade is in flight.
  get upgradeClientId(): string | undefined {
    return this.#upgradeClientId;
  }

  async probe(): Promise<void> {
    // A stored token is the source of truth: the WebSocket stream needs it, and a
    // working token means the server is secured and we are good. Check it first.
    const stored = this.#identity.value.token;
    if (stored) {
      // credentials: 'omit' so a live session cookie cannot authorize this probe and
      // mask a stale token; the token alone must prove access (it is what the stream uses).
      const authed = await this.#safeFetch(`${this.#base}${PROBE_PATH}`, {
        headers: { Authorization: `Bearer ${stored}` },
        credentials: 'omit',
      });
      if (authed?.ok) {
        this.token = stored;
        this.status = 'authenticated';
        return;
      }
      // A transport failure proves nothing about the token: clearing it here would wipe an
      // admin-approved token on a flaky boat network. Keep it, skip the anonymous probe (it
      // would also fail and could mislabel the server), and let a later probe retry.
      if (!authed) return;
      // Likewise a non-auth error (a 500, a proxy hiccup) is not a rejection of the token.
      if (authed.status !== 401 && authed.status !== 403) return;
      // Only a definite rejection invalidates the stored token.
      this.#store(null);
    }
    // Probe anonymously WITHOUT credentials. A browser session cookie would
    // otherwise make a secured server look unsecured, and the WebSocket stream
    // (which the cookie does not authenticate) would then connect tokenless and
    // receive no data. `credentials: 'omit'` forces a true anonymous check.
    const anon = await this.#safeFetch(`${this.#base}${PROBE_PATH}`, { credentials: 'omit' });
    if (anon?.ok) {
      this.status = 'unsecured';
      return;
    }
    await this.requestAccess();
  }

  // POST an access request for a client id, requesting readwrite up front so the admin's approval UI
  // defaults to it rather than the server's readonly fallback (Binnacle writes routes, waypoints,
  // tracks, course, alarms, and radar controls; a readonly grant 401s every one). `ok` is false only
  // when the POST itself did not land (offline), so the caller can retry; `href` is the granted poll
  // URL. Anonymous (credentials omitted): the request is keyed by clientId and href, never a cookie.
  async #postAccessRequest(
    clientId: string,
    description: string,
  ): Promise<{ ok: boolean; href?: string }> {
    const res = await this.#safeFetch(`${this.#base}${REQUEST_PATH}`, {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, description, permissions: 'readwrite' }),
    });
    if (!res) return { ok: false };
    const body = await jsonOr<Record<string, unknown>>(res, {});
    return { ok: true, href: typeof body.href === 'string' ? body.href : undefined };
  }

  // Poll a pending access-request href once. 'gone' = the request expired or was cleared (404/410),
  // 'pending' = not yet answered or a transient error, 'denied' = completed but not approved, and an
  // object carries the approved token. Shared by the initial flow and the read/write upgrade flow.
  async #pollAccessRequest(
    href: string,
  ): Promise<'gone' | 'pending' | 'denied' | { token: string }> {
    const res = await this.#safeFetch(`${this.#base}${href}`, { credentials: 'omit' });
    if (res && (res.status === 404 || res.status === 410)) return 'gone';
    if (!res?.ok) return 'pending';
    const body = await jsonOr<Record<string, unknown>>(res, {});
    if (body.state !== 'COMPLETED') return 'pending';
    const request = (body.accessRequest ?? {}) as { permission?: string; token?: string };
    if (request.permission === 'APPROVED' && typeof request.token === 'string') {
      return { token: request.token };
    }
    return 'denied';
  }

  async requestAccess(): Promise<void> {
    this.status = 'requesting';
    const { ok, href } = await this.#postAccessRequest(this.clientId, 'Binnacle chart plotter');
    if (!ok) {
      // A failed POST (offline at startup) must not strand the request at 'requesting' forever: re-issue
      // it on the poll cadence, bounded by the attempt counter, which resets once a POST lands.
      this.#schedulePoll(() => this.requestAccess());
      return;
    }
    this.#pollAttempts = 0;
    this.#href = href;
    if (!href) {
      this.status = 'denied';
      return;
    }
    this.#schedulePoll();
  }

  async checkRequest(): Promise<void> {
    // Skip if a check is already in flight: a tab return fires focus and visibilitychange together,
    // and a manual recheck can overlap the scheduled poll, so one guard avoids duplicate fetches.
    if (this.#checking || !this.#href || this.status === 'authenticated') return;
    this.#checking = true;
    try {
      const result = await this.#pollAccessRequest(this.#href);
      if (result === 'gone') {
        // The request expired or was cleared server-side; start a fresh one rather than poll a dead
        // href forever (which left the first tab stuck until the user opened a new one).
        await this.requestAccess();
      } else if (result === 'pending') {
        this.#schedulePoll();
      } else if (result === 'denied') {
        this.status = 'denied';
      } else {
        this.#store(result.token);
        this.token = result.token;
        this.status = 'authenticated';
      }
    } finally {
      this.#checking = false;
    }
  }

  // Watch the environment so an approval is noticed without a reload: re-check the pending request
  // when the tab regains focus (background tabs throttle the poll timer, so an approval made while
  // away is otherwise missed until the next delayed poll), and adopt a token approved in another tab
  // via the storage event. Owned here so the storage format and request lifecycle stay encapsulated;
  // call once after construction, and stop() tears it down.
  watch(): void {
    if (this.#watching || typeof window === 'undefined') return;
    this.#watching = true;
    window.addEventListener('focus', this.#onFocus);
    window.addEventListener('storage', this.#onStorage);
    if (typeof document !== 'undefined')
      document.addEventListener('visibilitychange', this.#onFocus);
  }

  recheck(): void {
    if (this.status === 'requesting') void this.checkRequest();
    if (this.upgrading) void this.checkUpgrade();
  }

  adoptToken(token: string): void {
    if (!token || this.status === 'authenticated') return;
    this.#store(token);
    this.token = token;
    this.status = 'authenticated';
  }

  // Record a write outcome observed through sendJson. An authenticated session whose write is refused
  // (401/403) holds a read-only token; a 2xx write proves write access and clears the flag (so the
  // banner disappears once an upgraded token takes effect). Reads and an unsecured server never set it.
  reportWriteOutcome(ok: boolean, status: number): void {
    if (this.status !== 'authenticated') return;
    if (ok) this.writeBlocked = false;
    else if (status === 401 || status === 403) this.writeBlocked = true;
  }

  // Request a fresh read/write token when the current one is read-only. A new clientId is used so the
  // admin sees a new request to approve (re-requesting the same clientId would just re-return the
  // existing read grant). The current read token stays live until the new one is approved, so the chart
  // keeps updating; on approval the new identity is adopted wholesale.
  async requestWriteAccess(): Promise<void> {
    if (this.upgrading) return;
    // Set the upgrade client id before the reactive flag so the banner names it on first render.
    this.#upgradeAttempts = 0;
    this.#upgradeClientId = newClientId();
    this.upgrading = true;
    const { href } = await this.#postAccessRequest(
      this.#upgradeClientId,
      'Binnacle chart plotter (read/write)',
    );
    this.#upgradeHref = href;
    if (!href) {
      this.upgrading = false;
      return;
    }
    this.#scheduleUpgradePoll();
  }

  async checkUpgrade(): Promise<void> {
    if (!this.#upgradeHref) return;
    const result = await this.#pollAccessRequest(this.#upgradeHref);
    if (result === 'pending') {
      this.#scheduleUpgradePoll();
      return;
    }
    // On approval adopt the new read/write identity wholesale; 'gone' and 'denied' just end the upgrade,
    // leaving the live read token in place so the chart keeps updating.
    if (typeof result === 'object' && this.#upgradeClientId) {
      this.#identity.set({ clientId: this.#upgradeClientId, token: result.token });
      this.token = result.token;
      this.status = 'authenticated';
      this.writeBlocked = false;
    }
    this.#endUpgrade();
  }

  stop(): void {
    this.#stopped = true;
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', this.#onFocus);
      window.removeEventListener('storage', this.#onStorage);
    }
    if (typeof document !== 'undefined')
      document.removeEventListener('visibilitychange', this.#onFocus);
  }

  #onFocus = (): void => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    this.recheck();
  };

  #onStorage = (event: StorageEvent): void => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      const token = (JSON.parse(event.newValue) as AuthIdentity).token;
      if (token) this.adoptToken(token);
    } catch {
      // Ignore a malformed storage payload.
    }
  };

  // Schedule the next poll tick. The default task checks the pending request; requestAccess
  // passes itself as the task to retry a POST that failed in transit.
  #schedulePoll(task?: () => Promise<void>): void {
    if (this.#stopped || this.#pollScheduled || this.status === 'authenticated') return;
    if (this.#pollAttempts >= MAX_POLL_ATTEMPTS) {
      this.status = 'denied';
      return;
    }
    this.#pollAttempts += 1;
    this.#pollScheduled = true;
    this.#schedule(() => {
      this.#pollScheduled = false;
      void (task ? task() : this.checkRequest());
    }, this.#pollMs);
  }

  #scheduleUpgradePoll(): void {
    if (this.#stopped || this.#upgradeScheduled || !this.#upgradeHref) return;
    if (this.#upgradeAttempts >= MAX_POLL_ATTEMPTS) {
      this.#endUpgrade();
      return;
    }
    this.#upgradeAttempts += 1;
    this.#upgradeScheduled = true;
    this.#schedule(() => {
      this.#upgradeScheduled = false;
      void this.checkUpgrade();
    }, this.#pollMs);
  }

  #endUpgrade(): void {
    this.upgrading = false;
    this.#upgradeHref = undefined;
    this.#upgradeClientId = undefined;
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
}
