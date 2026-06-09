import type { LayerSettings } from '$shared/map';
import type { Thresholds, TrackSettings } from '$shared/settings';
import type { Theme } from '$shared/ui';

// The full set of user preferences a profile captures, so switching profiles restores a complete
// look and policy in one step. `mode` is reserved for the future three-mode shell (Watch, Anchor,
// Inhabit): v1 never writes it, but it round-trips so a v3 profile read by v1 keeps its value.
export interface ProfileSettings {
  theme: Theme;
  layers: LayerSettings;
  layerOrder: string[];
  layerCategories: Record<string, boolean>;
  weatherLayers: LayerSettings;
  thresholds: Thresholds;
  trackSettings: TrackSettings;
  planningSpeedKn: number;
  alarmMuted: boolean;
  arrivalMuted: boolean;
  mode?: string;
}

export interface Profile {
  id: string;
  name: string;
  settings: ProfileSettings;
  createdAt: number;
  updatedAt: number;
}

export interface ProfilesState {
  profiles: Profile[];
  activeId: string | undefined;
  defaultId: string | undefined;
}
