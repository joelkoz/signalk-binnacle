import { describe, expect, it } from 'vitest';
import { hexToRgba, legendColorTable } from './legend';
import type { LegendEntry } from './radar-types';

// An index-based legend: no minValue/maxValue, so entry index == sample value.
const indexLegend: LegendEntry[] = [
  { color: '#00000000', label: 'none' },
  { color: '#00ff00ff', label: 'weak' },
  { color: '#ff8800ff', label: 'medium' },
  { color: '#ff0000ff', label: 'strong' },
];

// A ranged legend: entries carry explicit min/maxValue bounds.
const rangedLegend: LegendEntry[] = [
  { color: '#00000000', label: 'none', minValue: 0, maxValue: 0 },
  { color: '#00ff00ff', label: 'weak', minValue: 1, maxValue: 10 },
  { color: '#ff0000ff', label: 'strong', minValue: 11, maxValue: 20 },
];

describe('hexToRgba', () => {
  it('parses an 8-digit hex color with alpha', () => {
    expect(hexToRgba('#ff8020c0', 255)).toEqual([0xff, 0x80, 0x20, 0xc0]);
  });

  it('parses a 6-digit hex color and uses fallbackAlpha', () => {
    expect(hexToRgba('#ff8020', 128)).toEqual([0xff, 0x80, 0x20, 128]);
  });

  it('handles the hash prefix being absent', () => {
    expect(hexToRgba('00ff00ff', 255)).toEqual([0x00, 0xff, 0x00, 0xff]);
  });
});

describe('legendColorTable', () => {
  it('returns a 256-entry RGBA lookup table (1024 bytes)', () => {
    const table = legendColorTable(indexLegend);
    expect(table).toHaveLength(256 * 4);
  });

  it('makes sample value 0 fully transparent regardless of the entry color', () => {
    // The entry at index 0 has an opaque-looking color, but value 0 must be transparent.
    const opaqueAtZero: LegendEntry[] = [{ color: '#ff0000ff', label: 'zero' }];
    const table = legendColorTable(opaqueAtZero);
    expect(table[3]).toBe(0);
  });

  it('maps each entry index to the correct RGBA for an index-based legend', () => {
    const table = legendColorTable(indexLegend);
    // Index 1: #00ff00ff -> [0, 255, 0, 255]
    expect(Array.from(table.slice(1 * 4, 1 * 4 + 4))).toEqual([0, 255, 0, 255]);
    // Index 2: #ff8800ff -> [255, 136, 0, 255]
    expect(Array.from(table.slice(2 * 4, 2 * 4 + 4))).toEqual([255, 136, 0, 255]);
    // Index 3: #ff0000ff -> [255, 0, 0, 255]
    expect(Array.from(table.slice(3 * 4, 3 * 4 + 4))).toEqual([255, 0, 0, 255]);
  });

  it('leaves indices past the last entry fully transparent', () => {
    const table = legendColorTable(indexLegend);
    // indexLegend has 4 entries, so index 4 and beyond must be transparent.
    expect(Array.from(table.slice(4 * 4, 4 * 4 + 4))).toEqual([0, 0, 0, 0]);
    expect(Array.from(table.slice(255 * 4, 255 * 4 + 4))).toEqual([0, 0, 0, 0]);
  });

  it('fills every value in a range for a ranged legend', () => {
    const table = legendColorTable(rangedLegend);
    // Values 1..10 must all be green [0, 255, 0, 255].
    for (let v = 1; v <= 10; v++) {
      expect(Array.from(table.slice(v * 4, v * 4 + 4))).toEqual([0, 255, 0, 255]);
    }
    // Values 11..20 must all be red [255, 0, 0, 255].
    for (let v = 11; v <= 20; v++) {
      expect(Array.from(table.slice(v * 4, v * 4 + 4))).toEqual([255, 0, 0, 255]);
    }
  });

  it('keeps value 0 transparent in a ranged legend', () => {
    const table = legendColorTable(rangedLegend);
    expect(table[3]).toBe(0);
  });

  it('respects the alpha channel from an 8-digit entry color', () => {
    const halfOpaque: LegendEntry[] = [
      { color: '#00000000', label: 'none' },
      { color: '#ff000080', label: 'half' },
    ];
    const table = legendColorTable(halfOpaque);
    expect(table[1 * 4 + 3]).toBe(0x80);
  });
});
