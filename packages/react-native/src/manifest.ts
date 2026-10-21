import type { NativeManifestPublication, NativeStyleManifest } from './types'

/** 只冻结当前快照拥有的数据，不冻结调用方传入的对象。 */
export function freezeSnapshot<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) {
      freezeSnapshot(child)
    }
    Object.freeze(value)
  }
  return value
}

export function parseManifestSnapshot(json: string): NativeStyleManifest {
  return freezeSnapshot(JSON.parse(json) as NativeStyleManifest)
}

export function copyManifestSnapshot(manifest: NativeStyleManifest) {
  return parseManifestSnapshot(JSON.stringify(manifest))
}

export function copyPublication(publication: NativeManifestPublication | undefined) {
  if (!publication) {
    return undefined
  }
  if (typeof publication.revision !== 'string' || !publication.revision.trim()
    || typeof publication.manifestSha256 !== 'string' || !/^[a-f\d]{64}$/.test(publication.manifestSha256)) {
    throw new Error('React Native manifest 发布身份无效')
  }
  return Object.freeze({ revision: publication.revision, manifestSha256: publication.manifestSha256 })
}
