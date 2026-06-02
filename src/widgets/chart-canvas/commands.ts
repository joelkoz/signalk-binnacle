// Imperative map actions the chart exposes to the app shell (e.g. for menu items),
// handed up once the map is ready.
export interface MapCommands {
  centerOnVessel: () => void;
  // Clear any selected note (drop the selection ring); used when the detail panel closes.
  clearNoteSelection: () => void;
}
