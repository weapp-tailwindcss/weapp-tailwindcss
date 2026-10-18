import type { DevelopmentImageSource, DevelopmentShot, DevelopmentVideoSource } from '../capture/manifest'
import { resolveManifestPath } from '../capture/manifest'
import { mediaDuration, probe } from './probe'

/** 与真实媒体头核对元数据，防止仅修改清单尺寸绕过可读性验收。 */
export async function verifyDevelopmentMedia(shots: DevelopmentShot[], manifestFile: string, inspect = probe) {
  const media = new Map<string, DevelopmentImageSource | DevelopmentVideoSource>()
  const add = (source: DevelopmentImageSource | DevelopmentVideoSource) => {
    const previous = media.get(source.path)
    if (previous && (previous.sha256 !== source.sha256 || previous.width !== source.width || previous.height !== source.height
      || ('durationSeconds' in previous ? previous.durationSeconds : undefined) !== ('durationSeconds' in source ? source.durationSeconds : undefined))) {
      throw new Error(`${source.path} 媒体元数据不一致。`)
    }
    media.set(source.path, source)
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
      }
    }
  }
  for (const source of media.values()) {
    const metadata = await inspect(resolveManifestPath(manifestFile, source.path))
    const visual = metadata.streams.find(stream => stream.codec_type === 'video')
    if (!visual || visual.width !== source.width || visual.height !== source.height) {
      throw new Error(`${source.path} 真实媒体尺寸与剪辑元数据不一致。`)
    }
    if ('durationSeconds' in source && Math.abs(mediaDuration(metadata, source.path) - source.durationSeconds) > 0.05) {
      throw new Error(`${source.path} 真实视频时长与剪辑元数据不一致。`)
    }
  }
}
