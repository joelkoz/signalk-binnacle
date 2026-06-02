import { describe, expect, it } from 'vitest';
import type { TrackRecorder } from '$entities/track';
import { mapThemePaint, type OverlayContext } from '$shared/map';
import type { PersistedValue, TrackSettings } from '$shared/settings';
import { createFakeMap } from '$shared/testing/fake-map';
import { createTrackOverlay } from './track-overlay';

function ctxFor(map: ReturnType<typeof createFakeMap>): OverlayContext {
  return { map: map as never, beforeIdFor: () => undefined };
}

function stubRecorder(points: TrackRecorder['points']): TrackRecorder {
  return { points } as unknown as TrackRecorder;
}

function stubSettings(colorMode: TrackSettings['colorMode']): PersistedValue<TrackSettings> {
  return {
    value: { intervalSeconds: 10, minMeters: 10, colorMode },
  } as PersistedValue<TrackSettings>;
}

describe('track overlay', () => {
  it('adds active and saved sources and line layers in the track band', () => {
    const overlay = createTrackOverlay(stubRecorder([]), stubSettings('speed'));
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    expect(overlay.band).toBe('track');
    expect(map.sources.size).toBe(2);
    expect(map.layers.has('binnacle-track-active-line')).toBe(true);
    expect(map.layers.has('binnacle-track-saved-line')).toBe(true);
  });

  it('sync sets the active source data from the recorder points', () => {
    const overlay = createTrackOverlay(
      stubRecorder([
        { lat: 0, lon: 0, t: 0, sog: 1 },
        { lat: 0, lon: 0.01, t: 10_000, sog: 2 },
      ]),
      stubSettings('speed'),
    );
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    overlay.sync(ctxFor(map));
    const source = map.sources.get('binnacle-track-active');
    const fc = source?.data as GeoJSON.FeatureCollection;
    expect(fc.features.length).toBe(1);
  });

  it('applyTheme recolors both layers', () => {
    const overlay = createTrackOverlay(stubRecorder([]), stubSettings('solid'));
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    overlay.applyTheme?.(ctxFor(map), mapThemePaint('night-red'));
    expect(map.setPaintProperty).toHaveBeenCalled();
  });

  it('remove tears down layers and sources', () => {
    const overlay = createTrackOverlay(stubRecorder([]), stubSettings('speed'));
    const map = createFakeMap();
    overlay.add(ctxFor(map));
    overlay.remove(ctxFor(map));
    expect(map.layers.size).toBe(0);
    expect(map.sources.size).toBe(0);
  });
});
