import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { deliveryProjectPath, packageDelivery } from '../scripts/package-delivery'
import { developmentFixture } from './test-fixtures/development'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

const hash = (content: string | Uint8Array) => createHash('sha256').update(content).digest('hex')

describe('可迁移交付包', () => {
  it('保留 POSIX 根目录、相对来源和 Windows 盘符内的位置', () => {
    expect(deliveryProjectPath('/repo', '/repo/apps/video', path.posix)).toBe('project/apps/video')
    expect(deliveryProjectPath('/', '/apps/video', path.posix)).toBe('project/apps/video')
    expect(deliveryProjectPath('C:\\repo', 'C:\\repo\\apps\\video', path.win32)).toBe('project\\apps\\video')
    expect(deliveryProjectPath(path.resolve('repo'), path.resolve('repo', 'apps'))).toBe(path.join('project', 'apps'))
  })

  it('仓库外目录和 Windows 其他盘符不会逃逸交付根目录', () => {
    const posix = deliveryProjectPath('/repo', '/other/raw.mov', path.posix)
    const windows = deliveryProjectPath('C:\\repo', 'D:\\recording\\raw.mov', path.win32)
    expect(posix).toMatch(/^project\/external\/[a-f0-9]{16}\/raw.mov$/)
    expect(windows).toMatch(/^project\\external\\[a-f0-9]{16}\\raw.mov$/)
    expect(deliveryProjectPath('/repo', '/repository/raw.mov', path.posix)).toMatch(/^project\/external\//)
  })

  it('验证记录缺失或未通过时拒绝创建交付目录', async () => {
    const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx-delivery-gate-'))
    directories.push(repoRoot)
    const appRoot = path.join(repoRoot, 'apps', 'lynx-promo-video')
    await expect(packageDelivery({ appRoot, repoRoot })).rejects.toMatchObject({ code: 'ENOENT' })
    await fs.mkdir(path.join(appRoot, 'out'), { recursive: true })
    await fs.writeFile(path.join(appRoot, 'out', 'verification.json'), '{"status":"pending"}')
    await expect(packageDelivery({ appRoot, repoRoot })).rejects.toThrow('status 为 passed')
    expect(await fs.readdir(path.join(appRoot, 'out'))).toEqual(['verification.json'])
  })

  it('小型真实文件清单迁移后所有引用可解析、原片保留且校验和覆盖交付内容', async () => {
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx-delivery-copy-'))
    directories.push(temporary)
    const repoRoot = path.join(temporary, 'repository')
    const appRoot = path.join(repoRoot, 'apps', 'lynx-promo-video')
    const captureRoot = path.join(appRoot, 'public', 'captures')
    const manifestFile = path.join(captureRoot, 'manifest.json')
    const relative = (file: string) => path.relative(captureRoot, file)
    async function file(target: string, content = 'fixture') {
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, content)
      return target
    }
    async function snapshot(root: string) {
      await file(path.join(root, 'src', 'App.tsx'), 'source')
      const files = [{ path: path.join('src', 'App.tsx'), sha256: hash('source') }]
      return { root: relative(root), sha256: hash(JSON.stringify(files)), files }
    }
    async function bundle(root: string) {
      return { path: relative(await file(path.join(root, 'main.lynx.bundle'), 'bundle')), sha256: hash('bundle') }
    }
    async function assets(root: string) {
      const assetsRoot = path.join(root, 'capture-assets')
      return {
        assetsRoot: relative(assetsRoot),
        assets: [{ path: relative(await file(path.join(assetsRoot, 'static', 'avatar.jpg'), 'local JPEG fixture')), sha256: hash('local JPEG fixture') }],
      }
    }
    const source = await snapshot(path.join(repoRoot, 'examples', 'react-lynx-promo'))
    const platforms: Record<string, unknown> = {}
    for (const platform of ['ios', 'android']) {
      const raw = path.join(appRoot, '.capture', platform, 'raw')
      platforms[platform] = {
        rawVideo: relative(await file(path.join(raw, 'raw.mp4'))),
        video: relative(await file(path.join(captureRoot, `${platform}.mp4`))),
        cover: relative(await file(path.join(captureRoot, `${platform}-cover.png`))),
        bundle: await bundle(raw),
        ...await assets(raw),
      }
      await file(path.join(raw, 'device.json'))
    }
    const development = path.join(appRoot, '.capture', 'development')
    const events = []
    for (const stage of ['initial', 'spacing', 'color']) {
      const root = path.join(development, 'stages', stage)
      events.push({ id: stage, source: await snapshot(root), bundle: await bundle(root), ...await assets(root) })
      await file(path.join(development, `${stage}-native`, 'screen.png'))
    }
    for (const excluded of ['edit', 'review', '.tmp-build']) {
      await file(path.join(development, excluded, 'duplicate.mp4'))
    }
    await file(path.join(development, 'edit-decision-list.json'), '{}')
    const external = await file(path.join(temporary, 'external-capture', 'screen.png'), 'compatibility')
    const manifest = {
      version: 1,
      source,
      platforms,
      development: { rawVideo: relative(await file(path.join(development, 'development-raw.mov'))), video: relative(await file(path.join(captureRoot, 'development.mp4'))), events, shots: developmentFixture().shots },
      compatibility: { source: external, screenshot: relative(await file(path.join(captureRoot, 'compatibility-lab.png'), 'compatibility')) },
    }
    for (const shot of manifest.development.shots) {
      const sources = shot.kind === 'video'
        ? [shot.media, ...(shot.preview ? [shot.preview.media, shot.preview.sourceVideo] : [])]
        : [shot.before.media, shot.before.sourceVideo, shot.after.media, shot.after.sourceVideo]
      for (const source of sources) {
        const target = path.resolve(captureRoot, source.path)
        if (!await fs.stat(target).catch(() => undefined)) {
          await file(target, `shot fixture: ${source.path}`)
        }
        source.sha256 = hash(await fs.readFile(target))
      }
    }
    await file(manifestFile, JSON.stringify(manifest))
    for (const name of ['src', 'scripts', path.join('public', 'audio'), path.join('public', 'brand')]) {
      await file(path.join(appRoot, name, 'asset.txt'))
    }
    await file(path.join(appRoot, 'src', 'assets', 'fonts', 'OFL-Noto-Sans-SC.txt'))
    for (const name of ['package.json', 'tsconfig.json', 'vitest.config.ts', 'remotion.config.ts', 'README.md']) {
      await file(path.join(appRoot, name))
    }
    for (const name of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) {
      await file(path.join(repoRoot, name))
    }
    await file(path.join(repoRoot, 'examples', 'react-lynx', 'src', 'compatibility', 'baseline.json'), '{}')
    for (const name of ['lynx-promo-zh-1080p.mp4', 'lynx-promo-en-1080p.mp4', 'lynx-promo-cover-1920x1080.png', 'lynx-promo-cover-en-1920x1080.png']) {
      await file(path.join(appRoot, 'out', name))
    }
    for (const locale of ['zh', 'en']) {
      for (const extension of ['srt', 'vtt']) {
        await file(path.join(appRoot, `lynx-promo-${locale}.${extension}`))
      }
    }
    await file(path.join(appRoot, 'out', 'verification.json'), '{"status":"passed"}')
    const result = await packageDelivery({ appRoot, repoRoot })
    const relocated = JSON.parse(await fs.readFile(result.manifest, 'utf8'))
    const resolve = (input: string) => path.resolve(path.dirname(result.manifest), input)
    expect(path.isAbsolute(relocated.compatibility.source)).toBe(false)
    expect(await fs.readFile(resolve(relocated.compatibility.source), 'utf8')).toBe('compatibility')
    expect(await fs.readFile(path.join(result.directory, 'provenance-original-manifest.json'), 'utf8')).toBe(JSON.stringify(manifest))
    expect(await fs.readFile(manifestFile, 'utf8')).toBe(JSON.stringify(manifest))
    for (const capture of Object.values(relocated.platforms) as Array<{ rawVideo: string, video: string, cover: string, bundle: { path: string } }>) {
      for (const input of [capture.rawVideo, capture.video, capture.cover, capture.bundle.path]) {
        expect((await fs.stat(resolve(input))).isFile()).toBe(true)
      }
    }
    for (const event of relocated.development.events) {
      expect(await digestSnapshot(event.source, resolve)).toBe('source')
    }
    for (const capture of [...Object.values(relocated.platforms), ...relocated.development.events] as Array<{ assetsRoot: string, assets: Array<{ path: string, sha256: string }> }>) {
      expect(path.isAbsolute(capture.assetsRoot)).toBe(false)
      for (const asset of capture.assets) {
        expect(path.isAbsolute(asset.path)).toBe(false)
        expect(path.relative(resolve(capture.assetsRoot), resolve(asset.path))).toBe(path.join('static', 'avatar.jpg'))
        expect(hash(await fs.readFile(resolve(asset.path)))).toBe(asset.sha256)
      }
    }
    for (const shot of relocated.development.shots) {
      const sources = shot.kind === 'video'
        ? [shot.media, ...(shot.preview ? [shot.preview.media, shot.preview.sourceVideo] : [])]
        : [shot.before.media, shot.before.sourceVideo, shot.after.media, shot.after.sourceVideo]
      for (const source of sources) {
        expect(path.isAbsolute(source.path)).toBe(false)
        expect(hash(await fs.readFile(resolve(source.path)))).toBe(source.sha256)
      }
    }
    const rawDirectory = path.dirname(resolve(relocated.development.rawVideo))
    expect(await fs.readdir(rawDirectory)).toEqual(expect.arrayContaining(['development-raw.mov', 'edit-decision-list.json', 'initial-native', 'spacing-native', 'color-native']))
    for (const excluded of ['edit', 'review', '.tmp-build']) {
      expect(await fs.readdir(rawDirectory)).not.toContain(excluded)
    }
    const sums = (await fs.readFile(path.join(result.directory, 'SHA256SUMS'), 'utf8')).trim().split('\n')
    expect(sums.some(line => line.endsWith('  README.md'))).toBe(true)
    expect(sums).toHaveLength(result.files)
    for (const line of sums) {
      const [expected, name] = line.split('  ')
      expect(hash(await fs.readFile(path.resolve(result.directory, name)))).toBe(expected)
    }
    const originalAssets = manifest.development.events[0].assets
    await fs.writeFile(path.resolve(captureRoot, originalAssets[0].path), 'tampered image fixture')
    await expect(packageDelivery({ appRoot, repoRoot })).rejects.toThrow('镜头素材摘要不匹配')
  })
})

async function digestSnapshot(snapshot: { root: string }, resolve: (input: string) => string) {
  return fs.readFile(path.join(resolve(snapshot.root), 'src', 'App.tsx'), 'utf8')
}
