import { rm } from 'node:fs/promises'
import { afterEach, expect, it, vi } from 'vitest'
import { PNG } from './lynx/png'
import { buildLynxCapabilityReport } from './tailwind-capabilities/lynx-adapter'
import { directories, fixture, rect } from './tailwind-capabilities/lynx/adapter-test-fixture'

vi.mock('./tailwind-capabilities/identity', async (original) => {
  const module = await original<typeof import('./tailwind-capabilities/identity')>()
  return { ...module, capabilityIdentity: async () => ({
    sourceHash: 'a'.repeat(64),
    lockfileHash: 'b'.repeat(64),
    catalogHash: 'c'.repeat(64),
    fixtureHash: 'd'.repeat(64),
    expectationsHash: 'e'.repeat(64),
    versions: { tailwindcss: '4.3.3' },
  }) }
})

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

function image(width: number, height: number) {
  const png = new PNG({ width: 480, height: 288 })
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const cx = (x + 0.5) / 3
      const cy = (y + 0.5) / 3
      const body = cx >= 8 && cx < 8 + width && cy >= 8 && cy < 8 + height
      const marker = cx >= 12 && cx < 16 && cy >= 12 && cy < 16
      png.data.set(marker ? [249, 115, 22, 255] : body ? [37, 99, 235, 255] : [255, 255, 255, 255], (y * png.width + x) * 4)
    }
  }
  return PNG.sync.write(png)
}

async function fixed(paintedHeight = 22.5) {
  const test = await fixture('sizing-fixed', 'supported', false)
  test.raw.environment.viewport = { width: 375, height: 812, pixelRatio: 3 }
  test.raw.results[0]!.screenMetrics = { version: 1, source: 'lynx-native-screen-v1', width: 375, height: 812, pixelRatio: 3 }
  test.raw.results[0]!.geometry = {
    probeContainer: rect(10, 20, 160, 96),
    controlContainer: rect(200, 300, 160, 96),
    probe: rect(18, 28, 123, 22.5),
    control: rect(208, 308, 80, 64),
    probeChild: rect(22, 32, 4, 4),
    controlChild: rect(212, 312, 4, 4),
  }
  await test.saveGeometry([image(123, paintedHeight), image(80, 64)])
  await test.save()
  return test
}

it('完整宽高、原生 screen 与两张实际 PNG 才能贡献混合 authoring 案例', async () => {
  const { context, raw } = await fixed()
  const { report, contracts } = await buildLynxCapabilityReport(context, 'lynx-ios', raw)
  expect(report.results[0]).toMatchObject({ status: 'passed', support: 'supported', assertions: [{ actual: 'supported', expected: 'supported' }] })
  expect(contracts[0]!.features).toEqual(['authoring/sizing-fixed'])
})

it('旧报告的正确宽度和可见截图缺少 screen 时仍阻断', async () => {
  const { context, raw } = await fixture('sizing-fixed')
  const { report } = await buildLynxCapabilityReport(context, 'lynx-ios', raw)
  expect(report.results[0]).toMatchObject({ status: 'blocked', assertions: [], reason: expect.stringContaining('screen') })
})

it.each([40, 45, 64])('伪造几何不能令实际 %s 高的 PNG 通过适配器', async (height) => {
  const { context, raw } = await fixed(height)
  const { report } = await buildLynxCapabilityReport(context, 'lynx-ios', raw)
  expect(report.results[0]).toMatchObject({ status: 'blocked', assertions: [], reason: expect.stringContaining('截图') })
})
