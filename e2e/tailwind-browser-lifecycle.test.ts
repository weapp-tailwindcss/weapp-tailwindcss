import { beforeEach, expect, it, vi } from 'vitest'
import { runWebSuite } from './tailwind-capabilities/web-suite'

const mocks = vi.hoisted(() => ({ launch: vi.fn(), close: vi.fn(), web: vi.fn(), registry: vi.fn(), authoring: vi.fn(), hmr: vi.fn(), context: vi.fn(), framework: vi.fn(), lifecycle: vi.fn(), nativeMedia: vi.fn(), autofill: vi.fn(), history: vi.fn() }))
vi.mock('playwright', () => ({ chromium: { launch: mocks.launch, executablePath: () => '/unit/full-chromium' }, firefox: { launch: mocks.launch }, webkit: { launch: mocks.launch } }))
vi.mock('./tailwind-capabilities/inventory', () => ({ loadInventory: async () => ({ utilities: [{ id: 'utility/static/flex' }] }) }))
vi.mock('./tailwind-capabilities/web', () => ({ runWeb: mocks.web, webProbes: [{ id: 'color' }] }))
vi.mock('./tailwind-capabilities/registry-web', () => ({ runRegistryWeb: mocks.registry }))
vi.mock('./tailwind-capabilities/authoring-web', () => ({ runAuthoringWeb: mocks.authoring, authoringWebProfiles: [{ id: 'authoring/theme' }] }))
vi.mock('./tailwind-capabilities/hmr', () => ({ runHmr: mocks.hmr }))
vi.mock('./tailwind-capabilities/web-context/run', () => ({ runContextWeb: mocks.context }))
vi.mock('./tailwind-capabilities/framework-source', () => ({ runFrameworkSource: mocks.framework, frameworkSourceProfiles: [{ id: 'framework/react/conditional' }] }))
vi.mock('./tailwind-capabilities/web-lifecycle/run', () => ({ runLifecycleWeb: mocks.lifecycle }))
vi.mock('./tailwind-capabilities/web-native-media/run', () => ({ runNativeMediaWeb: mocks.nativeMedia }))
vi.mock('./tailwind-capabilities/web-history/run', () => ({ runHistoryWeb: mocks.history }))
vi.mock('./tailwind-capabilities/web-autofill/run', () => ({ runAutofillWeb: mocks.autofill }))
const context = { root: 'unit', directory: 'unit', runId: 'unit-browser-lifecycle' }

beforeEach(() => {
  vi.resetAllMocks()
  mocks.launch.mockResolvedValue({ close: mocks.close })
  for (const runner of [mocks.web, mocks.registry, mocks.authoring, mocks.hmr, mocks.context, mocks.framework, mocks.lifecycle, mocks.nativeMedia, mocks.autofill, mocks.history]) {
    // 合成协议数据只用于资源生命周期回归，不作为真实浏览器能力证据。
    runner.mockResolvedValue({ results: [{ status: 'passed' }] })
  }
})

it('普通分组共用一个后台实例，历史组拥有独立 profile 入口', async () => {
  await runWebSuite(context, 'firefox')
  expect(mocks.launch).toHaveBeenCalledExactlyOnceWith({ headless: true })
  const browser = await mocks.launch.mock.results[0]!.value
  expect(mocks.web).toHaveBeenCalledExactlyOnceWith(context, 'firefox', browser)
  expect(mocks.registry).toHaveBeenCalledExactlyOnceWith(context, 'firefox', 20, browser)
  expect(mocks.authoring).toHaveBeenCalledExactlyOnceWith(context, 'firefox', browser)
  expect(mocks.hmr).toHaveBeenCalledExactlyOnceWith(context, 'firefox', browser)
  expect(mocks.context).toHaveBeenCalledExactlyOnceWith(context, 'firefox', browser)
  expect(mocks.framework).toHaveBeenCalledExactlyOnceWith(context, 'firefox', browser)
  expect(mocks.lifecycle).toHaveBeenCalledExactlyOnceWith(context, 'firefox', browser)
  expect(mocks.nativeMedia).not.toHaveBeenCalled()
  expect(mocks.close).toHaveBeenCalledTimes(1)
})

it('子 runner 抛错后仍收集后续独立分组并关闭本任务实例', async () => {
  mocks.registry.mockRejectedValue(new Error('registry failed'))
  await expect(runWebSuite(context, 'chromium')).rejects.toThrow('registry failed')
  expect(mocks.launch).toHaveBeenCalledTimes(1)
  expect(mocks.close).toHaveBeenCalledTimes(1)
  for (const runner of [mocks.authoring, mocks.hmr, mocks.context, mocks.framework, mocks.lifecycle, mocks.nativeMedia, mocks.autofill, mocks.history]) {
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
  for (const runner of [mocks.hmr, mocks.context, mocks.framework, mocks.lifecycle]) {
    expect(runner).toHaveBeenCalledTimes(1)
  }
  expect(mocks.close).toHaveBeenCalledTimes(1)
})

it.each([['authoring', /^authoring\//], ['lifecycle', /^runtime\/lifecycle-/]] as const)('%s 过滤后只执行选中的独立分组', async (group, caseFilter) => {
  await runWebSuite({ ...context, caseFilter }, 'chromium')
  const selected = mocks[group]
  expect(selected).toHaveBeenCalledTimes(1)
  for (const runner of [mocks.web, mocks.registry, mocks.authoring, mocks.hmr, mocks.context, mocks.framework, mocks.lifecycle, mocks.nativeMedia, mocks.autofill, mocks.history].filter(runner => runner !== selected)) {
    expect(runner).not.toHaveBeenCalled()
  }
  expect(mocks.close).toHaveBeenCalledTimes(1)
})

it('浏览器启动失败时不能执行分组或创建替代实例', async () => {
  mocks.launch.mockRejectedValue(new Error('browser unavailable'))
  await expect(runWebSuite(context, 'webkit')).rejects.toThrow('browser unavailable')
  expect(mocks.launch).toHaveBeenCalledTimes(1)
  expect(mocks.close).not.toHaveBeenCalled()
  for (const runner of [mocks.web, mocks.registry, mocks.authoring, mocks.hmr, mocks.context, mocks.framework, mocks.lifecycle, mocks.nativeMedia, mocks.autofill, mocks.history]) {
    expect(runner).not.toHaveBeenCalled()
  }
})

it('Chromium 原生媒体单独过滤，其他引擎不得创建浏览器或伪造空成功', async () => {
  const selected = { ...context, caseFilter: /^runtime\/native-media-/ }
  await runWebSuite(selected, 'chromium')
  expect(mocks.nativeMedia).toHaveBeenCalledTimes(1)
  expect(mocks.close).toHaveBeenCalledTimes(1)
  vi.clearAllMocks()
  for (const engine of ['firefox', 'webkit'] as const) {
    await expect(runWebSuite(selected, engine)).rejects.toThrow(/没有匹配/)
  }
  expect(mocks.launch).not.toHaveBeenCalled()
  expect(mocks.nativeMedia).not.toHaveBeenCalled()
})

it('Autofill 复用预检覆盖的完整 Chromium，其他引擎保持未执行', async () => {
  const selected = { ...context, caseFilter: /^runtime\/autofill-/ }
  await runWebSuite(selected, 'chromium')
  expect(mocks.launch).toHaveBeenCalledExactlyOnceWith({ headless: true, executablePath: '/unit/full-chromium' })
  expect(mocks.autofill).toHaveBeenCalledTimes(1)
  expect(mocks.close).toHaveBeenCalledTimes(1)
  vi.clearAllMocks()
  for (const engine of ['firefox', 'webkit'] as const) {
    await expect(runWebSuite(selected, engine)).rejects.toThrow(/没有匹配/)
  }
  expect(mocks.launch).not.toHaveBeenCalled()
  expect(mocks.autofill).not.toHaveBeenCalled()
})

it.each(['chromium', 'firefox', 'webkit'] as const)('%s 历史单独过滤只创建必要persistent profiles，不额外打开普通Browser', async (engine) => {
  await runWebSuite({ ...context, caseFilter: /^runtime\/history-/ }, engine)
  expect(mocks.history).toHaveBeenCalledTimes(1)
  expect(mocks.launch).not.toHaveBeenCalled()
  expect(mocks.close).not.toHaveBeenCalled()
  expect(mocks.web).not.toHaveBeenCalled()
})
