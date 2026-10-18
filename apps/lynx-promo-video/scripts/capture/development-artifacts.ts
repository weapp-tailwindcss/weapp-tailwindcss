import type { DevelopmentShot, DevelopmentStage, FileDigest } from './manifest'
import fs from 'node:fs/promises'
import { resolveManifestPath, sha256 } from './manifest'

/** 每个展示来源均保留摘要；截图停留不替代阶段源码和 bundle 证据。 */
export async function assertDevelopmentShotArtifacts(shots: DevelopmentShot[], manifestFile: string) {
  const files = new Map<string, string>()
  const screenshots = new Map<DevelopmentStage, FileDigest>()
  const add = (file: FileDigest) => {
    if (!/^[a-f\d]{64}$/i.test(file.sha256) || !file.path || (files.has(file.path) && files.get(file.path) !== file.sha256)) {
      throw new Error(`${file.path} 镜头素材缺少有效且一致的 SHA256。`)
    }
    files.set(file.path, file.sha256)
  }
  for (const shot of shots) {
    if (shot.kind === 'video') {
      add(shot.media)
      if (shot.preview) {
        add(shot.preview.media)
        add(shot.preview.sourceVideo)
      }
    }
    else {
      for (const screenshot of [shot.before, shot.after]) {
        add(screenshot.media)
        add(screenshot.sourceVideo)
        const previous = screenshots.get(screenshot.stage)
        if (previous && (previous.path !== screenshot.media.path || previous.sha256 !== screenshot.media.sha256)) {
          throw new Error(`${screenshot.stage} 前后对比必须复用同一张阶段截图。`)
        }
        screenshots.set(screenshot.stage, screenshot.media)
      }
    }
  }
  for (const [file, digest] of files) {
    if (sha256(await fs.readFile(resolveManifestPath(manifestFile, file))) !== digest) {
      throw new Error(`${file} 镜头素材与录制摘要不一致。`)
    }
  }
}
