const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

async function visitorKey(address: string, pepper: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${pepper}:${address || 'unknown'}`));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function isLoginAllowed(db: D1Database, address: string, pepper: string): Promise<boolean> {
  const key = await visitorKey(address, pepper);
  const row = await db.prepare('SELECT window_started_at, attempts FROM login_attempts WHERE address_key = ?').bind(key).first<{ window_started_at: string; attempts: number }>();
  return !row || Date.now() - Date.parse(row.window_started_at) >= WINDOW_MS || row.attempts < MAX_FAILURES;
}

export async function recordLoginFailure(db: D1Database, address: string, pepper: string): Promise<void> {
  const key = await visitorKey(address, pepper);
  await db.prepare(`INSERT INTO login_attempts (address_key, window_started_at, attempts) VALUES (?, ?, 1)
    ON CONFLICT(address_key) DO UPDATE SET
      attempts = CASE WHEN julianday('now') - julianday(window_started_at) >= ? THEN 1 ELSE attempts + 1 END,
      window_started_at = CASE WHEN julianday('now') - julianday(window_started_at) >= ? THEN excluded.window_started_at ELSE window_started_at END`)
    .bind(key, new Date().toISOString(), WINDOW_MS / 86_400_000, WINDOW_MS / 86_400_000).run();
}

export async function clearLoginFailures(db: D1Database, address: string, pepper: string): Promise<void> {
  await db.prepare('DELETE FROM login_attempts WHERE address_key = ?').bind(await visitorKey(address, pepper)).run();
}
