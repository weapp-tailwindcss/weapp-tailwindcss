const { createRequire } = require('node:module')
const path = require('node:path')
const process = require('node:process')

const root = path.resolve(__dirname, '../../..')
const demoRequire = createRequire(path.join(root, 'demo/subpackage-taro-webpack-react-tailwindcss-v4/package.json'))
const taroRequire = createRequire(demoRequire.resolve('@tarojs/webpack5-runner/package.json'))
const { Compiler } = taroRequire('webpack')
const originalWatch = Compiler.prototype.watch
const identities = new WeakMap()
let nextIdentity = 0
function identity(value) {
  if (!value || !['object', 'function'].includes(typeof value)) {
    return value
  }
  if (!identities.has(value)) {
    identities.set(value, ++nextIdentity)
  }
  return identities.get(value)
}
function trace(event, data) {
  process.stdout.write(`[weapp-watch-diagnostic] ${JSON.stringify({ event, ...data })}\n`)
}
Compiler.prototype.watch = function (...args) {
  const compiler = this
  const id = identity(compiler)
  compiler.hooks.invalid.tap('WatchDiagnostic', (file, time) => trace('invalid', { id, file, time }))
  compiler.hooks.watchRun.tap('WatchDiagnostic', () => trace('watchRun', {
    id,
    modified: [...compiler.modifiedFiles || []],
    removed: [...compiler.removedFiles || []],
    options: identity(compiler.watching.watchOptions),
    ignored: identity(compiler.watching.watchOptions.ignored),
  }))
  compiler.hooks.done.tap('WatchDiagnostic', (stats) => {
    const compilation = stats.compilation
    trace('done', {
      id,
      startTime: compilation.startTime,
      endTime: compilation.endTime,
      options: identity(compiler.watching.watchOptions),
      ignored: identity(compiler.watching.watchOptions.ignored),
      missing: [...compilation.missingDependencies].filter(file => path.extname(file) === '.js'),
    })
  })
  const watchFileSystem = compiler.watchFileSystem
  const watchFiles = watchFileSystem.watch
  watchFileSystem.watch = function (...watchArgs) {
    const result = watchFiles.apply(this, watchArgs)
    const watcher = this.watcher
    trace('attach', { id, watcher: identity(watcher), startTime: watchArgs[3], options: identity(watchArgs[4]), manager: identity(watcher.watcherManager) })
    watcher.on('change', (file, time, type) => trace('change', { id, file, time, type }))
    watcher.on('remove', (file, type) => {
      const directoryWatcher = watcher.fileWatchers.get(file)?.watcher.directoryWatcher
      trace('remove', { id, file, type, directory: identity(directoryWatcher), initialScan: directoryWatcher?.initialScan, initialScanFinished: directoryWatcher?.initialScanFinished })
    })
    return result
  }
  return originalWatch.apply(this, args)
}
