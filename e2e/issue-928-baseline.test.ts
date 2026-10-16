import type { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PNG } from 'pngjs'
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { compareIssue928Baseline, selectIssue928Baseline } from './issue-928/baseline'
import { cropCssPixelRegion } from './issue-928/css-pixel-region'
import { assertIssue928GradientRuntime } from './issue-928/gradient'

const state = vi.hoisted(() => ({ raw: new Uint8Array(), artifactDir: '', update: false }))
vi.mock('../scripts/demo-visual-e2e-report/mini-program-screenshot', () => ({
  captureMiniProgramViewport: async (_mini: unknown, file: string) => {
    const { writeFile } = await import('node:fs/promises')
    await writeFile(file, state.raw)
  },
}))
vi.mock('./issue-928/config', () => ({
  issue928PageUrl: '/pages/issue-928/index',
  timeoutMs: 30_000,
  get artifactDir() { return state.artifactDir },
  get shouldUpdateIssue928CompareBaseline() { return state.update },
}))

const fixtureDir = path.resolve(import.meta.dirname, 'fixtures/issue-928-baselines')
const rects = [
  { left: 24, top: 72, width: 112, height: 56 },
  { left: 148, top: 72, width: 112, height: 56 },
  { left: 24, top: 140, width: 112, height: 56 },
]
const compareRect = { left: 22, top: 70, width: 240, height: 128 }
let captures: Record<1 | 2, PNG>
let baselines: Record<1 | 2, Buffer>
let paths: Record<1 | 2, string>

beforeAll(async () => {
  captures = {
    1: PNG.sync.read(await fs.readFile(path.join(fixtureDir, 'captures/viewport-1x.png'))),
    2: PNG.sync.read(await fs.readFile(path.join(fixtureDir, 'captures/viewport-2x.png'))),
  }
  baselines = {
    1: await fs.readFile(path.join(fixtureDir, 'v4-compare-1x.png')),
    2: await fs.readFile(path.join(fixtureDir, 'v4-compare.png')),
  }
})

beforeEach(async () => {
  state.artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), 'issue928-baseline-'))
  state.update = false
  paths = { 1: path.join(state.artifactDir, '1x.png'), 2: path.join(state.artifactDir, '2x.png') }
  await Promise.all([fs.writeFile(paths[1], baselines[1]), fs.writeFile(paths[2], baselines[2])])
})

afterEach(async () => {
  await fs.rm(state.artifactDir, { recursive: true, force: true })
})

async function run(scale: 1 | 2, source = captures[scale], legacyOnly = false) {
  state.raw = PNG.sync.write(source)
  const selectors = ['gradient', 'via', 'stop', 'radial', 'conic', 'image']
  const page = {
    waitFor: async () => {},
    size: async () => ({ width: 375, height: 603 }),
    $: async (selector: string) => {
      const rect = rects[Math.min(selectors.indexOf(selector), 2)]!
      return {
        offset: async () => ({ left: rect.left, top: rect.top }),
        size: async () => ({ width: rect.width, height: rect.height }),
        attribute: async () => 'primary via from-cyan-500',
      }
    },
  }
  await assertIssue928GradientRuntime({ reLaunch: async () => page }, {
    artifactPrefix: 'sampling',
    coveredIssue: '#928',
    expectedPrimaryClass: 'primary',
    expectedViaClass: 'via',
    gradientSelector: 'gradient',
    viaSelector: 'via',
    stopSelector: 'stop',
    radialSelector: 'radial',
    conicSelector: 'conic',
    arbitraryImageSelector: 'image',
    ...(legacyOnly ? { compareBaselinePath: paths[2] } : { compareBaselinePaths: paths }),
  })
  return JSON.parse(await fs.readFile(path.join(state.artifactDir, 'sampling-issue-928-gradient-visual.json'), 'utf8'))
}

it.each([1, 2] as const)('真实 %sx 原图按相同运行时几何选择唯一基线并通过完整比较入口', async (scale) => {
  const result = await run(scale)
  expect(result.compareBaselinePath).toBe(paths[scale])
  expect(result.compareBaselineScale).toBe(scale)
  expect(result.compareDifferentPixels).toBe(0)
  expect(result.compareBaselineUpdated).toBe(false)
  expect(cropCssPixelRegion(captures[scale], 375, compareRect).data).toEqual(PNG.sync.read(baselines[scale]).data)
})

it('保留旧的单路径2x调用', async () => {
  expect((await run(2, captures[2], true)).compareDifferentPixels).toBe(0)
})

it.each([1, 2] as const)('选中的 %sx 基线错误时，即使另一份完全匹配也不能回退', async (scale) => {
  const other = scale === 1 ? 2 : 1
  await fs.writeFile(paths[scale], baselines[other])
  await fs.writeFile(paths[other], baselines[scale])
  await expect(run(scale)).rejects.toThrow('less than 10')
})

it.each(['missing', 'corrupt'])('普通验证遇到选中的 %s 基线直接失败且不自动更新', async (kind) => {
  if (kind === 'missing') {
    await fs.rm(paths[1])
  }
  else {
    await fs.writeFile(paths[1], 'invalid png')
  }
  await expect(run(1)).rejects.toThrow()
  if (kind === 'missing') {
    await expect(fs.access(paths[1])).rejects.toThrow()
  }
  else {
    expect(await fs.readFile(paths[1], 'utf8')).toBe('invalid png')
  }
  expect(await fs.readFile(paths[2])).toEqual(baselines[2])
})

it('显式1x更新只写当前密度，保留原2x基线', async () => {
  await fs.rm(paths[1])
  state.update = true
  const result = await run(1)
  expect(result.compareBaselineUpdated).toBe(true)
  expect(PNG.sync.read(await fs.readFile(paths[1])).data).toEqual(PNG.sync.read(baselines[1]).data)
  expect(await fs.readFile(paths[2])).toEqual(baselines[2])
})

it.each([1, 2] as const)('%sx 入口保留9像素通过、10像素拒绝的原门槛', async (scale) => {
  for (const count of [9, 10]) {
    const actual = PNG.sync.read(PNG.sync.write(captures[scale]))
    // 在白色边距写入黑色像素，避免把渐变的抗锯齿过滤误当作门槛变化。
    for (let x = 0; x < count; x++) {
      const index = (Math.floor(70.5 * scale) * actual.width + Math.floor((30.5 + x) * scale)) * 4
      actual.data.set([0, 0, 0, 255], index)
    }
    if (count === 9) {
      expect((await run(scale, actual)).compareDifferentPixels).toBe(9)
    }
    else {
      await expect(run(scale, actual)).rejects.toThrow('less than 10')
    }
  }
})

it.each([1, 2] as const)('%sx 比较仍拒绝真实颜色、位移和CSS尺寸回归', (scale) => {
  const expected = PNG.sync.read(baselines[scale])
  const changed = PNG.sync.read(baselines[scale])
  for (let y = 12; y < 24; y++) {
    for (let x = 12; x < 24; x++) {
      changed.data.set([0, 0, 0, 255], (y * changed.width + x) * 4)
    }
  }
  expect(compareIssue928Baseline(changed, expected).differentPixels).toBeGreaterThanOrEqual(10)
  const shifted = new PNG({ width: expected.width, height: expected.height })
  PNG.bitblt(expected, shifted, 0, 0, expected.width - 1, expected.height, 1, 0)
  expect(compareIssue928Baseline(shifted, expected).differentPixels).toBeGreaterThanOrEqual(10)
  expect(() => compareIssue928Baseline(new PNG({ width: expected.width + 2, height: expected.height }), expected)).toThrow()
})

it.each([[367, 390], [640, 390], [804, 375], [1125, 375], [0, 375], [375, 0], [Number.NaN, 375]])('不猜测未知或不可靠的采样 %s/%s', (width, viewport) => {
  expect(() => selectIssue928Baseline(width, viewport, paths)).toThrow('1x/2x')
})

it('缺少对应密度登记时不借用另一份路径', () => {
  expect(() => selectIssue928Baseline(375, 375, { 2: paths[2] })).toThrow('缺少 1x')
})

it.each(['/repo/baseline.png', 'C:\\repo\\baseline.png', '..\\fixtures\\baseline.png'])('选择只返回登记路径，不推导或改写平台路径 %s', (file) => {
  expect(selectIssue928Baseline(750, 375, { 2: file })).toEqual({ path: file, scale: 2 })
})
