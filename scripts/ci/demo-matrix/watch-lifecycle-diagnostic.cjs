const fs = require('node:fs')
const { createRequire } = require('node:module')
const path = require('node:path')
const process = require('node:process')

// 仅保存有界诊断，不创建保活句柄，也不改变 watcher 的关闭或异常语义。
const recent = []
const active = new Map()
const compilers = new Map()
let nextId = 0
function record(event, data = {}) {
  recent.push({ event, time: Date.now(), ...data })
  if (recent.length > 100) {
    recent.shift()
  }
}

const originalWatch = fs.watch
fs.watch = function (...args) {
  const watcher = originalWatch.apply(this, args)
  const id = ++nextId
  const file = String(args[0])
  active.set(id, file)
  record('fs.watch', { id, file })
  const close = watcher.close
  watcher.close = function (...closeArgs) {
    record('fs.close', { id, file, stack: new Error('watcher 关闭调用').stack })
    return close.apply(this, closeArgs)
  }
  watcher.once('close', () => {
    active.delete(id)
    record('fs.closed', { id, file, remaining: active.size })
  })
  return watcher
}

const projectRequire = createRequire(path.join(process.cwd(), 'package.json'))
let webpackPath
try {
  webpackPath = projectRequire.resolve('webpack')
}
catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') {
    throw error
  }
}
if (webpackPath) {
  const { Compiler } = projectRequire(webpackPath)
  const watch = Compiler.prototype.watch
  Compiler.prototype.watch = function (...args) {
    const compiler = this
    const id = ++nextId
    const state = { id, name: compiler.name, context: compiler.context, webpackPath }
    compilers.set(id, state)
    for (const phase of ['watchRun', 'beforeCompile', 'compile', 'thisCompilation', 'make', 'finishMake', 'afterCompile', 'emit', 'afterEmit', 'done', 'afterDone', 'invalid', 'failed', 'watchClose', 'shutdown']) {
      compiler.hooks[phase]?.tap('WatchLifecycleDiagnostic', (value) => {
        state.phase = phase
        state.activeWatchers = active.size
        if (phase === 'failed') {
          state.error = value?.stack ?? String(value)
        }
        if (phase === 'done') {
          state.dependencies = { files: value.compilation.fileDependencies.size, contexts: value.compilation.contextDependencies.size, missing: value.compilation.missingDependencies.size }
        }
        record('webpack', { ...state })
      })
    }
    return watch.apply(this, args)
  }
}

process.on('beforeExit', (code) => {
  fs.writeSync(2, `[watch-lifecycle] ${JSON.stringify({ code, pid: process.pid, resources: process.getActiveResourcesInfo(), active: [...active], compilers: [...compilers.values()], recent })}\n`)
})
