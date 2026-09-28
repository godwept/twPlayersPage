import { describe, expect, it } from 'vitest';
import { parseRosterCsv } from '../../src/shared/roster-csv';

describe('roster CSV import', () => {
  it('reads the documented columns, quoted fields and optional jersey numbers', () => {
    expect(parseRosterCsv('\uFEFFjersey_number,first_name,last_name\r\n4,Avery,"De La Cruz"\r\n,Sam,Example')).toEqual({
      players: [{ jerseyNumber: '4', firstName: 'Avery', lastName: 'De La Cruz' }, { jerseyNumber: null, firstName: 'Sam', lastName: 'Example' }],
      errors: [],
    });
  });

  it('reports malformed or incomplete rows without returning a partial import', () => {
    const result = parseRosterCsv('first_name,last_name\nAlex,North\n,South');
    expect(result.players).toEqual([]);
    expect(result.errors).toHaveLength(2);
  });
});
