import type { NativePlatformReport } from '../examples/react-lynx/src/compatibility/types'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { compatibilityCases } from '../examples/react-lynx/src/compatibility/catalog'
import { evidenceSequence, requiresPixelEffect } from '../examples/react-lynx/src/compatibility/evidence'
import staticEvidence from '../examples/react-lynx/src/compatibility/static-evidence.json'
import { darkReceipts } from './lynx/fixtures/dark-images'
import { effectFixtureImage } from './lynx/fixtures/effect-images'
import { finalizeNativePixelEffects, validateNativePixelEvidence } from './lynx/pixel-evidence'
import { PNG } from './lynx/png'
import { validateNativeReport } from './lynx/reports'
import androidReport from './lynx/reports/android.json'

const directories: string[] = []
const target = 'type-weight-style'

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

function screenshot(width = 8, height = 4, color = [14, 165, 233, 255], deflateLevel = 9) {
  const png = new PNG({ width, height })
  for (let offset = 0; offset < png.data.length; offset += 4) {
    png.data.set(color, offset)
  }
  return PNG.sync.write(png, { deflateLevel })
}

// 像素算法独立回归；完整实时门禁及更新器入口由 lynx-evidence.test.ts 覆盖。
async function readPixelReport(reportPath: string, platform: 'android') {
  const report = validateNativeReport(JSON.parse(await fs.readFile(reportPath, 'utf8')), platform)
  await validateNativePixelEvidence(report, path.join(path.dirname(reportPath), 'crops'))
  return report
}

async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx pixel evidence '))
  directories.push(directory)
  const crops = path.join(directory, 'crops')
  await fs.mkdir(crops)
  const report = structuredClone(androidReport) as NativePlatformReport
  report.evidence = { version: 1, runId: '00000000-0000-4000-8000-000000000001', bundleSha256: 'a'.repeat(64), artifacts: [] }
  for (const result of report.results) {
    // 此文件只验证像素协议；已改为几何取证的 supports 不再提供伪像素 checkpoint。
    if (result.id === 'variant-supports') {
      result.status = 'unsupported'
      result.reason = '几何回归由 lynx-evidence.test.ts 独立覆盖'
      result.checkpoints = [{ name: 'geometry:probe-vs-control', passed: false }]
      continue
    }
    const slots = evidenceSequence(compatibilityCases.find(item => item.id === result.id)!, staticEvidence.results.find(item => item.id === result.id))?.frames ?? []
    for (const [index, slot] of slots.entries()) {
      await fs.writeFile(path.join(crops, `${result.id}-${slot}.png`), await effectFixtureImage(result.id, slot) ?? screenshot(8, 4, [index * 80, 165, 233, 255]))
    }
    if (requiresPixelEffect(result.id) || result.id === 'variant-dark') {
      result.status = 'not-tested'
    }
    if (result.id === 'variant-dark') {
      result.colorScheme = darkReceipts(report.evidence.runId)
    }
  }
  const final = await finalizeNativePixelEffects(report, crops)
  const reportPath = path.join(directory, 'report.json')
  await fs.writeFile(reportPath, JSON.stringify(final))
  return { crops, report: final, reportPath }
}

it('接收带完整且可见像素变化的原生报告', async () => {
  const { reportPath, report } = await fixture()
  await expect(readPixelReport(reportPath, 'android')).resolves.toEqual(report)
})

it.each(['missing-frame', 'foreign-receipt', 'wrong-restore', 'false-supported'])('dark 的 %s 不能进入最终验收', async (mode) => {
  const { crops, report, reportPath } = await fixture()
  const result = report.results.find(item => item.id === 'variant-dark')!
  if (mode === 'missing-frame') {
    await fs.rm(path.join(crops, 'variant-dark-dark-control.png'))
  }
  else if (mode === 'foreign-receipt') {
    result.colorScheme!.dark.runId = 'another-run'
  }
  else if (mode === 'wrong-restore') {
    result.colorScheme!.restored.scheme = 'dark'
  }
  else {
    await fs.copyFile(path.join(crops, 'variant-dark-light-probe.png'), path.join(crops, 'variant-dark-dark-probe.png'))
  }
  await fs.writeFile(reportPath, JSON.stringify(report))
  await expect(readPixelReport(reportPath, 'android')).rejects.toThrow(/variant-dark|颜色模式/)
})

it('拒绝原始基线中仅多一列背景像素导致的支持结论', async () => {
  const { crops, reportPath } = await fixture()
  await fs.writeFile(path.join(crops, `${target}-probe.png`), screenshot(446, 171))
  await fs.writeFile(path.join(crops, `${target}-control.png`), screenshot(445, 171))
  await expect(readPixelReport(reportPath, 'android')).rejects.toThrow(/type-weight-style.*446x171.*445x171.*可见像素/)
})

it('不把 PNG 压缩编码差异当作可见像素差异', async () => {
  const { crops, reportPath } = await fixture()
  const first = screenshot(8, 4, undefined, 0)
  const second = screenshot(8, 4, undefined, 9)
  expect(first.equals(second)).toBe(false)
  await fs.writeFile(path.join(crops, `${target}-probe.png`), first)
  await fs.writeFile(path.join(crops, `${target}-control.png`), second)
  await expect(readPixelReport(reportPath, 'android')).rejects.toThrow(/type-weight-style.*可见像素/)
})

it('忽略完全透明像素中不可见的 RGB 数据', async () => {
  const { crops, reportPath } = await fixture()
  await fs.writeFile(path.join(crops, `${target}-probe.png`), screenshot(8, 4, [255, 0, 0, 0]))
  await fs.writeFile(path.join(crops, `${target}-control.png`), screenshot(8, 4, [0, 255, 0, 0]))
  await expect(readPixelReport(reportPath, 'android')).rejects.toThrow(/type-weight-style.*可见像素/)
})

it.each(['missing', 'corrupt'])('%s 截图使报告无效，即使 checkpoint 写了通过', async (kind) => {
  const { crops, reportPath } = await fixture()
  const file = path.join(crops, `${target}-probe.png`)
  if (kind === 'missing') {
    await fs.rm(file)
  }
  else {
    await fs.writeFile(file, 'not a PNG')
  }
  await expect(readPixelReport(reportPath, 'android')).rejects.toThrow(/type-weight-style-probe.png/)
})

it.each([[9, 4], [8, 5]])('尺寸 %ix%i 的截图即使颜色不同也不能与 8x4 对照', async (width, height) => {
  const { crops, reportPath } = await fixture()
  await fs.writeFile(path.join(crops, `${target}-probe.png`), screenshot(width, height, [128, 0, 0, 255]))
  await fs.writeFile(path.join(crops, `${target}-control.png`), screenshot(8, 4, [0, 0, 0, 255]))
  await expect(readPixelReport(reportPath, 'android')).rejects.toThrow(/截图尺寸不一致/)
})

it('相同 RGB 的透明度变化仍属于可见变化', async () => {
  const { crops, reportPath } = await fixture()
  await fs.writeFile(path.join(crops, `${target}-probe.png`), screenshot(8, 4, [0, 0, 0, 128]))
  await fs.writeFile(path.join(crops, `${target}-control.png`), screenshot(8, 4, [0, 0, 0, 255]))
  await expect(readPixelReport(reportPath, 'android')).resolves.toBeDefined()
})

it('相同尺寸的多行图中单个可见像素变化仍被接受', async () => {
  const { crops, reportPath } = await fixture()
  const first = PNG.sync.read(screenshot(8, 4))
  const second = PNG.sync.read(screenshot(8, 4))
  first.data[(2 * first.width + 3) * 4] = 100
  second.data[(2 * second.width + 3) * 4] = 100
  await fs.writeFile(path.join(crops, `${target}-probe.png`), PNG.sync.write(first))
  await fs.writeFile(path.join(crops, `${target}-control.png`), PNG.sync.write(second))
  await expect(readPixelReport(reportPath, 'android')).rejects.toThrow(/可见像素/)
  first.data[(2 * first.width + 3) * 4] = 101
  await fs.writeFile(path.join(crops, `${target}-probe.png`), PNG.sync.write(first))
  await expect(readPixelReport(reportPath, 'android')).resolves.toBeDefined()
})

it('额外列中的颜色不能代替等尺寸的样式证据', async () => {
  const { crops, reportPath } = await fixture()
  const first = PNG.sync.read(screenshot(9, 4))
  for (let row = 0; row < first.height; row++) {
    first.data[(row * first.width + 8) * 4] = 255
  }
  await fs.writeFile(path.join(crops, `${target}-probe.png`), PNG.sync.write(first))
  await fs.writeFile(path.join(crops, `${target}-control.png`), screenshot(8, 4))
  await expect(readPixelReport(reportPath, 'android')).rejects.toThrow(/可见像素/)
})

it('拒绝只声明 pixel 前缀而缺少具体采样契约的 checkpoint', async () => {
  const { report, reportPath } = await fixture()
  report.results.find(result => result.id === target)!.checkpoints = [{ name: 'pixel:exists', passed: true }]
  await fs.writeFile(reportPath, JSON.stringify(report))
  await expect(readPixelReport(reportPath, 'android')).rejects.toThrow(/缺少 pixel:probe-vs-control checkpoint/)
})

it('拒绝动画时间序列仅有编码变化的通过结论', async () => {
  const { crops, report, reportPath } = await fixture()
  const result = report.results.find(result => result.id === 'animation-spin')!
  result.status = 'supported'
  result.checkpoints = [{ name: 'interaction:animation-progress', passed: true }]
  await fs.writeFile(reportPath, JSON.stringify(report))
  await fs.writeFile(path.join(crops, 'animation-spin-before.png'), screenshot(8, 4, undefined, 0))
  await fs.writeFile(path.join(crops, 'animation-spin-after.png'), screenshot(8, 4, undefined, 9))
  await expect(readPixelReport(reportPath, 'android')).rejects.toThrow(/animation-spin.*可见像素/)
})

it('transition 必须在相邻两个区间都有可见变化', async () => {
  const { crops, report, reportPath } = await fixture()
  const result = report.results.find(result => result.id === 'transition-basic')!
  result.status = 'supported'
  result.checkpoints = [{ name: 'interaction:transition-progress', passed: true }]
  await fs.writeFile(reportPath, JSON.stringify(report))
  await fs.copyFile(path.join(crops, 'transition-basic-during.png'), path.join(crops, 'transition-basic-after.png'))
  await expect(readPixelReport(reportPath, 'android')).rejects.toThrow(/transition-basic.*during.*after.*可见像素/)
})

it('不支持的结论也必须保留可解码的截图', async () => {
  const { crops, report, reportPath } = await fixture()
  const result = report.results.find(result => result.id === target)!
  result.status = 'unsupported'
  result.reason = 'probe/control 元素截图没有可观察的像素差异'
  result.checkpoints[0]!.passed = false
  await fs.writeFile(reportPath, JSON.stringify(report))
  await fs.copyFile(path.join(crops, `${target}-probe.png`), path.join(crops, `${target}-control.png`))
  await expect(readPixelReport(reportPath, 'android')).resolves.toBeDefined()
  await fs.rm(path.join(crops, `${target}-control.png`))
  await expect(readPixelReport(reportPath, 'android')).rejects.toThrow(/type-weight-style-control.png/)
})

it.each(['background-linear-gradient', 'effect-shadow'])('%s 不能把移除默认效果后的纯色图判为支持', async (id) => {
  const { crops, report, reportPath } = await fixture()
  const result = report.results.find(item => item.id === id)!
  result.status = 'supported'
  delete result.reason
  result.checkpoints = [{ name: 'pixel:probe-vs-control', passed: true }]
  await fs.writeFile(reportPath, JSON.stringify(report))
  expect(await fs.readFile(path.join(crops, `${id}-probe.png`))).toEqual(await effectFixtureImage(id, 'probe'))
  await expect(readPixelReport(reportPath, 'android').then(() => 'accepted')).rejects.toThrow(/预期效果/)
})

it('宿主只判定待验收效果，保留原始采集报告且无效图不能降级为不支持', async () => {
  const { crops, report } = await fixture()
  await expect(finalizeNativePixelEffects(report, crops)).rejects.toThrow('原始采集报告不能预先声明')
  for (const result of report.results) {
    if (requiresPixelEffect(result.id) || result.id === 'variant-dark') {
      result.status = 'not-tested'
      result.reason = '等待宿主'
    }
  }
  const original = JSON.stringify(report)
  const final = await finalizeNativePixelEffects(report, crops)
  expect(JSON.stringify(report)).toBe(original)
  expect(final.results.filter(result => requiresPixelEffect(result.id)).map(result => result.status)).toEqual(['unsupported', 'unsupported', 'supported'])
  await fs.writeFile(path.join(crops, 'effect-shadow-control.png'), 'broken PNG')
  await expect(finalizeNativePixelEffects(report, crops)).rejects.toThrow('无法解码')
})

it.each(['missing', 'forged', 'duplicate'])('%s 效果契约不允许进入最终验收', async (mode) => {
  const { report, reportPath } = await fixture()
  const result = report.results.find(item => item.id === 'effect-shadow')!
  const checkpoint = result.checkpoints.find(item => item.name === 'pixel:expected-effect-v1')!
  if (mode === 'missing') {
    result.checkpoints = result.checkpoints.filter(item => item !== checkpoint)
  }
  else if (mode === 'forged') {
    checkpoint.actual = 'trust this report'
  }
  else {
    result.checkpoints.push(checkpoint)
  }
  await fs.writeFile(reportPath, JSON.stringify(report))
  await expect(readPixelReport(reportPath, 'android').then(() => 'accepted')).rejects.toThrow('预期效果结论')
})

it.each(['missing', 'corrupt', 'forged', 'old-geometry'] as const)('skew 的 %s 证据不得沿用旧矩形结论', async (mode) => {
  const { crops, report, reportPath } = await fixture()
  const result = report.results.find(item => item.id === 'transform-skew')!
  if (mode === 'missing') {
    await fs.rm(path.join(crops, 'transform-skew-control.png'))
  }
  else if (mode === 'corrupt') {
    await fs.writeFile(path.join(crops, 'transform-skew-probe.png'), 'broken PNG')
  }
  else if (mode === 'forged') {
    result.checkpoints.find(item => item.name === 'geometry:expected-effect-v1')!.actual = 'old View matrix'
  }
  else {
    result.checkpoints = [{ name: 'geometry:probe-vs-control', passed: true }]
  }
  await fs.writeFile(reportPath, JSON.stringify(report))
  await expect(readPixelReport(reportPath, 'android')).rejects.toThrow(/transform-skew/)
})
