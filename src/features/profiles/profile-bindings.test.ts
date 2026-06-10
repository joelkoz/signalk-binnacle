import { describe, expect, it } from 'vitest';
import { createProfileBindings, type ProfileBindingDeps } from './profile-bindings';

// Minimal stand-ins: the bindings only read `.value`/`.theme` and call `.set`, so a plain object with
// those is enough. Cast through unknown since the real types carry more.
function makeDeps(): ProfileBindingDeps {
  const pv = <T>(value: T) => ({
    value,
    set(next: T) {
      this.value = next;
    },
  });
  return {
    theme: {
      theme: 'day',
      set(next: string) {
        this.theme = next;
      },
    },
    layers: pv({}),
    layerOrder: pv<string[]>([]),
    layerCategories: pv({}),
    weatherLayers: pv({}),
    thresholds: pv({
      dangerCpaMeters: 1,
      dangerTcpaSeconds: 1,
      warningCpaMeters: 1,
      warningTcpaSeconds: 1,
    }),
    trackSettings: pv({ intervalSeconds: 10, minMeters: 10, colorMode: 'speed' }),
    planningSpeedKn: pv(5),
    arrivalMuted: pv(false),
  } as unknown as ProfileBindingDeps;
}

describe('createProfileBindings', () => {
  it('captures every portable setting into one bundle', () => {
    const bindings = createProfileBindings(makeDeps());
    const bundle = bindings.capture();
    expect(bundle).toMatchObject({ theme: 'day', planningSpeedKn: 5, arrivalMuted: false });
    expect(bundle.layerOrder).toEqual([]);
    expect(bundle.trackSettings.colorMode).toBe('speed');
  });

  it('applies a bundle back to every store', () => {
    const deps = makeDeps();
    const bindings = createProfileBindings(deps);
    bindings.apply({
      ...bindings.capture(),
      theme: 'night-red',
      planningSpeedKn: 7,
      arrivalMuted: true,
    });
    expect(deps.theme.theme).toBe('night-red');
    expect(deps.planningSpeedKn.value).toBe(7);
    expect(deps.arrivalMuted.value).toBe(true);
  });
});
