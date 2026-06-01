import { describe, expect, it } from 'vitest';
import { categoryForSkIcon, categoryLabel, poiIconId } from './poi-categories';

describe('poi categories', () => {
  it('maps representative skIcons to their category', () => {
    expect(categoryForSkIcon('anchorage')).toBe('anchorage');
    expect(categoryForSkIcon('mooring')).toBe('anchorage');
    expect(categoryForSkIcon('marina')).toBe('marina');
    expect(categoryForSkIcon('harbour')).toBe('marina');
    expect(categoryForSkIcon('rock')).toBe('hazard');
    expect(categoryForSkIcon('buoy_lateral')).toBe('navaid');
    expect(categoryForSkIcon('light_major')).toBe('navaid');
    expect(categoryForSkIcon('bridge')).toBe('structure');
    expect(categoryForSkIcon('boatramp')).toBe('structure');
  });

  it('falls back to generic for unknown or missing skIcons', () => {
    expect(categoryForSkIcon('notice-to-mariners')).toBe('generic');
    expect(categoryForSkIcon('something-new')).toBe('generic');
    expect(categoryForSkIcon(undefined)).toBe('generic');
  });

  it('exposes a label and a stable icon id per category', () => {
    expect(categoryLabel('marina')).toBe('Marina');
    expect(poiIconId('hazard')).toBe('binnacle-poi-hazard');
  });
});
