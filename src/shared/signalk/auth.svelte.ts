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
    : `binnacle-${Date.now().toString(36)}`;
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
    // Persist the identity once so the generated clientId is stable across reloads.
    this.#identity.set(this.#identity.value);
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
