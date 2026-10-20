import type { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { lstat, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { PNG } from 'pngjs'

export const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')

/** 清单路径是跨平台逻辑路径；只在本边界转换为文件系统路径。 */
export function manifestFile(root: string, name: string) {
  if (!name || path.posix.isAbsolute(name) || path.win32.isAbsolute(name) || name.includes('\\') || name.includes(':') || name.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error(`不安全的基线路径：${name}`)
  }
  return path.join(root, ...name.split('/'))
}

export async function regularBytes(file: string) {
  if (!(await lstat(file)).isFile()) {
    throw new Error(`基线仅接受普通文件：${file}`)
  }
  return readFile(file)
}

export async function regularDirectory(directory: string) {
  if (!(await lstat(directory)).isDirectory()) {
    throw new Error(`基线目录不能是链接或特殊文件：${directory}`)
  }
}

export async function treeFiles(root: string, prefix = ''): Promise<string[]> {
  await regularDirectory(root)
  const result: string[] = []
  for (const entry of await readdir(prefix ? manifestFile(root, prefix) : root, { withFileTypes: true })) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name
    manifestFile(root, name)
    if (entry.isDirectory()) {
      result.push(...await treeFiles(root, name))
    }
    else if (entry.isFile()) {
      result.push(name)
    }
    else {
      throw new Error(`基线树包含链接或特殊文件：${name}`)
    }
  }
  return result.sort()
}

export async function filesDigest(root: string, names: string[]) {
  const entries = await Promise.all([...names].sort().map(async name => [name, digest(await regularBytes(manifestFile(root, name)))]))
  return digest(JSON.stringify(entries))
}

export async function pngRecord(root: string, name: string) {
  const bytes = await regularBytes(manifestFile(root, name))
  const png = PNG.sync.read(bytes, { checkCRC: true })
  return { file: name, bytes: bytes.length, sha256: digest(bytes), width: png.width, height: png.height }
}

export function exactNames(actual: string[], expected: string[]) {
  if (new Set(expected.map(name => name.toLowerCase())).size !== expected.length || JSON.stringify([...actual].sort()) !== JSON.stringify([...expected].sort())) {
    throw new Error('基线文件集合缺失、多余、重复或存在大小写碰撞')
  }
}
