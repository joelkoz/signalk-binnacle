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

export const STORAGE_KEY = 'binnacle:signalk-auth';
const PROBE_PATH = '/signalk/v1/api/vessels/self';
const REQUEST_PATH = '/signalk/v1/access/requests';
// Stop polling an unanswered access request after this many attempts (about 10 min at
// the default 3 s interval) so a never-approved request is not an unbounded loop.
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

  #base: string;
  #fetch: typeof fetch;
  #schedule: (run: () => void, ms: number) => void;
  #pollMs: number;
  #identity: PersistedValue<AuthIdentity>;
  #href?: string;
  #stopped = false;
  #pollAttempts = 0;
  #pollScheduled = false;

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

  async requestAccess(): Promise<void> {
    this.status = 'requesting';
    this.#pollAttempts = 0;
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
    if (!this.#href || this.status === 'authenticated') return;
    const res = await this.#safeFetch(`${this.#base}${this.#href}`);
    if (res && (res.status === 404 || res.status === 410)) {
      // The request expired or was cleared server-side; start a fresh one rather than poll a dead
      // href forever (which left the first tab stuck until the user opened a new one).
      await this.requestAccess();
      return;
    }
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

  // Re-check a pending request right now, e.g. when the tab regains focus after the user approved
  // Binnacle in the Signal K UI. Background tabs throttle the poll timer, so without this an
  // approval is not noticed until the next (delayed) poll; this picks it up immediately on return.
  recheck(): void {
    if (this.status === 'requesting') void this.checkRequest();
  }

  // Adopt a token approved in another tab (delivered via the storage event), so every open tab
  // connects once any one of them is approved, with no reload.
  adoptToken(token: string): void {
    if (!token || this.status === 'authenticated') return;
    this.#store(token);
    this.token = token;
    this.status = 'authenticated';
  }

  stop(): void {
    this.#stopped = true;
  }

  #schedulePoll(): void {
    if (this.#stopped || this.#pollScheduled || this.status === 'authenticated') return;
    if (this.#pollAttempts >= MAX_POLL_ATTEMPTS) {
      this.status = 'denied';
      return;
    }
    this.#pollAttempts += 1;
    this.#pollScheduled = true;
    this.#schedule(() => {
      this.#pollScheduled = false;
      void this.checkRequest();
    }, this.#pollMs);
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
