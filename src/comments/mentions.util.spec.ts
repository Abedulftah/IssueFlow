import { extractMentions } from './mentions.util';

describe('extractMentions', () => {
  it('returns empty array for content with no mentions', () => {
    expect(extractMentions('hello world')).toEqual([]);
  });

  it('extracts a single mention', () => {
    expect(extractMentions('hey @alice!')).toEqual(['alice']);
  });

  it('extracts multiple distinct mentions', () => {
    expect(extractMentions('@alice and @bob please review')).toEqual(
      expect.arrayContaining(['alice', 'bob']),
    );
  });

  it('lowercases mention tokens', () => {
    expect(extractMentions('@Alice @BOB')).toEqual(
      expect.arrayContaining(['alice', 'bob']),
    );
  });

  it('deduplicates repeated mentions', () => {
    const result = extractMentions('@alice @alice @ALICE');
    expect(result).toHaveLength(1);
    expect(result).toContain('alice');
  });

  it('handles underscores and numbers in usernames', () => {
    expect(extractMentions('@user_42 check this')).toEqual(['user_42']);
  });

  it('returns empty array for empty string', () => {
    expect(extractMentions('')).toEqual([]);
  });
});
