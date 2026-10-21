import type { NativeManifestPublication, NativeStyleManifest } from '../types'
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import { setTimeout } from 'node:timers/promises'
import { copyPublication, freezeSnapshot, parseManifestSnapshot } from '../runtime/manifest'

export interface PublishedSnapshot {
  manifest: NativeStyleManifest
  virtualPath?: string
  publication?: NativeManifestPublication
  manifestJson?: string
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
      const manifestJson = await fs.promises.readFile(filename, 'utf8')
      return freezeSnapshot({ manifest: parseManifestSnapshot(manifestJson), manifestJson })
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
      const ready = JSON.parse(before) as { error?: string, virtualPath?: string, revision?: string, manifestSha256?: string }
      if (ready?.error) {
        if (before !== await fs.promises.readFile(readyPath, 'utf8')) {
          continue
        }
        throw new Error(ready.error)
      }
      if (!ready || typeof ready.virtualPath !== 'string' || !ready.virtualPath || !ready.revision || !ready.manifestSha256) {
        throw new Error('React Native manifest 缺少发布身份')
      }
      const publication = copyPublication({ revision: ready.revision, manifestSha256: ready.manifestSha256 })!
      const content = await fs.promises.readFile(filename, 'utf8')
      const after = await fs.promises.readFile(readyPath, 'utf8')
      if (before === after) {
        if (createHash('sha256').update(content, 'utf8').digest('hex') !== publication.manifestSha256) {
          throw new Error('React Native manifest 字节摘要不匹配')
        }
        return freezeSnapshot({ manifest: parseManifestSnapshot(content), manifestJson: content, virtualPath: ready.virtualPath, publication })
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
