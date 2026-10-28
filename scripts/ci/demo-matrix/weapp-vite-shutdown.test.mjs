import { AsyncLocalStorage } from 'node:async_hooks'
import { EventEmitter } from 'node:events'
import { expect, it, vi } from 'vitest'
import { repo } from './catalog.mjs'
import { evaluatePublishedDefinitions, publishedClassMethods, publishedExport } from './weapp-vite-package.fixture.mjs'

const bindHostLifecycle = await publishedExport('bindHostLifecycle')
const takeHostLifecycle = await publishedExport('takeHostLifecycle')

function createScope(signals) {
  signals.stdin ??= new EventEmitter()
  const { createDevShutdownScope } = evaluatePublishedDefinitions(['DevShutdownScope', 'createDevShutdownScope'], {
    process: signals,
    operations: new AsyncLocalStorage(),
  })
  return createDevShutdownScope()
}

function serve(signals, driver) {
  const backend = { descriptor: { id: 'miniprogram' }, driver }
  const targets = { select: () => [backend], has: () => true }
  let action
  const cli = {
    command: () => cli,
    alias: () => cli,
    option: () => cli,
    action: (callback) => { action = callback },
  }
  const { registerServeCommand } = evaluatePublishedDefinitions(['startServeCommand', 'registerServeCommand'], {
    createDevShutdownScope: () => createScope(signals),
    process: signals,
    filterDuplicateOptions() {},
    parseDashboardUiHost() {},
    setCommandNodeEnv() {},
    resolveConfigFile() {},
    resolveRuntimeTargets: () => targets,
    resolveConfiguredRuntimeTargets: value => value,
    resolveWebHost() {},
    getBackendForCapability: (_, id) => id === 'miniprogram' ? backend : undefined,
    createInlineConfig() {},
    createCompilerContext: async () => ({ configService: { weappViteConfig: {} } }),
    getHmrRuntimeSession: () => ({ classicIdeConfig: { close: async () => {} } }),
    detectAiDevelopmentEnvironment: async () => ({}),
    applyMcpCliOptions() {},
    logRuntimeTarget() {},
    isUiEnabled: () => false,
    createServeDevelopmentActions: () => ({}),
    startDevHotkeys: () => ({ restore() {}, close() {} }),
    createAnalyzeController: () => ({}),
    logger_default: { success() {}, error() {} },
    formatDuration: String,
    logBuildAppFinish() {},
    closeActiveForwardConsole: async () => {},
  })
  registerServeCommand(cli)
  return () => action(repo, {})
}

/** 资源替身只提供外部关闭动作，租约获取、排空和幂等关闭执行真实发布方法。 */
function session(install) {
  const methods = publishedClassMethods('StatefulHmrSession', ['prepareIdeAssetWatch', 'prepareClassicHandoff', 'close', 'closeResources'], {
    resolveIdePrivateConfigPath: () => 'fixture',
    installIdeAssetWatch: install,
    getHmrRuntimeSession: () => ({ classicIdeConfig: {} }),
    getCompilerHmrHost: () => ({}),
    clearTimeout,
  })
  return {
    ...methods,
    ctx: { configService: { outDir: 'fixture', projectConfig: {} } },
    snapshots: { initial: { output: [] } },
    delivery: { close: vi.fn(async () => {}) },
    snapshotScheduler: { close: vi.fn(async () => {}) },
    interruptSettlement: vi.fn(async () => {}),
    transport: { close: vi.fn(async () => {}) },
    adapter: { close: vi.fn(async () => {}) },
    sourceDirtyReasons: new Map(),
    unpersistedNativeScripts: new Map(),
    nativeScriptInputs: { clear: vi.fn() },
    retiringOutputFailures: new Set(),
    outputChain: Promise.resolve(),
  }
}

function host(close = vi.fn(async () => {}), restart = vi.fn(async () => {}), inlineConfig = {}) {
  return { close, restart, config: { inlineConfig }, watcher: { close: vi.fn(async () => {}) } }
}

it.each(['success', 'startup-error', 'cleanup-error'])('真实 serve action 保持整个启动和关闭作用域：%s', async (mode) => {
  const signals = new EventEmitter()
  const external = vi.fn()
  signals.on('SIGTERM', external)
  const started = Promise.withResolvers()
  const startup = Promise.withResolvers()
  const closing = Promise.withResolvers()
  const cleanup = Promise.withResolvers()
  const driver = {
    dev: vi.fn(() => {
      started.resolve()
      return startup.promise
    }),
    close: vi.fn(() => {
      closing.resolve()
      return cleanup.promise
    }),
  }
  let finished = false
  const result = serve(signals, driver)().then(() => undefined, error => error).finally(() => {
    finished = true
  })
  try {
    await started.promise
    expect(signals.listenerCount('SIGINT')).toBe(1)
    signals.emit('SIGTERM')
    if (mode === 'startup-error') {
      startup.reject(new Error(mode))
    }
    else { startup.resolve() }
    await closing.promise
    signals.emit('SIGTERM')
    signals.emit('SIGINT')
    expect(finished).toBe(false)
    expect(signals.listenerCount('SIGINT')).toBe(1)
    if (mode === 'cleanup-error') {
      cleanup.reject(new Error(mode))
    }
    else {
      cleanup.resolve()
    }
    expect((await result)?.message).toBe(mode === 'success' ? undefined : mode)
    expect(driver.close).toHaveBeenCalledTimes(1)
    expect(signals.listenerCount('SIGINT')).toBe(0)
    expect(signals.listeners('SIGTERM')).toEqual([external])
  }
  finally {
    startup.resolve()
    cleanup.resolve()
    signals.emit('SIGTERM')
    await result
  }
})

it('启动前监听退出信号，重复信号不能提前移除清理期间的监听', async () => {
  const signals = new EventEmitter()
  const external = vi.fn()
  signals.on('SIGTERM', external)
  const scope = createScope(signals)
  const started = Promise.withResolvers()
  const cleanup = Promise.withResolvers()
  scope.own(() => {
    started.resolve()
    return cleanup.promise
  })
  try {
    expect(signals.listenerCount('SIGINT')).toBe(1)
    signals.emit('SIGTERM')
    await scope.signal
    await started.promise
    signals.emit('SIGINT')
    signals.emit('SIGTERM')
    expect(signals.listenerCount('SIGINT')).toBe(1)
    expect(signals.listenerCount('SIGTERM')).toBe(2)
  }
  finally {
    cleanup.resolve()
    await scope.close()
  }
  expect(signals.listenerCount('SIGINT')).toBe(0)
  expect(signals.listeners('SIGTERM')).toEqual([external])
})

it.each(['resolve', 'reject'])('并发释放共享完成边界，下一轮安装等待旧租约 %s', async (result) => {
  const cleanup = Promise.withResolvers()
  const restoring = Promise.withResolvers()
  const failure = new Error('restore failed')
  const restore = vi.fn(() => {
    restoring.resolve()
    return cleanup.promise
  })
  const nextRestore = vi.fn()
  const install = vi.fn().mockResolvedValueOnce(restore).mockResolvedValueOnce(nextRestore)
  const first = session(install)
  const next = session(install)
  await first.prepareIdeAssetWatch()
  let server
  const nativeRestart = vi.fn(async () => {
    await next.prepareIdeAssetWatch()
    const replacement = host(undefined, undefined, server.config.inlineConfig)
    bindHostLifecycle(replacement, () => next.close(), takeHostLifecycle(replacement.config.inlineConfig))
    Object.assign(server, replacement)
  })
  server = host(undefined, nativeRestart)
  bindHostLifecycle(server, () => first.close())
  const restarting = server.restart()
  const observed = restarting.then(() => undefined, error => error)
  try {
    await restoring.promise
    expect(install).toHaveBeenCalledTimes(1)
    expect(nativeRestart).not.toHaveBeenCalled()
    expect(first.close()).toBe(first.close())
    if (result === 'reject') {
      cleanup.reject(failure)
    }
    else { cleanup.resolve() }
    expect(await observed).toBe(result === 'reject' ? failure : undefined)
    expect(install).toHaveBeenCalledTimes(result === 'reject' ? 1 : 2)
    expect(restore).toHaveBeenCalledTimes(1)
  }
  finally {
    cleanup.resolve()
    await observed
    if (result === 'reject') {
      await expect(server.close()).rejects.toBe(failure)
    }
    else {
      await server.close()
    }
  }
  if (result === 'resolve') {
    expect(nextRestore).toHaveBeenCalledTimes(1)
  }
})

it.each(['success', 'native-error', 'lease-error'])('public close 等待真实会话租约恢复并传播错误：%s', async (mode) => {
  const cleanup = Promise.withResolvers()
  const restoring = Promise.withResolvers()
  const failure = new Error(mode)
  const restore = vi.fn(() => {
    restoring.resolve()
    return cleanup.promise
  })
  const resource = session(vi.fn().mockResolvedValue(restore))
  await resource.prepareIdeAssetWatch()
  const nativeClose = vi.fn(async () => {
    if (mode === 'native-error') {
      throw failure
    }
  })
  const server = host(nativeClose)
  bindHostLifecycle(server, () => resource.close())
  let settled = false
  const first = server.close()
  const second = server.close()
  const finished = Promise.allSettled([first, second]).then((results) => {
    settled = true
    return results
  })
  try {
    expect(first).toBe(second)
    await restoring.promise
    expect(settled).toBe(false)
    expect(nativeClose).not.toHaveBeenCalled()
    if (mode === 'lease-error') {
      cleanup.reject(failure)
    }
    else {
      cleanup.resolve()
    }
    const results = await finished
    expect(results.map(item => item.status)).toEqual(Array.from({ length: 2 }).fill(mode === 'success' ? 'fulfilled' : 'rejected'))
    if (mode !== 'success') {
      expect(results.map(item => item.reason)).toEqual([failure, failure])
    }
    expect(nativeClose).toHaveBeenCalledTimes(1)
    expect(restore).toHaveBeenCalledTimes(1)
  }
  finally {
    cleanup.resolve()
    await finished
  }
})

it('会话资源关闭失败时，仍恢复租约并保留失败', async () => {
  const failure = new Error('delivery close failed')
  const restore = vi.fn()
  const resource = session(vi.fn().mockResolvedValue(restore))
  await resource.prepareIdeAssetWatch()
  resource.delivery.close.mockRejectedValue(failure)
  const first = resource.close()
  expect(first).toBe(resource.close())
  await expect(first).rejects.toBe(failure)
  expect(resource.snapshotScheduler.close).toHaveBeenCalledTimes(1)
  expect(resource.adapter.close).toHaveBeenCalledTimes(1)
  expect(restore).toHaveBeenCalledExactlyOnceWith(undefined)
})
