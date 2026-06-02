import type { SignalKChart } from '$shared/map';

// Imperative map actions the chart exposes to the app shell (e.g. for menu items),
// handed up once the map is ready.
export interface MapCommands {
  centerOnVessel: () => void;
  // Clear any selected note (drop the selection ring); used when the detail panel closes.
  clearNoteSelection: () => void;
}

// Register or remove a user-imported chart overlay once the map is ready. The app drives this
// from the user-charts entity, resolving each chart's tile url before calling register.
export interface UserChartRegistrar {
  register: (chart: SignalKChart) => Promise<void>;
  unregister: (identifier: string) => void;
}
