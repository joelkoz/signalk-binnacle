import { describe, expect, it } from 'vitest';
import { canPrewarm } from './estimate.js';
import type { CacheStats } from './prewarm-client.js';

// Pins the gate predicate the panel uses: Download is enabled only when a box is drawn, at least
// one source is selected, the user can write, and the estimate fits the regions-free budget.

const stats: CacheStats = {
  rows: 0,
  bytes: 0,
  cap: 1_000_000_000,
  regionsBudgetBytes: 500_000_000,
  regionsFreeBytes: 450_000_000,
  perSourceAvgBytes: { seamark: 20_000 },
};

describe('prewarm gate', () => {
  it('disabled with no box', () => {
    expect(
      canPrewarm({
        bbox: null,
        sources: ['seamark'],
        writeBlocked: false,
        stats,
        zoomRange: [6, 8],
      }),
    ).toBe(false);
  });

  it('disabled when write is blocked', () => {
    expect(
      canPrewarm({
        bbox: [-1, -1, 1, 1],
        sources: ['seamark'],
        writeBlocked: true,
        stats,
        zoomRange: [6, 8],
      }),
    ).toBe(false);
  });

  it('disabled when the estimate exceeds the regions-free budget', () => {
    const tiny: CacheStats = { ...stats, regionsBudgetBytes: 1000, regionsFreeBytes: 1000 };
    expect(
      canPrewarm({
        bbox: [-5, -5, 5, 5],
        sources: ['seamark'],
        writeBlocked: false,
        stats: tiny,
        zoomRange: [6, 10],
      }),
    ).toBe(false);
  });

  it('enabled when a box and a source are set and the estimate fits', () => {
    expect(
      canPrewarm({
        bbox: [-0.1, -0.1, 0.1, 0.1],
        sources: ['seamark'],
        writeBlocked: false,
        stats,
        zoomRange: [6, 7],
      }),
    ).toBe(true);
  });

  it('disabled with no sources selected', () => {
    expect(
      canPrewarm({
        bbox: [-1, -1, 1, 1],
        sources: [],
        writeBlocked: false,
        stats,
        zoomRange: [6, 8],
      }),
    ).toBe(false);
  });
});

it('persists position-warm settings through postConfig', async () => {
  const posted: unknown[] = [];
  const client = {
    getConfig: async () => ({
      bbox: null,
      sources: [],
      minzoom: 6,
      maxzoom: 12,
      positionWarm: {
        enabled: false,
        radiusMeters: 3704,
        moveThresholdMeters: 1852,
        intervalSecs: 60,
        baseZoom: 12,
        sources: [],
      },
    }),
    postConfig: async (c: unknown) => {
      posted.push(c);
    },
  };
  const { buildConfigPayload } = await import('./settings-payload.js');
  const payload = buildConfigPayload({
    enabled: true,
    radiusMeters: 5556,
    moveThresholdMeters: 1852,
    intervalSecs: 120,
    baseZoom: 13,
    sources: ['seamark'],
  });
  await client.postConfig(payload);
  expect(posted[0]).toMatchObject({
    positionWarm: { enabled: true, radiusMeters: 5556, intervalSecs: 120 },
  });
});
