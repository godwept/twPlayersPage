const SESSION_LIFETIME_MS = 12 * 60 * 60 * 1000;
const COOKIE_NAME = 'tw_admin_session';

async function digestToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createSession(db: D1Database): Promise<{ token: string; cookie: string }> {
  const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
  const tokenHash = await digestToken(token);
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS).toISOString();
  await db.prepare('INSERT INTO sessions (token_hash, expires_at, created_at) VALUES (?, ?, ?)')
    .bind(tokenHash, expiresAt, new Date().toISOString()).run();
  const cookie = `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_LIFETIME_MS / 1000}`;
  return { token, cookie };
}

export function sessionTokenFromCookie(cookieHeader: string | null): string | null {
  const item = cookieHeader?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`));
  return item?.slice(COOKIE_NAME.length + 1) || null;
}

export async function validateSession(db: D1Database, token: string | null): Promise<boolean> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return false;
  const hash = await digestToken(token);
  const row = await db.prepare('SELECT expires_at FROM sessions WHERE token_hash = ?').bind(hash).first<{ expires_at: string }>();
  if (!row) return false;
  if (Date.parse(row.expires_at) <= Date.now()) {
    await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(hash).run();
    return false;
  }
  return true;
}

export async function revokeSession(db: D1Database, token: string | null): Promise<void> {
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await digestToken(token)).run();
  }
}

export const expiredSessionCookie = `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
