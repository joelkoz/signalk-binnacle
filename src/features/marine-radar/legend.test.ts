import { describe, expect, it } from 'vitest';
import { legendColorTable } from './legend';
import type { RadarLegend } from './radar-types';

const legend: RadarLegend = {
  pixels: [
    { type: 'Normal', color: '#000000' },
    { type: 'Normal', color: '#00ff00' },
    { type: 'History', color: '#004400' },
    { type: 'DopplerApproaching', color: '#ff0000' },
    { type: 'DopplerReceding', color: '#0000ff' },
  ],
};

describe('legendColorTable', () => {
  it('builds a 256-entry RGBA table indexed by the data byte', () => {
    const table = legendColorTable(legend);
    expect(table).toHaveLength(256 * 4);
    expect(Array.from(table.slice(4, 8))).toEqual([0, 255, 0, 255]);
    expect(Array.from(table.slice(12, 16))).toEqual([255, 0, 0, 255]);
  });

  it('makes index 0 fully transparent so empty bins do not paint', () => {
    const table = legendColorTable(legend);
    expect(table[3]).toBe(0);
  });

  it('leaves indices past the legend transparent', () => {
    const table = legendColorTable(legend);
    expect(Array.from(table.slice(5 * 4, 5 * 4 + 4))).toEqual([0, 0, 0, 0]);
  });
});
