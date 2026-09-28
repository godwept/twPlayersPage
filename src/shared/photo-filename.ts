export type ParsedPhotoFilename = { jerseyNumber: string; surname: string; sequence: string };
export type FilenameMatch =
  | { status: 'matched'; playerId: string }
  | { status: 'ambiguous'; playerIds: string[] }
  | { status: 'unmatched' }
  | { status: 'invalid' };

export function parsePhotoFilename(filename: string): ParsedPhotoFilename | null {
  const basename = filename.replaceAll('\\', '/').split('/').pop() ?? '';
  const match = /^(\d{1,3})\s*-\s*(.+?)(\d+)\.jpe?g$/i.exec(basename);
  if (!match) return null;
  const surname = match[2].trim();
  if (!/^[\p{L}][\p{L}\p{M}'’ -]*$/u.test(surname)) return null;
  return { jerseyNumber: match[1].replace(/^0+(?=\d)/, ''), surname, sequence: match[3] };
}

function normalizeName(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[’']/g, '').replace(/[ -]/g, '');
}

export function matchPhotoFilename(
  filename: string,
  roster: Array<{ id: string; firstName?: string; lastName: string; jerseyNumber: string | null }>,
): FilenameMatch {
  const parsed = parsePhotoFilename(filename);
  if (!parsed) return { status: 'invalid' };
  const matches = roster.filter((player) => player.jerseyNumber !== null &&
    player.jerseyNumber.replace(/^0+(?=\d)/, '') === parsed.jerseyNumber &&
    (normalizeName(player.lastName) === normalizeName(parsed.surname) ||
      (player.firstName !== undefined && normalizeName(`${player.firstName}${player.lastName}`) === normalizeName(parsed.surname))));
  if (matches.length === 1) return { status: 'matched', playerId: matches[0].id };
  if (matches.length > 1) return { status: 'ambiguous', playerIds: matches.map(({ id }) => id).sort() };
  return { status: 'unmatched' };
}
