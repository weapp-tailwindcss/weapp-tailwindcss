import type { CaptureManifest, FileDigest, SourceSnapshot } from './manifest'
import fs from 'node:fs/promises'
import path from 'node:path'
import { assertCaptureAssets, captureAssetIdentity } from './assets'
import { assertDevelopmentShotArtifacts } from './development-artifacts'
import { resolveManifestPath, sha256, snapshotSources } from './manifest'

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

async function assertSourceSnapshot(source: SourceSnapshot, manifestFile: string, label: string) {
  requireDigest(source.sha256, `${label}.sha256`)
  if (source.files.length === 0) {
    throw new Error('录制清单必须记录真实源码文件摘要。')
  }
  if (sha256(JSON.stringify(source.files)) !== source.sha256) {
    throw new Error('录制清单源码总摘要与文件清单不一致。')
  }
  for (const file of source.files) {
    requireDigest(file.sha256, file.path)
  }
  const sourceRoot = resolveManifestPath(manifestFile, source.root)
  const current = await snapshotSources(sourceRoot).catch((cause: unknown) => {
    throw new Error(`${label} 源码文件集与录制摘要不一致：${sourceRoot}`, { cause })
  })
  if (JSON.stringify(current.files.map(file => file.path)) !== JSON.stringify(source.files.map(file => file.path))) {
    throw new Error(`${label} 源码文件集与录制摘要不一致：${sourceRoot}`)
  }
  if (current.sha256 !== source.sha256) {
    throw new Error(`${label} 当前源码与录制摘要不一致：${sourceRoot}`)
  }
}

async function assertBundle(bundle: FileDigest, manifestFile: string, label: string) {
  requireDigest(bundle.sha256, `${label}.bundle.sha256`)
  const file = resolveManifestPath(manifestFile, bundle.path)
  if (sha256(await fs.readFile(file)) !== bundle.sha256) {
    throw new Error(`${label} bundle 与录制摘要不一致：${file}`)
  }
}

export async function assertDevelopmentArtifacts(manifest: CaptureManifest, manifestFile: string) {
  const events = manifest.development?.events
  if (!events?.length) {
    throw new Error('缺少真实开发录屏与操作时间区间。')
  }
  for (const event of events) {
    requireDigest(event.sourceSha256, `${event.id}.sourceSha256`)
    requireDigest(event.bundleSha256, `${event.id}.bundleSha256`)
    if (!event.source || !event.bundle) {
      throw new Error(`${event.id} 缺少阶段源码与 bundle 归档。`)
    }
    if (event.source.sha256 !== event.sourceSha256 || event.bundle.sha256 !== event.bundleSha256) {
      throw new Error(`${event.id} 阶段归档与操作摘要不一致。`)
    }
    await assertSourceSnapshot(event.source, manifestFile, event.id)
    await assertBundle(event.bundle, manifestFile, event.id)
    await assertCaptureAssets(event, manifestFile, event.id)
  }
  const spacing = events.find(event => event.id === 'spacing')
  const color = events.find(event => event.id === 'color')
  if (!spacing || !color) {
    throw new Error('开发录屏必须包含 spacing 与 color 两次真实修改。')
  }
  if (spacing.sourceSha256 === color.sourceSha256 || spacing.bundleSha256 === color.bundleSha256) {
    throw new Error('spacing 与 color 必须绑定不同的源码及 bundle。')
  }
  if (manifest.development?.shots) {
    const initial = events.find(event => event.id === 'initial')
    if (!initial || new Set([initial, spacing, color].map(event => event.sourceSha256)).size !== 3
      || new Set([initial, spacing, color].map(event => event.bundleSha256)).size !== 3) {
      throw new Error('新开发镜头必须归档 initial、spacing、color 三阶段独立源码与 bundle。')
    }
    await assertDevelopmentShotArtifacts(manifest.development.shots, manifestFile)
  }
  if (color.sourceSha256 !== manifest.source.sha256
    || (['ios', 'android'] as const).some(platform => manifest.platforms[platform]?.bundle.sha256 !== color.bundleSha256)) {
    throw new Error('color 最终源码与双端 bundle 必须对应同一录制版本。')
  }
  const finalAssets = captureAssetIdentity(color, manifestFile, 'color')
  for (const platform of ['ios', 'android'] as const) {
    const native = manifest.platforms[platform]!
    const nativeAssets = captureAssetIdentity(native, manifestFile, platform)
    if (JSON.stringify(nativeAssets) !== JSON.stringify(finalAssets)) {
      throw new Error(`color 最终资源与 ${platform} 原生资源清单必须对应同一录制版本。`)
    }
  }
}

export async function assertCaptureInputs(manifest: CaptureManifest, manifestFile: string, captureDir: string) {
  await assertSourceSnapshot(manifest.source, manifestFile, '当前工程')
  for (const platform of ['ios', 'android'] as const) {
    const native = manifest.platforms[platform]
    if (!native?.device || !native.runtime?.trim()) {
      throw new Error(`缺少 ${platform} 设备与运行来源。`)
    }
    if (native.sourceSha256 !== manifest.source.sha256) {
      throw new Error(`${platform} 录屏未绑定当前源码版本，请重新录制。`)
    }
    await assertBundle(native.bundle, manifestFile, platform)
    await assertCaptureAssets(native, manifestFile, platform)
    for (const file of [native.video, native.rawVideo, native.cover]) {
      await requireFile(resolveManifestPath(manifestFile, file))
    }
    if (resolveManifestPath(manifestFile, native.video) !== path.join(captureDir, `${platform}.mp4`)) {
      throw new Error(`${platform} 清单必须绑定当前公开素材。`)
    }
  }
  if (!manifest.development || manifest.development.events.length === 0 || (manifest.development.clips.length === 0 && !manifest.development.shots?.length)) {
    throw new Error('缺少真实开发录屏与操作时间区间。')
  }
  await assertDevelopmentArtifacts(manifest, manifestFile)
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
