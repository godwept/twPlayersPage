import { exports } from 'cloudflare:workers';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { formatCrc32, photoChecksums } from '../../shared/photo-checksum';

const api = 'http://example.com/api';
const source = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3, 0xff, 0xd9]);
const display = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 8, 7, 6, 0xff, 0xd9]);

async function adminCookie(): Promise<string> {
  const response = await exports.default.fetch(`${api}/admin/login`, {
    method: 'POST', headers: { Origin: 'http://example.com', 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'test-only-password-for-workers' }),
  });
  return response.headers.get('set-cookie')!.split(';')[0];
}

describe('photo upload and publication', () => {
  it('streams uploads, verifies source bytes, handles duplicates explicitly and serves original bytes verbatim', async () => {
    const cookie = await adminCookie();
    const playerId = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO players (id, first_name, last_name, jersey_number, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(playerId, 'Casey', 'Photo', '3', new Date().toISOString()).run();
    const sourceChecksums = await photoChecksums(source.slice().buffer);
    const displayChecksums = await photoChecksums(display.slice().buffer);
    const sourceHash = sourceChecksums.sha256;

    async function stage(uploadId: string) {
      const baseHeaders = { Origin: 'http://example.com', Cookie: cookie, 'Content-Type': 'image/jpeg' };
      const original = await exports.default.fetch(`${api}/admin/uploads/${uploadId}/original`, { method: 'PUT', headers: { ...baseHeaders, 'X-Photo-SHA256': sourceChecksums.sha256, 'X-Photo-CRC32': formatCrc32(sourceChecksums.crc32) }, body: source });
      expect(original.status).toBe(201);
      expect(await original.json()).toMatchObject({ sha256: sourceHash, crc32: 1912419538 });
      const optimized = await exports.default.fetch(`${api}/admin/uploads/${uploadId}/display`, { method: 'PUT', headers: { ...baseHeaders, 'X-Photo-SHA256': displayChecksums.sha256, 'X-Photo-CRC32': formatCrc32(displayChecksums.crc32) }, body: display });
      expect(optimized.status).toBe(201);
    }
    async function publish(uploadId: string, keepDuplicate = false) {
      return exports.default.fetch(`${api}/admin/photos`, {
        method: 'POST', headers: { Origin: 'http://example.com', Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId, playerId, filename: '3 - Photo1.jpg', sha256: sourceHash, keepDuplicate }),
      });
    }

    const firstUploadId = crypto.randomUUID();
    await stage(firstUploadId);
    const first = await publish(firstUploadId);
    expect(first.status).toBe(201);
    const firstPhotoId = (await first.json() as { id: string }).id;
    const download = await exports.default.fetch(`${api}/photos/${firstPhotoId}/original`);
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(source);
    expect(download.headers.get('content-disposition')).toContain('3%20-%20Photo1.jpg');

    const duplicateUploadId = crypto.randomUUID();
    await stage(duplicateUploadId);
    expect((await publish(duplicateUploadId)).status).toBe(409);
    const kept = await publish(duplicateUploadId, true);
    expect(kept.status).toBe(201);
    expect((await kept.json() as { id: string }).id).not.toBe(firstPhotoId);
  });

  it('rejects uploads without client checksums and never records them', async () => {
    const cookie = await adminCookie();
    const id = crypto.randomUUID();
    const response = await exports.default.fetch(`${api}/admin/uploads/${id}/original`, {
      method: 'PUT', headers: { Origin: 'http://example.com', Cookie: cookie, 'Content-Type': 'image/jpeg' }, body: source,
    });
    expect(response.status).toBe(400);
    expect(await env.DB.prepare('SELECT count(*) AS count FROM upload_staging WHERE upload_id = ?').bind(id).first<{ count: number }>()).toMatchObject({ count: 0 });
  });
});
