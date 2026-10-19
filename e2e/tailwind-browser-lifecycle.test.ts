import { beforeEach, expect, it, vi } from 'vitest'
import { runWebSuite } from './tailwind-capabilities/web-suite'

const mocks = vi.hoisted(() => ({ launch: vi.fn(), close: vi.fn(), web: vi.fn(), registry: vi.fn(), authoring: vi.fn(), hmr: vi.fn() }))
vi.mock('playwright', () => ({ chromium: { launch: mocks.launch }, firefox: { launch: mocks.launch }, webkit: { launch: mocks.launch } }))
vi.mock('./tailwind-capabilities/inventory', () => ({ loadInventory: async () => ({ utilities: [{ id: 'utility/static/flex' }] }) }))
vi.mock('./tailwind-capabilities/web', () => ({ runWeb: mocks.web, webProbes: [{ id: 'color' }] }))
vi.mock('./tailwind-capabilities/registry-web', () => ({ runRegistryWeb: mocks.registry }))
vi.mock('./tailwind-capabilities/authoring-web', () => ({ runAuthoringWeb: mocks.authoring, authoringWebProfiles: [{ id: 'authoring/theme' }] }))
vi.mock('./tailwind-capabilities/hmr', () => ({ runHmr: mocks.hmr }))
const context = { root: 'unit', directory: 'unit', runId: 'unit-browser-lifecycle' }

beforeEach(() => {
  vi.resetAllMocks()
  mocks.launch.mockResolvedValue({ close: mocks.close })
  for (const runner of [mocks.web, mocks.registry, mocks.authoring, mocks.hmr]) {
    // 合成协议数据只用于资源生命周期回归，不作为真实浏览器能力证据。
    runner.mockResolvedValue({ results: [{ status: 'passed' }] })
  }
})

it('一个引擎只创建一个后台实例，所有分组借用同一实例并定向关闭', async () => {
  await runWebSuite(context, 'firefox')
  expect(mocks.launch).toHaveBeenCalledExactlyOnceWith({ headless: true })
  const browser = await mocks.launch.mock.results[0]!.value
  expect(mocks.web).toHaveBeenCalledExactlyOnceWith(context, 'firefox', browser)
  expect(mocks.registry).toHaveBeenCalledExactlyOnceWith(context, 'firefox', 20, browser)
  expect(mocks.authoring).toHaveBeenCalledExactlyOnceWith(context, 'firefox', browser)
  expect(mocks.hmr).toHaveBeenCalledExactlyOnceWith(context, 'firefox', browser)
  expect(mocks.close).toHaveBeenCalledTimes(1)
})

it('子 runner 抛错后仍关闭本任务实例，不创建替代实例继续重试', async () => {
  mocks.registry.mockRejectedValue(new Error('registry failed'))
  await expect(runWebSuite(context, 'chromium')).rejects.toThrow('registry failed')
  expect(mocks.launch).toHaveBeenCalledTimes(1)
  expect(mocks.close).toHaveBeenCalledTimes(1)
  expect(mocks.authoring).not.toHaveBeenCalled()
})

it('即使全部语义通过，关闭失败也不能将执行判为成功', async () => {
  mocks.close.mockRejectedValue(new Error('owned browser cleanup failed'))
  await expect(runWebSuite(context, 'webkit')).rejects.toThrow('owned browser cleanup failed')
})
