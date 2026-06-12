import { describe, expect, it } from 'vitest';
import { shortVesselId } from './vessel-id';

describe('shortVesselId', () => {
  it('reads the MMSI from a Signal K vessel urn', () => {
    expect(shortVesselId('vessels.urn:mrn:imo:mmsi:368000000')).toBe('368000000');
  });

  it('passes an unrecognized id through', () => {
    expect(shortVesselId('boat-7')).toBe('boat-7');
  });
});
