import { parseCsv, toCsvRow } from './csv.util';

describe('toCsvRow', () => {
  it('wraps each field in double-quotes', () => {
    expect(toCsvRow(['id', 'title'])).toBe('"id","title"');
  });

  it('escapes inner double-quotes as ""', () => {
    expect(toCsvRow(['say "hello"'])).toBe('"say ""hello"""');
  });

  it('handles a field containing a comma', () => {
    expect(toCsvRow(['a,b'])).toBe('"a,b"');
  });

  it('handles an empty field', () => {
    expect(toCsvRow([''])).toBe('""');
  });

  it('handles null/undefined by treating as empty string', () => {
    expect(toCsvRow([null as any])).toBe('""');
    expect(toCsvRow([undefined as any])).toBe('""');
  });
});

describe('parseCsv', () => {
  it('parses a simple CSV with header and data rows', () => {
    const csv = 'title,description\nFoo,Bar';
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ title: 'Foo', description: 'Bar' });
  });

  it('returns empty array when fewer than 2 lines', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('title,description')).toEqual([]);
  });

  it('skips blank lines', () => {
    const csv = 'title,description\n\nFoo,Bar\n\n';
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
  });

  it('handles quoted fields containing commas', () => {
    const csv = 'title,description\n"Hello, world",plain';
    const rows = parseCsv(csv);
    expect(rows[0].title).toBe('Hello, world');
  });

  it('handles quoted fields containing escaped double-quotes', () => {
    const csv = 'title,description\n"say ""hi""",ok';
    const rows = parseCsv(csv);
    expect(rows[0].title).toBe('say "hi"');
  });

  it('maps missing columns to empty string', () => {
    const csv = 'title,description\nFoo';
    const rows = parseCsv(csv);
    expect(rows[0].description).toBe('');
  });
});
