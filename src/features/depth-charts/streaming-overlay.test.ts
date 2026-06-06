import { describe, expect, it } from 'vitest';
import { createStreamingChartOverlay } from './streaming-overlay';
import { STREAMING_CHART_SOURCES } from './streaming-sources';

describe('streaming chart sources', () => {
  it('every catalog source is well-formed with a substitutable tile token', () => {
    const ids = new Set<string>();
    for (const source of STREAMING_CHART_SOURCES) {
      expect(source.id).toBeTruthy();
      expect(source.title).toBeTruthy();
      expect(source.attribution).toBeTruthy();
      expect(source.tiles.length).toBeGreaterThan(0);
      for (const url of source.tiles) {
        expect(url.includes('{bbox-epsg-3857}') || url.includes('{z}')).toBe(true);
      }
      ids.add(source.id);
    }
    expect(ids.size).toBe(STREAMING_CHART_SOURCES.length);
  });

  it('splits the NOAA ENC categories across separate overlays', () => {
    const tilesById = (id: string): string =>
      STREAMING_CHART_SOURCES.find((s) => s.id === id)?.tiles[0] ?? '';
    // The chart carries the chart categories only; data quality (8, 9) and the shallow-water and
    // overscale warning patterns (11, 12) live in their own overlays so they toggle independently.
    expect(tilesById('depth-noaa-enc')).toContain('LAYERS=0,1,2,3,4,5,6,7,10&');
    expect(tilesById('depth-noaa-enc-quality')).toContain('LAYERS=8,9&');
    expect(tilesById('depth-noaa-enc-warnings')).toContain('LAYERS=11,12&');
  });

  it('builds a hidden bathymetry overlay for each source', () => {
    for (const source of STREAMING_CHART_SOURCES) {
      const overlay = createStreamingChartOverlay(source);
      expect(overlay.id).toBe(source.id);
      expect(overlay.band).toBe('bathymetry');
      expect(overlay.defaultVisible).toBe(false);
      expect(overlay.supportsOpacity).toBe(true);
      expect(overlay.layerIds).toHaveLength(1);
    }
  });
});
