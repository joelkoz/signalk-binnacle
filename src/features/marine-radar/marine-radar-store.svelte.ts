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

// The marine radar state: the discovered radars, the selected radar, its control definitions and live
// values, the connection status, and whether a control write was refused for lack of write access. The
// controller orchestrates; this only holds state.
export class MarineRadarStore {
  radars = $state<RadarInfo[]>([]);
  selectedId = $state<string | undefined>(undefined);
  status = $state<RadarConnectionStatus>('idle');
  capabilities = $state<ControlDefinition[]>([]);
  controlValues = $state<Record<string, number>>({});
  // True once a control write was refused for lack of write access: the controls need a read-write token.
  controlsForbidden = $state(false);

  selected = $derived(this.radars.find((r) => r.id === this.selectedId));

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
    }
  }

  select(id: string): void {
    const radar = this.radars.find((r) => r.id === id);
    if (radar && id !== this.selectedId) {
      this.selectedId = id;
      this.capabilities = [];
      this.controlValues = controlValuesOf(radar);
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

  setControlsForbidden(forbidden: boolean): void {
    this.controlsForbidden = forbidden;
  }
}
