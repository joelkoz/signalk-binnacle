import { describe, expect, it } from 'vitest';
import type { UserChartSource } from '$entities/user-charts';
import { chartSpecRows } from './chart-spec';

const source = (overrides: Partial<UserChartSource>): UserChartSource => ({
  id: 'c1',
  name: 'Chart',
  kind: 'vector',
  origin: { type: 'url', url: 'https://example.com/chart.pmtiles' },
  ...overrides,
});

describe('chartSpecRows', () => {
  it('labels a vector chart and its zoom span', () => {
    const rows = chartSpecRows(source({ minzoom: 4, maxzoom: 12 }));
    expect(rows.type).toEqual({ label: 'Type', value: 'Vector' });
    expect(rows.zoom).toEqual({ label: 'Zoom', value: '4 to 12' });
  });

  it('labels a raster chart', () => {
    expect(chartSpecRows(source({ kind: 'raster' })).type.value).toBe('Raster');
  });
});
