import { describe, expect, it } from 'vitest';
import { categoryForSkIcon, categoryLabel, poiIconId } from './poi-categories';

describe('poi categories', () => {
  it('maps representative skIcons to their category', () => {
    expect(categoryForSkIcon('anchorage')).toBe('anchorage');
    expect(categoryForSkIcon('mooring')).toBe('anchorage');
    expect(categoryForSkIcon('marina')).toBe('marina');
    expect(categoryForSkIcon('harbour')).toBe('marina');
    expect(categoryForSkIcon('fuel')).toBe('fuel');
    expect(categoryForSkIcon('water')).toBe('services');
    expect(categoryForSkIcon('pumpout')).toBe('services');
    expect(categoryForSkIcon('rock')).toBe('hazard');
    expect(categoryForSkIcon('buoy_lateral')).toBe('navaid');
    expect(categoryForSkIcon('light_major')).toBe('navaid');
    expect(categoryForSkIcon('bridge')).toBe('structure');
    expect(categoryForSkIcon('boatramp')).toBe('structure');
  });

  it('maps the live Crows Nest (ActiveCaptain) vocabulary', () => {
    // Verified against the server's own notes feed: these are the real skIcon strings.
    expect(categoryForSkIcon('inlet')).toBe('inlet');
    expect(categoryForSkIcon('navigation-structure')).toBe('navaid');
    expect(categoryForSkIcon('business')).toBe('services');
    expect(categoryForSkIcon('ferry')).toBe('structure');
    expect(categoryForSkIcon('dam')).toBe('structure');
  });

  it('keyword-matches unfamiliar skIcon variants without an exact entry', () => {
    expect(categoryForSkIcon('fuel_dock')).toBe('fuel');
    expect(categoryForSkIcon('active_captain_marina')).toBe('marina');
    expect(categoryForSkIcon('public_boat_ramp')).toBe('structure');
    expect(categoryForSkIcon('fresh_water_tap')).toBe('services');
    // navaid wins over the services 'water' keyword for a safe-water mark
    expect(categoryForSkIcon('buoy_safe_water_2')).toBe('navaid');
    // hazard wins over the navaid keywords for an isolated-danger mark
    expect(categoryForSkIcon('buoy_isolated_danger_n')).toBe('hazard');
  });

  it('falls back to generic for unknown or missing skIcons', () => {
    expect(categoryForSkIcon('notice-to-mariners')).toBe('generic');
    expect(categoryForSkIcon('something-new')).toBe('generic');
    expect(categoryForSkIcon(undefined)).toBe('generic');
  });

  it('exposes a label and a stable icon id per category', () => {
    expect(categoryLabel('marina')).toBe('Marina');
    expect(categoryLabel('fuel')).toBe('Fuel');
    expect(categoryLabel('services')).toBe('Services');
    expect(poiIconId('hazard')).toBe('binnacle-poi-hazard');
  });
});
