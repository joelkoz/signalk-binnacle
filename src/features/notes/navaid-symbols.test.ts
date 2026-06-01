import { describe, expect, it } from 'vitest';
import { navaidClassify, navaidIconId } from './navaid-symbols';

describe('navaid classification', () => {
  it('infers the kind from the note name', () => {
    expect(navaidClassify('Vermilion Lighthouse').kind).toBe('lighthouse');
    expect(navaidClassify('West Harbor Access Channel Light 10').kind).toBe('light');
    expect(navaidClassify('Port Clinton Channel Buoy 2').kind).toBe('buoy');
    expect(navaidClassify('Sandusky River Daybeacon Middle').kind).toBe('daybeacon');
    expect(navaidClassify('Some Harbor Wall').kind).toBe('generic');
  });

  it('infers the lateral side from the number (US IALA-B: even red, odd green)', () => {
    expect(navaidClassify('Channel Buoy 2').side).toBe('starboard');
    expect(navaidClassify('Channel Buoy 7').side).toBe('port');
    expect(navaidClassify('Daybeacon 18').side).toBe('starboard');
    expect(navaidClassify('Daybeacon Middle').side).toBe('none');
  });

  it('treats a lighted buoy as a buoy, not a light', () => {
    const c = navaidClassify('West Harbor Access Channel Lighted Buoy 6');
    expect(c.kind).toBe('buoy');
    expect(c.side).toBe('starboard');
  });

  it('maps a classification to a stable icon id', () => {
    expect(navaidIconId({ kind: 'lighthouse', side: 'none' })).toBe('binnacle-navaid-lighthouse');
    expect(navaidIconId({ kind: 'light', side: 'none' })).toBe('binnacle-navaid-light');
    expect(navaidIconId({ kind: 'buoy', side: 'starboard' })).toBe(
      'binnacle-navaid-buoy-starboard',
    );
    expect(navaidIconId({ kind: 'daybeacon', side: 'port' })).toBe(
      'binnacle-navaid-daybeacon-port',
    );
    // a generic navaid reuses the existing poi-navaid disc
    expect(navaidIconId({ kind: 'generic', side: 'none' })).toBe('binnacle-poi-navaid');
  });
});
