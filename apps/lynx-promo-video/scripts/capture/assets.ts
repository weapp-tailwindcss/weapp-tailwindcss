import type { FileDigest } from './manifest'
import fs from 'node:fs/promises'
import path from 'node:path'
import { resolveManifestPath, sha256 } from './manifest'

export interface CaptureAssets {
  assetsRoot?: string
  assets?: FileDigest[]
}

/** 资源身份由显式根目录内的位置和摘要共同决定，不能只比较同名图片。 */
export function captureAssetIdentity(capture: CaptureAssets, manifestFile: string, label: string, paths: typeof path = path) {
  if (capture.assets === undefined) {
    return undefined
  }
  if (!Array.isArray(capture.assets) || (capture.assets.length > 0 && !capture.assetsRoot)) {
    throw new Error(`${label} 原生资源清单必须记录 assetsRoot。`)
  }
  const root = capture.assetsRoot ? resolveManifestPath(manifestFile, capture.assetsRoot, paths) : paths.dirname(manifestFile)
  const names = new Set<string>()
  return capture.assets.map((asset) => {
    const file = resolveManifestPath(manifestFile, asset.path, paths)
    const relative = paths.relative(root, file)
    if (!relative || relative === '..' || relative.startsWith(`..${paths.sep}`) || paths.isAbsolute(relative)) {
      throw new Error(`${label} 资源路径逃逸 assetsRoot：${asset.path}`)
    }
    if (names.has(relative) || !/^[a-f\d]{64}$/i.test(asset.sha256)) {
      throw new Error(`${label} 资源名称重复或 SHA256 无效：${asset.path}`)
    }
    names.add(relative)
    return { path: relative.split(paths.sep).join('/'), sha256: asset.sha256 }
  }).sort((a, b) => a.path.localeCompare(b.path, 'en'))
}

export async function assertCaptureAssets(capture: CaptureAssets, manifestFile: string, label: string) {
  captureAssetIdentity(capture, manifestFile, label)
  for (const asset of capture.assets ?? []) {
    const file = resolveManifestPath(manifestFile, asset.path)
    const data = await fs.readFile(file).catch((cause: unknown) => {
      throw new Error(`${label} 缺少原生资源文件：${file}`, { cause })
    })
    if (sha256(data) !== asset.sha256) {
      throw new Error(`${label} 原生资源与录制摘要不一致：${file}`)
    }
  }
}
