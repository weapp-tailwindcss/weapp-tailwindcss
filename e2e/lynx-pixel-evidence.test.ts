import type { NativePlatformReport } from '../examples/react-lynx/src/compatibility/types'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { PNG } from './lynx/png'
import { readNativeReport } from './lynx/reports'
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

async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx pixel evidence '))
  directories.push(directory)
  const crops = path.join(directory, 'crops')
  await fs.mkdir(crops)
  const report = structuredClone(androidReport) as NativePlatformReport
  for (const result of report.results) {
    const slots = result.checkpoints.some(checkpoint => checkpoint.name === 'pixel:probe-vs-control')
      ? ['probe', 'control']
      : result.id === 'variant-state'
        ? ['before', 'active']
        : result.id === 'animation-spin'
          ? ['before', 'after']
          : result.id === 'transition-basic' ? ['before', 'during', 'after'] : []
    for (const [index, slot] of slots.entries()) {
      await fs.writeFile(path.join(crops, `${result.id}-${slot}.png`), screenshot(8, 4, [index * 80, 165, 233, 255]))
    }
  }
  const reportPath = path.join(directory, 'report.json')
  await fs.writeFile(reportPath, JSON.stringify(report))
  return { crops, report, reportPath }
}

it('接收带完整且可见像素变化的原生报告', async () => {
  const { reportPath, report } = await fixture()
  await expect(readNativeReport(reportPath, 'android')).resolves.toEqual(report)
})

it('拒绝原始基线中仅多一列背景像素导致的支持结论', async () => {
  const { crops, reportPath } = await fixture()
  await fs.writeFile(path.join(crops, `${target}-probe.png`), screenshot(446, 171))
  await fs.writeFile(path.join(crops, `${target}-control.png`), screenshot(445, 171))
  await expect(readNativeReport(reportPath, 'android')).rejects.toThrow(/type-weight-style.*446x171.*445x171.*可见像素/)
})

it('不把 PNG 压缩编码差异当作可见像素差异', async () => {
  const { crops, reportPath } = await fixture()
  const first = screenshot(8, 4, undefined, 0)
  const second = screenshot(8, 4, undefined, 9)
  expect(first.equals(second)).toBe(false)
  await fs.writeFile(path.join(crops, `${target}-probe.png`), first)
  await fs.writeFile(path.join(crops, `${target}-control.png`), second)
  await expect(readNativeReport(reportPath, 'android')).rejects.toThrow(/type-weight-style.*可见像素/)
})

it('忽略完全透明像素中不可见的 RGB 数据', async () => {
  const { crops, reportPath } = await fixture()
  await fs.writeFile(path.join(crops, `${target}-probe.png`), screenshot(8, 4, [255, 0, 0, 0]))
  await fs.writeFile(path.join(crops, `${target}-control.png`), screenshot(8, 4, [0, 255, 0, 0]))
  await expect(readNativeReport(reportPath, 'android')).rejects.toThrow(/type-weight-style.*可见像素/)
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
  await expect(readNativeReport(reportPath, 'android')).rejects.toThrow(/type-weight-style-probe.png/)
})

it.each([[9, 4], [8, 5]])('尺寸 %ix%i 的截图即使颜色不同也不能与 8x4 对照', async (width, height) => {
  const { crops, reportPath } = await fixture()
  await fs.writeFile(path.join(crops, `${target}-probe.png`), screenshot(width, height, [128, 0, 0, 255]))
  await fs.writeFile(path.join(crops, `${target}-control.png`), screenshot(8, 4, [0, 0, 0, 255]))
  await expect(readNativeReport(reportPath, 'android')).rejects.toThrow(/截图尺寸不一致/)
})

it('相同 RGB 的透明度变化仍属于可见变化', async () => {
  const { crops, reportPath } = await fixture()
  await fs.writeFile(path.join(crops, `${target}-probe.png`), screenshot(8, 4, [0, 0, 0, 128]))
  await fs.writeFile(path.join(crops, `${target}-control.png`), screenshot(8, 4, [0, 0, 0, 255]))
  await expect(readNativeReport(reportPath, 'android')).resolves.toBeDefined()
})

it('相同尺寸的多行图中单个可见像素变化仍被接受', async () => {
  const { crops, reportPath } = await fixture()
  const first = PNG.sync.read(screenshot(8, 4))
  const second = PNG.sync.read(screenshot(8, 4))
  first.data[(2 * first.width + 3) * 4] = 100
  second.data[(2 * second.width + 3) * 4] = 100
  await fs.writeFile(path.join(crops, `${target}-probe.png`), PNG.sync.write(first))
  await fs.writeFile(path.join(crops, `${target}-control.png`), PNG.sync.write(second))
  await expect(readNativeReport(reportPath, 'android')).rejects.toThrow(/可见像素/)
  first.data[(2 * first.width + 3) * 4] = 101
  await fs.writeFile(path.join(crops, `${target}-probe.png`), PNG.sync.write(first))
  await expect(readNativeReport(reportPath, 'android')).resolves.toBeDefined()
})

it('额外列中的颜色不能代替等尺寸的样式证据', async () => {
  const { crops, reportPath } = await fixture()
  const first = PNG.sync.read(screenshot(9, 4))
  for (let row = 0; row < first.height; row++) {
    first.data[(row * first.width + 8) * 4] = 255
  }
  await fs.writeFile(path.join(crops, `${target}-probe.png`), PNG.sync.write(first))
  await fs.writeFile(path.join(crops, `${target}-control.png`), screenshot(8, 4))
  await expect(readNativeReport(reportPath, 'android')).rejects.toThrow(/可见像素/)
})

it('拒绝只声明 pixel 前缀而缺少具体采样契约的 checkpoint', async () => {
  const { report, reportPath } = await fixture()
  report.results.find(result => result.id === target)!.checkpoints = [{ name: 'pixel:exists', passed: true }]
  await fs.writeFile(reportPath, JSON.stringify(report))
  await expect(readNativeReport(reportPath, 'android')).rejects.toThrow(/缺少 pixel:probe-vs-control checkpoint/)
})

it('拒绝动画时间序列仅有编码变化的通过结论', async () => {
  const { crops, report, reportPath } = await fixture()
  const result = report.results.find(result => result.id === 'animation-spin')!
  result.status = 'supported'
  result.checkpoints = [{ name: 'interaction:animation-progress', passed: true }]
  await fs.writeFile(reportPath, JSON.stringify(report))
  await fs.writeFile(path.join(crops, 'animation-spin-before.png'), screenshot(8, 4, undefined, 0))
  await fs.writeFile(path.join(crops, 'animation-spin-after.png'), screenshot(8, 4, undefined, 9))
  await expect(readNativeReport(reportPath, 'android')).rejects.toThrow(/animation-spin.*可见像素/)
})

it('transition 必须在相邻两个区间都有可见变化', async () => {
  const { crops, report, reportPath } = await fixture()
  const result = report.results.find(result => result.id === 'transition-basic')!
  result.status = 'supported'
  result.checkpoints = [{ name: 'interaction:transition-progress', passed: true }]
  await fs.writeFile(reportPath, JSON.stringify(report))
  await fs.copyFile(path.join(crops, 'transition-basic-during.png'), path.join(crops, 'transition-basic-after.png'))
  await expect(readNativeReport(reportPath, 'android')).rejects.toThrow(/transition-basic.*during.*after.*可见像素/)
})

it('不支持的结论也必须保留可解码的截图', async () => {
  const { crops, report, reportPath } = await fixture()
  const result = report.results.find(result => result.id === target)!
  result.status = 'unsupported'
  result.reason = 'probe/control 元素截图没有可观察的像素差异'
  result.checkpoints[0]!.passed = false
  await fs.writeFile(reportPath, JSON.stringify(report))
  await fs.copyFile(path.join(crops, `${target}-probe.png`), path.join(crops, `${target}-control.png`))
  await expect(readNativeReport(reportPath, 'android')).resolves.toBeDefined()
  await fs.rm(path.join(crops, `${target}-control.png`))
  await expect(readNativeReport(reportPath, 'android')).rejects.toThrow(/type-weight-style-control.png/)
})
