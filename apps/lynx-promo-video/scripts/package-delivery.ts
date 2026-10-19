import type { DevelopmentShot } from './capture/manifest'
import type { CaptureAssets } from './capture/assets'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants, createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { captureAssetIdentity } from './capture/assets'
import { appRoot as defaultAppRoot, repoRoot as defaultRepoRoot } from './paths'

interface Snapshot {
  root: string
  sha256: string
  files: Array<{ path: string, sha256: string }>
}
interface Bundle { path: string, sha256: string }
interface VerificationDigest { file: string, sha256: string, bytes?: number }
interface VerificationReport {
  status?: string
  captureManifest?: { file: string, sha256: string }
  media?: Record<'zh' | 'en', VerificationDigest>
  coversAndSubtitles?: VerificationDigest[]
  developmentRaw?: { file: string, sha256: string }
  provenance?: { finalSourceSha256?: string, finalBundleSha256?: string }
}
interface Manifest {
  version: number
  source: Snapshot
  platforms: Record<string, { rawVideo: string, video: string, cover: string, bundle: Bundle } & CaptureAssets>
  development: { rawVideo: string, video: string, events: Array<{ id: string, sourceSha256?: string, bundleSha256?: string, source: Snapshot, bundle: Bundle } & CaptureAssets>, shots?: DevelopmentShot[] }
  compatibility: { source: string, screenshot: string }
}

function inside(root: string, file: string, paths: typeof path = path) {
  const relative = paths.relative(root, file)
  return relative !== '..' && !relative.startsWith(`..${paths.sep}`) && !paths.isAbsolute(relative)
}

/** 保留仓库内位置；仓库外来源使用独立目录，兼容 Windows 不同盘符。 */
export function deliveryProjectPath(root: string, file: string, paths: typeof path = path) {
  const absolute = paths.resolve(file)
  return inside(paths.resolve(root), absolute, paths)
    ? paths.join('project', paths.relative(paths.resolve(root), absolute))
    : paths.join('project', 'external', createHash('sha256').update(absolute).digest('hex').slice(0, 16), paths.basename(absolute))
}

/** 清单和校验和中的路径是可迁移逻辑路径，统一使用斜杠。 */
function portable(file: string) {
  return file.split(path.sep).join('/')
}

async function digest(file: string) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) {
    hash.update(chunk)
  }
  return hash.digest('hex')
}

/** 报告中的路径是交付逻辑路径；先核对其形状，再映射到当前工作树的真实来源。 */
function logicalPath(file: string) {
  return file.replaceAll('\\', '/')
}

function requireLogicalReportPath(file: string, label: string) {
  const value = logicalPath(file)
  if (!value || value.startsWith('/') || /^[A-Za-z]:\//.test(value) || value.split('/').includes('..')) {
    throw new Error(`${label} 必须是安全的相对交付路径。`)
  }
  return value
}

async function verifyVerificationIdentity(report: VerificationReport, manifestFile: string, manifest: Manifest, appRoot: string, output: string) {
  if (!report.captureManifest?.file || !/^[a-f\d]{64}$/i.test(report.captureManifest.sha256)) {
    throw new Error('验收报告缺少 captureManifest.file/sha256，拒绝复用旧版 passed 报告。')
  }
  const reportedManifestPath = requireLogicalReportPath(report.captureManifest.file, 'captureManifest.file')
  if (!reportedManifestPath.endsWith('public/captures/manifest.json') && reportedManifestPath !== 'manifest.json') {
    throw new Error('captureManifest.file 必须指向 public/captures/manifest.json。')
  }
  if (await digest(manifestFile) !== report.captureManifest.sha256) {
    throw new Error('验收报告 captureManifest 摘要与当前录制清单不一致。')
  }
  if (!report.media?.zh || !report.media.en || !report.coversAndSubtitles || !report.developmentRaw) {
    throw new Error('验收报告缺少中英文媒体、封面字幕或开发原片摘要。')
  }
  const expectedMedia = {
    zh: 'lynx-promo-zh-1080p.mp4',
    en: 'lynx-promo-en-1080p.mp4',
  } as const
  for (const locale of ['zh', 'en'] as const) {
    const entry = report.media[locale]
    const reported = requireLogicalReportPath(entry.file, `media.${locale}.file`)
    if (reported !== `media/${expectedMedia[locale]}` && reported !== `out/${expectedMedia[locale]}` && reported !== expectedMedia[locale]) {
      throw new Error(`media.${locale}.file 必须绑定 ${expectedMedia[locale]}。`)
    }
    const file = path.join(output, expectedMedia[locale])
    if (await digest(file) !== entry.sha256) {
      throw new Error(`media.${locale} 摘要与当前成片不一致：${file}`)
    }
  }
  const expectedAuxiliary = [
    ['lynx-promo-cover-1920x1080.png', path.join(output, 'lynx-promo-cover-1920x1080.png')],
    ['lynx-promo-cover-en-1920x1080.png', path.join(output, 'lynx-promo-cover-en-1920x1080.png')],
    ['lynx-promo-zh.srt', path.join(appRoot, 'lynx-promo-zh.srt')],
    ['lynx-promo-zh.vtt', path.join(appRoot, 'lynx-promo-zh.vtt')],
    ['lynx-promo-en.srt', path.join(appRoot, 'lynx-promo-en.srt')],
    ['lynx-promo-en.vtt', path.join(appRoot, 'lynx-promo-en.vtt')],
  ] as const
  if (report.coversAndSubtitles.length !== expectedAuxiliary.length) {
    throw new Error('coversAndSubtitles 必须完整记录两张封面和四份字幕。')
  }
  const seenAuxiliary = new Set<string>()
  for (const entry of report.coversAndSubtitles) {
    const reported = requireLogicalReportPath(entry.file, 'coversAndSubtitles.file')
    const name = path.posix.basename(reported)
    const match = expectedAuxiliary.find(([expected]) => expected === name)
    if (!match || seenAuxiliary.has(name) || (reported !== `media/${name}` && reported !== `out/${name}` && reported !== name)) {
      throw new Error(`coversAndSubtitles.file 不是本轮唯一交付媒体：${entry.file}`)
    }
    seenAuxiliary.add(name)
    if (await digest(match[1]) !== entry.sha256) {
      throw new Error(`coversAndSubtitles 摘要与当前文件不一致：${match[1]}`)
    }
  }
  const rawReported = requireLogicalReportPath(report.developmentRaw.file, 'developmentRaw.file')
  if (!rawReported.startsWith('project/') && !rawReported.startsWith('raw/')) {
    throw new Error('developmentRaw.file 必须保留 project/ 或 raw/ 交付路径。')
  }
  const rawFile = path.resolve(path.dirname(manifestFile), manifest.development.rawVideo)
  if (path.posix.basename(rawReported) !== path.basename(rawFile) || await digest(rawFile) !== report.developmentRaw.sha256) {
    throw new Error('developmentRaw 摘要与当前完整桌面原片不一致。')
  }
  const finalEvent = manifest.development.events.find(event => event.id === 'color')
  if (!finalEvent || report.provenance?.finalSourceSha256 !== manifest.source.sha256 || report.provenance.finalBundleSha256 !== (finalEvent.bundleSha256 ?? finalEvent.bundle.sha256)) {
    throw new Error('验收报告 provenance 未绑定当前最终源码与 color bundle。')
  }
}

export async function packageDelivery(options: { appRoot?: string, repoRoot?: string, manifestFile?: string } = {}) {
  const appRoot = path.resolve(options.appRoot ?? defaultAppRoot)
  const repoRoot = path.resolve(options.repoRoot ?? defaultRepoRoot)
  const output = path.join(appRoot, 'out')
  const verificationFile = path.join(output, 'verification.json')
  const verification = JSON.parse(await fs.readFile(verificationFile, 'utf8')) as VerificationReport
  if (verification.status !== 'passed') {
    throw new Error('交付打包要求 out/verification.json 的 status 为 passed。')
  }
  const manifestFile = path.resolve(options.manifestFile ?? process.env.LYNX_PROMO_CAPTURE_MANIFEST ?? path.join(appRoot, 'public', 'captures', 'manifest.json'))
  const original = await fs.readFile(manifestFile, 'utf8')
  const manifest = JSON.parse(original) as Manifest
  if (manifest.version !== 1 || !manifest.source || !manifest.platforms?.ios || !manifest.platforms.android || !manifest.development || !manifest.compatibility) {
    throw new Error('交付打包要求完整的本轮双端、开发和兼容性素材清单。')
  }
  await verifyVerificationIdentity(verification, manifestFile, manifest, appRoot, output)
  const resolveInput = (file: string) => path.resolve(path.dirname(manifestFile), file)
  await fs.mkdir(output, { recursive: true })
  const delivery = await fs.mkdtemp(path.join(output, 'delivery-'))
  const packagedManifest = path.join(delivery, 'project', 'apps', 'lynx-promo-video', 'public', 'captures', 'manifest.json')
  const copied = new Map<string, string>()
  const externalRoots = new Map<string, string>()
  const excluded = new Set(['node_modules', '.git', '.tmp', '.cache', '.gradle', 'build', 'edit', 'review'])
  function targetFor(source: string) {
    for (const [root, target] of [...externalRoots].sort((a, b) => b[0].length - a[0].length)) {
      if (inside(root, source)) {
        return path.join(target, path.relative(root, source))
      }
    }
    return path.join(delivery, deliveryProjectPath(repoRoot, source))
  }
  function register(source: string) {
    const target = targetFor(source)
    if (!inside(repoRoot, source)) {
      externalRoots.set(source, target)
    }
    return target
  }
  async function copyFile(source: string, target = targetFor(source)) {
    if (copied.has(target)) {
      if (copied.get(target) !== source) {
        throw new Error(`交付路径冲突：${target}`)
      }
      return
    }
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.copyFile(source, target, constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE)
    copied.set(target, source)
  }
  async function copyTree(source: string) {
    if (inside(source, delivery)) {
      throw new Error(`交付输出目录不能包含在递归来源中：${source}`)
    }
    register(source)
    for (const entry of await fs.readdir(source, { withFileTypes: true })) {
      if (excluded.has(entry.name) || entry.name.startsWith('.tmp')) {
        continue
      }
      const file = path.join(source, entry.name)
      if (entry.isDirectory()) {
        await copyTree(file)
      }
      else if (entry.isFile()) {
        await copyFile(file)
      }
      else {
        throw new Error(`交付来源包含不受支持的链接或特殊文件：${file}`)
      }
    }
  }
  const relative = (file: string) => portable(path.relative(path.dirname(packagedManifest), targetFor(resolveInput(file))))
  async function copySnapshot(snapshot: Snapshot) {
    const root = resolveInput(snapshot.root)
    register(root)
    for (const file of snapshot.files) {
      const source = path.resolve(root, file.path)
      if (!inside(root, source) || await digest(source) !== file.sha256) {
        throw new Error(`源码归档摘要或路径无效：${source}`)
      }
      await copyFile(source)
    }
    snapshot.root = relative(snapshot.root)
  }
  async function copyBundle(bundle: Bundle) {
    const source = resolveInput(bundle.path)
    if (await digest(source) !== bundle.sha256) {
      throw new Error(`bundle 摘要不匹配：${source}`)
    }
    await copyFile(source)
    bundle.path = relative(bundle.path)
  }
  async function copyShotMedia(media: Bundle) {
    const source = resolveInput(media.path)
    if (await digest(source) !== media.sha256) {
      throw new Error(`镜头素材摘要不匹配：${source}`)
    }
    await copyFile(source)
    media.path = relative(media.path)
  }
  async function copyAssets(capture: CaptureAssets) {
    captureAssetIdentity(capture, manifestFile, '交付包')
    if (capture.assetsRoot) {
      register(resolveInput(capture.assetsRoot))
    }
    for (const asset of capture.assets ?? []) {
      await copyShotMedia(asset)
    }
    if (capture.assetsRoot) {
      capture.assetsRoot = relative(capture.assetsRoot)
    }
  }
  await copySnapshot(manifest.source)
  for (const capture of Object.values(manifest.platforms)) {
    await copyTree(path.dirname(resolveInput(capture.rawVideo)))
    for (const key of ['rawVideo', 'video', 'cover'] as const) {
      await copyFile(resolveInput(capture[key]))
      capture[key] = relative(capture[key])
    }
    await copyBundle(capture.bundle)
    await copyAssets(capture)
  }
  await copyTree(path.dirname(resolveInput(manifest.development.rawVideo)))
  for (const key of ['rawVideo', 'video'] as const) {
    await copyFile(resolveInput(manifest.development[key]))
    manifest.development[key] = relative(manifest.development[key])
  }
  for (const event of manifest.development.events) {
    if (!event.source || !event.bundle) {
      throw new Error('交付开发事件缺少阶段源码或 bundle。')
    }
    await copySnapshot(event.source)
    await copyBundle(event.bundle)
    await copyAssets(event)
  }
  for (const shot of manifest.development.shots ?? []) {
    if (shot.kind === 'video') {
      await copyShotMedia(shot.media)
      if (shot.preview) {
        await copyShotMedia(shot.preview.media)
        await copyShotMedia(shot.preview.sourceVideo)
      }
    }
    else {
      for (const screenshot of [shot.before, shot.after]) {
        await copyShotMedia(screenshot.media)
        await copyShotMedia(screenshot.sourceVideo)
      }
    }
  }
  const compatibilitySource = resolveInput(manifest.compatibility.source)
  await copyTree(path.dirname(compatibilitySource))
  await copyFile(resolveInput(manifest.compatibility.screenshot))
  manifest.compatibility.source = relative(manifest.compatibility.source)
  manifest.compatibility.screenshot = relative(manifest.compatibility.screenshot)
  for (const directory of ['src', 'scripts', path.join('public', 'audio'), path.join('public', 'brand')]) {
    await copyTree(path.join(appRoot, directory))
  }
  for (const name of ['package.json', 'tsconfig.json', 'vitest.config.ts', 'remotion.config.ts', 'README.md']) {
    await copyFile(path.join(appRoot, name))
  }
  for (const name of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) {
    await copyFile(path.join(repoRoot, name))
  }
  await copyFile(path.join(repoRoot, 'examples', 'react-lynx', 'src', 'compatibility', 'baseline.json'))
  const media = ['lynx-promo-zh-1080p.mp4', 'lynx-promo-en-1080p.mp4', 'lynx-promo-cover-1920x1080.png', 'lynx-promo-cover-en-1920x1080.png']
  for (const name of media) {
    await copyFile(path.join(output, name), path.join(delivery, 'media', name))
  }
  for (const locale of ['zh', 'en']) {
    for (const extension of ['srt', 'vtt']) {
      const name = `lynx-promo-${locale}.${extension}`
      await copyFile(path.join(appRoot, name), path.join(delivery, 'media', name))
    }
  }
  await copyFile(verificationFile, path.join(delivery, 'verification.json'))
  await fs.mkdir(path.dirname(packagedManifest), { recursive: true })
  await fs.writeFile(packagedManifest, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' })
  const provenanceManifest = path.join(delivery, 'provenance-original-manifest.json')
  await fs.writeFile(provenanceManifest, original, { flag: 'wx' })
  if (await digest(provenanceManifest) !== verification.captureManifest!.sha256) {
    throw new Error('交付包 provenance-original-manifest.json 与验收报告 captureManifest 不一致。')
  }
  let revision = '未取得 Git 提交；请使用原仓库与包内锁文件核对。'
  try {
    revision = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  }
  catch {}
  await fs.writeFile(path.join(delivery, 'README.md'), `# Lynx 宣传片交付包\n\nmedia/ 保存中英文成片、封面和 SRT/VTT。verification.json 为最终验收记录，SHA256SUMS 覆盖除其自身以外的所有交付文件。\n\n完整开发原片、EDL、三阶段源码与原生截图、双端原始证据保留在 project/ 的原目录结构中，排除 edit/review 重复素材及构建缓存。主清单位于 project/apps/lynx-promo-video/public/captures/manifest.json，所有活跃素材路径均相对清单解析；仓库外来源迁至 project/external/。provenance-original-manifest.json 和原始证据中的历史绝对路径原样保留，用于追溯。\n\n复现参考提交：${revision}。使用原仓库对应源码与包内 pnpm-lock.yaml 安装 Node/pnpm 依赖，再把 project/ 内容复制到独立 checkout；按视频工程 README 执行 assets、typecheck、verify 和 render:zh/render:en。包内保存视频工程 src/scripts/package、Demo 实际源码和配置，不包含完整库工程或 node_modules。\n\n兼容性数量来自包内已提交 baseline.json 的历史双端结论；当前截图来源在可迁移清单 compatibility.source 中明示，不代表本轮重验全部兼容性用例。\n`, { flag: 'wx' })
  const entries: string[] = []
  async function checksumTree(directory: string) {
    for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        await checksumTree(file)
      }
      else {
        entries.push(`${await digest(file)}  ${portable(path.relative(delivery, file))}`)
      }
    }
  }
  await checksumTree(delivery)
  await fs.writeFile(path.join(delivery, 'SHA256SUMS'), `${entries.join('\n')}\n`, { flag: 'wx' })
  return { directory: delivery, files: entries.length, manifest: packagedManifest }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  packageDelivery().then(result => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
    process.exitCode = 1
  })
}
