import type { NativePlatformReport, Platform } from '../examples/react-lynx/src/compatibility/types'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, expect, it, vi } from 'vitest'
import { validateNativeBaselineArchive } from './lynx/baseline-archive'
import { updateNativeBaseline } from './lynx/baseline-update'
import { compatibilityVersions, getCatalogHash } from './lynx/catalog'
import { readNativeReport } from './lynx/reports'
import androidJson from './lynx/reports/android.json'
import iosJson from './lynx/reports/ios.json'

// 此套隔离归档搬迁与发布顺序；真实 APK、bundle、PNG 语义门禁由各 evidence 回归验证。
// 模拟读取器每次都从所给报告的同目录重读原始文件，不能回退到首次输入目录。
vi.mock('./lynx/reports', () => ({
  readNativeReport: vi.fn(async (file: string, platform: Platform) => {
    const report = JSON.parse(await fs.readFile(file, 'utf8')) as NativePlatformReport
    expect(report.platform).toBe(platform)
    const directory = path.dirname(file)
    for (const name of ['run-context.json', 'main.lynx.bundle', 'main.css', 'raw-report.json']) {
      expect((await fs.readFile(path.join(directory, name))).length).toBeGreaterThan(0)
    }
    for (const receipt of report.evidence!.artifacts) {
      const bytes = await fs.readFile(path.join(directory, 'crops', report.evidence!.runId, receipt.name))
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(receipt.sha256)
    }
    return report
  }),
}))

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'Lynx baseline 中文 & '))
  directories.push(root)
  const inputs = path.join(root, 'external-download')
  const reports = path.join(root, 'tracked', 'reports')
  const archiveRoot = path.join(root, 'controlled-artifacts')
  await fs.mkdir(reports, { recursive: true })
  await fs.writeFile(path.join(reports, 'ios.json'), 'historical-ios')
  await fs.writeFile(path.join(reports, 'android.json'), 'historical-android')
  await fs.writeFile(path.join(root, 'tracked', 'baseline.json'), 'historical-baseline')
  const paths = {} as Record<Platform, string>
  for (const [platform, source] of [['ios', iosJson], ['android', androidJson]] as const) {
    const report = { ...structuredClone(source), versions: compatibilityVersions } as NativePlatformReport
    report.catalogHash = getCatalogHash()
    report.versions = compatibilityVersions
    const runId = platform === 'ios' ? '00000000-0000-4000-8000-000000000001' : '00000000-0000-4000-8000-000000000002'
    const bytes = new TextEncoder().encode(`synthetic-${platform}-PNG`)
    report.evidence = { version: 1, runId, bundleSha256: 'a'.repeat(64), artifacts: [{ runId, name: 'synthetic.png', sha256: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.length }] }
    const directory = path.join(inputs, platform)
    await fs.mkdir(path.join(directory, 'crops', runId), { recursive: true })
    paths[platform] = path.join(directory, 'report.json')
    await fs.writeFile(paths[platform], JSON.stringify(report))
    await fs.writeFile(path.join(directory, 'crops', runId, 'synthetic.png'), bytes)
    for (const name of ['run-context.json', 'main.lynx.bundle', 'main.css', 'raw-report.json', 'device.json']) {
      await fs.writeFile(path.join(directory, name), `synthetic-${platform}-${name}`)
    }
    await fs.mkdir(path.join(directory, 'android-sdk'))
    await fs.writeFile(path.join(directory, 'android-sdk', 'build.apk'), `synthetic-${platform}-APK`)
  }
  return { root, inputs, reports, archiveRoot, options: { iosPath: paths.ios, androidPath: paths.android, reportDirectory: reports, baselinePath: path.join(root, 'tracked', 'baseline.json'), archiveRoot } }
}

it('正常更新先归档双端原始目录，删除外部下载目录后仍能从相对索引重读', async () => {
  const { root, inputs, options } = await fixture()
  const result = await updateNativeBaseline(options)
  expect(result).toHaveProperty('archive.directory')
  const archive = result.archive
  expect(path.relative(await fs.realpath(options.archiveRoot), archive.directory)).not.toMatch(/^\.\./)
  const index = JSON.parse(await fs.readFile(archive.indexPath, 'utf8'))
  expect(JSON.stringify(index)).not.toContain(root)
  expect(index.platforms.ios.runId).not.toBe(index.platforms.android.runId)
  await fs.rm(inputs, { recursive: true })
  await expect(validateNativeBaselineArchive(archive.directory)).resolves.toHaveProperty('reports.android.platform', 'android')
  await expect(readNativeReport(result.reports.ios, 'ios')).rejects.toThrow('ENOENT')
  const relocated = path.join(root, 'moved-archive')
  await fs.rename(archive.directory, relocated)
  archive.directory = relocated
  await expect(validateNativeBaselineArchive(relocated)).resolves.toHaveProperty('reports.ios.platform', 'ios')
  for (const platform of ['ios', 'android'] as const) {
    const archivedReport = path.join(archive.directory, ...index.platforms[platform].report)
    await expect(readNativeReport(archivedReport, platform)).resolves.toHaveProperty('platform', platform)
    expect(await fs.readFile(path.join(archive.directory, platform, 'android-sdk', 'build.apk'), 'utf8')).toBe(`synthetic-${platform}-APK`)
  }
})

it.each(['missing', 'corrupt', 'extra'] as const)('归档中的 %s 原始工件使相对索引回放失败', async (mode) => {
  const { options } = await fixture()
  const { archive } = await updateNativeBaseline(options)
  const file = path.join(archive.directory, 'android', 'android-sdk', 'build.apk')
  if (mode === 'missing') {
    await fs.rm(file)
  }
  else if (mode === 'corrupt') {
    await fs.writeFile(file, 'other APK')
  }
  else {
    await fs.writeFile(path.join(archive.directory, 'unexpected.txt'), 'stale')
  }
  await expect(validateNativeBaselineArchive(archive.directory)).rejects.toThrow('归档文件缺失、增加或摘要不符')
})

it.each([['..', 'outside'], ['C:\\outside'], ['C:relative'], ['/outside'], ['.'], []])('拒绝越界或不可移植的索引路径 %j', async (...segments) => {
  const { options } = await fixture()
  const { archive } = await updateNativeBaseline(options)
  const index = JSON.parse(await fs.readFile(archive.indexPath, 'utf8'))
  index.artifacts[0].path = segments
  await fs.writeFile(archive.indexPath, JSON.stringify(index))
  await expect(validateNativeBaselineArchive(archive.directory)).rejects.toThrow('相对路径片段')
})

it.each(['pixels', 'report'] as const)('复制前原始 %s 发生变化时拒绝更新，保留历史结论和源目录', async (kind) => {
  const { inputs, reports, options } = await fixture()
  const original = vi.mocked(readNativeReport).getMockImplementation()!
  vi.mocked(readNativeReport).mockImplementationOnce(async (file, platform) => {
    const report = await original(file, platform)
    if (kind === 'pixels') {
      const artifact = report.evidence!.artifacts[0]!
      await fs.writeFile(path.join(path.dirname(file), 'crops', report.evidence!.runId, artifact.name), 'changed after validation')
    }
    else {
      await fs.writeFile(file, JSON.stringify({ ...report, verifiedAt: '2026-01-01T00:00:00.000Z' }))
    }
    return report
  })
  await expect(updateNativeBaseline(options)).rejects.toThrow()
  expect(await fs.readFile(path.join(reports, 'ios.json'), 'utf8')).toBe('historical-ios')
  expect(await fs.readFile(path.join(reports, 'android.json'), 'utf8')).toBe('historical-android')
  expect(await fs.readFile(options.baselinePath, 'utf8')).toBe('historical-baseline')
  expect(await fs.readdir(options.archiveRoot)).toEqual([])
  expect(await fs.readdir(inputs)).toEqual(['android', 'ios'])
})

it('禁止将归档根放入原始输入目录，避免递归复制自身', async () => {
  const { inputs, options } = await fixture()
  options.archiveRoot = path.join(inputs, 'ios', 'nested-output')
  await expect(updateNativeBaseline(options)).rejects.toThrow('不能放在原始输入目录内')
  expect(await fs.readFile(options.baselinePath, 'utf8')).toBe('historical-baseline')
})

it.skipIf(process.platform === 'win32')('符号链接不得把外部文件或目录带入可移植归档', async () => {
  const { inputs, options } = await fixture()
  await fs.symlink(options.baselinePath, path.join(inputs, 'ios', 'unrelated-link'))
  await expect(updateNativeBaseline(options)).rejects.toThrow('符号链接或非普通文件')
  expect(await fs.readFile(options.baselinePath, 'utf8')).toBe('historical-baseline')
  expect(await fs.readdir(options.archiveRoot)).toEqual([])
})
