import { createRequire } from 'node:module'
import path from 'node:path'
import { expect, it } from 'vitest'
import { repo } from './catalog.mjs'

const demoRequire = createRequire(path.join(repo, 'demo/subpackage-taro-webpack-react-tailwindcss-v4/package.json'))
const taroRequire = createRequire(demoRequire.resolve('@tarojs/webpack5-runner/package.json'))
const VirtualModulesPlugin = taroRequire('webpack-virtual-modules')
const webpackRequire = createRequire(taroRequire.resolve('webpack/package.json'))
const Watchpack = webpackRequire('watchpack')

function createCompiler() {
  const callbacks = { afterEnvironment: [], afterResolvers: [], watchRun: [] }
  const inputFileSystem = { _writeVirtualFile() {}, _virtualFiles: Object.create(null) }
  const compiler = {
    context: repo,
    inputFileSystem: { _inputFileSystem: inputFileSystem },
    webpack: {},
    hooks: Object.fromEntries(Object.entries(callbacks).map(([name, taps]) => [name, {
      tap(_name, callback) { taps.push(callback) },
      tapAsync(_name, callback) { taps.push(callback) },
    }])),
  }
  const instances = []
  const result = { close() {} }
  function createWatchFileSystem() {
    return {
      inputFileSystem: compiler.inputFileSystem,
      watch(...args) {
        expect(this.inputFileSystem).toBe(compiler.inputFileSystem)
        expect(args).toEqual(['original arguments'])
        this.watcher = new Watchpack({ aggregateTimeout: 60_000 })
        instances.push(this.watcher)
        return result
      },
    }
  }
  compiler.watchFileSystem = {
    wfs: createWatchFileSystem(),
    watch(...args) { return this.wfs.watch(...args) },
  }
  return {
    compiler,
    inputFileSystem,
    result,
    createWatchFileSystem,
    environment() { callbacks.afterEnvironment.forEach(callback => callback()) },
    watchRun() { callbacks.watchRun.forEach(callback => callback(compiler, () => {})) },
    close() { instances.forEach(watcher => watcher.close()) },
  }
}

for (const file of ['/project/virtual.js', 'C:\\project\\virtual.js', '/', 'C:\\', 'relative/virtual.js']) {
  it(`preserves an aggregated virtual update before a false removal: ${file}`, () => {
    const context = createCompiler()
    try {
      new VirtualModulesPlugin().apply(context.compiler)
      context.environment()
      context.inputFileSystem._virtualFiles[file] = { contents: '42' }
      expect(context.compiler.watchFileSystem.watch('original arguments')).toBe(context.result)
      const watcher = context.compiler.watchFileSystem.wfs.watcher
      const removed = []
      watcher.on('remove', item => removed.push(item))
      watcher.once('aggregated', () => {})
      watcher._onChange(file, Date.now(), file, 'change')
      watcher._onRemove(file, file, 'watch (missing on attach)')
      const physical = `${file}.physical`
      watcher._onRemove(physical, physical, 'remove')
      expect(watcher.aggregatedChanges.has(file)).toBe(true)
      expect(watcher.aggregatedRemovals).toEqual(new Set([physical]))
      expect(removed).toEqual([physical])
      expect(watcher.listenerCount('aggregated')).toBe(1)
      expect(watcher.paused).toBe(false)
      expect(watcher.getAggregated()).toEqual({ changes: new Set([file]), removals: new Set([physical]) })
      // 暂停状态也保留真实更新；getInfo 等读取聚合集合的路径不能看到伪删除。
      watcher.pause()
      watcher._onChange(file, Date.now(), file, 'change')
      watcher._onRemove(file, file, 'scan (missing in initial scan)')
      expect(watcher.getAggregated()).toEqual({ changes: new Set([file]), removals: new Set() })
    }
    finally {
      context.close()
    }
  })
}

it('reads current FS ownership and preserves removals after virtual ownership ends', () => {
  const context = createCompiler()
  const file = path.join(repo, 'virtual.js')
  try {
    new VirtualModulesPlugin().apply(context.compiler)
    new VirtualModulesPlugin().apply(context.compiler)
    context.environment()
    context.compiler.watchFileSystem.watch('original arguments')
    const watcher = context.compiler.watchFileSystem.wfs.watcher
    const originalGuard = watcher._onRemove
    context.watchRun()
    expect(watcher._onRemove).toBe(originalGuard)
    context.inputFileSystem._virtualFiles = { [file]: { contents: '84' } }
    watcher._onRemove(file, file, 'remove')
    expect(watcher.getAggregated().removals.size).toBe(0)
    delete context.inputFileSystem._virtualFiles[file]
    watcher._onRemove(file, file, 'remove')
    expect(watcher.getAggregated().removals).toEqual(new Set([file]))
    context.inputFileSystem._virtualFiles = Object.create({ [file]: { contents: 'inherited' } })
    watcher._onRemove(file, file, 'remove')
    expect(watcher.getAggregated().removals).toEqual(new Set([file]))
    const owner = context.compiler.watchFileSystem.wfs
    owner.inputFileSystem = { _inputFileSystem: { _virtualFiles: { [file]: { contents: 'replacement' } } } }
    watcher._onRemove(file, file, 'remove')
    expect(watcher.getAggregated().removals.size).toBe(0)
    owner.inputFileSystem = { _virtualFiles: {} }
    watcher._onRemove(file, file, 'remove')
    expect(watcher.getAggregated().removals).toEqual(new Set([file]))
    // 后续插件替换监听器后，watchRun 仍应为新实例安装相同边界。
    context.compiler.watchFileSystem = context.createWatchFileSystem()
    context.watchRun()
    context.inputFileSystem._virtualFiles = { [file]: { contents: '168' } }
    context.compiler.watchFileSystem.watch('original arguments')
    context.compiler.watchFileSystem.watcher._onRemove(file, file, 'remove')
    expect(context.compiler.watchFileSystem.watcher.getAggregated().removals.size).toBe(0)
  }
  finally {
    context.close()
  }
})
