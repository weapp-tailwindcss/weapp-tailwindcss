import type { NativeStyleManifest } from '../types'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import { setTimeout } from 'node:timers/promises'

interface PublishedSnapshot {
  manifest: NativeStyleManifest
  virtualPath?: string
}

/** 同目录替换，避免 Metro 或 worker 读到截断后的虚拟模块与 JSON。 */
export function writeManifestFile(filename: string, content: string) {
  const temporary = `${filename}.${randomUUID()}.tmp`
  try {
    fs.writeFileSync(temporary, content, 'utf8')
    fs.renameSync(temporary, filename)
  }
  finally {
    fs.rmSync(temporary, { force: true })
  }
}

/** ready 前后版本一致才接受产物；失败和超时不能降级成旧 manifest。 */
export async function readPublishedSnapshot(filename: string, readyPath: string | undefined): Promise<PublishedSnapshot | undefined> {
  if (!readyPath) {
    try {
      return { manifest: JSON.parse(await fs.promises.readFile(filename, 'utf8')) as NativeStyleManifest }
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined
      }
      throw error
    }
  }
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    try {
      const before = await fs.promises.readFile(readyPath, 'utf8')
      const content = await fs.promises.readFile(filename, 'utf8')
      const after = await fs.promises.readFile(readyPath, 'utf8')
      if (before === after) {
        let virtualPath: string | undefined
        if (before.startsWith('{')) {
          const publication = JSON.parse(before) as { error?: string, virtualPath?: string, revision?: string }
          if (publication.error) {
            throw new Error(publication.error)
          }
          if (!publication.revision || !publication.virtualPath) {
            throw new Error('React Native manifest 缺少发布身份')
          }
          virtualPath = publication.virtualPath
        }
        else if (!/^\d+\s*$/.test(before)) {
          throw new Error('React Native manifest 发布标识无效')
        }
        return { manifest: JSON.parse(content) as NativeStyleManifest, ...(virtualPath ? { virtualPath } : {}) }
      }
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
    await setTimeout(25)
  }
  throw new Error(`等待 React Native manifest 超时：${filename}`)
}

export async function readPublishedManifest(filename: string, readyPath: string | undefined) {
  return (await readPublishedSnapshot(filename, readyPath))?.manifest
}
