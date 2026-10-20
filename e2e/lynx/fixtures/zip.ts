import { Buffer } from 'node:buffer'
import { crc32, deflateRawSync } from 'node:zlib'

/** 仅供反例构造，绝不能作为真实设备或官方 SDK 证据。 */
export function zipFixture(entries: [string, Uint8Array][], deflate = false, padding = 0, descriptor: boolean | 'unsigned' = false) {
  const local: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const [name, bytes] of entries) {
    const filename = Buffer.from(name)
    const compressed = deflate ? deflateRawSync(bytes) : Buffer.from(bytes)
    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034B50)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(descriptor ? 8 : 0, 6)
    header.writeUInt16LE(deflate ? 8 : 0, 8)
    header.writeUInt32LE(descriptor ? 0 : crc32(bytes), 14)
    header.writeUInt32LE(descriptor ? 0 : compressed.length, 18)
    header.writeUInt32LE(descriptor ? 0 : bytes.length, 22)
    header.writeUInt16LE(filename.length, 26)
    header.writeUInt16LE(padding, 28)
    const trailer = Buffer.alloc(descriptor ? descriptor === 'unsigned' ? 12 : 16 : 0)
    if (descriptor) {
      const start = descriptor === 'unsigned' ? 0 : 4
      if (start) trailer.writeUInt32LE(0x08074B50)
      trailer.writeUInt32LE(crc32(bytes), start)
      trailer.writeUInt32LE(compressed.length, start + 4)
      trailer.writeUInt32LE(bytes.length, start + 8)
    }
    local.push(header, filename, Buffer.alloc(padding), compressed, trailer)
    const record = Buffer.alloc(46)
    record.writeUInt32LE(0x02014B50)
    record.writeUInt16LE(20, 4)
    record.writeUInt16LE(20, 6)
    record.writeUInt16LE(descriptor ? 8 : 0, 8)
    record.writeUInt16LE(deflate ? 8 : 0, 10)
    record.writeUInt32LE(crc32(bytes), 16)
    record.writeUInt32LE(compressed.length, 20)
    record.writeUInt32LE(bytes.length, 24)
    record.writeUInt16LE(filename.length, 28)
    record.writeUInt32LE(offset, 42)
    central.push(record, filename)
    offset += header.length + filename.length + padding + compressed.length + trailer.length
  }
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054B50)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(central.reduce((sum, item) => sum + item.length, 0), 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...local, ...central, end])
}
