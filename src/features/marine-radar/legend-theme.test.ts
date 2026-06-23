import { describe, expect, it } from 'vitest';
import { themedColorTable } from './legend-theme';
import type { RadarLegend } from './radar-types';

const legend: RadarLegend = {
  pixels: [
    { type: 'Normal', color: '#000000' },
    { type: 'Normal', color: '#10ff20' },
    { type: 'DopplerApproaching', color: '#ff0000' },
  ],
};

describe('themedColorTable', () => {
  it('maps Normal returns onto a pure-red ramp at night with the green channel zeroed', () => {
    const table = themedColorTable(legend, 'night-red');
    expect(table[4 + 1]).toBe(0);
    expect(table[4 + 2]).toBe(0);
    expect(table[4]).toBeGreaterThan(0);
  });

  it('keeps a Doppler accent distinguishable from Normal at night (not zeroed away)', () => {
    const table = themedColorTable(legend, 'night-red');
    const dopplerRed = table[2 * 4];
    expect(dopplerRed).toBeGreaterThan(0);
  });

  it('passes Normal colors through unchanged in day theme', () => {
    const table = themedColorTable(legend, 'day');
    expect(Array.from(table.slice(4, 7))).toEqual([0x10, 0xff, 0x20]);
  });
});
