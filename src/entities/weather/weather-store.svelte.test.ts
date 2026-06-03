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
  it('defaults the selected time to the first step when a grid arrives', () => {
    const s = new WeatherStore();
    s.setGrid(grid);
    expect(s.status).toBe('ready');
    expect(s.selectedTime).toBe(1000);
    expect(s.bracket).toEqual({ lo: 0, hi: 0, frac: 0 });
  });

  it('reflects a set selected time in the bracket', () => {
    const s = new WeatherStore();
    s.setGrid(grid);
    s.setSelectedTime(2500);
    expect(s.bracket).toEqual({ lo: 0, hi: 1, frac: 0.5 });
  });
});
