const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  return crc >>> 0;
});

export type PhotoChecksums = { sha256: string; crc32: number };

export async function photoChecksums(bytes: ArrayBuffer): Promise<PhotoChecksums> {
  const view = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  let crc = 0xffffffff;
  for (const byte of view) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return {
    sha256: [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
    crc32: (crc ^ 0xffffffff) >>> 0,
  };
}

export function formatCrc32(crc32: number): string {
  return (crc32 >>> 0).toString(16).padStart(8, '0');
}
