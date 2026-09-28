import { Hono } from 'hono';
import { addPlayer, findPlayer, InvalidPlayerError, listPlayers, normalizePlayerInput, PlayerConflictError, PlayerNotFoundError, removePlayer, updatePlayer } from './repos/players';
import { clearLoginFailures, isLoginAllowed, recordLoginFailure } from './auth/login-limit';
import { PasswordVerificationError, verifyAdminPassword } from './auth/password';
import { createSession, expiredSessionCookie, revokeSession, sessionTokenFromCookie, validateSession } from './auth/session';
import { findPhoto, listPlayerPhotos } from './repos/photos';
import { makeStoreZipStream, uniqueZipNames } from './lib/store-zip';

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

type Bindings = {
  DB: D1Database;
  PHOTOS: R2Bucket;
  ADMIN_PASSWORD_HASH: string;
};

const app = new Hono<{ Bindings: Bindings }>().basePath('/api');

app.get('/health', (c) => c.json({ ok: true }));

function addressFor(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? 'unknown';
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin');
  if (!origin || origin === 'null') return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

app.use('/admin/*', async (c, next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    if (!sameOrigin(c.req.raw)) return c.json({ error: 'Cross-origin write rejected' }, 403);
    const contentType = c.req.header('Content-Type')?.toLowerCase() ?? '';
    if (!contentType.startsWith('application/json') && !contentType.startsWith('multipart/form-data') && !['image/jpeg', 'image/png', 'image/webp'].includes(contentType.split(';')[0])) {
      return c.json({ error: 'Unsupported content type' }, 415);
    }
  }
  if (c.req.path !== '/api/admin/login') {
    const token = sessionTokenFromCookie(c.req.header('Cookie') ?? null);
    if (!await validateSession(c.env.DB, token)) return c.json({ error: 'Authentication required' }, 401);
  }
  await next();
});

app.post('/admin/login', async (c) => {
  const body = await c.req.json<{ password?: unknown }>().catch(() => null);
  if (!body || typeof body.password !== 'string' || body.password.length > 1024) return c.json({ error: 'Invalid request' }, 400);
  if (!c.env.ADMIN_PASSWORD_HASH) return c.json({ error: 'Administrator is not configured' }, 503);
  const address = addressFor(c.req.raw);
  if (!await isLoginAllowed(c.env.DB, address, c.env.ADMIN_PASSWORD_HASH)) return c.json({ error: 'Invalid credentials' }, 429);
  let verified: boolean;
  try {
    verified = await verifyAdminPassword(body.password, c.env.ADMIN_PASSWORD_HASH);
  } catch (error) {
    if (!(error instanceof PasswordVerificationError)) throw error;
    return c.json({ error: 'Sign-in is temporarily unavailable. Please try again later.' }, 503, { 'Cache-Control': 'no-store' });
  }
  if (!verified) {
    await recordLoginFailure(c.env.DB, address, c.env.ADMIN_PASSWORD_HASH);
    return c.json({ error: 'Invalid credentials' }, 401);
  }
  await clearLoginFailures(c.env.DB, address, c.env.ADMIN_PASSWORD_HASH);
  const session = await createSession(c.env.DB);
  return c.json({ authenticated: true }, 200, { 'Set-Cookie': session.cookie, 'Cache-Control': 'no-store' });
});

app.get('/admin/session', (c) => c.json({ authenticated: true }, 200, { 'Cache-Control': 'no-store' }));

app.post('/admin/logout', async (c) => {
  await revokeSession(c.env.DB, sessionTokenFromCookie(c.req.header('Cookie') ?? null));
  return c.json({ ok: true }, 200, { 'Set-Cookie': expiredSessionCookie, 'Cache-Control': 'no-store' });
});

app.get('/players', async (c) => {
  const result = await c.env.DB.prepare(`SELECT p.id, p.first_name AS firstName, p.last_name AS lastName,
      p.jersey_number AS jerseyNumber,
      COALESCE((SELECT selected.id FROM photos selected WHERE selected.id = p.featured_photo_id AND selected.player_id = p.id AND selected.state = 'active'),
        (SELECT recent.id FROM photos recent WHERE recent.player_id = p.id AND recent.state = 'active' ORDER BY recent.uploaded_at DESC, recent.id DESC LIMIT 1)) AS featuredPhotoId,
      p.crop_x AS cropX, p.crop_y AS cropY, p.crop_zoom AS cropZoom
    FROM players p ORDER BY p.jersey_number IS NULL, CAST(p.jersey_number AS INTEGER), p.last_name COLLATE NOCASE, p.id`).all();
  return c.json(result.results.map((player: Record<string, unknown>) => ({
    id: player.id,
    firstName: player.firstName,
    lastName: player.lastName,
    jerseyNumber: player.jerseyNumber,
    featuredPhotoId: player.featuredPhotoId,
    featuredImageUrl: player.featuredPhotoId ? `/api/photos/${encodeURIComponent(String(player.featuredPhotoId))}/display` : null,
    crop: { x: player.cropX, y: player.cropY, zoom: player.cropZoom },
  })));
});

app.get('/players/:id', async (c) => {
  const player = await findPlayer(c.env.DB, c.req.param('id'));
  return player ? c.json({ id: player.id, firstName: player.first_name, lastName: player.last_name, jerseyNumber: player.jersey_number }) : c.json({ error: 'Player not found' }, 404);
});

app.get('/players/:id/photos', async (c) => {
  try {
    const limit = c.req.query('limit') ? Number(c.req.query('limit')) : 30;
    const page = await listPlayerPhotos(c.env.DB, c.req.param('id'), limit, c.req.query('cursor'));
    return page ? c.json(page, 200, { 'Cache-Control': 'no-store' }) : c.json({ error: 'Player not found' }, 404);
  } catch {
    return c.json({ error: 'Invalid gallery cursor' }, 400);
  }
});

app.get('/photos/:id/:kind{display|original}', async (c) => {
  const photo = await findPhoto(c.env.DB, c.req.param('id'));
  if (!photo || photo.state !== 'active') return c.json({ error: 'Photo not found' }, 404);
  const original = c.req.param('kind') === 'original';
  const object = await c.env.PHOTOS.get(original ? photo.original_key : photo.display_key);
  if (!object) return c.json({ error: 'Photo not found' }, 404);
  const headers = new Headers({
    'Content-Type': object.httpMetadata?.contentType ?? 'image/jpeg',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'public, max-age=31536000, immutable',
    ETag: object.httpEtag,
  });
  if (original) {
    headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(photo.filename)}`);
    headers.set('Cache-Control', 'private, no-store');
  }
  return new Response(object.body, { headers });
});

app.get('/players/:id/download.zip', async (c) => {
  const player = await findPlayer(c.env.DB, c.req.param('id'));
  if (!player) return c.json({ error: 'Player not found' }, 404);
  const photoResult = await c.env.DB.prepare(`SELECT id, filename, original_key, crc32, uploaded_at FROM photos
    WHERE player_id = ? AND state = 'active' ORDER BY uploaded_at DESC, id DESC`).bind(player.id)
    .all<{ id: string; filename: string; original_key: string; crc32: number; uploaded_at: string }>();
  if (!photoResult.results.length) return c.json({ error: 'This player has no photos to download' }, 404);
  if (photoResult.results.length > 65_535) return c.json({ error: 'This gallery is too large for a standard ZIP file' }, 413);

  const heads: Array<R2Object | null> = [];
  for (let start = 0; start < photoResult.results.length; start += 24) {
    const batch = photoResult.results.slice(start, start + 24);
    heads.push(...await Promise.all(batch.map((photo) => c.env.PHOTOS.head(photo.original_key))));
  }
  if (heads.some((head) => !head)) return c.json({ error: 'A source photo is missing. No archive was started.' }, 502);
  const zipNames = uniqueZipNames(photoResult.results.map((photo) => ({ id: photo.id, filename: photo.filename.replaceAll('\\', '/').split('/').pop() || `${photo.id}.jpg` })));
  const entries = photoResult.results.map((photo, index) => ({ name: zipNames[index], key: photo.original_key, crc32: photo.crc32 >>> 0, size: heads[index]!.size }));
  const totalSize = entries.reduce((sum, entry) => { const nameBytes = new TextEncoder().encode(entry.name).length; return sum + entry.size + (nameBytes * 2) + 92; }, 22);
  if (totalSize > 0xffffffff) return c.json({ error: 'This gallery exceeds the supported ZIP size' }, 413);
  const safeNumber = player.jersey_number ? `_${player.jersey_number}` : '';
  return new Response(makeStoreZipStream(c.env.PHOTOS, entries), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="timberwolves${safeNumber}_photos.zip"`,
      'Cache-Control': 'private, no-store',
    },
  });
});

app.get('/site', async (c) => {
  const settings = await c.env.DB.prepare('SELECT banner_key, logo_key, banner_position_x, banner_position_y FROM site_settings WHERE id = 1')
    .first<{ banner_key: string | null; logo_key: string | null; banner_position_x: number; banner_position_y: number }>();
  return c.json({
    bannerUrl: settings?.banner_key ? '/api/site/banner' : null,
    logoUrl: settings?.logo_key ? '/api/site/logo' : null,
    bannerPosition: { x: settings?.banner_position_x ?? 0.5, y: settings?.banner_position_y ?? 0.5 },
  });
});

app.get('/site/:kind{banner|logo}', async (c) => {
  const column = c.req.param('kind') === 'banner' ? 'banner_key' : 'logo_key';
  const settings = await c.env.DB.prepare(`SELECT ${column} AS object_key FROM site_settings WHERE id = 1`)
    .first<{ object_key: string | null }>();
  if (!settings?.object_key) return c.notFound();
  const object = await c.env.PHOTOS.get(settings.object_key);
  return object ? new Response(object.body, { headers: { 'Content-Type': object.httpMetadata?.contentType ?? 'image/jpeg', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=3600' } }) : c.notFound();
});

app.post('/admin/players', async (c) => {
  try {
    const body = await c.req.json<{ firstName: string; lastName: string; jerseyNumber?: string | null }>();
    const id = await addPlayer(c.env.DB, body);
    return c.json({ id }, 201);
  } catch (error) {
    if (error instanceof InvalidPlayerError) return c.json({ error: error.message }, 400);
    return c.json({ error: 'Invalid request' }, 400);
  }
});

app.post('/admin/players/import', async (c) => {
  const body = await c.req.json<{ players?: unknown }>().catch(() => null);
  if (!Array.isArray(body?.players) || body.players.length < 1 || body.players.length > 500) return c.json({ error: 'Choose a CSV with between 1 and 500 roster rows' }, 400);
  try {
    const players = body.players.map((value) => {
      if (!value || typeof value !== 'object') throw new InvalidPlayerError('Each roster row must include names and an optional number');
      const row = value as Record<string, unknown>;
      if (typeof row.firstName !== 'string' || typeof row.lastName !== 'string' || (row.jerseyNumber !== null && typeof row.jerseyNumber !== 'string')) throw new InvalidPlayerError('Each roster row must include names and an optional number');
      return normalizePlayerInput({ firstName: row.firstName, lastName: row.lastName, jerseyNumber: row.jerseyNumber as string | null });
    });
    const createdAt = new Date().toISOString();
    const ids = players.map(() => crypto.randomUUID());
    const statements = players.map((player, index) => c.env.DB.prepare('INSERT INTO players (id, first_name, last_name, jersey_number, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(ids[index], player.firstName, player.lastName, player.jerseyNumber, createdAt));
    await c.env.DB.batch(statements);
    return c.json({ ids, count: ids.length }, 201);
  } catch (error) {
    if (error instanceof InvalidPlayerError) return c.json({ error: error.message }, 400);
    return c.json({ error: 'Roster import failed without adding players' }, 400);
  }
});

app.patch('/admin/players/:id', async (c) => {
  try {
    await updatePlayer(c.env.DB, c.req.param('id'), await c.req.json());
    return c.json({ ok: true });
  } catch (error) {
    if (error instanceof PlayerNotFoundError) return c.json({ error: 'Player not found' }, 404);
    if (error instanceof InvalidPlayerError) return c.json({ error: error.message }, 400);
    return c.json({ error: 'Invalid request' }, 400);
  }
});

app.delete('/admin/players/:id', async (c) => {
  try {
    await removePlayer(c.env.DB, c.req.param('id'));
    return c.body(null, 204);
  } catch (error) {
    if (error instanceof PlayerNotFoundError) return c.json({ error: 'Player not found' }, 404);
    if (error instanceof PlayerConflictError) return c.json({ error: 'Reassign or delete this player’s photos before removing the player' }, 409);
    return c.json({ error: 'Could not remove player' }, 500);
  }
});

app.put('/admin/uploads/:uploadId/:kind{original|display}', async (c) => {
  const uploadId = c.req.param('uploadId');
  const kind = c.req.param('kind');
  if (!/^[0-9a-f-]{36}$/i.test(uploadId)) return c.json({ error: 'Invalid upload ID' }, 400);
  const contentType = c.req.header('Content-Type')?.split(';')[0].toLowerCase();
  if (contentType !== 'image/jpeg') return c.json({ error: 'Upload a JPEG image' }, 415);
  const sha256 = c.req.header('X-Photo-SHA256')?.toLowerCase() ?? '';
  const crc32Header = c.req.header('X-Photo-CRC32')?.toLowerCase() ?? '';
  if (!/^[a-f0-9]{64}$/.test(sha256) || !/^[a-f0-9]{8}$/.test(crc32Header)) return c.json({ error: 'Missing or invalid photo checksums' }, 400);
  const crc32 = Number.parseInt(crc32Header, 16) >>> 0;
  const length = Number(c.req.header('Content-Length') ?? 0);
  if (length > MAX_UPLOAD_BYTES) return c.json({ error: 'This file exceeds the Workers request body limit' }, 413);
  if (!c.req.raw.body) return c.json({ error: 'Empty upload' }, 400);
  const key = `.staging/${uploadId}/${kind}.jpg`;
  try {
    const stored = await c.env.PHOTOS.put(key, c.req.raw.body, { httpMetadata: { contentType: 'image/jpeg' } });
    if (stored.size > MAX_UPLOAD_BYTES) {
      await c.env.PHOTOS.delete(key);
      return c.json({ error: 'This file exceeds the Workers request body limit' }, 413);
    }
    await c.env.DB.prepare(`INSERT INTO upload_staging (upload_id, kind, object_key, sha256, crc32, content_type, size_bytes, created_at)
      VALUES (?, ?, ?, ?, ?, 'image/jpeg', ?, ?)
      ON CONFLICT(upload_id, kind) DO UPDATE SET object_key = excluded.object_key, sha256 = excluded.sha256, crc32 = excluded.crc32, size_bytes = excluded.size_bytes, created_at = excluded.created_at`)
      .bind(uploadId, kind, key, sha256, crc32, stored.size, new Date().toISOString()).run();
    return c.json({ uploadId, kind, sha256, crc32, size: stored.size }, 201);
  } catch (error) {
    await c.env.PHOTOS.delete(key).catch(() => undefined);
    return c.json({ error: 'Upload failed' }, 502);
  }
});

app.delete('/admin/uploads/:uploadId', async (c) => {
  const uploadId = c.req.param('uploadId');
  const staged = await c.env.DB.prepare('SELECT object_key FROM upload_staging WHERE upload_id = ?').bind(uploadId).all<{ object_key: string }>();
  await Promise.all(staged.results.map(({ object_key }) => c.env.PHOTOS.delete(object_key)));
  await c.env.DB.prepare('DELETE FROM upload_staging WHERE upload_id = ?').bind(uploadId).run();
  return c.body(null, 204);
});

app.post('/admin/photos/duplicates', async (c) => {
  const body = await c.req.json<{ sha256?: string }>().catch(() => null);
  if (!body || !/^[a-f0-9]{64}$/.test(body.sha256 ?? '')) return c.json({ error: 'Invalid content hash' }, 400);
  const duplicates = await c.env.DB.prepare(`SELECT id, player_id AS playerId, filename, uploaded_at AS uploadedAt FROM photos WHERE sha256 = ? AND state = 'active' ORDER BY uploaded_at DESC`)
    .bind(body.sha256).all();
  return c.json({ duplicates: duplicates.results });
});

app.post('/admin/photos', async (c) => {
  const body = await c.req.json<{ uploadId?: string; playerId?: string; filename?: string; sha256?: string; keepDuplicate?: boolean }>().catch(() => null);
  if (!body || !/^[0-9a-f-]{36}$/i.test(body.uploadId ?? '') || !/^[a-f0-9]{64}$/.test(body.sha256 ?? '') ||
    !body.playerId || !body.filename || body.filename.length > 240 || body.filename.includes('/') || body.filename.includes('\\') || !/\.jpe?g$/i.test(body.filename)) {
    return c.json({ error: 'Invalid photo publication request' }, 400);
  }
  const player = await findPlayer(c.env.DB, body.playerId);
  if (!player) return c.json({ error: 'Player not found' }, 404);
  const staged = await c.env.DB.prepare('SELECT kind, object_key, sha256, crc32, size_bytes FROM upload_staging WHERE upload_id = ?')
    .bind(body.uploadId).all<{ kind: string; object_key: string; sha256: string; crc32: number; size_bytes: number }>();
  const original = staged.results.find((item) => item.kind === 'original');
  const display = staged.results.find((item) => item.kind === 'display');
  if (!original || !display || original.sha256 !== body.sha256) return c.json({ error: 'Upload is incomplete or its source hash does not match' }, 409);
  const duplicate = await c.env.DB.prepare("SELECT id, player_id AS playerId, filename, uploaded_at AS uploadedAt FROM photos WHERE sha256 = ? AND state = 'active' LIMIT 1")
    .bind(body.sha256).first();
  if (duplicate && body.keepDuplicate !== true) return c.json({ error: 'This image already exists. Choose Keep or Skip.', duplicate: true, existing: duplicate }, 409);

  const originalStage = await c.env.PHOTOS.get(original.object_key);
  const displayStage = await c.env.PHOTOS.get(display.object_key);
  if (!originalStage || !displayStage) return c.json({ error: 'A staged image is missing; upload this photo again' }, 409);
  const id = crypto.randomUUID();
  const originalKey = `photos/${id}/original.jpg`;
  const displayKey = `photos/${id}/display.jpg`;
  try {
    await Promise.all([
      c.env.PHOTOS.put(originalKey, originalStage.body, { httpMetadata: { contentType: 'image/jpeg' } }),
      c.env.PHOTOS.put(displayKey, displayStage.body, { httpMetadata: { contentType: 'image/jpeg' } }),
    ]);
    await c.env.DB.prepare('INSERT INTO photos (id, player_id, original_key, display_key, filename, sha256, crc32, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, body.playerId, originalKey, displayKey, body.filename, body.sha256, original.crc32, new Date().toISOString()).run();
  } catch {
    await Promise.all([c.env.PHOTOS.delete(originalKey), c.env.PHOTOS.delete(displayKey)]);
    return c.json({ error: 'Could not publish this photo' }, 502);
  }
  await Promise.all(staged.results.map(({ object_key }) => c.env.PHOTOS.delete(object_key)));
  await c.env.DB.prepare('DELETE FROM upload_staging WHERE upload_id = ?').bind(body.uploadId).run();
  return c.json({ id }, 201);
});

app.patch('/admin/photos/:id', async (c) => {
  const body = await c.req.json<{ playerId?: string }>().catch(() => null);
  if (!body?.playerId) return c.json({ error: 'A destination player is required' }, 400);
  if (!await findPlayer(c.env.DB, body.playerId)) return c.json({ error: 'Player not found' }, 404);
  const result = await c.env.DB.prepare("UPDATE photos SET player_id = ? WHERE id = ? AND state = 'active'")
    .bind(body.playerId, c.req.param('id')).run();
  return result.meta.changes ? c.json({ ok: true }) : c.json({ error: 'Photo not found' }, 404);
});

app.delete('/admin/photos/:id', async (c) => {
  const body = await c.req.json<{ confirm?: boolean }>().catch(() => null);
  if (body?.confirm !== true) return c.json({ error: 'Confirm permanent deletion' }, 400);
  const photo = await findPhoto(c.env.DB, c.req.param('id'));
  if (!photo) return c.body(null, 204);
  await c.env.DB.prepare("UPDATE photos SET state = 'deleting' WHERE id = ?").bind(photo.id).run();
  try {
    await Promise.all([c.env.PHOTOS.delete(photo.original_key), c.env.PHOTOS.delete(photo.display_key)]);
    await c.env.DB.prepare('DELETE FROM photos WHERE id = ?').bind(photo.id).run();
    return c.body(null, 204);
  } catch {
    return c.json({ error: 'Photo is hidden while deletion retries; submit the same request again to finish deletion' }, 502);
  }
});

app.put('/admin/players/:id/featured', async (c) => {
  const body = await c.req.json<{ photoId: string; x?: number; y?: number; zoom?: number }>().catch(() => null);
  if (!body?.photoId) return c.json({ error: 'Choose a photo' }, 400);
  const x = body.x ?? 0.5; const y = body.y ?? 0.5; const zoom = body.zoom ?? 1;
  if (![x, y].every((value) => Number.isFinite(value) && value >= 0 && value <= 1) || !Number.isFinite(zoom) || zoom < 1 || zoom > 4) return c.json({ error: 'Crop values are out of range' }, 400);
  const photo = await c.env.DB.prepare("SELECT id FROM photos WHERE id = ? AND player_id = ? AND state = 'active'")
    .bind(body.photoId, c.req.param('id')).first();
  if (!photo) return c.json({ error: 'Choose an active photo in this player’s gallery' }, 400);
  const updated = await c.env.DB.prepare('UPDATE players SET featured_photo_id = ?, crop_x = ?, crop_y = ?, crop_zoom = ? WHERE id = ?')
    .bind(body.photoId, x, y, zoom, c.req.param('id')).run();
  return updated.meta.changes ? c.json({ ok: true }) : c.json({ error: 'Player not found' }, 404);
});

app.put('/admin/site/:kind{banner|logo}', async (c) => {
  const kind = c.req.param('kind') as 'banner' | 'logo';
  const contentType = c.req.header('Content-Type')?.split(';')[0].toLowerCase() ?? '';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) return c.json({ error: 'Upload a JPEG, PNG or WebP image' }, 415);
  const length = Number(c.req.header('Content-Length') ?? 0);
  if (length > MAX_UPLOAD_BYTES) return c.json({ error: 'This file exceeds the Workers request body limit' }, 413);
  if (!c.req.raw.body) return c.json({ error: 'Empty upload' }, 400);
  const settings = await c.env.DB.prepare('SELECT banner_key, logo_key FROM site_settings WHERE id = 1')
    .first<{ banner_key: string | null; logo_key: string | null }>();
  const column = kind === 'banner' ? 'banner_key' : 'logo_key';
  const oldKey = settings?.[column] ?? null;
  const key = `site/${kind}/${crypto.randomUUID()}.${contentType === 'image/jpeg' ? 'jpg' : contentType === 'image/png' ? 'png' : 'webp'}`;
  try {
    const object = await c.env.PHOTOS.put(key, c.req.raw.body, { httpMetadata: { contentType } });
    if (object.size > MAX_UPLOAD_BYTES) { await c.env.PHOTOS.delete(key); return c.json({ error: 'This file exceeds the Workers request body limit' }, 413); }
    await c.env.DB.prepare(`INSERT INTO site_settings (id, ${column}, updated_at) VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET ${column} = excluded.${column}, updated_at = excluded.updated_at`)
      .bind(key, new Date().toISOString()).run();
  } catch {
    await c.env.PHOTOS.delete(key).catch(() => undefined);
    return c.json({ error: 'Could not save the site image' }, 502);
  }
  if (oldKey) await c.env.PHOTOS.delete(oldKey).catch(() => undefined);
  return c.json({ ok: true, url: `/api/site/${kind}` });
});

app.put('/admin/site/position', async (c) => {
  const body = await c.req.json<{ x?: number; y?: number }>().catch(() => null);
  if (!body || ![body.x, body.y].every((value) => Number.isFinite(value) && Number(value) >= 0 && Number(value) <= 1)) return c.json({ error: 'Position values must be between zero and one' }, 400);
  const updatedAt = new Date().toISOString();
  await c.env.DB.prepare(`INSERT INTO site_settings (id, banner_position_x, banner_position_y, updated_at) VALUES (1, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET banner_position_x = excluded.banner_position_x, banner_position_y = excluded.banner_position_y, updated_at = excluded.updated_at`)
    .bind(body.x, body.y, updatedAt).run();
  return c.json({ ok: true });
});

app.notFound((c) => c.json({ error: 'Not found' }, 404));

export default app;
