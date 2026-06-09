import { uuidv4 } from '$shared/lib';
import type { Profile, ProfileSettings, ProfilesState } from './profile-types';

const STORAGE_KEY = 'binnacle:profiles';

// The persistence seam: production reads and writes localStorage, tests inject an in-memory fake.
export interface ProfileAdapter {
  load(): ProfilesState | undefined;
  save(state: ProfilesState): void;
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

  #persist(): void {
    this.#adapter.save({
      profiles: this.profiles,
      activeId: this.activeId,
      defaultId: this.#defaultId,
    });
  }
}
