import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { x as extractTar } from 'tar'

export interface ArchiveInput {
  file: string
  url: string
  sha256: string
  destination: string[]
  strip: number
}

export function sha256(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex')
}

export async function downloadArchive(input: ArchiveInput, directory: string, cache?: string) {
  await fs.mkdir(directory, { recursive: true })
  const destination = path.join(directory, input.file)
  const cached = cache ? await fs.readFile(path.join(cache, input.file)).catch(() => undefined) : undefined
  let bytes = cached
  if (!bytes) {
    const response = await fetch(input.url, { signal: AbortSignal.timeout(600_000) })
    if (!response.ok) { throw new Error(`下载失败 ${response.status}: ${input.url}`) }
    bytes = Buffer.from(await response.arrayBuffer())
  }
  if (sha256(bytes) !== input.sha256) { throw new Error(`归档 SHA-256 不匹配: ${input.file}`) }
  await fs.writeFile(destination, bytes)
  return destination
}

export async function unpackArchive(archive: string, destination: string, strip: number) {
  await fs.mkdir(destination, { recursive: true })
  await extractTar({
    file: archive,
    cwd: destination,
    strip,
    strict: true,
    filter(name, entry) {
      // tar 成员使用 POSIX 逻辑路径；提取后才由 tar 映射为宿主文件路径。
      if (name.includes('\\') || name.startsWith('/') || /^[a-z]:/i.test(name) || name.split('/').includes('..')) { throw new Error(`归档包含越界路径: ${name}`) }
      if (entry.type !== 'File' && entry.type !== 'Directory') { throw new Error(`归档包含非普通文件: ${name} (${entry.type})`) }
      return true
    },
  })
}
