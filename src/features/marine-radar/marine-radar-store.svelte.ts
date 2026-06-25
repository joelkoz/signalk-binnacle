import type { ControlDefinition, RadarInfo } from './radar-types';

// The stream connection state, distinct from the radar's own operational status (off/standby/transmit).
export type RadarConnectionStatus = 'idle' | 'connecting' | 'live' | 'error';

// Seed the displayed control values from a radar's reported controls so the panel shows real values
// immediately, before any capability fetch or stream delta.
function controlValuesOf(radar: RadarInfo): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, entry] of Object.entries(radar.controls)) {
    if (entry) out[id] = entry.value;
  }
  return out;
}

// Seed which controls are in auto from the radar's reported control state, so an auto-capable control
// shows its Auto toggle lit immediately, before any user change.
function controlAutoOf(radar: RadarInfo): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [id, entry] of Object.entries(radar.controls)) {
    if (entry?.auto) out[id] = true;
  }
  return out;
}

// The marine radar state: the discovered radars, the selected radar, its control definitions and live
// values, the connection status, and whether a control write was refused for lack of write access. The
// controller orchestrates; this only holds state.
export class MarineRadarStore {
  radars = $state<RadarInfo[]>([]);
  selectedId = $state<string | undefined>(undefined);
  status = $state<RadarConnectionStatus>('idle');
  capabilities = $state<ControlDefinition[]>([]);
  controlValues = $state<Record<string, number>>({});
  // Which controls are currently in auto mode, keyed by control id, for the controls that report an
  // auto/manual capability. A direct property write stays reactive without reallocating the object.
  controlAuto = $state<Record<string, boolean>>({});
  // True once a control write was refused for lack of write access: the controls need a read-write token.
  controlsForbidden = $state(false);

  selected = $derived(this.radars.find((r) => r.id === this.selectedId));
  // A radar is detected once discovery returns at least one. Shared by the layer row's availability
  // gate and the menu tile so the two cannot drift on what "has a radar" means.
  hasRadar = $derived(this.radars.length > 0);

  setDiscovered(radars: RadarInfo[]): void {
    this.radars = radars;
    // A fresh discovery clears a stale read-only warning: if access was granted and the link
    // reconnected, the next control write should be allowed to prove itself rather than the banner
    // lingering from the previous session.
    this.controlsForbidden = false;
    if (!radars.some((r) => r.id === this.selectedId)) {
      const first = radars[0];
      this.selectedId = first?.id;
      // A new selection starts with that radar's own controls, never another radar's gain, sea, or rain.
      this.capabilities = [];
      this.controlValues = first ? controlValuesOf(first) : {};
      this.controlAuto = first ? controlAutoOf(first) : {};
    }
  }

  select(id: string): void {
    const radar = this.radars.find((r) => r.id === id);
    if (radar && id !== this.selectedId) {
      this.selectedId = id;
      this.capabilities = [];
      this.controlValues = controlValuesOf(radar);
      this.controlAuto = controlAutoOf(radar);
    }
  }

  setCapabilities(controls: ControlDefinition[]): void {
    this.capabilities = controls;
  }

  setStatus(status: RadarConnectionStatus): void {
    this.status = status;
  }

  setControlValue(id: string, value: number): void {
    // controlValues is a $state object, so a direct property write is reactive and avoids allocating a
    // fresh object on every slider move.
    this.controlValues[id] = value;
  }

  setControlAuto(id: string, auto: boolean): void {
    this.controlAuto[id] = auto;
  }

  setControlsForbidden(forbidden: boolean): void {
    this.controlsForbidden = forbidden;
  }
}
