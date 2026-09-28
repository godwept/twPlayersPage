type ZipEntry = { name: string; key: string; crc32: number; size: number };

function write16(view: DataView, offset: number, value: number): void { view.setUint16(offset, value, true); }
function write32(view: DataView, offset: number, value: number): void { view.setUint32(offset, value >>> 0, true); }

function localHeader(name: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(30 + name.length); const view = new DataView(bytes.buffer);
  write32(view, 0, 0x04034b50); write16(view, 4, 20); write16(view, 6, 0x0808); write16(view, 8, 0); write16(view, 10, 0); write16(view, 12, 0x21);
  write32(view, 14, 0); write32(view, 18, 0); write32(view, 22, 0); write16(view, 26, name.length); write16(view, 28, 0); bytes.set(name, 30);
  return bytes;
}

function dataDescriptor(crc32: number, size: number): Uint8Array {
  const bytes = new Uint8Array(16); const view = new DataView(bytes.buffer);
  write32(view, 0, 0x08074b50); write32(view, 4, crc32); write32(view, 8, size); write32(view, 12, size);
  return bytes;
}

function centralHeader(name: Uint8Array, crc32: number, size: number, offset: number): Uint8Array {
  const bytes = new Uint8Array(46 + name.length); const view = new DataView(bytes.buffer);
  write32(view, 0, 0x02014b50); write16(view, 4, 20); write16(view, 6, 20); write16(view, 8, 0x0808); write16(view, 10, 0);
  write16(view, 12, 0); write16(view, 14, 0x21); write32(view, 16, crc32); write32(view, 20, size); write32(view, 24, size);
  write16(view, 28, name.length); write16(view, 30, 0); write16(view, 32, 0); write16(view, 34, 0); write16(view, 36, 0);
  write32(view, 38, 0); write32(view, 42, offset); bytes.set(name, 46);
  return bytes;
}

function endRecord(entryCount: number, centralSize: number, centralOffset: number): Uint8Array {
  const bytes = new Uint8Array(22); const view = new DataView(bytes.buffer);
  write32(view, 0, 0x06054b50); write16(view, 4, 0); write16(view, 6, 0); write16(view, 8, entryCount); write16(view, 10, entryCount);
  write32(view, 12, centralSize); write32(view, 16, centralOffset); write16(view, 20, 0);
  return bytes;
}

export function makeStoreZipStream(bucket: R2Bucket, entries: ZipEntry[]): ReadableStream<Uint8Array> {
  let activeReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  async function* chunks(): AsyncGenerator<Uint8Array> {
    let offset = 0;
    const central: Uint8Array[] = [];
    for (const entry of entries) {
      const name = new TextEncoder().encode(entry.name);
      if (name.length > 65_535) throw new RangeError('ZIP filename is too long');
      const start = offset;
      const header = localHeader(name); offset += header.length; yield header;
      const object = await bucket.get(entry.key);
      if (!object) throw new Error('A source photo disappeared while creating the ZIP');
      activeReader = object.body.getReader();
      let size = 0;
      try {
        while (true) {
          const { value, done } = await activeReader.read();
          if (done) break;
          size += value.byteLength; offset += value.byteLength; yield value;
        }
      } finally {
        activeReader.releaseLock(); activeReader = undefined;
      }
      if (size !== entry.size) throw new Error('A source photo changed while creating the ZIP');
      const descriptor = dataDescriptor(entry.crc32, size); offset += descriptor.length; yield descriptor;
      central.push(centralHeader(name, entry.crc32, size, start));
    }
    const centralOffset = offset;
    let centralSize = 0;
    for (const header of central) { offset += header.length; centralSize += header.length; yield header; }
    yield endRecord(entries.length, centralSize, centralOffset);
  }
  const iterator = chunks();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) controller.close(); else controller.enqueue(next.value);
      } catch (error) { controller.error(error); }
    },
    async cancel(reason) {
      await activeReader?.cancel(reason).catch(() => undefined);
      await iterator.return(undefined);
    },
  });
}

export function uniqueZipNames(rows: Array<{ id: string; filename: string }>): string[] {
  const used = new Set<string>();
  return rows.map(({ id, filename }) => {
    if (!used.has(filename)) { used.add(filename); return filename; }
    const dot = filename.lastIndexOf('.');
    const stem = dot > 0 ? filename.slice(0, dot) : filename;
    const extension = dot > 0 ? filename.slice(dot) : '';
    let suffix = id.slice(0, 8); let name = `${stem} (${suffix})${extension}`; let counter = 2;
    while (used.has(name)) { suffix = `${id.slice(0, 6)}-${counter++}`; name = `${stem} (${suffix})${extension}`; }
    used.add(name); return name;
  });
}
