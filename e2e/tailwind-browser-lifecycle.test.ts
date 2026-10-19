import { beforeEach, expect, it, vi } from 'vitest'
import { runWebSuite } from './tailwind-capabilities/web-suite'

const mocks = vi.hoisted(() => ({ launch: vi.fn(), close: vi.fn(), web: vi.fn(), registry: vi.fn(), authoring: vi.fn(), hmr: vi.fn(), context: vi.fn(), framework: vi.fn() }))
vi.mock('playwright', () => ({ chromium: { launch: mocks.launch }, firefox: { launch: mocks.launch }, webkit: { launch: mocks.launch } }))
vi.mock('./tailwind-capabilities/inventory', () => ({ loadInventory: async () => ({ utilities: [{ id: 'utility/static/flex' }] }) }))
vi.mock('./tailwind-capabilities/web', () => ({ runWeb: mocks.web, webProbes: [{ id: 'color' }] }))
vi.mock('./tailwind-capabilities/registry-web', () => ({ runRegistryWeb: mocks.registry }))
vi.mock('./tailwind-capabilities/authoring-web', () => ({ runAuthoringWeb: mocks.authoring, authoringWebProfiles: [{ id: 'authoring/theme' }] }))
vi.mock('./tailwind-capabilities/hmr', () => ({ runHmr: mocks.hmr }))
vi.mock('./tailwind-capabilities/web-context/run', () => ({ runContextWeb: mocks.context }))
vi.mock('./tailwind-capabilities/framework-source', () => ({ runFrameworkSource: mocks.framework, frameworkSourceProfiles: [{ id: 'framework/react/conditional' }] }))
const context = { root: 'unit', directory: 'unit', runId: 'unit-browser-lifecycle' }

beforeEach(() => {
  vi.resetAllMocks()
  mocks.launch.mockResolvedValue({ close: mocks.close })
  for (const runner of [mocks.web, mocks.registry, mocks.authoring, mocks.hmr, mocks.context, mocks.framework]) {
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
  expect(mocks.context).toHaveBeenCalledExactlyOnceWith(context, 'firefox', browser)
  expect(mocks.framework).toHaveBeenCalledExactlyOnceWith(context, 'firefox', browser)
  expect(mocks.close).toHaveBeenCalledTimes(1)
})

it('子 runner 抛错后仍收集后续独立分组并关闭本任务实例', async () => {
  mocks.registry.mockRejectedValue(new Error('registry failed'))
  await expect(runWebSuite(context, 'chromium')).rejects.toThrow('registry failed')
  expect(mocks.launch).toHaveBeenCalledTimes(1)
  expect(mocks.close).toHaveBeenCalledTimes(1)
  for (const runner of [mocks.authoring, mocks.hmr, mocks.context, mocks.framework]) {
    expect(runner).toHaveBeenCalledTimes(1)
  }
})

it('即使全部语义通过，关闭失败也不能将执行判为成功', async () => {
  mocks.close.mockRejectedValue(new Error('owned browser cleanup failed'))
  await expect(runWebSuite(context, 'webkit')).rejects.toThrow('owned browser cleanup failed')
})

it('聚合未通过报告、执行异常与清理异常，保留分组和原始原因', async () => {
  const registryError = new Error('registry crashed before reporting')
  const cleanupError = new Error('owned browser cleanup failed')
  mocks.web.mockResolvedValue({ results: [{ id: 'color', status: 'failed', reason: 'wrong color' }] })
  mocks.registry.mockRejectedValue(registryError)
  mocks.authoring.mockResolvedValue({ results: [{ id: 'theme', status: 'blocked', reason: 'reference unavailable' }] })
  mocks.close.mockRejectedValue(cleanupError)
  const error = await runWebSuite(context, 'firefox').catch(error => error) as AggregateError
  expect(error).toBeInstanceOf(AggregateError)
  expect(error.errors).toHaveLength(4)
  expect(error.errors.map(item => item.message)).toEqual([
    expect.stringContaining('authored: Error: Tailwind 能力报告：1 项尚未通过：color (failed: wrong color)'),
    expect.stringContaining('registry: Error: registry crashed before reporting'),
    expect.stringContaining('authoring: Error: Tailwind 能力报告：1 项尚未通过：theme (blocked: reference unavailable)'),
    expect.stringContaining('cleanup: Error: owned browser cleanup failed'),
  ])
  expect(error.errors[1].cause).toBe(registryError)
  expect(error.errors[3].cause).toBe(cleanupError)
  expect(String(error)).toContain('wrong color')
  expect(String(error)).toContain('registry crashed before reporting')
  expect(String(error)).toContain('reference unavailable')
  expect(String(error)).toContain('owned browser cleanup failed')
  for (const runner of [mocks.hmr, mocks.context, mocks.framework]) {
    expect(runner).toHaveBeenCalledTimes(1)
  }
  expect(mocks.close).toHaveBeenCalledTimes(1)
})

it('过滤后只执行选中的独立分组', async () => {
  await runWebSuite({ ...context, caseFilter: /^authoring\// }, 'chromium')
  expect(mocks.authoring).toHaveBeenCalledTimes(1)
  for (const runner of [mocks.web, mocks.registry, mocks.hmr, mocks.context, mocks.framework]) {
    expect(runner).not.toHaveBeenCalled()
  }
  expect(mocks.close).toHaveBeenCalledTimes(1)
})

it('浏览器启动失败时不能执行分组或创建替代实例', async () => {
  mocks.launch.mockRejectedValue(new Error('browser unavailable'))
  await expect(runWebSuite(context, 'webkit')).rejects.toThrow('browser unavailable')
  expect(mocks.launch).toHaveBeenCalledTimes(1)
  expect(mocks.close).not.toHaveBeenCalled()
  for (const runner of [mocks.web, mocks.registry, mocks.authoring, mocks.hmr, mocks.context, mocks.framework]) {
    expect(runner).not.toHaveBeenCalled()
  }
})
