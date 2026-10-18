import type { CaptureManifest, FileDigest } from './manifest'
import path from 'node:path'

/** 仅在公开素材边界把文件系统路径转换为浏览器资源路径。 */
export function publicAssetPath(manifestFile: string, file: string, publicDir: string, paths: typeof path = path) {
  const relative = paths.relative(paths.resolve(publicDir), paths.resolve(paths.dirname(manifestFile), file))
  if (!relative || relative === '..' || relative.startsWith(`..${paths.sep}`) || paths.isAbsolute(relative)) {
    throw new Error(`开发镜头素材必须位于 public 目录：${file}`)
  }
  return relative.split(paths.sep).join('/')
}

export function developmentRenderMetadata(development: NonNullable<CaptureManifest['development']>, manifestFile: string, publicDir: string) {
  const metadata = structuredClone({ clips: development.clips, shots: development.shots })
  const convert = (media: FileDigest) => {
    media.path = publicAssetPath(manifestFile, media.path, publicDir)
  }
  for (const shot of metadata.shots ?? []) {
    if (shot.kind === 'video') {
      convert(shot.media)
      if (shot.preview) {
        convert(shot.preview.media)
        convert(shot.preview.sourceVideo)
      }
    }
    else {
      for (const screenshot of [shot.before, shot.after]) {
        convert(screenshot.media)
        convert(screenshot.sourceVideo)
      }
    }
  }
  return metadata
}
