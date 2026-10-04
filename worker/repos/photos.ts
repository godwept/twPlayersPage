export type GalleryPhoto = { id: string; filename: string; uploadedAt: string; displayUrl: string; originalDownloadUrl: string };
export type PhotoCursor = { uploadedAt: string; id: string };
export type GalleryPage = { items: GalleryPhoto[]; nextCursor: string | null };
export type HockeyTechGalleryPage = {
  playerId: string;
  photoCount: number;
  items: Array<Omit<GalleryPhoto, 'originalDownloadUrl'>>;
  nextCursor: string | null;
};

function encodeCursor(cursor: PhotoCursor): string {
  return btoa(JSON.stringify(cursor)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function decodeCursor(value: string | undefined): PhotoCursor | null {
  if (!value) return null;
  try {
    const raw = value.replaceAll('-', '+').replaceAll('_', '/');
    const cursor = JSON.parse(atob(raw + '='.repeat((4 - raw.length % 4) % 4))) as PhotoCursor;
    if (typeof cursor.id !== 'string' || !cursor.id || typeof cursor.uploadedAt !== 'string' || !Number.isFinite(Date.parse(cursor.uploadedAt))) return null;
    return cursor;
  } catch { return null; }
}

export async function listPlayerPhotos(db: D1Database, playerId: string, limit: number, cursorValue?: string): Promise<GalleryPage | null> {
  const player = await db.prepare('SELECT id FROM players WHERE id = ?').bind(playerId).first();
  if (!player) return null;
  const limitValue = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 60) : 30;
  const cursor = decodeCursor(cursorValue);
  if (cursorValue && !cursor) throw new TypeError('Invalid gallery cursor');
  const result = cursor
    ? await db.prepare(`SELECT id, filename, uploaded_at FROM photos WHERE player_id = ? AND state = 'active'
      AND (uploaded_at < ? OR (uploaded_at = ? AND id < ?)) ORDER BY uploaded_at DESC, id DESC LIMIT ?`)
      .bind(playerId, cursor.uploadedAt, cursor.uploadedAt, cursor.id, limitValue + 1).all<{ id: string; filename: string; uploaded_at: string }>()
    : await db.prepare(`SELECT id, filename, uploaded_at FROM photos WHERE player_id = ? AND state = 'active'
      ORDER BY uploaded_at DESC, id DESC LIMIT ?`).bind(playerId, limitValue + 1).all<{ id: string; filename: string; uploaded_at: string }>();
  const hasMore = result.results.length > limitValue;
  const rows = result.results.slice(0, limitValue);
  return {
    items: rows.map((photo) => ({
      id: photo.id,
      filename: photo.filename,
      uploadedAt: photo.uploaded_at,
      displayUrl: `/api/photos/${encodeURIComponent(photo.id)}/display`,
      originalDownloadUrl: `/api/photos/${encodeURIComponent(photo.id)}/original`,
    })),
    nextCursor: hasMore && rows.length ? encodeCursor({ uploadedAt: rows.at(-1)!.uploaded_at, id: rows.at(-1)!.id }) : null,
  };
}

export async function findPhoto(db: D1Database, id: string): Promise<{ id: string; player_id: string; original_key: string; display_key: string; filename: string; state: string } | null> {
  return db.prepare('SELECT id, player_id, original_key, display_key, filename, state FROM photos WHERE id = ?').bind(id)
    .first<{ id: string; player_id: string; original_key: string; display_key: string; filename: string; state: string }>();
}

export async function listHockeyTechPlayerPhotos(db: D1Database, hockeyTechPlayerId: string, limit: number, cursorValue?: string): Promise<HockeyTechGalleryPage | null> {
  if (cursorValue && !decodeCursor(cursorValue)) throw new TypeError('Invalid gallery cursor');
  const player = await db.prepare(`SELECT id,
    (SELECT COUNT(*) FROM photos WHERE player_id = players.id AND state = 'active') AS photoCount
    FROM players WHERE hockeytech_player_id = ?`).bind(hockeyTechPlayerId).first<{ id: string; photoCount: number }>();
  if (!player) return null;
  const page = await listPlayerPhotos(db, player.id, limit, cursorValue);
  return {
    playerId: player.id, photoCount: player.photoCount,
    items: (page?.items ?? []).map((photo) => ({ id: photo.id, filename: photo.filename, uploadedAt: photo.uploadedAt, displayUrl: photo.displayUrl })),
    nextCursor: page?.nextCursor ?? null,
  };
}
