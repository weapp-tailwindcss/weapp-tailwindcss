import { EventEmitter } from 'node:events'
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { runInNewContext } from 'node:vm'
import { parseSync, traverse } from '@babel/core'
import { expect, it, vi } from 'vitest'
import { repo } from './catalog.mjs'

const demoRequire = createRequire(path.join(repo, 'demo/weapp-vite-tailwindcss-v4/package.json'))
const dist = path.join(path.dirname(demoRequire.resolve('weapp-vite/package.json')), 'dist')
const contextSource = readFileSync(path.join(dist, readdirSync(dist).find(name => /^createContext-.*\.mjs$/.test(name))), 'utf8')
const cliSource = readFileSync(path.join(dist, 'cli.mjs'), 'utf8')

// 执行发行包里的真实私有实现，避免导入 CLI 触发其命令入口。
function fragment(source, predicate) {
  const ast = parseSync(source, { babelrc: false, configFile: false, sourceType: 'module' })
  const matches = []
  traverse(ast, {
    enter({ node }) {
      if (predicate(node)) {
        matches.push(node)
      }
    },
  })
  expect(matches).toHaveLength(1)
  return source.slice(matches[0].start, matches[0].end)
}

function deferred() {
  return Promise.withResolvers()
}

const scopeSource = fragment(cliSource, node => node.type === 'FunctionDeclaration' && /^(?:waitForServeShutdownSignal|createServeShutdownSignalScope)$/.test(node.id.name))
const serveSource = fragment(cliSource, node => node.type === 'FunctionDeclaration' && node.id.name === 'registerServeCommand')
const ownershipSource = fragment(contextSource, node => node.type === 'ObjectExpression' && node.properties.some(property => property.key?.name === 'name' && property.value?.value === 'weapp-vite:ide-asset-watch-ownership'))
const installSource = fragment(contextSource, node => node.type === 'IfStatement' && node.test.type === 'Identifier' && node.test.name === 'privateConfigPath')
const leaseSource = contextSource.slice(contextSource.indexOf('\tlet restoreAssetWatch;'), contextSource.indexOf('\tasync function trackStatefulRestart('))

function lease(install) {
  return runInNewContext(`${leaseSource}\n({ release: releaseAssetWatch, install: async () => { ${installSource} } })`, {
    configService: { outDir: 'fixture', projectConfig: {} },
    privateConfigPath: 'fixture',
    initialSnapshot: [],
    installIdeAssetWatch: install,
  })
}

function serve(signals, driver) {
  const backend = { descriptor: { id: 'miniprogram' }, driver }
  let action
  const cli = {
    command: () => cli,
    alias: () => cli,
    option: () => cli,
    action: (callback) => { action = callback },
  }
  runInNewContext(`${scopeSource}\n${serveSource}\nregisterServeCommand(cli)`, {
    cli,
    process: signals,
    filterDuplicateOptions() {},
    setCommandNodeEnv() {},
    resolveConfigFile() {},
    resolveRuntimeTargets: () => ({ select: () => [backend], has: () => true }),
    getBackendForCapability: (_, id) => id === 'miniprogram' ? backend : undefined,
    createInlineConfig() {},
    createCompilerContext: async () => ({ configService: { multiPlatform: {}, weappViteConfig: {} } }),
    detectAiDevelopmentEnvironment: async () => ({}),
    applyMcpCliOptions() {},
    logRuntimeTarget() {},
    isUiEnabled: () => false,
    createServeMiniProgramDevActions: () => ({}),
    resolveIdeProjectRoot() {},
    startDevHotkeys: () => ({ restore() {}, close() {} }),
    createAnalyzeController: () => ({}),
    logger_default: { success() {} },
    formatDuration: String,
    logBuildAppFinish() {},
    closeActiveForwardConsole: async () => {},
  })
  return () => action(repo, {})
}

it.each(['success', 'startup-error', 'cleanup-error'])('真实 serve action 保持整个启动和关闭作用域：%s', async (mode) => {
  const signals = new EventEmitter()
  const external = vi.fn()
  signals.on('SIGTERM', external)
  const started = deferred()
  const startup = deferred()
  const closing = deferred()
  const cleanup = deferred()
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
  const action = serve(signals, driver)
  let finished = false
  const result = action().then(() => undefined, error => error).finally(() => {
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
    else { cleanup.resolve() }
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
  const factoryName = scopeSource.match(/function (\w+)/)[1]
  const scope = runInNewContext(`${scopeSource}\n${factoryName}()`, { process: signals })
  try {
    expect(signals.listenerCount('SIGINT')).toBe(1)
    signals.emit('SIGTERM')
    await (scope.signal ?? scope)
    signals.emit('SIGINT')
    signals.emit('SIGTERM')
    expect(signals.listenerCount('SIGINT')).toBe(1)
    expect(signals.listenerCount('SIGTERM')).toBe(2)
  }
  finally { scope.dispose?.() }
  expect(signals.listenerCount('SIGINT')).toBe(0)
  expect(signals.listeners('SIGTERM')).toEqual([external])
})

it.each(['resolve', 'reject'])('并发释放共享完成边界，下一轮安装等待旧租约 %s', async (result) => {
  const cleanup = deferred()
  const restore = vi.fn(() => cleanup.promise)
  const nextRestore = vi.fn()
  const install = vi.fn().mockResolvedValueOnce(restore).mockResolvedValueOnce(nextRestore)
  const resource = lease(install)
  await resource.install()
  const first = resource.release()
  const second = resource.release()
  const next = resource.install()
  const settled = Promise.allSettled([first, second, next])
  await Promise.resolve()
  expect(restore).toHaveBeenCalledTimes(1)
  expect(install).toHaveBeenCalledTimes(1)
  if (result === 'reject') {
    cleanup.reject(new Error('restore failed'))
  }
  else { cleanup.resolve() }
  const results = await settled
  expect(results.map(item => item.status)).toEqual(Array.from({ length: 3 }).fill(result === 'reject' ? 'rejected' : 'fulfilled'))
  expect(install).toHaveBeenCalledTimes(result === 'reject' ? 1 : 2)
  if (result === 'resolve') {
    await resource.release()
    expect(nextRestore).toHaveBeenCalledTimes(1)
  }
})

it.each(['close', 'restart', 'error'])('Vite 已开始 %s 时，public close 仍须等待租约恢复', async (reason) => {
  const cleanup = deferred()
  const releasing = deferred()
  const released = vi.fn(() => {
    releasing.resolve()
    return cleanup.promise
  })
  const plugin = runInNewContext(`(${ownershipSource})`, { releaseAssetWatch: released })
  const failure = new Error('server close failed')
  const originalClose = vi.fn(async () => {
    if (reason === 'error') {
      throw failure
    }
    await plugin.closeServer?.({ reason })
  })
  const server = { close: originalClose }
  plugin.configureServer?.(server)
  let settled = false
  const first = server.close()
  const second = server.close()
  const finished = Promise.allSettled([first, second]).then((results) => {
    settled = true
    return results
  })
  await Promise.race([releasing.promise, finished])
  expect(released).toHaveBeenCalled()
  expect(settled).toBe(false)
  cleanup.resolve()
  const results = await finished
  expect(results.map(result => result.status)).toEqual(Array.from({ length: 2 }).fill(reason === 'error' ? 'rejected' : 'fulfilled'))
  if (reason === 'error') {
    expect(results.map(result => result.reason)).toEqual([failure, failure])
  }
  expect(originalClose).toHaveBeenCalledTimes(1)
})

it('内部重启保留租约，启动期关闭 hook 等待释放', async () => {
  const cleanup = deferred()
  const released = vi.fn(() => cleanup.promise)
  const plugin = runInNewContext(`(${ownershipSource})`, { releaseAssetWatch: released })
  await plugin.closeServer?.({ reason: 'restart' })
  expect(released).not.toHaveBeenCalled()
  let settled = false
  const closing = Promise.resolve(plugin.closeServer?.({ reason: 'close' })).then(() => {
    settled = true
  })
  await Promise.resolve()
  expect(released).toHaveBeenCalledTimes(1)
  expect(settled).toBe(false)
  cleanup.resolve()
  await closing
})
