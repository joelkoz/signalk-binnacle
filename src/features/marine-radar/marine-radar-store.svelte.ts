import type { RadarInfo, RadarProvider } from './radar-types';

export type RadarStatus = 'idle' | 'connecting' | 'live' | 'standby' | 'error';

// The marine radar state: which provider answered, the discovered radars, the selected radar, the
// live control values, and the connection status. The controller orchestrates; this only holds state.
export class MarineRadarStore {
  provider = $state<RadarProvider | undefined>(undefined);
  radars = $state<RadarInfo[]>([]);
  selectedId = $state<string | undefined>(undefined);
  status = $state<RadarStatus>('idle');
  controlValues = $state<Record<string, number>>({});

  get selected(): RadarInfo | undefined {
    return this.radars.find((r) => r.id === this.selectedId);
  }

  setDiscovered(provider: RadarProvider, radars: RadarInfo[]): void {
    this.provider = radars.length > 0 ? provider : undefined;
    this.radars = radars;
    if (!radars.some((r) => r.id === this.selectedId)) {
      this.selectedId = radars[0]?.id;
    }
  }

  select(id: string): void {
    if (this.radars.some((r) => r.id === id)) this.selectedId = id;
  }

  setStatus(status: RadarStatus): void {
    this.status = status;
  }

  setControlValue(id: string, value: number): void {
    this.controlValues = { ...this.controlValues, [id]: value };
  }
}
