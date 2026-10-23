import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { closeSync, openSync, readSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { x as extractTar, Parser } from 'tar'

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
    if (!response.ok) {
      throw new Error(`下载失败 ${response.status}: ${input.url}`)
    }
    bytes = Buffer.from(await response.arrayBuffer())
  }
  if (sha256(bytes) !== input.sha256) {
    throw new Error(`归档 SHA-256 不匹配: ${input.file}`)
  }
  await fs.writeFile(destination, bytes)
  return destination
}

export function validateArchivePath(name: string) {
  // tar 成员是 POSIX 逻辑路径；通过校验后才映射成宿主文件路径。
  if (name.includes('\\') || name.startsWith('/') || /^[a-z]:/i.test(name) || name.split('/').includes('..')) {
    throw new Error(`归档包含越界路径: ${name}`)
  }
}

export async function unpackArchive(archive: string, destination: string, strip: number) {
  await fs.mkdir(destination, { recursive: true })
  const links: Array<{ file: string[], target: string[] }> = []
  // 先同步检查所有成员，避免异步提取回调抛错后留下悬而未决的 Promise。
  const parser = new Parser({
    file: archive,
    sync: true,
    strict: true,
    onReadEntry(entry) {
      // tar 在 Windows 会先改写 ReadEntry 路径；普通头原文必须先过 POSIX 边界。
      validateArchivePath(entry.header.path ?? '')
      if (entry.header.linkpath?.includes('\\')) {
        throw new Error(`归档链接包含非 POSIX 路径: ${entry.header.linkpath}`)
      }
      const name = entry.path
      validateArchivePath(name)
      if (entry.type === 'SymbolicLink') {
        const linkpath = entry.linkpath
        if (!linkpath) {
          throw new Error('归档链接缺少目标路径')
        }
        if (linkpath.includes('\\') || path.posix.isAbsolute(linkpath) || /^[a-z]:/i.test(linkpath)) {
          throw new Error(`归档链接包含绝对路径: ${linkpath}`)
        }
        const file = name.split('/').slice(strip)
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(file.join('/')), linkpath))
        validateArchivePath(target)
        links.push({ file, target: target.split('/') })
      }
      else if (entry.type !== 'File' && entry.type !== 'Directory') {
        throw new Error(`归档包含非普通文件: ${name} (${entry.type})`)
      }
      entry.resume()
    },
  })
  // 固定源码归档仅接受 POSIX 元数据；在 tar 消费 PAX/GNU 扩展并做宿主归一化前检查。
  parser.on('meta', (metadata: string) => {
    if (metadata.includes('\\')) {
      throw new Error('归档扩展元数据包含非 POSIX 路径')
    }
  })
  const descriptor = openSync(archive, 'r')
  try {
    const chunk = Buffer.alloc(64 * 1024)
    let length = readSync(descriptor, chunk, 0, chunk.length, null)
    while (length > 0) {
      parser.write(Buffer.from(chunk.subarray(0, length)))
      length = readSync(descriptor, chunk, 0, chunk.length, null)
    }
    parser.end()
  }
  finally {
    closeSync(descriptor)
  }
  await extractTar({
    file: archive,
    cwd: destination,
    strip,
    strict: true,
    filter: (_name, entry) => !('type' in entry) || entry.type !== 'SymbolicLink',
  })
  // 上游 PrimJS 的头文件软链接在提取后物化为文件，Windows 无需启用符号链接权限。
  for (const link of links) {
    const source = path.join(destination, ...link.target)
    if (!(await fs.lstat(source)).isFile()) {
      throw new Error(`归档链接目标不是普通文件: ${link.target.join('/')}`)
    }
    const file = path.join(destination, ...link.file)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.copyFile(source, file)
  }
}
