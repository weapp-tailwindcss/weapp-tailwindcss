import { Buffer } from 'node:buffer'
import { cp, mkdir, readdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { digest, manifestFile } from './files'
import { candidateImages, installCandidates, installedDirectory, reviewCandidates, verifyInstalledBaselines } from './install'
import { readBaselineManifest } from './manifest'
import { snapshotBindings } from './report'
import { baselineFixture, environment } from './test-support'

vi.mock('./identity', async original => ({ ...await original<object>(), renderEnvironment: async () => environment }))
vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>()
  return { ...actual, rename: vi.fn(actual.rename) }
})
const roots: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
async function fixture() {
  const result = await baselineFixture()
  roots.push(result.root)
  return result
}

it.each(['../escape.png', '/absolute.png', 'C:\\temp\\escape.png', 'C:/escape.png', 'folder\\escape.png', '//host/share', 'a/../escape.png', './x.png'])('拒绝跨平台路径逃逸：%s', (name) => {
  expect(() => manifestFile('root', name)).toThrow('不安全')
})

it('真实报告按附件绑定匿名路径，拒绝缺项、额外项、失败、意外跳过、重试和重复附件', async () => {
  const { report, directory, cases } = await fixture()
  const root = path.join(directory, 'snapshots')
  expect(snapshotBindings(report, root, cases)).toHaveLength(4)
  for (const change of [
    (r: typeof report) => r.suites[0]!.specs.pop(),
    (r: typeof report) => r.suites[0]!.specs.push(r.suites[0]!.specs[0]!),
    (r: typeof report) => { r.suites[0]!.specs[0]!.tests[0]!.results[0]!.status = 'failed' },
    (r: typeof report) => { r.suites[0]!.specs[0]!.tests[0]!.results[0]!.status = 'skipped' },
    (r: typeof report) => { r.suites[0]!.specs[0]!.tests[0]!.results[0]!.retry = 1 },
    (r: typeof report) => r.suites[0]!.specs[0]!.tests[0]!.results[0]!.attachments.push(r.suites[0]!.specs[0]!.tests[0]!.results[0]!.attachments[0]!),
    (r: typeof report) => { r.suites[0]!.specs[0]!.tests[0]!.results[0]!.attachments[0]!.path = path.join(directory, 'outside.png') },
  ]) {
    const changed = structuredClone(report)
    change(changed)
    expect(() => snapshotBindings(changed, root, cases)).toThrow()
  }
})

it('清单必须同时通过真实报告、完整 PNG 集合和当前渲染合同', async () => {
  const { directory, websiteRoot, manifest, png } = await fixture()
  const verify = () => readBaselineManifest(directory, candidateImages(directory), websiteRoot, environment)
  await expect(verify()).resolves.toHaveProperty('sha256')
  const file = path.join(candidateImages(directory), manifest.images[0]!.file)
  for (const bytes of [Buffer.from('not-a-png'), Buffer.from(png).fill(0)]) {
    await writeFile(file, bytes)
    await expect(verify()).rejects.toThrow()
  }
  await writeFile(file, png)
  await writeFile(path.join(candidateImages(directory), 'extra.png'), png)
  await expect(verify()).rejects.toThrow('集合')
  await rm(path.join(candidateImages(directory), 'extra.png'))
  await rm(file)
  await expect(verify()).rejects.toThrow('集合')
  await writeFile(file, png)
  await expect(readBaselineManifest(directory, candidateImages(directory), websiteRoot, { ...environment, release: 'old' })).rejects.toThrow('环境')
  await writeFile(path.join(websiteRoot, 'tests', 'helpers', 'screenshot.ts'), 'changed-contract')
  await expect(verify()).rejects.toThrow('合同')
})

it('拒绝清单中虚报完整而实际报告未完成的运行', async () => {
  const { directory, websiteRoot, manifest, report } = await fixture()
  report.suites[0]!.specs.pop()
  const bytes = JSON.stringify(report)
  await writeFile(path.join(directory, 'report.json'), bytes)
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ ...manifest, reportSha256: digest(bytes) }))
  await expect(readBaselineManifest(directory, candidateImages(directory), websiteRoot, environment)).rejects.toThrow('集合')
})

it('拒绝链接、大小写冲突与 PNG 元数据篡改', async () => {
  const { directory, websiteRoot, manifest } = await fixture()
  const file = path.join(candidateImages(directory), manifest.images[0]!.file)
  const backup = path.join(directory, 'backup.png')
  await cp(file, backup)
  await rm(file)
  await symlink(backup, file)
  await expect(readBaselineManifest(directory, candidateImages(directory), websiteRoot, environment)).rejects.toThrow('链接')
  await rm(file)
  await cp(backup, file)
  const changed = structuredClone(manifest)
  changed.images[0]!.width++
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(changed))
  await expect(readBaselineManifest(directory, candidateImages(directory), websiteRoot, environment)).rejects.toThrow('尺寸')
  changed.images[1]!.file = changed.images[0]!.file.toUpperCase()
  await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(changed))
  await expect(readBaselineManifest(directory, candidateImages(directory), websiteRoot, environment)).rejects.toThrow('集合')
})

it('完整候选经视觉证据审查后原子安装、登记且可幂等；改图不能由可见节点掩盖', async () => {
  const { directory, websiteRoot, manifest } = await fixture()
  await expect(installCandidates(directory, websiteRoot)).rejects.toThrow()
  const evidence = path.join(candidateImages(directory), manifest.images[0]!.file)
  await reviewCandidates(directory, websiteRoot, '测试审查者', '已审查真实夹具 PNG，确认颜色与布局', [evidence])
  await installCandidates(directory, websiteRoot)
  await verifyInstalledBaselines(websiteRoot)
  await installCandidates(directory, websiteRoot)
  expect(JSON.parse(await readFile(path.join(websiteRoot, 'tests', 'visual-baselines', `${environment.platform}.json`), 'utf8')).source.head).toBe(manifest.source.head)
  await writeFile(path.join(installedDirectory(websiteRoot), manifest.images[0]!.file), 'visible-but-wrong')
  await expect(verifyInstalledBaselines(websiteRoot)).rejects.toThrow()
})

it('旧审查、缺视觉证据和未知目标目录均不能安装', async () => {
  const { directory, websiteRoot, manifest } = await fixture()
  await expect(reviewCandidates(directory, websiteRoot, '测试', '说明', [])).rejects.toThrow('PNG 证据')
  await reviewCandidates(directory, websiteRoot, '测试', '说明', [path.join(candidateImages(directory), manifest.images[0]!.file)])
  const review = JSON.parse(await readFile(path.join(directory, 'review.json'), 'utf8'))
  await writeFile(path.join(directory, 'review.json'), JSON.stringify({ ...review, manifestSha256: '0'.repeat(64) }))
  await expect(installCandidates(directory, websiteRoot)).rejects.toThrow('审查')
  await writeFile(path.join(directory, 'review.json'), JSON.stringify(review))
  await mkdir(installedDirectory(websiteRoot))
  await writeFile(path.join(installedDirectory(websiteRoot), 'unknown.png'), 'user-owned')
  await expect(installCandidates(directory, websiteRoot)).rejects.toThrow()
  expect(await readFile(path.join(installedDirectory(websiteRoot), 'unknown.png'), 'utf8')).toBe('user-owned')
})

it('安装的最终原子替换失败时清理暂存目录，不能留下可用黄金图', async () => {
  const { directory, websiteRoot, manifest } = await fixture()
  await reviewCandidates(directory, websiteRoot, '测试', '说明', [path.join(candidateImages(directory), manifest.images[0]!.file)])
  vi.mocked(rename).mockRejectedValueOnce(new Error('fixture-rename-failed'))
  await expect(installCandidates(directory, websiteRoot)).rejects.toThrow('fixture-rename-failed')
  expect(await readdir(path.join(websiteRoot, 'tests'))).not.toContain('index.spec.ts-snapshots')
  expect((await readdir(path.join(websiteRoot, 'tests'))).some(name => name.startsWith('.visual-baseline-install-'))).toBe(false)
  await expect(readFile(path.join(websiteRoot, 'tests', 'visual-baselines', `${environment.platform}.json`))).rejects.toHaveProperty('code', 'ENOENT')
  await expect(verifyInstalledBaselines(websiteRoot)).rejects.toThrow()
})

it('拒绝候选、截图父目录及登记目录的链接，不向链接目标写入', async () => {
  const { root, directory, websiteRoot, manifest } = await fixture()
  await reviewCandidates(directory, websiteRoot, '测试', '说明', [path.join(candidateImages(directory), manifest.images[0]!.file)])
  const alias = path.join(root, 'candidate-alias')
  await symlink(directory, alias, 'junction')
  await expect(installCandidates(alias, websiteRoot)).rejects.toThrow('链接')
  const snapshots = path.join(directory, 'snapshots')
  const backup = path.join(directory, 'snapshots-original')
  await rename(snapshots, backup)
  await symlink(backup, snapshots, 'junction')
  await expect(installCandidates(directory, websiteRoot)).rejects.toThrow('链接')
  await rm(snapshots)
  await rename(backup, snapshots)
  const outside = path.join(root, 'outside-registry')
  await mkdir(outside)
  await symlink(outside, path.join(websiteRoot, 'tests', 'visual-baselines'), 'junction')
  await expect(installCandidates(directory, websiteRoot)).rejects.toThrow('链接')
  expect(await readdir(outside)).toEqual([])
})
