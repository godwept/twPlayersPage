export type PlayerRecord = {
  id: string;
  first_name: string;
  last_name: string;
  jersey_number: string | null;
  hockeytech_player_id: string | null;
  featured_photo_id: string | null;
  crop_x: number;
  crop_y: number;
  crop_zoom: number;
  created_at: string;
};

export type PlayerInput = { firstName: string; lastName: string; jerseyNumber?: string | null };
export type PlayerUpdate = Partial<PlayerInput> & { hockeyTechPlayerId?: string | null };

export class PlayerNotFoundError extends Error {
  constructor() { super('Player not found'); }
}
export class PlayerConflictError extends Error {
  constructor(message = 'Player still has photos') { super(message); }
}
export class InvalidPlayerError extends Error {
  constructor(message: string) { super(message); }
}

function normalizeName(value: string | undefined, label: string): string {
  const result = value?.trim();
  if (!result || result.length > 80 || /[\u0000-\u001f\u007f]/.test(result)) throw new InvalidPlayerError(`${label} must be 1 to 80 characters`);
  return result;
}

function normalizeNumber(value: string | null | undefined): string | null {
  if (value == null || value.trim() === '') return null;
  const result = value.trim();
  if (!/^\d{1,3}$/.test(result)) throw new InvalidPlayerError('Jersey number must contain 1 to 3 digits');
  return result;
}

export function normalizeHockeyTechPlayerId(value: string | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') throw new InvalidPlayerError('HockeyTech player ID must contain 1 to 20 digits');
  const result = value.trim();
  if (!result) return null;
  if (!/^\d{1,20}$/.test(result)) throw new InvalidPlayerError('HockeyTech player ID must contain 1 to 20 digits');
  return result;
}

export async function addPlayer(db: D1Database, input: PlayerInput): Promise<string> {
  const normalized = normalizePlayerInput(input);
  const id = crypto.randomUUID();
  await db.prepare('INSERT INTO players (id, first_name, last_name, jersey_number, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, normalized.firstName, normalized.lastName, normalized.jerseyNumber, new Date().toISOString()).run();
  return id;
}

export function normalizePlayerInput(input: PlayerInput): PlayerInput {
  return {
    firstName: normalizeName(input.firstName, 'First name'),
    lastName: normalizeName(input.lastName, 'Last name'),
    jerseyNumber: normalizeNumber(input.jerseyNumber),
  };
}

export async function listPlayers(db: D1Database): Promise<PlayerRecord[]> {
  const result = await db.prepare(`SELECT id, first_name, last_name, jersey_number, hockeytech_player_id, featured_photo_id, crop_x, crop_y, crop_zoom, created_at
    FROM players ORDER BY jersey_number IS NULL, CAST(jersey_number AS INTEGER), last_name COLLATE NOCASE, id`).all<PlayerRecord>();
  return result.results;
}

export async function findPlayer(db: D1Database, id: string): Promise<PlayerRecord | null> {
  return db.prepare('SELECT id, first_name, last_name, jersey_number, hockeytech_player_id, featured_photo_id, crop_x, crop_y, crop_zoom, created_at FROM players WHERE id = ?')
    .bind(id).first<PlayerRecord>();
}

export async function updatePlayer(db: D1Database, id: string, input: PlayerUpdate): Promise<void> {
  if (!await findPlayer(db, id)) throw new PlayerNotFoundError();
  const fields: string[] = [];
  const values: Array<string | null> = [];
  if ('firstName' in input) { fields.push('first_name = ?'); values.push(normalizeName(input.firstName, 'First name')); }
  if ('lastName' in input) { fields.push('last_name = ?'); values.push(normalizeName(input.lastName, 'Last name')); }
  if ('jerseyNumber' in input) { fields.push('jersey_number = ?'); values.push(normalizeNumber(input.jerseyNumber)); }
  if ('hockeyTechPlayerId' in input) { fields.push('hockeytech_player_id = ?'); values.push(normalizeHockeyTechPlayerId(input.hockeyTechPlayerId)); }
  if (fields.length === 0) throw new InvalidPlayerError('At least one player field is required');
  try {
    const result = await db.prepare(`UPDATE players SET ${fields.join(', ')} WHERE id = ?`).bind(...values, id).run();
    if (!result.meta.changes) throw new PlayerNotFoundError();
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint failed: players\.hockeytech_player_id/.test(error.message)) {
      throw new PlayerConflictError('HockeyTech player ID is already linked to another player');
    }
    throw error;
  }
}

export async function removePlayer(db: D1Database, id: string): Promise<void> {
  const result = await db.prepare('DELETE FROM players WHERE id = ? AND NOT EXISTS (SELECT 1 FROM photos WHERE photos.player_id = players.id)')
    .bind(id).run();
  if (result.meta.changes) return;
  if (!await findPlayer(db, id)) throw new PlayerNotFoundError();
  throw new PlayerConflictError();
}
