/** The single owner of Chart Locker companion health, polled for the status strip's offline-charts
 * chip. It rebuilds the regions client with the live token every tick, so a token that arrives after
 * admin approval or rotates mid-session is always current, and it never captures a stale one. It lives
 * in the offline-charts feature because it drives that feature's cache-stats client; the app composes
 * one instance and reads its getters into the presenter chip. */

import { createRegionsClient, HttpStatusError } from './regions-client.js';

export const COMPANION_POLL_MS = 30_000;

export type CompanionState = 'serving' | 'needs-auth' | 'down';

export class CompanionStatus {
  #origin: string;
  #getBase: () => string | null;
  #getToken: () => string | null;
  #fetchImpl: typeof fetch | undefined;

  #state = $state<CompanionState>('needs-auth');
  #cacheBytes = $state<number | null>(null);

  #timer: ReturnType<typeof setInterval> | null = null;
  #onVisibility: (() => void) | null = null;
  #inFlight = false;
  // The exact token a 401 or 403 refused. While the live token still equals it, the poller stays backed
  // off, so a secured server is not re-hit with the same refused token every interval. Any change
  // (a fresh sign-in, or an expired token refreshed to a new one) clears it and resumes polling.
  #refusedToken: string | null = null;

  constructor(
    origin: string,
    getBase: () => string | null,
    getToken: () => string | null,
    fetchImpl?: typeof fetch,
  ) {
    this.#origin = origin;
    this.#getBase = getBase;
    this.#getToken = getToken;
    this.#fetchImpl = fetchImpl;
  }

  // Present is derived from the base, not stored, so a late detectCompanion resolution flips the chip
  // on without the poller having run.
  get present(): boolean {
    return this.#getBase() !== null;
  }

  get state(): CompanionState {
    return this.#state;
  }

  get cacheBytes(): number | null {
    return this.#cacheBytes;
  }

  start(): void {
    // Idempotent: a visibility resume or a double mount must not stack a second interval or listener.
    if (this.#timer !== null) return;
    if (typeof document !== 'undefined') {
      this.#onVisibility = () => {
        if (!document.hidden) void this.#tick();
      };
      document.addEventListener('visibilitychange', this.#onVisibility);
    }
    this.#timer = setInterval(() => void this.#tick(), COMPANION_POLL_MS);
    // An immediate first poll resolves serving versus down within a tick rather than after the full
    // interval.
    void this.#tick();
  }

  stop(): void {
    if (this.#timer !== null) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
    if (this.#onVisibility !== null && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.#onVisibility);
    }
    this.#onVisibility = null;
  }

  async #tick(): Promise<void> {
    // Requests self-abort under the client's withTimeout well inside the interval, so a single
    // in-flight guard is enough to keep polls from piling up; no own AbortController.
    if (this.#inFlight) return;
    const base = this.#getBase();
    if (base === null) return;
    if (typeof document !== 'undefined' && document.hidden) return;

    const token = this.#getToken();

    // An anonymous or read-blocked viewer polls zero times: the chip reads needs-sign-in without ever
    // touching the admin-gated route, so a secured server is not 401-spammed.
    if (token === null) {
      this.#state = 'needs-auth';
      this.#refusedToken = null;
      return;
    }
    // Stay backed off while the live token is still the one a 401 or 403 refused; any other token
    // (a fresh sign-in, or a refreshed one) clears the block and polls again.
    if (token === this.#refusedToken) return;

    this.#inFlight = true;
    try {
      const stats = await createRegionsClient(this.#origin, token, this.#fetchImpl).getCacheStats();
      this.#state = 'serving';
      this.#cacheBytes = stats.bytes;
    } catch (error) {
      if (error instanceof HttpStatusError && (error.status === 401 || error.status === 403)) {
        this.#state = 'needs-auth';
        this.#refusedToken = token;
      } else {
        // A network fault or a 5xx: keep polling so the chip recovers on its own when the link or the
        // container comes back.
        this.#state = 'down';
      }
    } finally {
      this.#inFlight = false;
    }
  }
}
