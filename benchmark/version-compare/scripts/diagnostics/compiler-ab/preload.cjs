const assert = require('node:assert/strict')
const { Buffer } = require('node:buffer')
const { createHash } = require('node:crypto')
const fs = require('node:fs')
const { createRequire, syncBuiltinESMExports } = require('node:module')
const path = require('node:path')
const { performance } = require('node:perf_hooks')
const process = require('node:process')
const threads = require('node:worker_threads')

const hash = value => createHash('sha256').update(value).digest('hex')

function serializable(value, seen = new WeakSet(), depth = 0) {
  if (typeof value === 'function') return { function: value.name, sha256: hash(String(value)) }
  if (!value || typeof value !== 'object') return value
  if (value instanceof RegExp) return { regexp: String(value) }
  if (seen.has(value)) return '<shared-or-circular>'
  assert.ok(depth < 32, 'compiler options 超过观测深度，拒绝静默截断')
  seen.add(value)
  if (Array.isArray(value)) return value.map(item => serializable(item, seen, depth + 1))
  return {
    ...(value.constructor?.name !== 'Object' ? { _constructor: value.constructor?.name } : {}),
    ...Object.fromEntries(Object.keys(value).sort().map(key => [key, serializable(value[key], seen, depth + 1)])),
  }
}

function assetEvidence(compilation) {
  const assets = compilation.getAssets().sort((a, b) => a.name.localeCompare(b.name, 'en'))
  assert.ok(assets.length <= 16384, '资产数量超过观测上限，拒绝截断')
  const manifest = assets.map(({ name, source, info }) => {
    const value = source.source()
    assert.ok(typeof value === 'string' || Buffer.isBuffer(value), `资产必须提供完整正文：${name}`)
    const related = info.related?.sourceMap
    return {
      name, bytes: Buffer.byteLength(value), size: source.size(), sha256: hash(value),
      sourceType: source.constructor.name,
      mapAsset: /\.map$/i.test(name),
      relatedSourceMaps: related === undefined ? [] : Array.isArray(related) ? related : [related],
    }
  })
  return {
    manifest, assetCount: manifest.length,
    bytes: manifest.reduce((sum, asset) => sum + asset.bytes, 0),
    mapAssetCount: manifest.filter(asset => asset.mapAsset).length,
    relatedSourceMapCount: manifest.reduce((sum, asset) => sum + asset.relatedSourceMaps.length, 0),
    manifestSha256: hash(JSON.stringify(manifest)),
    modules: compilation.modules.size, chunks: compilation.chunks.size,
  }
}

function start() {
  if (!threads.isMainThread || !process.env.WEAPP_TW_COMPILER_AB_SESSION) return
  const session = JSON.parse(process.env.WEAPP_TW_COMPILER_AB_SESSION)
  if (!process.argv[1] || path.relative(fs.realpathSync(process.argv[1]), fs.realpathSync(session.expectedEntry))) return
  assert.ok(!fs.existsSync(path.join(session.root, '.git')), '观测只允许无 Git 元数据的临时副本')
  const projectRequire = createRequire(path.join(session.project, 'package.json'))
  const webpackRoot = path.dirname(projectRequire.resolve('webpack/package.json'))
  const Compiler = require(path.join(webpackRoot, 'lib/Compiler.js'))
  const Compilation = require(path.join(webpackRoot, 'lib/Compilation.js'))
  const fd = fs.openSync(session.file, 'wx')
  let bytesWritten = 0
  let records = 0
  const workers = { created: 0, active: 0, peak: 0, exited: 0 }

  function write(type, detail = {}) {
    const value = Buffer.from(`${JSON.stringify({ type, atEpochMs: Date.now(), atMonotonicMs: performance.now(), pid: process.pid, ...detail })}\n`)
    assert.ok(bytesWritten + value.length <= 64 * 1024 * 1024, '编译器观测超过 64MiB，拒绝截断')
    let offset = 0
    while (offset < value.length) {
      const written = fs.writeSync(fd, value, offset, value.length - offset)
      assert.ok(written > 0, '观测写入没有进展')
      offset += written
    }
    bytesWritten += value.length
    records += 1
  }

  const memory = () => ({ memory: process.memoryUsage(), workers: { ...workers } })
  write('start', {
    session, node: process.version, execArgv: process.execArgv, ppid: process.ppid,
    preloadSha256: hash(fs.readFileSync(__filename)), webpackRoot,
    observation: 'phase memory precedes full source.source() hashing; hashing can materialize cached sources; source.map() is never requested',
    ...memory(),
  })

  const OriginalWorker = threads.Worker
  threads.Worker = class CompilerDiagnosticWorker extends OriginalWorker {
    constructor(...args) {
      super(...args)
      workers.created += 1
      assert.ok(workers.created <= 1024, 'worker 数量超过观测上限')
      workers.active += 1
      workers.peak = Math.max(workers.peak, workers.active)
      const threadId = this.threadId
      write('worker-created', { threadId, entry: String(args[0]), ...memory() })
      this.once('exit', (exitCode) => {
        workers.active -= 1
        workers.exited += 1
        write('worker-exit', { threadId, exitCode, ...memory() })
      })
    }
  }

  syncBuiltinESMExports()

  let compilationNumber = 0
  const original = Compiler.prototype.newCompilation
  Compiler.prototype.newCompilation = function diagnosticCompilation(...args) {
    const compilation = original.apply(this, args)
    const number = ++compilationNumber
    write('compiler-options', {
      number, name: this.name, child: Boolean(this.parentCompilation),
      options: serializable({
        mode: this.options.mode, devtool: this.options.devtool, cache: this.options.cache,
        parallelism: this.options.parallelism, resolve: this.options.resolve,
        optimization: this.options.optimization, output: this.options.output,
        module: this.options.module, experiments: this.options.experiments,
        plugins: this.options.plugins?.map(plugin => plugin.constructor.name),
      }), ...memory(),
    })
    const capture = phase => () => {
      const before = memory()
      const started = performance.now()
      const assets = assetEvidence(compilation)
      write('phase', {
        number, phase, ...before, ...assets,
        evidenceCostMs: performance.now() - started,
        memoryAfterEvidence: process.memoryUsage(),
      })
    }
    compilation.hooks.processAssets.tap({ name: 'CompilerABBeforeMinify', stage: Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE - 1 }, capture('before-optimize-size'))
    compilation.hooks.processAssets.tap({ name: 'CompilerABAfterMinify', stage: Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE + 1 }, capture('after-optimize-size'))
    compilation.hooks.afterProcessAssets.tap('CompilerABAssetsComplete', capture('after-process-assets'))
    return compilation
  }
  const timer = setInterval(() => write('memory', memory()), 250)
  timer.unref()
  process.once('exit', (exitCode) => {
    clearInterval(timer)
    write('exit', { exitCode, compilations: compilationNumber, bytesBeforeExit: bytesWritten, recordsBeforeExit: records, ...memory() })
    fs.closeSync(fd)
  })
}

if (require.main === module) throw new Error('使用 --require 启用编译器观测')
start()

module.exports = { assetEvidence, serializable }
