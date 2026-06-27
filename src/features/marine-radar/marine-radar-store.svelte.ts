import type { RadarStateSnapshot } from './radar-client';
import {
  type ControlDefinition,
  POWER_PENDING_KEY,
  type RadarInfo,
  type RadarStatus,
} from './radar-types';

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
  // The radar's own operational state (off/standby/transmit/warming), distinct from the stream
  // connection status above. Seeded from discovery and reconciled from GET /state, so the panel shows
  // whether the radar is transmitting and the TX/Standby control reflects the real state.
  operationalStatus = $state<RadarStatus | undefined>(undefined);
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
      this.operationalStatus = first?.status;
    }
  }

  select(id: string): void {
    const radar = this.radars.find((r) => r.id === id);
    if (radar && id !== this.selectedId) {
      this.selectedId = id;
      this.capabilities = [];
      this.controlValues = controlValuesOf(radar);
      this.controlAuto = controlAutoOf(radar);
      this.operationalStatus = radar.status;
    }
  }

  setOperationalStatus(status: RadarStatus): void {
    this.operationalStatus = status;
  }

  // Reconcile live control values and the operational status from GET /state, skipping any control id
  // in `pending` so a value the user just set (an in-flight optimistic write the server has not yet
  // echoed) is not clobbered back to its old value.
  reconcile(snapshot: RadarStateSnapshot, pending: ReadonlySet<string>): void {
    // POWER_PENDING_KEY guards the operational status the same way a control id guards its value: a
    // poll landing right after an optimistic transmit/standby must not flip the pill back to stale.
    if (snapshot.status && !pending.has(POWER_PENDING_KEY))
      this.operationalStatus = snapshot.status;
    for (const [id, entry] of Object.entries(snapshot.controls)) {
      if (!entry || pending.has(id)) continue;
      this.controlValues[id] = entry.value;
      if (entry.auto !== undefined) this.controlAuto[id] = entry.auto;
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
