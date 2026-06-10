import { withTimeout } from '$shared/lib';
import { authInit } from '$shared/signalk';
import type { ProfilesState } from './profile-types';
import type { AsyncProfileAdapter } from './profiles-store.svelte';

// The SignalK applicationData store, keyed by appId and data-format version. The version segment is
// the document schema version (1.0.0), a constant independent of the app's package version. POSTing
// to the bare URL (no trailing key path) replaces the whole document, which is the ProfilesState.
const APP_DATA_URL = (base: string) =>
  `${base}/signalk/v1/applicationData/user/signalk-binnacle/1.0.0`;

// Persists the profiles document to the SignalK server's per-user applicationData store, so profiles
// follow a logged-in user across devices. Every call degrades silently: a load failure resolves
// undefined and a save failure resolves false, so the store keeps its local cache rather than throw.
export class SignalKProfileAdapter implements AsyncProfileAdapter {
  #base: string;
  #token: string | undefined;

  constructor(base: string, token: string | undefined) {
    this.#base = base;
    this.#token = token;
  }

  async load(): Promise<ProfilesState | undefined> {
    try {
      const response = await fetch(APP_DATA_URL(this.#base), withTimeout(authInit(this.#token)));
      // Any non-2xx (401 unauthenticated, 405 security off, 404, and the rest) means the store is
      // unavailable: undefined tells the caller to stay local and not attempt a write that would also
      // fail, distinct from the reachable-but-empty case below.
      if (!response.ok) return undefined;
      const body = await response.json();
      // A reachable but empty store answers with {} and a 200, so a missing profiles array is an empty
      // state, not an unavailable one: returning it lets the store seed the server from the local cache.
      if (!body || typeof body !== 'object' || !Array.isArray((body as ProfilesState).profiles)) {
        return { profiles: [], activeId: undefined, defaultId: undefined };
      }
      return body as ProfilesState;
    } catch {
      return undefined;
    }
  }

  async save(state: ProfilesState): Promise<boolean> {
    try {
      const response = await fetch(
        APP_DATA_URL(this.#base),
        withTimeout(
          authInit(this.#token, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(state),
          }),
        ),
      );
      return response.ok;
    } catch {
      return false;
    }
  }
}
