import type { NativePlatformReport, Platform, StaticEvidenceReport } from '../examples/react-lynx/src/compatibility/types'
import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { candidateCheckpoint, combineCandidateEvidence, requiresCandidateEvidence } from '../examples/react-lynx/src/compatibility/candidate-evidence'
import { compatibilityCases } from '../examples/react-lynx/src/compatibility/catalog'
import { evidenceArtifactNames, evidenceSequence, requiresPixelEffect } from '../examples/react-lynx/src/compatibility/evidence'
import { evaluateGeometry } from '../examples/react-lynx/src/compatibility/geometry'
import staticEvidence from '../examples/react-lynx/src/compatibility/static-evidence.json'
import { archiveNativeBaseline, validateNativeBaselineArchive } from './lynx/baseline-archive'
import { compatibilityVersions, getCatalogHash } from './lynx/catalog'
import { collectNativeEvidence, createEvidenceContext, cropsDirectory, sha256, validateNativeEvidence } from './lynx/evidence'
import { darkReceipts } from './lynx/fixtures/dark-images'
import { effectFixtureImage } from './lynx/fixtures/effect-images'
import { overflowArtifactFixture } from './lynx/fixtures/overflow-artifacts'
import { responsiveArtifactFixture } from './lynx/fixtures/responsive-artifacts'
import { finalizeNativePixelEffects } from './lynx/pixel-evidence'
import { PNG } from './lynx/png'
import { readNativeReport } from './lynx/reports'
import androidReport from './lynx/reports/android.json'
import { validateStyleFixtureArtifacts } from './lynx/style-fixture-artifacts'

// 本文件隔离验证存储/几何协议，支持预期漂移由 lynx-reports.test.ts 的真实门禁单独回归。
// 官方 AAR/APK 身份由 lynx-android-sdk.test.ts 独立验证，不以此处合成几何夹具冒充。
vi.mock('../examples/react-lynx/src/compatibility/android-sdk-contract', () => ({ validatePlatformSdk: () => {} }))
vi.mock('./lynx/android-sdk', () => ({ validateAndroidSdkEvidence: async () => {} }))
// 此套使用 dummy bundle 隔离存储/几何协议；真实样式门禁由 lynx-style-fixture-artifacts.test.ts 验证。
vi.mock('./lynx/style-fixture-artifacts', () => ({ validateStyleFixtureArtifacts: vi.fn(async () => {}) }))
vi.mock('./lynx/expectations', async importOriginal => ({
  ...await importOriginal<typeof import('./lynx/expectations')>(),
  assertReviewedLynxOutcome: () => {},
}))

// 该套仅验证证据协议：显式构造本轮合成静态输入，不改写或冒充已提交的历史报告。
vi.mock('../examples/react-lynx/src/compatibility/static-evidence.json', async (importOriginal) => {
  const original = await importOriginal<{ default: StaticEvidenceReport }>()
  const { compatibilityVersions, getCatalogHash } = await import('./lynx/catalog')
  const { compatibilityCases } = await import('../examples/react-lynx/src/compatibility/catalog')
  const { default: protocolReport } = await import('./lynx/reports/android.json')
  return {
    default: {
      ...original.default,
      catalogHash: getCatalogHash(),
      versions: compatibilityVersions,
      // 历史协议夹具决定本测试覆盖的取证分支，不让本轮 encoder 的变化跳过几何或像素反例。
      // 真实静态字节与阶段合同由 decoder、static-evidence 和 reports 测试独立核验。
      results: original.default.results.map((result) => {
        const checkpoints = protocolReport.results.find(item => item.id === result.id)!.checkpoints
        const generated = checkpoints.find(item => item.name === 'generated')?.passed ?? true
        const bundled = result.id === 'syntax-important' || (checkpoints.find(item => item.name === 'bundled')?.passed ?? true)
        return {
          ...result,
          generated,
          bundled,
          candidates: compatibilityCases.find(item => item.id === result.id)!.className.split(/\s+/).filter(Boolean).map(className => ({
            className,
            generated,
            bundled,
            reason: result.reason,
          })),
        }
      }),
    },
  }
})

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

it('统一入口可以传递同轮 UUID，非法身份在原生运行之前拒绝', () => {
  const runId = '00000000-0000-4000-8000-000000000001'
  expect(createEvidenceContext(Buffer.from('bundle'), runId)).toMatchObject({ version: 1, runId })
  expect(() => createEvidenceContext(Buffer.from('bundle'), '../old-run')).toThrow(/evidence 身份/)
})

async function fixture(platform: Platform = 'android') {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx bound evidence '))
  directories.push(directory)
  const report = structuredClone(androidReport) as NativePlatformReport
  report.platform = platform
  report.environment.osName = platform === 'ios' ? 'iOS' : 'Android'
  report.catalogHash = getCatalogHash()
  report.versions = compatibilityVersions
  for (const item of compatibilityCases) {
    const result = report.results.find(result => result.id === item.id)!
    const built = staticEvidence.results.find(result => result.id === item.id)!
    if (requiresCandidateEvidence(item.id)) {
      Object.assign(result, combineCandidateEvidence(item, built, item.className.split(/\s+/).map(className => ({
        className,
        status: 'supported',
        checkpoints: [{ name: candidateCheckpoint(className), passed: true }],
      }))))
    }
    if (item.evidence === 'build' && built.generated) {
      Object.assign(result, { status: 'supported', reason: undefined, checkpoints: [{ name: 'build:generated', passed: true }] })
    }
  }
  // 此 fixture 验证取证协议：几何节点使用同布局、不同屏幕原点，结论应为不支持。
  const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height })
  const layoutControls: Record<string, number[]> = {
    'grid-placement': [50, 34, 40, 24, 0, 0, 8, 8],
    'grid-auto': [6, 6, 140, 68, 0, 36, 40, 24],
    'grid-justify-self': [6, 6, 100, 44, 0, 0, 20, 12],
    'variant-supports': [6, 6, 100, 44, 0, 16, 20, 12],
    'flex-grow': [6, 6, 24, 24, 0, 0, 8, 8],
    'flex-wrap-order': [6, 6, 64, 24, 44, 0, 40, 24],
    'flex-shorthand-shrink': [6, 6, 24, 24, 0, 0, 12, 24],
  }
  for (const result of report.results) {
    if (!requiresPixelEffect(result.id) && (result.id === 'variant-supports' || result.checkpoints.some(checkpoint => checkpoint.name.startsWith('geometry:')))) {
      const item = compatibilityCases.find(item => item.id === result.id)!
      const layout = layoutControls[item.id]
      if (layout) {
        const [x, y, width, height, childX, childY, childWidth, childHeight] = layout as [number, number, number, number, number, number, number, number]
        Object.assign(result, evaluateGeometry(item, {
          probe: rect(x, y, width, height),
          control: rect(200 + x, 300 + y, width, height),
          probeContainer: rect(0, 0, 160, 140),
          controlContainer: rect(200, 300, 160, 140),
          probeChild: rect(x + childX, y + childY, childWidth, childHeight),
          controlChild: rect(200 + x + childX, 300 + y + childY, childWidth, childHeight),
        }))
        continue
      }
      Object.assign(result, evaluateGeometry(item, {
        probe: rect(6, 6, 80, 40),
        control: rect(206, 306, 80, 40),
        probeContainer: rect(0, 0, 160, 160),
        controlContainer: rect(200, 300, 160, 160),
        probeChild: rect(14, 30, 12, 12),
        controlChild: rect(214, 330, 12, 12),
      }))
    }
  }
  const bundle = Buffer.from('the actual staged bundle')
  const context = createEvidenceContext(bundle)
  report.evidence = { ...context, artifacts: [] }
  const images = new Map<string, Buffer>()
  for (const [name, bytes] of responsiveArtifactFixture(report)) {
    images.set(name, bytes)
  }
  for (const [name, bytes] of overflowArtifactFixture(report)) {
    images.set(name, bytes)
  }
  for (const result of report.results) {
    if (result.id === 'variant-responsive' || result.id === 'layout-overflow') {
      continue
    }
    const frames = evidenceSequence(compatibilityCases.find(item => item.id === result.id)!, staticEvidence.results.find(item => item.id === result.id))?.frames ?? []
    for (const [index, frame] of frames.entries()) {
      const name = `${result.id}-${frame}.png`
      const png = new PNG({ width: 8, height: 4 })
      for (let offset = 0; offset < png.data.length; offset += 4) {
        png.data.set([index * 80, 165, 233, 255], offset)
      }
      const data = await effectFixtureImage(result.id, frame) ?? PNG.sync.write(png)
      images.set(name, data)
      report.evidence.artifacts.push({ runId: context.runId, name, sha256: sha256(data), byteLength: data.byteLength })
    }
    for (const name of evidenceArtifactNames(compatibilityCases.find(item => item.id === result.id)!, staticEvidence.results.find(item => item.id === result.id)).filter(name => !images.has(name))) {
      // 仅供协议反例的合成宿主文件，不能作为真实设备支持证据。
      let data: Buffer
      if (name.endsWith('.json')) {
        data = Buffer.from(JSON.stringify({ version: 1, source: 'lynx-native-host-geometry-v1', platform: report.platform, id: result.id, runId: context.runId, bundleSha256: context.bundleSha256, geometry: result.geometry }))
      }
      else {
        const rect = name.endsWith('-probe.png') ? result.geometry!.probeContainer : result.geometry!.controlContainer
        const png = new PNG({ width: Math.round(rect.width * report.environment.viewport.pixelRatio), height: Math.round(rect.height * report.environment.viewport.pixelRatio) })
        png.data.fill(255)
        data = PNG.sync.write(png)
      }
      images.set(name, data)
      report.evidence.artifacts.push({ runId: context.runId, name, sha256: sha256(data), byteLength: data.byteLength })
    }
    if (requiresPixelEffect(result.id) || result.id === 'variant-dark') {
      result.status = 'not-tested'
    }
    if (result.id === 'variant-dark') {
      result.colorScheme = darkReceipts(context.runId)
    }
  }
  const reportPath = path.join(directory, 'report.json')
  await fs.writeFile(reportPath, JSON.stringify(report))
  await fs.writeFile(path.join(directory, 'run-context.json'), JSON.stringify(context))
  await fs.writeFile(path.join(directory, 'main.lynx.bundle'), bundle)
  await collectNativeEvidence(report, directory, context, async name => images.get(name)!)
  const final = await finalizeNativePixelEffects(report, cropsDirectory(directory, context))
  await fs.writeFile(reportPath, JSON.stringify(final))
  return { directory, reportPath, report: final, context, crops: cropsDirectory(directory, context), images }
}

it('完整协议入口接受同轮落盘回执、绑定的 bundle 字节和合成像素夹具', async () => {
  const { reportPath, report, directory } = await fixture()
  await expect(readNativeReport(reportPath, 'android')).resolves.toEqual(report)
  expect(validateStyleFixtureArtifacts).toHaveBeenCalledWith(directory)
})

it('双端归档搬迁后仍重读本轮 run context、bundle、全部 PNG 和宿主侧车，历史 JSON 不能补证', async () => {
  const ios = await fixture('ios')
  const android = await fixture()
  const archiveRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx archived evidence '))
  directories.push(archiveRoot)
  const expected = { ios: await readNativeReport(ios.reportPath, 'ios'), android: await readNativeReport(android.reportPath, 'android') }
  const archive = await archiveNativeBaseline({ ios: { file: ios.reportPath, report: expected.ios }, android: { file: android.reportPath, report: expected.android } }, archiveRoot)
  await fs.rm(ios.directory, { recursive: true })
  await fs.rm(android.directory, { recursive: true })
  const moved = path.join(archiveRoot, 'relocated')
  await fs.rename(archive.directory, moved)
  const result = await validateNativeBaselineArchive(moved)
  expect(result.reports).toEqual(expected)
  const historical = path.join(archiveRoot, 'ios.json')
  await fs.writeFile(historical, JSON.stringify(ios.report))
  await expect(readNativeReport(historical, 'ios')).rejects.toThrow('本轮 Lynx evidence 身份和 bundle')
})

it('报告没有 mediaGate 时也传播样式夹具门禁失败', async () => {
  const { reportPath, report } = await fixture()
  expect(report.mediaGate).toBeUndefined()
  vi.mocked(validateStyleFixtureArtifacts).mockRejectedValueOnce(new Error('style fixture rejected'))
  await expect(readNativeReport(reportPath, 'android')).rejects.toThrow('style fixture rejected')
})

it('整份旧报告和旧截图同时残留也不能冒充新 run', async () => {
  const { directory, reportPath } = await fixture()
  const current = createEvidenceContext(Buffer.from('the actual staged bundle'))
  await fs.writeFile(path.join(directory, 'run-context.json'), JSON.stringify(current))
  await expect(readNativeReport(reportPath, 'android')).rejects.toThrow(/不属于本轮/)
})

it('拒绝把其他 bundle 的报告带入当前验收', async () => {
  const { directory, reportPath } = await fixture()
  await fs.writeFile(path.join(directory, 'main.lynx.bundle'), 'different bundle')
  await expect(readNativeReport(reportPath, 'android')).rejects.toThrow(/本轮.*bundle/)
})

it.each(['hash', 'length', 'name-swap', 'missing', 'duplicate', 'wrong-run', 'old-protocol'] as const)('拒绝 %s 截图清单', async (kind) => {
  const { report, reportPath } = await fixture()
  const receipts = report.evidence!.artifacts
  if (kind === 'hash') {
    receipts[0]!.sha256 = 'a'.repeat(64)
  }
  if (kind === 'length') {
    receipts[0]!.byteLength += 1
  }
  if (kind === 'name-swap') {
    const probe = receipts.find(item => item.name === 'layout-visibility-probe.png')!
    const control = receipts.find(item => item.name === 'layout-visibility-control.png')!
    ;[probe.name, control.name] = [control.name, probe.name]
  }
  if (kind === 'missing') {
    receipts.pop()
  }
  if (kind === 'duplicate') {
    receipts[1] = {
      ...receipts[0]!,
    }
  }
  if (kind === 'wrong-run') {
    receipts[0]!.runId = createEvidenceContext(Buffer.from('other')).runId
  }
  if (kind === 'old-protocol') {
    delete report.evidence
  }
  await fs.writeFile(reportPath, JSON.stringify(report))
  await expect(readNativeReport(reportPath, 'android')).rejects.toThrow(/evidence/)
})

it.each(['../escape.png', '..\\escape.png', '/root.png', 'C:\\root.png', 'C:relative.png'])('拒绝越界或伪造文件名 %s', async (name) => {
  const { report, directory, context } = await fixture()
  report.evidence!.artifacts[0]!.name = name
  await expect(validateNativeEvidence(report, directory, context)).rejects.toThrow(/回执无效/)
})

it('有效旧图不能替代本轮声明的图，即使旧图仍有可见差异', async () => {
  const { reportPath, crops, report } = await fixture()
  const frame = report.evidence!.artifacts[0]!
  const png = new PNG({ width: 8, height: 4 })
  png.data.fill(255)
  await fs.writeFile(path.join(crops, frame.name), PNG.sync.write(png))
  await expect(readNativeReport(reportPath, 'android')).rejects.toThrow(/字节与本轮回执不符/)
})

it('复制失败不会使用输出目录中的旧 crops，并阻止同 run 重入', async () => {
  const { directory, report, context, images } = await fixture()
  await expect(collectNativeEvidence(report, directory, context, async name => images.get(name)!)).rejects.toThrow(/EEXIST/)
  const next = createEvidenceContext(Buffer.from('the actual staged bundle'))
  report.evidence = { ...next, artifacts: report.evidence!.artifacts.map(item => ({ ...item, runId: next.runId })) }
  await expect(collectNativeEvidence(report, directory, next, async () => {
    throw new Error('device copy failed')
  })).rejects.toThrow('device copy failed')
  await expect(validateNativeEvidence(report, directory, next)).rejects.toThrow(/ENOENT/)
})

it('unsupported 结论也拒绝未绑定的截图', async () => {
  const { report, reportPath, crops } = await fixture()
  const frame = report.evidence!.artifacts.find(item => item.name === 'layout-overflow-geometry-probe.png')!
  const result = report.results.find(item => item.id === 'layout-overflow')!
  result.status = 'unsupported'
  result.reason = 'no visible difference'
  result.checkpoints[0]!.passed = false
  await fs.writeFile(reportPath, JSON.stringify(report))
  await fs.writeFile(path.join(crops, frame.name), 'stale PNG')
  await expect(readNativeReport(reportPath, 'android')).rejects.toThrow(/字节与本轮回执不符/)
})

it.each(['source', 'id', 'platform', 'bundle', 'report-mismatch', 'invalid-corners'] as const)('离线验收拒绝hash有效但 %s 不符的几何侧车', async (mode) => {
  const { report, directory, context, crops } = await fixture()
  const receipt = report.evidence!.artifacts.find(item => item.name === 'layout-aspect-geometry.json')!
  const file = path.join(crops, receipt.name)
  const value = JSON.parse(await fs.readFile(file, 'utf8'))
  if (mode === 'source') {
    value.source = 'report-json'
  }
  if (mode === 'id') {
    value.id = 'another-case'
  }
  if (mode === 'platform') {
    value.platform = 'ios'
  }
  if (mode === 'bundle') {
    value.bundleSha256 = 'f'.repeat(64)
  }
  if (mode === 'report-mismatch') {
    value.geometry.probe.left += 1
  }
  if (mode === 'invalid-corners') {
    value.geometry.probe.right += 1
    report.results.find(item => item.id === value.id)!.geometry = value.geometry
  }
  const bytes = Buffer.from(JSON.stringify(value))
  await fs.writeFile(file, bytes)
  Object.assign(receipt, { sha256: sha256(bytes), byteLength: bytes.byteLength })
  await expect(validateNativeEvidence(report, directory, context)).rejects.toThrow(/几何宿主侧车/)
})

it('拒绝新报告配合上轮残留的有效截图，历史报告不能刷新基线', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx stale evidence '))
  directories.push(directory)
  const crops = path.join(directory, 'crops')
  await fs.mkdir(crops)
  const report = structuredClone(androidReport) as NativePlatformReport
  for (const result of report.results) {
    const frames = (requiresPixelEffect(result.id) || result.checkpoints.some(checkpoint => checkpoint.name === 'pixel:probe-vs-control'))
      ? ['probe', 'control']
      : result.id === 'variant-state'
        ? ['before', 'active']
        : result.id === 'animation-spin'
          ? ['before', 'after']
          : result.id === 'transition-basic' ? ['before', 'during', 'after'] : []
    for (const [index, frame] of frames.entries()) {
      const png = new PNG({ width: 8, height: 4 })
      for (let offset = 0; offset < png.data.length; offset += 4) {
        png.data.set([index * 80, 165, 233, 255], offset)
      }
      await fs.writeFile(path.join(crops, `${result.id}-${frame}.png`), PNG.sync.write(png))
    }
  }
  const reportPath = path.join(directory, 'report.json')
  await fs.writeFile(reportPath, JSON.stringify(report))
  await expect(readNativeReport(reportPath, 'android')).rejects.toThrow(/catalog hash is stale/)
})

it('基线更新拒绝只有支持结论而缺少原始几何证据的报告', async () => {
  const { reportPath, report } = await fixture()
  delete report.results.find(item => item.id === 'flex-direction')!.geometry
  await fs.writeFile(reportPath, JSON.stringify(report))
  await expect(readNativeReport(reportPath, 'android').then(() => 'unexpected acceptance')).rejects.toThrow(/geometry.*证据/)
})

it('基线更新从原始容器重算几何结论，拒绝固定列偏移假阳性', async () => {
  const { reportPath, report } = await fixture()
  const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height })
  const result = report.results.find(item => item.id === 'flex-direction')!
  result.geometry = {
    probe: rect(6, 6, 80, 40),
    control: rect(206, 306, 80, 40),
    probeContainer: rect(0, 0, 160, 160),
    controlContainer: rect(200, 300, 160, 160),
    probeChild: rect(14, 30, 12, 12),
    controlChild: rect(214, 330, 12, 12),
  }
  result.status = 'supported'
  result.checkpoints = [{ name: 'geometry:probe-vs-control', passed: true, actual: '0,0,80,40', expected: 'different' }]
  await fs.writeFile(reportPath, JSON.stringify(report))
  await expect(readNativeReport(reportPath, 'android').then(() => 'unexpected acceptance')).rejects.toThrow(/geometry.*结论/)
})

it('原生 JSON 重排 checkpoint 字段不会改变几何证据', async () => {
  const { reportPath, report } = await fixture()
  const result = report.results.find(item => item.id === 'flex-direction')!
  const checkpoint = result.checkpoints[0]!
  result.checkpoints = [{ expected: checkpoint.expected, actual: checkpoint.actual, passed: checkpoint.passed, name: checkpoint.name }]
  await fs.writeFile(reportPath, JSON.stringify(report))
  await expect(readNativeReport(reportPath, 'android').then(() => 'accepted')).resolves.toBe('accepted')
})

it('supports 的无效条件也变成两列时，原始几何阻止旧结论放行', async () => {
  const { reportPath, report } = await fixture()
  const result = report.results.find(item => item.id === 'variant-supports')!
  const { control, controlChild } = result.geometry!
  Object.assign(controlChild, { left: control.left + 44, right: control.left + 64, top: control.top, bottom: control.top + 12 })
  await fs.writeFile(reportPath, JSON.stringify(report))
  await expect(readNativeReport(reportPath, 'android')).rejects.toThrow(/variant-supports.*geometry.*无效/)
})
