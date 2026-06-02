import { describe, expect, it } from 'vitest';
import type { NormalizedSection } from './notes-detail';
import { isDangerFlag, isRedundantNoteLabel, orderSections } from './notes-present';

const section = (id: string): NormalizedSection => ({ id, title: id, items: [] });

describe('orderSections', () => {
  it('leads with facts and trails with reviews and provenance', () => {
    const input = ['source', 'review', 'featuredReview', 'fuel', 'feature', 'depth'].map(section);
    expect(orderSections(input).map((s) => s.id)).toEqual([
      'feature',
      'depth',
      'fuel',
      'review',
      'featuredReview',
      'source',
    ]);
  });

  it('keeps an unknown section in the middle, ahead of reviews and source', () => {
    const input = ['source', 'mystery', 'review', 'fuel'].map(section);
    expect(orderSections(input).map((s) => s.id)).toEqual(['fuel', 'mystery', 'review', 'source']);
  });

  it('is stable within a rank', () => {
    const input = ['notes', 'information', 'remarks'].map(section);
    expect(orderSections(input).map((s) => s.id)).toEqual(['notes', 'information', 'remarks']);
  });
});

describe('isRedundantNoteLabel', () => {
  it('drops a label that repeats the section title or is generic', () => {
    expect(isRedundantNoteLabel('Notes', 'Notes')).toBe(true);
    expect(isRedundantNoteLabel('Information', 'Feature')).toBe(true);
    expect(isRedundantNoteLabel('Remarks', 'Remarks')).toBe(true);
  });

  it('keeps a meaningful label', () => {
    expect(isRedundantNoteLabel('Approach advice', 'Notes')).toBe(false);
  });
});

describe('isDangerFlag', () => {
  it('matches the producer danger flag and nothing else', () => {
    expect(isDangerFlag('Dangerous', 'flag')).toBe(true);
    expect(isDangerFlag('Transient', 'flag')).toBe(false);
    expect(isDangerFlag('Dangerous', 'text')).toBe(false);
  });
});
