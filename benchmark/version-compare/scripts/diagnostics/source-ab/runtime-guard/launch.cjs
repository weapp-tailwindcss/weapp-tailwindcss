const fs = require('node:fs')
const path = require('node:path')
const process = require('node:process')
const cp = require('node:child_process')
const threads = require('node:worker_threads')
const { fileURLToPath } = require('node:url')
const { randomUUID } = require('node:crypto')
const { syncBuiltinESMExports } = require('node:module')
const { promisify } = require('node:util')
const { executableCandidates } = require('./identity.cjs')
const { readEntity } = require('./linux.cjs')
const { observeReferences } = require('./lifetime.cjs')

function installLaunchGuard(context) {
  const { session, isolate, write, reject, digest } = context
  const preload = ['--require', session.bootstrap]
  const nodeOption = `--require ${JSON.stringify(session.bootstrap)}`
  function target(command, args, options) {
    if (options.shell) reject('shell launch cannot prove bootstrap propagation', { command })
    const cwd = options.cwd instanceof URL ? fileURLToPath(options.cwd) : options.cwd ?? process.cwd()
    const filename = executableCandidates(command, { cwd, env: options.env ?? process.env }).find(candidate => {
      try { fs.accessSync(candidate, fs.constants.X_OK); return fs.statSync(candidate).isFile() }
      catch { return false }
    })
    let actual
    try { actual = fs.realpathSync(filename) }
    catch { reject('launch executable identity unavailable', { command }) }
    if (actual === fs.realpathSync(process.execPath)) return { targetKind: 'node', filename: actual }
    const helper = session.nativeHelpers.find(item => item.path === actual && JSON.stringify(item.args) === JSON.stringify(args))
    if (!helper || digest(actual) !== helper.sha256) reject('unregistered native executable', { command, actual, args })
    return { targetKind: 'native', filename: actual, sha256: helper.sha256 }
  }
  function optionsFor(options, launch) {
    const env = { ...(options.env ?? process.env) }
    env.NODE_OPTIONS = `${nodeOption}${env.NODE_OPTIONS ? ` ${env.NODE_OPTIONS}` : ''}`
    env.WEAPP_TW_COMPILER_AB_PARENT = JSON.stringify({ isolate, launch })
    env.WEAPP_TW_COMPILER_AB_GUARD = JSON.stringify(session)
    return { ...options, env }
  }
  function start(command, args, options, method) {
    const identity = target(command, args, options)
    const launch = randomUUID()
    write('launch-intent', { launch, method, args: [...args], ...identity })
    return { launch, identity, args: [...args], options: identity.targetKind === 'node' ? optionsFor(options, launch) : { ...options } }
  }
  function observe(child, descriptor) {
    const { launch } = descriptor
    const pid = child.pid
    const osIdentity = descriptor.identity.targetKind === 'native' && session.unrefServices?.length && process.platform === 'linux'
      ? readEntity(pid, pid, { executable: true, hashExecutable: true }) : undefined
    if (osIdentity && (osIdentity.executable !== descriptor.identity.filename || osIdentity.sha256 !== descriptor.identity.sha256 || osIdentity.ppid !== process.pid || JSON.stringify(osIdentity.argv.slice(1)) !== JSON.stringify(descriptor.args))) reject('native OS identity mismatch')
    write('launch-start', { launch, targetPid: pid ?? null, targetThreadId: 0, osIdentity })
    observeReferences(child, launch, 'handle', write)
    observeReferences(child.stdin, launch, 'stdin', write)
    observeReferences(child.stdout, launch, 'stdout', write)
    const emit = child.emit
    child.emit = function (event, ...args) {
      if (event === 'error') write('launch-error', { launch, message: String(args[0]) })
      return emit.call(this, event, ...args)
    }
    child.once('close', (code, signal) => write('launch-close', { launch, targetPid: pid ?? null, code, signal }))
    return child
  }
  function readyPid(launch) {
    for (const filename of fs.readdirSync(path.join(session.directory, 'events'))) {
      const first = fs.readFileSync(path.join(session.directory, 'events', filename), 'utf8').split('\n')[0]
      let entry
      try { entry = JSON.parse(first) }
      catch { continue }
      if (entry.kind === 'ready' && entry.threadId === 0 && entry.parent?.isolate === isolate && entry.parent?.launch === launch) return entry.pid
    }
    return null
  }
  const spawn = cp.spawn
  cp.spawn = function (command, args, options) {
    const hasArgs = Array.isArray(args)
    const descriptor = start(command, hasArgs ? args : [], (hasArgs ? options : args ?? options) ?? {}, 'spawn')
    return observe(spawn.call(this, command, hasArgs ? args : [], descriptor.options), descriptor)
  }
  const execFile = cp.execFile
  cp.execFile = function (...args) {
    const index = Array.isArray(args[1]) || (args[1] == null && args.length > 2) ? 2 : 1
    const options = typeof args[index] === 'object' && args[index] !== null ? args[index] : {}
    const descriptor = start(args[0], Array.isArray(args[1]) ? args[1] : [], options, 'execFile')
    if (typeof args[index] === 'function') args.splice(index, 0, descriptor.options)
    else args[index] = descriptor.options
    return observe(execFile.apply(this, args), descriptor)
  }
  Object.defineProperty(cp.execFile, promisify.custom, {
    ...Object.getOwnPropertyDescriptor(execFile, promisify.custom),
    value: function (...args) {
      let resolve
      let rejectPromise
      const promise = new Promise((accept, reject) => { resolve = accept; rejectPromise = reject })
      promise.child = cp.execFile(...args, (error, stdout, stderr) => {
        if (error) {
          error.stdout = stdout
          error.stderr = stderr
          rejectPromise(error)
        }
        else resolve({ stdout, stderr })
      })
      return promise
    },
  })
  const fork = cp.fork
  cp.fork = function (filename, args, options) {
    const hasArgs = Array.isArray(args)
    const provided = (hasArgs ? options : args ?? options) ?? {}
    const descriptor = start(provided.execPath ?? process.execPath, [], provided, 'fork')
    const updated = { ...descriptor.options, execArgv: [...preload, ...(provided.execArgv ?? process.execArgv)] }
    return observe(fork.call(this, filename, hasArgs ? args : [], updated), descriptor)
  }
  const spawnSync = cp.spawnSync
  cp.spawnSync = function (command, args, options) {
    const hasArgs = Array.isArray(args)
    const descriptor = start(command, hasArgs ? args : [], (hasArgs ? options : args ?? options) ?? {}, 'spawnSync')
    const result = spawnSync.call(this, command, hasArgs ? args : [], descriptor.options)
    write('launch-start', { launch: descriptor.launch, targetPid: result.pid ?? null, targetThreadId: 0 })
    write('launch-close', { launch: descriptor.launch, targetPid: result.pid ?? null, code: result.status, signal: result.signal, error: result.error && String(result.error) })
    return result
  }
  const execFileSync = cp.execFileSync
  cp.execFileSync = function (command, args, options) {
    const hasArgs = Array.isArray(args)
    const descriptor = start(command, hasArgs ? args : [], (hasArgs ? options : args ?? options) ?? {}, 'execFileSync')
    if (descriptor.identity.targetKind !== 'node') reject('native execFileSync has no provable child pid')
    let failure
    try { return execFileSync.call(this, command, hasArgs ? args : [], descriptor.options) }
    catch (error) { failure = error; throw error }
    finally {
      const pid = readyPid(descriptor.launch)
      write('launch-start', { launch: descriptor.launch, targetPid: pid, targetThreadId: 0 })
      write('launch-close', { launch: descriptor.launch, targetPid: pid, code: failure ? failure.status ?? null : 0, signal: failure?.signal ?? null })
    }
  }
  for (const name of ['exec', 'execSync']) {
    cp[name] = function () { reject('shell execution cannot prove bootstrap propagation', { method: name }) }
  }
  const Worker = threads.Worker
  threads.Worker = new Proxy(Worker, {
    construct(constructor, args, newTarget) {
      const [filename, provided = {}] = args
      const launch = randomUUID()
      let entry
      try { entry = fs.realpathSync(filename instanceof URL ? fileURLToPath(filename) : filename) }
      catch {}
      const service = session.unrefServices?.find(item => item.entry === entry)
      write('launch-intent', { launch, method: 'Worker', targetKind: 'worker', filename: entry, sha256: service && digest(entry), serviceVersion: service && provided.workerData?.esbuildVersion })
      const options = { ...provided, execArgv: [...preload, ...(provided.execArgv ?? process.execArgv)] }
      const worker = Reflect.construct(constructor, [filename, options], newTarget)
      const targetThreadId = worker.threadId
      write('launch-start', { launch, targetPid: process.pid, targetThreadId })
      observeReferences(worker, launch, 'handle', write)
      const emit = worker.emit
      worker.emit = function (event, ...values) {
        if (event === 'error') write('launch-error', { launch, message: String(values[0]) })
        return emit.call(this, event, ...values)
      }
      worker.once('exit', code => write('launch-close', { launch, targetPid: process.pid, targetThreadId, code }))
      return worker
    },
  })
  syncBuiltinESMExports()
}

module.exports = { installLaunchGuard }
