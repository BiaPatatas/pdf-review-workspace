import { describe, expect, it } from 'vitest';
import { SOURCE_DOCUMENT_INDEX } from '../data/documentIndex';
import { matchSelectionToPassage } from './passageMatcher';

describe('matchSelectionToPassage', () => {
  it('matches short key terms like "JD" on page 2', () => {
    const result = matchSelectionToPassage(SOURCE_DOCUMENT_INDEX, 2, 'JD');
    expect(result.passage).not.toBeNull();
    expect(result.passage?.page).toBe(2);
  });

  it('excludes running headers and footers even with partial selections', () => {
    const header = matchSelectionToPassage(
      SOURCE_DOCUMENT_INDEX,
      1,
      'Platform Editor — Internal Draft'
    );
    const footer = matchSelectionToPassage(
      SOURCE_DOCUMENT_INDEX,
      2,
      'nternal draft — do not distribute'
    );
    expect(header.passage).toBeNull();
    expect(header.reason).toMatch(/headers and footers/i);
    expect(footer.passage).toBeNull();
    expect(footer.reason).toMatch(/headers and footers/i);
  });

  it('does not let short table cells capture longer unrelated selections on page 3', () => {
    const result = matchSelectionToPassage(
      SOURCE_DOCUMENT_INDEX,
      3,
      'nobody has accepted or rejected it yet'
    );
    expect(result.passage?.id).toBe('p3-table-r1-c1');
  });
});