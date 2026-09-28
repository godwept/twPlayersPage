export type RosterCsvPlayer = { firstName: string; lastName: string; jerseyNumber: string | null };
export type RosterCsvResult = { players: RosterCsvPlayer[]; errors: string[] };

function splitCsv(input: string): string[][] | null {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const text = input.replace(/^\uFEFF/, '');
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field.length === 0) quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index++;
      row.push(field); field = '';
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
    } else field += char;
  }
  if (quoted) return null;
  row.push(field);
  if (row.some((value) => value.trim() !== '')) rows.push(row);
  return rows;
}

export function parseRosterCsv(input: string): RosterCsvResult {
  const rows = splitCsv(input);
  if (!rows) return { players: [], errors: ['The CSV ends inside a quoted field.'] };
  if (!rows?.length) return { players: [], errors: ['The CSV is empty.'] };
  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const jerseyIndex = headers.indexOf('jersey_number');
  const firstIndex = headers.indexOf('first_name');
  const lastIndex = headers.indexOf('last_name');
  const errors: string[] = [];
  if (jerseyIndex < 0 || firstIndex < 0 || lastIndex < 0) errors.push('Include the columns jersey_number, first_name, and last_name in the header row.');
  const players: RosterCsvPlayer[] = [];
  for (let index = 1; index < rows.length; index++) {
    const row = rows[index];
    const firstName = row[firstIndex]?.trim() ?? '';
    const lastName = row[lastIndex]?.trim() ?? '';
    const number = row[jerseyIndex]?.trim() ?? '';
    const line = index + 1;
    if (!firstName || !lastName || firstName.length > 80 || lastName.length > 80 || /[\u0000-\u001f\u007f]/.test(firstName + lastName)) {
      errors.push(`Line ${line}: enter a first and last name up to 80 characters.`); continue;
    }
    if (number && !/^\d{1,3}$/.test(number)) { errors.push(`Line ${line}: jersey_number must contain 1 to 3 digits or be blank.`); continue; }
    players.push({ firstName, lastName, jerseyNumber: number || null });
  }
  return errors.length ? { players: [], errors } : { players, errors: [] };
}
