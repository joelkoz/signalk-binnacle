// Plain detail-level presets for an offline area, mapped to zoom ranges so a novice never sees a raw
// zoom number. Coastal matches the previous default (min 6, max 12). An advanced reveal still exposes
// the raw min and max for a power user, and a range that does not match a preset reads as "custom".

export type DetailKey = 'overview' | 'coastal' | 'harbor';

export interface DetailPreset {
  key: DetailKey;
  label: string;
  minzoom: number;
  maxzoom: number;
}

export const DETAIL_PRESETS: DetailPreset[] = [
  { key: 'overview', label: 'Overview', minzoom: 5, maxzoom: 9 },
  { key: 'coastal', label: 'Coastal', minzoom: 6, maxzoom: 12 },
  { key: 'harbor', label: 'Harbor', minzoom: 6, maxzoom: 15 },
];

/** The zoom range for a preset key. */
export function rangeForPreset(key: DetailKey): [number, number] {
  const preset = DETAIL_PRESETS.find((p) => p.key === key) ?? DETAIL_PRESETS[1];
  return [preset.minzoom, preset.maxzoom];
}

/** The preset a min and max zoom matches, or 'custom' when the range matches no preset. */
export function presetForRange(minzoom: number, maxzoom: number): DetailKey | 'custom' {
  const match = DETAIL_PRESETS.find((p) => p.minzoom === minzoom && p.maxzoom === maxzoom);
  return match ? match.key : 'custom';
}
