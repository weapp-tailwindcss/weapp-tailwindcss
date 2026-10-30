/* 仅供 Taro 独立诊断；只读观察主进程已完成加载的 CJS，不安装模块加载 hook。 */
'use strict'

const {
  Buffer,
} = require('node:buffer')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const {
  performance,
} = require('node:perf_hooks')
const process = require('node:process')
const {
  threadId,
  isMainThread,
} = require('node:worker_threads')
const { createBoundedSources } = require('./bounded-source.cjs')
const { createSourceMetadata } = require('./source-metadata.cjs')

function observeTaroBuild() {
  const initialArgvEntry = process.argv[1]
  const rawIdentity = process.env.WEAPP_TW_TARO_DIAG_IDENTITY
  if (!isMainThread || !rawIdentity || Buffer.byteLength(rawIdentity) > 64 * 1024) {
    return
  }
  const same = (left, right) => path.relative(left, right) === ''
  let identity, root, initialEntry, expectedEntry
  try {
    identity = JSON.parse(rawIdentity)
    root = fs.realpathSync(identity.root)
    initialEntry = initialArgvEntry && fs.realpathSync(initialArgvEntry)
    expectedEntry = fs.realpathSync(path.join(root, 'scripts', 'taro-build-runner.mjs'))
    // 在真实入口重写 argv 之前绑定；其它入口不产生文件或 exit observer。
    if (!initialEntry || !same(initialEntry, expectedEntry)) {
      return
    }
  }
  catch {
    return
  }
  const limits = Object.freeze({
    cacheEntries: 20000,
    loadedFiles: 1024,
    ownerDirectories: 20000,
    singleReadBytes: 16 * 1024 * 1024,
    totalReadBytes: 64 * 1024 * 1024,
    sourceMaps: 256,
    sourcesPerMap: 512,
    sourceChars: 4096,
    reportBytes: 8 * 1024 * 1024,
  })
  const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
  const inside = (file) => {
    const rel = path.relative(root, file)
    return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel))
  }
  const fail = (message) => {
    throw new Error(`Taro diagnostic: ${message}`)
  }
  const physical = stat => ({
    device: String(stat.dev),
    inode: String(stat.ino),
  })
  let reportRecordBytes = 0
  const { read, hashIdentity, getReadBytes } = createBoundedSources({ limits, physical, same, fail, digest })
  // 入口绑定后身份错误必须抛出，阻止未绑定身份的构建继续启动。
  const keys = ['role', 'root', 'sourceCommit', 'lockSha256', 'runnerSha256', 'preloadSha256', 'output']
  if (!identity || Array.isArray(identity) || Object.keys(identity).length !== keys.length || keys.some(key => typeof identity[key] !== 'string') || !['base', 'current'].includes(identity.role) || !/^[a-f0-9]{40}$/.test(identity.sourceCommit) || ['lockSha256', 'runnerSha256', 'preloadSha256'].some(key => !/^[a-f0-9]{64}$/.test(identity[key])) || !path.isAbsolute(identity.root) || !path.isAbsolute(identity.output)) {
    fail('invalid identity contract')
  }
  try {
    fs.lstatSync(path.join(root, '.git'))
    fail('prepared root contains .git metadata')
  }
  catch (error) {
    if (error.code !== 'ENOENT') {
      throw error
    }
  }
  const rootStat = fs.statSync(root, {
    bigint: true,
  })
  const output = fs.realpathSync(identity.output)
  const outputStat = fs.statSync(output, {
    bigint: true,
  })
  if (!rootStat.isDirectory() || !outputStat.isDirectory() || inside(output)) {
    fail('invalid prepared root/output directory')
  }
  const reportFile = path.join(output, 'loaded-cjs.json')
  try {
    fs.lstatSync(reportFile)
    fail('report already exists')
  }
  catch (error) {
    if (error.code !== 'ENOENT') {
      throw error
    }
  }
  const lockFile = fs.realpathSync(path.join(root, 'pnpm-lock.yaml'))
  if (!inside(lockFile) || !inside(expectedEntry)) {
    fail('lock/runner escapes prepared root')
  }
  const observed = {
    root: {
      physicalPath: root,
      ...physical(rootStat),
      rootGitMetadataAbsent: true,
    },
    output: {
      physicalPath: output,
      ...physical(outputStat),
    },
    lock: hashIdentity(lockFile),
    runner: hashIdentity(expectedEntry),
    preload: hashIdentity(__filename),
    helpers: { bounded: hashIdentity(require.resolve('./bounded-source.cjs')), metadata: hashIdentity(require.resolve('./source-metadata.cjs')) },
  }
  for (const [kind, key] of [['lock', 'lockSha256'], ['runner', 'runnerSha256'], ['preload', 'preloadSha256']]) {
    if (observed[kind].sha256AtObservation !== identity[key]) {
      fail(`${kind} SHA256 mismatch`)
    }
  }
  if (!inside(observed.lock.physicalFile) || !inside(observed.runner.physicalFile)) {
    fail('lock/runner escapes prepared root')
  }
  const { names, owner, sourceMap, getSourceMaps } = createSourceMetadata({ inside, same, limits, fail, read, digest })
  process.on('exit', (code) => {
    const started = performance.now()
    const report = {
      schemaVersion: 1,
      diagnosticOnly: true,
      budgetAcceptance: false,
      status: 'complete',
      incomplete: false,
      identity,
      observed,
      pid: process.pid,
      threadId,
      initialArgvEntry,
      initialEntry,
      expectedEntry,
      businessExitCode: process.exitCode ?? code,
      observer: {
        phase: 'process-exit',
        collectionStartedMs: started,
        cpuCoverage: 'whole process, including preload startup and exit observer hashing/serialization/write',
        processAssets: {
          window: 'unknown',
          attribution: 'unknown',
        },
      },
      limits,
      loaded: [],
      limitations: ['loaded=true proves completed CJS loading in this main process only; ESM and bundled internal modules are unknown', 'file/package/map hashes identify descriptor bytes at observation, not original loaded bytes', 'sourceCommit is supplied by the preparing runner; this preload does not verify source-tree equality', 'source map metadata is a directive hint; source equality and source-content validity are not verified', 'rootGitMetadataAbsent checks the prepared root .git entry only; no recursive metadata scan is claimed', 'no business timing window alignment; this report cannot attribute processAssets CPU or accept a performance budget'],
    }
    const recordFailure = (error) => {
      report.status = 'incomplete'
      report.incomplete = true
      if (!report.error) {
        const name = String(error.name || 'Error')
        const message = String(error.message || error)
        report.error = {
          name: name.slice(0, 256),
          message: message.slice(0, 4096),
          textTruncated: name.length > 256 || message.length > 4096,
          suppressedCloseError: error.suppressedCloseError,
        }
      }
      if ((process.exitCode === undefined || process.exitCode === 0 || process.exitCode === '0') && code === 0) {
        process.exitCode = 1
      }
    }
    try {
      const cache = Object.values(require.cache)
      report.cacheEntries = cache.length
      if (cache.length > limits.cacheEntries) {
        fail('CJS cache limit exceeded')
      }
      const seen = new Set()
      for (const item of cache) {
        if (!item || item.loaded !== true || typeof item.filename !== 'string') {
          continue
        }
        const file = fs.realpathSync(item.filename)
        if (!inside(file) || seen.has(file)) {
          continue
        }
        const info = owner(file)
        if (!info || !names.has(info.name)) {
          continue
        }
        if (seen.size >= limits.loadedFiles) {
          fail('loaded CJS file count limit exceeded')
        }
        seen.add(file)
        const {
          bytes,
          physicalFile,
          device,
          inode,
        } = read(file)
        const record = {
          ...info,
          evidence: 'loaded-cjs-cache',
          physicalFile,
          device,
          inode,
          bytes: bytes.length,
          fileSha256AtObservation: digest(bytes),
          sourceMap: sourceMap(bytes.toString('utf8'), physicalFile),
        }
        const recordBytes = Buffer.byteLength(JSON.stringify(record))
        if (reportRecordBytes + recordBytes > limits.reportBytes - 128 * 1024) {
          fail('loaded record report byte limit exceeded')
        }
        reportRecordBytes += recordBytes
        report.loaded.push(record)
      }
    }
    catch (error) {
      recordFailure(error)
    }
    report.readBytes = getReadBytes()
    report.sourceMaps = getSourceMaps()
    report.observer.collectionFinishedMs = performance.now()
    report.observer.collectionDurationMs = report.observer.collectionFinishedMs - started
    report.observer.durationExcludes = 'report serialization and write'
    try {
      const currentOutput = fs.realpathSync(identity.output)
      const currentStat = fs.statSync(currentOutput, {
        bigint: true,
      })
      if (!same(currentOutput, output) || currentStat.dev !== outputStat.dev || currentStat.ino !== outputStat.ino) {
        fail('output directory identity changed')
      }
      let text = `${JSON.stringify(report)}\n`
      if (Buffer.byteLength(text) > limits.reportBytes) {
        recordFailure(new Error('Taro diagnostic: final report byte limit exceeded'))
        report.omittedLoadedEvidence = {
          records: report.loaded.length,
          reason: 'report byte limit; inventory is incomplete',
        }
        report.loaded = []
        text = `${JSON.stringify(report)}\n`
      }
      if (Buffer.byteLength(text) > limits.reportBytes) {
        fail('failure report byte limit exceeded')
      }
      fs.writeFileSync(reportFile, text, {
        flag: 'wx',
      })
    }
    catch (error) {
      recordFailure(error)
      process.stderr.write(`Taro diagnostic report write failed: ${JSON.stringify(report.error)}; writeError=${String(error.message || error).slice(0, 4096)}\n`)
    }
  })
}

observeTaroBuild()
