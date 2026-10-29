const fs = require('node:fs')
const path = require('node:path')
const process = require('node:process')
const Module = require('node:module')
const { randomUUID } = require('node:crypto')
const threads = require('node:worker_threads')
const { createIdentity, digest } = require('./runtime-guard/identity.cjs')
const { installLaunchGuard } = require('./runtime-guard/launch.cjs')

const installed = Symbol.for('weapp-tailwindcss.compiler-ab.runtime-guard')

function install(session) {
  if (globalThis[installed]) {
    if (globalThis[installed] !== session.id) throw new Error('Runtime guard session conflict')
    return
  }
  globalThis[installed] = session.id
  const isolate = randomUUID()
  const bootstrapSha = digest(session.bootstrap)
  const output = path.join(session.directory, 'events', `${process.pid}-${threads.threadId}-${isolate}.ndjson`)
  let sequence = 0
  function write(kind, details = {}) {
    fs.appendFileSync(output, `${JSON.stringify({ ...details, session: session.id, isolate, pid: process.pid, ppid: process.ppid, threadId: threads.threadId, sequence: ++sequence, bootstrapSha, kind })}\n`)
  }
  function reject(reason, details = {}) {
    write('violation', { reason, ...details })
    const error = new Error(`Compiler runtime guard: ${reason}`)
    error.code = 'ERR_COMPILER_AB_RUNTIME_GUARD'
    throw error
  }
  for (const [filename, sha] of Object.entries(session.codeHashes)) {
    if (digest(filename) !== sha) reject('runtime source hash mismatch', { filename })
  }
  if (typeof Module.registerHooks !== 'function') reject('synchronous module hooks unavailable')
  const identity = createIdentity()
  const compilerSources = new Map()
  if (session.compilerSources) {
    if (digest(session.compilerSources.file) !== session.compilerSources.sha256) reject('compiler source contract hash mismatch')
    for (const source of JSON.parse(fs.readFileSync(session.compilerSources.file, 'utf8'))) {
      const root = fs.realpathSync(source.directory)
      if (root !== source.directory || compilerSources.has(root)) reject('compiler source contract root mismatch')
      if (digest(path.join(root, 'package.json')) !== source.files['package.json']) reject('webpack compiler manifest hash mismatch')
      compilerSources.set(root, source)
    }
  }
  const checkedCompilerFiles = new Set()
  const parents = new Map()
  function check(filename, parent) {
    const target = identity.owner(filename)
    if (target?.name === 'webpack' && session.compilerSources) {
      const approved = compilerSources.get(target.root)
      if (!approved) reject('unapproved webpack compiler context', { filename, root: target.root })
      if (!checkedCompilerFiles.has(target.file)) {
        const relative = path.relative(target.root, target.file)
        const actual = digest(target.file)
        if (approved.files[relative] !== actual) reject('webpack compiler source hash mismatch', { filename, root: target.root, relative })
        checkedCompilerFiles.add(target.file)
        write('compiler-load', { filename: target.file, root: target.root, key: approved.key, sha256: actual })
      }
    }
    if (target?.name === 'webpack-cli') reject('webpack-cli was loaded', { filename, parent })
    if (target?.name === 'esbuild' && identity.owner(parent)?.name === 'terser-webpack-plugin') {
      reject('terser-webpack-plugin consumed esbuild', { filename, parent })
    }
  }
  const originalLoad = Module._load
  Module._load = function (request, parent, isMain) {
    // 缓存命中的 require 也必须经过消费检查；resolve-only 不经过此入口。
    const filename = Module._resolveFilename(request, parent, isMain)
    check(filename, parent?.filename)
    return originalLoad.apply(this, arguments)
  }
  Module.registerHooks({
    resolve(specifier, context, nextResolve) {
      const result = nextResolve(specifier, context)
      const parent = identity.owner(context.parentURL)
      if (identity.owner(result.url)?.name === 'esbuild' && parent?.name === 'terser-webpack-plugin'
        && context.conditions.includes('import')) {
        const prior = parents.get(result.url) ?? new Set()
        prior.add(context.parentURL)
        parents.set(result.url, prior)
        // ESM 缓存命中不再进入 load；无法区分 resolve-only 时保守标为缺证。
        write('unsupported', { reason: 'cannot prove ESM Terser esbuild resolution consumption', filename: result.url, parent: context.parentURL })
      }
      return result
    },
    load(url, context, nextLoad) {
      check(url)
      for (const parent of parents.get(url) ?? []) check(url, parent)
      return nextLoad(url, context)
    },
  })
  installLaunchGuard({ session, isolate, write, reject, digest })
  const parent = threads.isMainThread && process.env.WEAPP_TW_COMPILER_AB_PARENT
    ? JSON.parse(process.env.WEAPP_TW_COMPILER_AB_PARENT)
    : undefined
  process.on('exit', code => write('exit', { code }))
  write('ready', { node: process.version, execPath: fs.realpathSync(process.execPath), codeHashes: session.codeHashes, compilerSourceSha256: session.compilerSources?.sha256, parent })
}

module.exports = { install }
