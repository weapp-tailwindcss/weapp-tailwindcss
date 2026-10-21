import type { NativeManifestPublication, NativeStyleManifest } from '../types'
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { freezeSnapshot, parseManifestSnapshot } from '../manifest'
import { writeManifestFile } from './manifest-store'
import { virtualModuleCode } from './virtual-module'

export interface NativeManifestSnapshot {
  version: number
  manifest: NativeStyleManifest
  manifestJson: string
  virtualPath: string
  publication?: NativeManifestPublication
}

export function createManifestSnapshot(manifest: NativeStyleManifest, virtualPath: string, version: number): NativeManifestSnapshot {
  const manifestJson = JSON.stringify(manifest)
  const publication = version > 0
    ? {
        revision: randomUUID(),
        manifestSha256: createHash('sha256').update(manifestJson, 'utf8').digest('hex'),
      }
    : undefined
  return freezeSnapshot({ manifest: parseManifestSnapshot(manifestJson), manifestJson, virtualPath, version, ...(publication ? { publication } : {}) })
}

/** 三份产物共用一次序列化；最后的 ready 成功前不提交内存状态。 */
export function writeManifestSnapshot(paths: { manifestPath: string, manifestReadyPath: string }, snapshot: NativeManifestSnapshot) {
  fs.mkdirSync(path.dirname(snapshot.virtualPath), { recursive: true })
  fs.mkdirSync(path.dirname(paths.manifestPath), { recursive: true })
  writeManifestFile(snapshot.virtualPath, virtualModuleCode(snapshot.manifest, snapshot.publication, snapshot.manifestJson))
  writeManifestFile(paths.manifestPath, snapshot.manifestJson)
  if (snapshot.publication) {
    writeManifestFile(paths.manifestReadyPath, JSON.stringify({ ...snapshot.publication, version: snapshot.version, virtualPath: snapshot.virtualPath }))
  }
}
