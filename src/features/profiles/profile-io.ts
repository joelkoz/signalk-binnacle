import type { Profile, ProfileSettings } from '$entities/profile';
import { downloadBlob } from '$shared/lib';
import { THEMES } from '$shared/ui';

// The canonical valid-theme list, so a corrupt import cannot smuggle an unknown theme into the store.
const VALID_THEMES: readonly string[] = THEMES;

// A validated import: the settings to recreate plus the name to recreate them under. The importer
// calls store.save(name, settings), so an id and timestamps are deliberately not carried over.
export interface ImportedProfile {
  name: string;
  settings: ProfileSettings;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isThresholds(value: unknown): boolean {
  if (!isPlainObject(value)) return false;
  return (
    isFiniteNumber(value.dangerCpaMeters) &&
    isFiniteNumber(value.dangerTcpaSeconds) &&
    isFiniteNumber(value.warningCpaMeters) &&
    isFiniteNumber(value.warningTcpaSeconds)
  );
}

function isTrackSettings(value: unknown): boolean {
  if (!isPlainObject(value)) return false;
  return (
    isFiniteNumber(value.intervalSeconds) &&
    isFiniteNumber(value.minMeters) &&
    (value.colorMode === 'speed' || value.colorMode === 'solid')
  );
}

// A strict structural guard: every field must be present and well-typed, so a malformed or partial
// import is rejected outright rather than producing a corrupt profile. The reserved `mode` is the one
// optional field, accepted only when it is a string.
export function isProfileSettings(value: unknown): value is ProfileSettings {
  if (!isPlainObject(value)) return false;
  if (typeof value.theme !== 'string' || !VALID_THEMES.includes(value.theme)) return false;
  if (!isPlainObject(value.layers)) return false;
  if (!isPlainObject(value.layerCategories)) return false;
  if (!isPlainObject(value.weatherLayers)) return false;
  if (!Array.isArray(value.layerOrder) || !value.layerOrder.every((id) => typeof id === 'string')) {
    return false;
  }
  if (!isThresholds(value.thresholds)) return false;
  if (!isTrackSettings(value.trackSettings)) return false;
  if (!isFiniteNumber(value.planningSpeedKn)) return false;
  if (typeof value.alarmMuted !== 'boolean') return false;
  if (typeof value.arrivalMuted !== 'boolean') return false;
  if (value.mode !== undefined && typeof value.mode !== 'string') return false;
  return true;
}

// Pull the candidate settings out of one parsed item: a full exported Profile carries `.settings`, a
// bare ProfileSettings carries `.theme` directly. The name comes from the Profile when present so the
// importer can keep it; a bare settings object has no name, so a fallback is supplied.
function toImported(item: unknown): ImportedProfile | undefined {
  if (!isPlainObject(item)) return undefined;
  if (isPlainObject(item.settings)) {
    if (!isProfileSettings(item.settings)) return undefined;
    const name = typeof item.name === 'string' && item.name ? item.name : 'Imported profile';
    return { name, settings: item.settings };
  }
  if (isProfileSettings(item)) {
    return { name: 'Imported profile', settings: item };
  }
  return undefined;
}

// Parse an exported profile document into a list of validated ImportedProfiles, the inverse of
// downloadProfileJson. Tolerant of three shapes: a single exported Profile, an array of Profiles or
// bare ProfileSettings, and a { profiles: [...] } envelope. Each candidate is strictly validated, so
// only well-formed profiles survive. Returns an empty array on a parse error or when nothing is valid.
export function parseProfilesJson(text: string): ImportedProfile[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  let items: unknown[];
  if (Array.isArray(parsed)) {
    items = parsed;
  } else if (isPlainObject(parsed) && Array.isArray(parsed.profiles)) {
    items = parsed.profiles;
  } else {
    items = [parsed];
  }
  const imported: ImportedProfile[] = [];
  for (const item of items) {
    const result = toImported(item);
    if (result) imported.push(result);
  }
  return imported;
}

// Trigger a browser download of a profile as pretty JSON, matching the route GPX and track GeoJSON
// exports. downloadBlob is Node-guarded, so this is inert outside a DOM context.
export function downloadProfileJson(profile: Profile): void {
  const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
  downloadBlob(`${profile.name || 'profile'}.binnacle-profile.json`, blob);
}
