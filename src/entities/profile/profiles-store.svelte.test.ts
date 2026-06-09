import { describe, expect, it, vi } from 'vitest';
import type { ProfileSettings, ProfilesState } from './profile-types';
import { type ProfileAdapter, ProfileStore } from './profiles-store.svelte';

// An in-memory adapter so tests never touch localStorage. It can be seeded with stored state and
// records every save for asserting persistence.
function fakeAdapter(initial?: ProfilesState): ProfileAdapter & { saved: ProfilesState[] } {
  let state = initial;
  const saved: ProfilesState[] = [];
  return {
    saved,
    load: () => state,
    save: (next: ProfilesState) => {
      state = next;
      saved.push(structuredClone(next));
    },
  };
}

const settings = (overrides: Partial<ProfileSettings> = {}): ProfileSettings => ({
  theme: 'day',
  layers: {},
  layerOrder: [],
  layerCategories: {},
  weatherLayers: {},
  thresholds: {
    dangerCpaMeters: 926,
    dangerTcpaSeconds: 600,
    warningCpaMeters: 1852,
    warningTcpaSeconds: 1200,
  },
  trackSettings: { intervalSeconds: 10, minMeters: 10, colorMode: 'speed' },
  planningSpeedKn: 6,
  alarmMuted: false,
  arrivalMuted: false,
  ...overrides,
});

describe('ProfileStore', () => {
  it('loads stored state into the runes on construction', () => {
    const stored: ProfilesState = {
      profiles: [{ id: 'p1', name: 'Coastal', settings: settings(), createdAt: 1, updatedAt: 1 }],
      activeId: 'p1',
      defaultId: 'p1',
    };
    const store = new ProfileStore(fakeAdapter(stored));
    expect(store.profiles.map((p) => p.id)).toEqual(['p1']);
    expect(store.activeId).toBe('p1');
    expect(store.defaultId).toBe('p1');
    expect(store.active?.name).toBe('Coastal');
  });

  it('starts empty when the adapter has nothing stored', () => {
    const store = new ProfileStore(fakeAdapter());
    expect(store.profiles).toEqual([]);
    expect(store.activeId).toBeUndefined();
    expect(store.defaultId).toBeUndefined();
    expect(store.active).toBeUndefined();
  });

  it('appends a saved profile with a fresh id and timestamps', () => {
    const adapter = fakeAdapter();
    const store = new ProfileStore(adapter);
    const a = store.save('Coastal', settings());
    const b = store.save('Offshore', settings());
    expect(store.profiles.map((p) => p.name)).toEqual(['Coastal', 'Offshore']);
    expect(a.id).not.toBe(b.id);
    expect(a.createdAt).toBe(a.updatedAt);
    expect(adapter.saved.at(-1)?.profiles).toHaveLength(2);
  });

  it('rewrites settings on update while keeping the id', () => {
    const store = new ProfileStore(fakeAdapter());
    const p = store.save('Coastal', settings({ planningSpeedKn: 6 }));
    store.update(p.id, settings({ planningSpeedKn: 9 }));
    const updated = store.profiles.find((x) => x.id === p.id);
    expect(updated?.id).toBe(p.id);
    expect(updated?.settings.planningSpeedKn).toBe(9);
  });

  it('renames a profile, changing the name only', () => {
    const store = new ProfileStore(fakeAdapter());
    const p = store.save('Coastal', settings({ planningSpeedKn: 6 }));
    store.rename(p.id, 'Inshore');
    const renamed = store.profiles.find((x) => x.id === p.id);
    expect(renamed?.name).toBe('Inshore');
    expect(renamed?.settings.planningSpeedKn).toBe(6);
  });

  it('removes a profile and resets active and default when they matched it', () => {
    const store = new ProfileStore(fakeAdapter());
    const p = store.save('Coastal', settings());
    store.setActive(p.id);
    store.setDefault(p.id);
    store.remove(p.id);
    expect(store.profiles).toEqual([]);
    expect(store.activeId).toBeUndefined();
    expect(store.defaultId).toBeUndefined();
  });

  it('leaves active and default intact when removing a different profile', () => {
    const store = new ProfileStore(fakeAdapter());
    const keep = store.save('Coastal', settings());
    const drop = store.save('Offshore', settings());
    store.setActive(keep.id);
    store.setDefault(keep.id);
    store.remove(drop.id);
    expect(store.profiles.map((p) => p.id)).toEqual([keep.id]);
    expect(store.activeId).toBe(keep.id);
    expect(store.defaultId).toBe(keep.id);
  });

  it('persists the default and reflects it through the getter', () => {
    const adapter = fakeAdapter();
    const store = new ProfileStore(adapter);
    const p = store.save('Coastal', settings());
    store.setDefault(p.id);
    expect(store.defaultId).toBe(p.id);
    expect(adapter.saved.at(-1)?.defaultId).toBe(p.id);
  });

  it('clears the dirty flag on setActive', () => {
    const store = new ProfileStore(fakeAdapter());
    const p = store.save('Coastal', settings());
    store.setActive(p.id);
    store.markDirty();
    expect(store.isDirty).toBe(true);
    store.setActive(p.id);
    expect(store.isDirty).toBe(false);
  });

  it('marks dirty only when a profile is active', () => {
    const store = new ProfileStore(fakeAdapter());
    store.markDirty();
    expect(store.isDirty).toBe(false);
    const p = store.save('Coastal', settings());
    store.setActive(p.id);
    store.markDirty();
    expect(store.isDirty).toBe(true);
  });

  it('clears the dirty flag on clearDirty', () => {
    const store = new ProfileStore(fakeAdapter());
    const p = store.save('Coastal', settings());
    store.setActive(p.id);
    store.markDirty();
    store.clearDirty();
    expect(store.isDirty).toBe(false);
  });

  it('calls adapter.save on each mutation', () => {
    const adapter = fakeAdapter();
    const saveSpy = vi.spyOn(adapter, 'save');
    const store = new ProfileStore(adapter);
    const p = store.save('Coastal', settings());
    store.update(p.id, settings({ planningSpeedKn: 8 }));
    store.rename(p.id, 'Inshore');
    store.setDefault(p.id);
    store.setActive(p.id);
    store.remove(p.id);
    expect(saveSpy).toHaveBeenCalledTimes(6);
  });

  it('round-trips the reserved mode field unchanged', () => {
    const adapter = fakeAdapter();
    const store = new ProfileStore(adapter);
    const p = store.save('Anchor watch', settings({ mode: 'anchor' }));
    const persisted = adapter.saved.at(-1)?.profiles.find((x) => x.id === p.id);
    expect(persisted?.settings.mode).toBe('anchor');

    const reloaded = new ProfileStore(fakeAdapter(adapter.saved.at(-1)));
    expect(reloaded.profiles.find((x) => x.id === p.id)?.settings.mode).toBe('anchor');
  });
});
