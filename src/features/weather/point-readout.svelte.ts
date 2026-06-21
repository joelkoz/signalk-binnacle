import type { WeatherStore } from '$entities/weather';
import { GRID_SOURCE_LABEL } from './fills';
import {
  fetchObservations,
  fetchPointForecasts,
  NEAR_NOW_MS,
  nearestInTimeBounded,
  readoutFromSignalK,
} from './signalk-weather';
import { readoutAtBracket, type WeatherReadout } from './weather-readout';

export interface PointReadoutDeps {
  // Getters, not values, for the reactive inputs: the store is a stable instance but the token and the
  // provider name change over the session (re-auth, provider detection), so a tap must read them live.
  store: () => WeatherStore;
  // The Signal K server origin, captured once for the page lifetime.
  origin: string;
  // The Signal K auth token, when one is configured.
  token: () => string | undefined;
  // The default weather provider's display name, when one is configured. With a provider the tap
  // prefers it and falls back to the free grid; without one the grid answers.
  providerName: () => string | undefined;
  // How many weather layers are on: the grid sample only shows when at least one is, matching the
  // overlays drawn under the finger.
  activeCount: () => number;
  // True once the host component has torn down, so a provider answer that resolves after teardown
  // does not write state.
  isDestroyed: () => boolean;
}

const READOUT_DISMISS_MS = 8000;

// The point-tap readout: the conditions at the tapped point for the selected time, with a fast grid
// sample shown immediately and a configured provider upgrading it when it answers. Owns the readout
// state and the dismiss timer; the host wires onTap, hold, release, and dismiss to the map and the
// readout card.
export function createPointReadout(deps: PointReadoutDeps) {
  let readout = $state<WeatherReadout | undefined>();
  let readoutSource = $state<string | undefined>();
  // A provider answer is pending and the grid had nothing to show meanwhile, so the tap must not
  // look dead on a slow boat link.
  let readoutPending = $state(false);
  let readoutTimer: ReturnType<typeof setTimeout> | undefined;
  // The pointer or focus is parked on the readout, so nothing (not even a provider upgrade landing
  // mid-read) may arm the dismiss timer until it leaves.
  let readoutHeld = false;
  // Each tap bumps this so a slow provider response from an earlier tap cannot overwrite a newer one.
  let tapSeq = 0;

  function clearReadoutTimer(): void {
    if (readoutTimer) clearTimeout(readoutTimer);
    readoutTimer = undefined;
  }

  function showReadout(value: WeatherReadout | undefined, source: string | undefined): void {
    clearReadoutTimer();
    readout = value;
    readoutSource = value ? source : undefined;
    if (value && !readoutHeld) readoutTimer = setTimeout(dismiss, READOUT_DISMISS_MS);
  }

  function dismiss(): void {
    clearReadoutTimer();
    readout = undefined;
    readoutSource = undefined;
    readoutPending = false;
  }

  // A slow reader must not lose the readout mid-read: hovering or focusing it parks the dismiss
  // timer, leaving restarts it.
  function hold(): void {
    readoutHeld = true;
    clearReadoutTimer();
  }

  function release(): void {
    readoutHeld = false;
    if (readout && !readoutTimer) readoutTimer = setTimeout(dismiss, READOUT_DISMISS_MS);
  }

  async function providerReadout(lat: number, lon: number): Promise<WeatherReadout | undefined> {
    const target = deps.store().selectedTime;
    if (Math.abs(target - Date.now()) < NEAR_NOW_MS) {
      const obs = await fetchObservations(deps.origin, lat, lon, deps.token());
      const reading = obs && readoutFromSignalK(obs);
      if (reading) return reading;
    }
    // Bounded: past the provider's horizon its last step must not answer for a time days away; the
    // caller falls back to the grid sample instead.
    const series = await fetchPointForecasts(deps.origin, lat, lon, 48, deps.token());
    const step = series && nearestInTimeBounded(series, target);
    return step ? readoutFromSignalK(step) : undefined;
  }

  // Conditions at the tapped point for the selected time. The free-grid sample (blended across the
  // time bracket, exactly as the fields are drawn) shows IMMEDIATELY; a configured provider then
  // upgrades it when it answers, so a slow boat link never leaves the tap looking dead.
  async function onTap(lng: number, lat: number): Promise<void> {
    const seq = ++tapSeq;
    const store = deps.store();
    const providerName = deps.providerName();
    const gridSample =
      deps.activeCount() > 0 && store.grid
        ? readoutAtBracket(store.grid, lng, lat, store.bracket)
        : undefined;
    if (!providerName) {
      showReadout(gridSample, gridSample ? GRID_SOURCE_LABEL : undefined);
      return;
    }
    if (gridSample) showReadout(gridSample, GRID_SOURCE_LABEL);
    else readoutPending = true;
    const value = await providerReadout(lat, lng);
    if (deps.isDestroyed() || seq !== tapSeq) return;
    readoutPending = false;
    if (value) showReadout(value, providerName);
    else if (!gridSample) dismiss();
  }

  function destroy(): void {
    clearReadoutTimer();
  }

  return {
    onTap,
    hold,
    release,
    dismiss,
    destroy,
    get readout() {
      return readout;
    },
    get readoutSource() {
      return readoutSource;
    },
    get readoutPending() {
      return readoutPending;
    },
  };
}
