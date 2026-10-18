import type { CaptureManifest } from './manifest'
import fs from 'node:fs/promises'
import path from 'node:path'
import { resolveManifestPath, sha256 } from './manifest'

async function requireFile(file: string) {
  const stat = await fs.stat(file).catch(() => undefined)
  if (!stat?.isFile() || stat.size === 0) {
    throw new Error(`缺少必需录制素材：${file}`)
  }
}

function requireDigest(value: string, name: string) {
  if (!/^[a-f\d]{64}$/i.test(value)) {
    throw new Error(`${name} 必须是 SHA256 摘要。`)
  }
}

export async function assertCaptureInputs(manifest: CaptureManifest, manifestFile: string, captureDir: string) {
  requireDigest(manifest.source.sha256, 'source.sha256')
  if (manifest.source.files.length === 0) {
    throw new Error('录制清单必须记录真实源码文件摘要。')
  }
  if (sha256(JSON.stringify(manifest.source.files)) !== manifest.source.sha256) {
    throw new Error('录制清单源码总摘要与文件清单不一致。')
  }
  const sourceRoot = resolveManifestPath(manifestFile, manifest.source.root)
  for (const file of manifest.source.files) {
    requireDigest(file.sha256, file.path)
    const absolute = path.resolve(sourceRoot, file.path)
    if (sha256(await fs.readFile(absolute)) !== file.sha256) {
      throw new Error(`当前源码与录制摘要不一致：${absolute}`)
    }
  }
  for (const platform of ['ios', 'android'] as const) {
    const native = manifest.platforms[platform]
    if (!native?.device || !native.runtime?.trim()) {
      throw new Error(`缺少 ${platform} 设备与运行来源。`)
    }
    if (native.sourceSha256 !== manifest.source.sha256) {
      throw new Error(`${platform} 录屏未绑定当前源码版本，请重新录制。`)
    }
    requireDigest(native.bundle.sha256, `${platform}.bundle.sha256`)
    const bundle = resolveManifestPath(manifestFile, native.bundle.path)
    if (sha256(await fs.readFile(bundle)) !== native.bundle.sha256) {
      throw new Error(`${platform} bundle 与录制摘要不一致：${bundle}`)
    }
    for (const file of [native.video, native.rawVideo, native.cover]) {
      await requireFile(resolveManifestPath(manifestFile, file))
    }
    if (resolveManifestPath(manifestFile, native.video) !== path.join(captureDir, `${platform}.mp4`)) {
      throw new Error(`${platform} 清单必须绑定当前公开素材。`)
    }
  }
  if (!manifest.development || manifest.development.events.length === 0 || manifest.development.clips.length === 0) {
    throw new Error('缺少真实开发录屏与操作时间区间。')
  }
  for (const event of manifest.development.events) {
    requireDigest(event.sourceSha256, `${event.id}.sourceSha256`)
    requireDigest(event.bundleSha256, `${event.id}.bundleSha256`)
  }
  for (const file of [manifest.development.video, manifest.development.rawVideo]) {
    await requireFile(resolveManifestPath(manifestFile, file))
  }
  if (resolveManifestPath(manifestFile, manifest.development.video) !== path.join(captureDir, 'development.mp4')) {
    throw new Error('开发录屏清单必须绑定当前 development.mp4。')
  }
}

export async function compatibilityScreenshot(manifest: CaptureManifest, manifestFile: string, explicitFile?: string) {
  const file = explicitFile
    ? path.resolve(explicitFile)
    : manifest.compatibility?.screenshot
      ? resolveManifestPath(manifestFile, manifest.compatibility.screenshot)
      : undefined
  if (!file) {
    throw new Error('缺少兼容性截图；请设置 LYNX_PROMO_COMPATIBILITY_SCREENSHOT 或绑定 manifest.compatibility。')
  }
  await requireFile(file)
  return file
}
