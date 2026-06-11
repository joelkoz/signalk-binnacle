import { describe, expect, it } from 'vitest';
import type { WeatherGrid } from './weather-grid';
import { WeatherStore } from './weather-store.svelte';

const grid: WeatherGrid = {
  lats: [0, 1],
  lons: [0, 1],
  times: [1000, 4000],
  windU: [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  windV: [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
};

describe('WeatherStore', () => {
  it('seeds the selected time to the step nearest now when a grid arrives', () => {
    const s = new WeatherStore();
    // The series spans the past (Open-Meteo starts at 00:00 of the current day), so the seed must
    // land on the step nearest now, never on times[0].
    s.setGrid(grid, 3800);
    expect(s.status).toBe('ready');
    expect(s.selectedTime).toBe(4000);
    expect(s.bracket).toEqual({ lo: 1, hi: 1, frac: 0 });
  });

  it('keeps an in-range selection across a grid update', () => {
    const s = new WeatherStore();
    s.setGrid(grid, 1200);
    expect(s.selectedTime).toBe(1000);
    s.setSelectedTime(2500);
    s.setGrid(grid, 3800);
    expect(s.selectedTime).toBe(2500);
  });

  it('reflects a set selected time in the bracket', () => {
    const s = new WeatherStore();
    s.setGrid(grid, 1200);
    s.setSelectedTime(2500);
    expect(s.bracket).toEqual({ lo: 0, hi: 1, frac: 0.5 });
  });
});
