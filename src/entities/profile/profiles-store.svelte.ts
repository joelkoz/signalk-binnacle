import { uuidv4 } from '$shared/lib';
import type { Profile, ProfileSettings, ProfilesState } from './profile-types';

const STORAGE_KEY = 'binnacle:profiles';

// The local persistence seam: production reads and writes localStorage, tests inject an in-memory fake.
export interface ProfileAdapter {
  load(): ProfilesState | undefined;
  save(state: ProfilesState): void;
}

// The optional server persistence seam (v2): the SignalK applicationData adapter persists per-user
// across devices. Both calls degrade gracefully (load resolves undefined, save resolves false) when the
// server is unsecured, unauthenticated, or unreachable, so the store falls back to the local cache.
export interface AsyncProfileAdapter {
  load(): Promise<ProfilesState | undefined>;
  save(state: ProfilesState): Promise<boolean>;
}

// Reads and writes the whole profiles state to localStorage as one JSON document. Guarded for SSR
// (no localStorage) and for a throwing or quota-full store, returning undefined on any read failure
// so a corrupt or absent value falls back to empty rather than breaking startup.
export class LocalProfileAdapter implements ProfileAdapter {
  load(): ProfilesState | undefined {
    if (typeof localStorage === 'undefined') return undefined;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw == null) return undefined;
      return JSON.parse(raw) as ProfilesState;
    } catch {
      return undefined;
    }
  }

  save(state: ProfilesState): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // A failed persist (quota exceeded, private mode) must not break the in-memory update.
    }
  }
}

// The reactive home for saved profiles. Each mutation updates the runes and persists the whole
// state through the adapter, so the on-disk document always matches what the UI shows.
export class ProfileStore {
  profiles = $state<Profile[]>([]);
  activeId = $state<string | undefined>(undefined);
  // True when the active profile's live settings have drifted from what was saved, so the UI can
  // offer to update it. Cleared on every profile switch and on an explicit save or update.
  isDirty = $state(false);

  #defaultId = $state<string | undefined>(undefined);
  #adapter: ProfileAdapter;
  // The optional server adapter and a single-flight push state, so concurrent saves never collide on a
  // server that has no write-conflict detection: the latest state is always the one that lands.
  #server: AsyncProfileAdapter | undefined;
  #pushPending = false;
  #pushing = false;

  constructor(adapter: ProfileAdapter = new LocalProfileAdapter()) {
    this.#adapter = adapter;
    const stored = adapter.load();
    if (stored) {
      this.profiles = stored.profiles ?? [];
      this.activeId = stored.activeId;
      this.#defaultId = stored.defaultId;
    }
  }

  get active(): Profile | undefined {
    return this.profiles.find((p) => p.id === this.activeId);
  }

  get defaultId(): string | undefined {
    return this.#defaultId;
  }

  // Seed starter profiles only when the store is empty, so a fresh device or browser is not blank.
  // Seeds carry stable ids so the same starters from two devices merge to one, not duplicate.
  seed(profiles: Profile[]): void {
    if (this.profiles.length > 0) return;
    this.profiles = profiles;
    this.#persist();
  }

  // Attach the SignalK applicationData adapter and reconcile with the server: merge the remote profiles
  // in by id (the later updatedAt wins), then push the reconciled state back so the server converges
  // (and an empty server is seeded from this device). Called once the user is authenticated.
  async syncWithServer(server: AsyncProfileAdapter): Promise<void> {
    let remote: ProfilesState | undefined;
    try {
      remote = await server.load();
    } catch {
      remote = undefined;
    }
    // undefined means the server is unavailable (unsecured, the token lacks access, or unreachable):
    // stay local and do not attach the adapter, so no further writes are attempted and the console is
    // not flooded with failures. A reachable server (even an empty one) attaches and pushes once.
    if (remote === undefined) return;
    this.#server = server;
    this.#mergeRemote(remote);
    this.#schedulePush();
  }

  #mergeRemote(remote: ProfilesState): void {
    const byId = new Map<string, Profile>();
    for (const p of this.profiles) byId.set(p.id, p);
    for (const p of remote.profiles ?? []) {
      const existing = byId.get(p.id);
      if (!existing || (p.updatedAt ?? 0) >= (existing.updatedAt ?? 0)) byId.set(p.id, p);
    }
    this.profiles = [...byId.values()];
    this.activeId = remote.activeId ?? this.activeId;
    this.#defaultId = remote.defaultId ?? this.#defaultId;
    // Cache the merged state locally without re-scheduling a push; syncWithServer pushes once.
    this.#adapter.save(this.#snapshot());
  }

  save(name: string, settings: ProfileSettings): Profile {
    const now = Date.now();
    const profile: Profile = { id: uuidv4(), name, settings, createdAt: now, updatedAt: now };
    this.profiles = [...this.profiles, profile];
    this.#persist();
    return profile;
  }

  update(id: string, settings: ProfileSettings): void {
    const now = Date.now();
    this.profiles = this.profiles.map((p) =>
      p.id === id ? { ...p, settings, updatedAt: now } : p,
    );
    this.#persist();
  }

  rename(id: string, name: string): void {
    this.profiles = this.profiles.map((p) =>
      p.id === id ? { ...p, name, updatedAt: Date.now() } : p,
    );
    this.#persist();
  }

  remove(id: string): void {
    this.profiles = this.profiles.filter((p) => p.id !== id);
    if (this.activeId === id) this.activeId = undefined;
    if (this.#defaultId === id) this.#defaultId = undefined;
    this.#persist();
  }

  setDefault(id: string): void {
    this.#defaultId = id;
    this.#persist();
  }

  setActive(id: string | undefined): void {
    this.activeId = id;
    this.isDirty = false;
    this.#persist();
  }

  markDirty(): void {
    if (this.activeId !== undefined) this.isDirty = true;
  }

  clearDirty(): void {
    this.isDirty = false;
  }

  #snapshot(): ProfilesState {
    return { profiles: this.profiles, activeId: this.activeId, defaultId: this.#defaultId };
  }

  #persist(): void {
    this.#adapter.save(this.#snapshot());
    this.#schedulePush();
  }

  // Single-flight server push: mark a write pending and start the runner if idle; the runner loops
  // until no write is pending, always sending the latest snapshot, so rapid edits collapse to one
  // in-flight request followed by one more with the final state.
  #schedulePush(): void {
    if (!this.#server) return;
    this.#pushPending = true;
    if (this.#pushing) return;
    void this.#runPush();
  }

  async #runPush(): Promise<void> {
    if (!this.#server) return;
    this.#pushing = true;
    while (this.#pushPending) {
      this.#pushPending = false;
      try {
        await this.#server.save(this.#snapshot());
      } catch {
        // A failed server write leaves the local cache as the source of truth; the next edit retries.
      }
    }
    this.#pushing = false;
  }
}
