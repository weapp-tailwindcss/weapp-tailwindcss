import type { NativePlatformReport } from '../examples/react-lynx/src/compatibility/types'
import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { compatibilityCases } from '../examples/react-lynx/src/compatibility/catalog'
import { requiresPixelEffect } from '../examples/react-lynx/src/compatibility/evidence'
import { evaluateGeometry } from '../examples/react-lynx/src/compatibility/geometry'
import { collectNativeEvidence, createEvidenceContext, cropsDirectory, sha256, validateNativeEvidence } from './lynx/evidence'
import { effectFixtureImage } from './lynx/fixtures/effect-images'
import { finalizeNativePixelEffects } from './lynx/pixel-evidence'
import { PNG } from './lynx/png'
import { readNativeReport } from './lynx/reports'
import androidReport from './lynx/reports/android.json'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx bound evidence '))
  directories.push(directory)
  const report = structuredClone(androidReport) as NativePlatformReport
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
  for (const result of report.results) {
    const frames = (requiresPixelEffect(result.id) || result.checkpoints.some(checkpoint => checkpoint.name === 'pixel:probe-vs-control'))
      ? ['probe', 'control']
      : result.id === 'variant-state'
        ? ['before', 'active']
        : result.id === 'animation-spin'
          ? ['before', 'after']
          : result.id === 'transition-basic' ? ['before', 'during', 'after'] : []
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
    if (requiresPixelEffect(result.id)) {
      result.status = 'not-tested'
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

it('完整入口接受本轮落盘回执、实际 bundle 和可见像素证据', async () => {
  const { reportPath, report } = await fixture()
  await expect(readNativeReport(reportPath, 'android')).resolves.toEqual(report)
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
    [receipts[0]!.name, receipts[1]!.name] = [receipts[1]!.name, receipts[0]!.name]
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
  const frame = report.evidence!.artifacts[0]!
  const result = report.results.find(item => `${item.id}-probe.png` === frame.name)!
  result.status = 'unsupported'
  result.reason = 'no visible difference'
  result.checkpoints[0]!.passed = false
  await fs.writeFile(reportPath, JSON.stringify(report))
  await fs.writeFile(path.join(crops, frame.name), 'stale PNG')
  await expect(readNativeReport(reportPath, 'android')).rejects.toThrow(/字节与本轮回执不符/)
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
  await expect(readNativeReport(reportPath, 'android')).rejects.toThrow(/本轮|证据|evidence/)
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
