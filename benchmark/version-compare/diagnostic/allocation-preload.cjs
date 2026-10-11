const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const Module = require('node:module')
const inspector = require('node:inspector')
const { performance, PerformanceObserver } = require('node:perf_hooks')

// 独立诊断分支专用；只观察真实 Mpx 进程，不进入性能门禁或产品源码。
if (/^mpx-cli-service(?:\.js)?$/.test(path.basename(process.argv[1] || ''))) {
  const output = process.env.MPX_ALLOCATION_OUTPUT
  if (!output) throw new Error('missing MPX_ALLOCATION_OUTPUT')
  fs.mkdirSync(output, { recursive: true })
  const session = new inspector.Session()
  session.connect()
  const events = []
  const histogram = new Map()
  const inputs = new Set()
  const declarations = new Map()
  let inputBytes = 0
  let sequence = 0
  let calls = 0
  const sha = value => crypto.createHash('sha256').update(value).digest('hex')
  const readFileSync = fs.readFileSync
  fs.readFileSync = function (...args) {
    const value = readFileSync.apply(this, args)
    const filename = args[0]
    if (typeof filename === 'string' && filename.endsWith('.d.ts')) {
      const previous = declarations.get(filename)
      if (!previous && declarations.size >= 16384) throw new Error('declaration inventory limit exceeded')
      declarations.set(filename, { reads: (previous?.reads ?? 0) + 1, bytes: Buffer.byteLength(value), sha256: sha(value) })
    }
    return value
  }
  const record = (kind, data = {}) => {
    if (events.length >= 2048) throw new Error('diagnostic event limit exceeded')
    events.push({ kind, atEpochMs: Date.now(), atMonotonicMs: performance.now(), memory: process.memoryUsage(), ...data })
  }
  const saveInput = (kind, source, details) => {
    const digest = sha(source)
    const bytes = Buffer.byteLength(source)
    if (!inputs.has(digest)) {
      if (inputs.size >= 64 || inputBytes + bytes > 67108864) throw new Error('diagnostic input limit exceeded')
      fs.writeFileSync(path.join(output, `${digest}.txt`), source)
      inputs.add(digest)
      inputBytes += bytes
    }
    record('input', { stage: kind, digest, bytes, details })
  }
  globalThis.__mpxAllocation = {
    sync(kind, source, details, action) {
      const id = ++sequence
      saveInput(kind, source, details)
      record('start', { stage: kind, id })
      const result = action()
      record('end', { stage: kind, id, count: result.size })
      return result
    },
    async css(source, options, action) {
      const id = ++sequence
      const scalarOptions = Object.fromEntries(Object.entries(options).filter(([, value]) => value == null || ['string', 'number', 'boolean'].includes(typeof value)))
      saveInput('normalize-css', source, { scalarOptions, optionKeys: Object.keys(options), optionsFingerprint: sha(JSON.stringify(scalarOptions)) })
      record('start', { stage: 'normalize-css', id })
      const result = await action()
      record('end', { stage: 'normalize-css', id, outputBytes: Buffer.byteLength(result), outputSha256: sha(result) })
      return result
    },
    ambiguous(token, fragments, action) {
      calls++
      let row = histogram.get(token)
      if (!row) {
        if (histogram.size >= 8192) throw new Error('diagnostic histogram limit exceeded')
        row = { count: 0, length: token.length, fragments }
        histogram.set(token, row)
      }
      row.count++
      const result = action()
      row.resultCount = result.length
      return result
    },
  }
  const compile = Module.prototype._compile
  Module.prototype._compile = function (source, filename) {
    const parts = filename.split(path.sep)
    if (parts.includes('packages') && parts.includes('dist') && /\.cjs$/.test(filename)) {
      const original = source
      const wrappers = []
      const signatures = [
        ['function collectEscapedRuntimeCandidates(source, escapeMap, escapeFragments) {', 'function collectEscapedRuntimeCandidatesImpl(source, escapeMap, escapeFragments) {', 'function collectEscapedRuntimeCandidates(source, escapeMap, escapeFragments) { return globalThis.__mpxAllocation.sync("escaped-candidates", source, { escapeMap, escapeFragments }, () => collectEscapedRuntimeCandidatesImpl(source, escapeMap, escapeFragments)); }'],
        ['function createAmbiguousRestoredRuntimeCandidates(token, escapeMap, escapeFragments) {', 'function createAmbiguousRestoredRuntimeCandidatesImpl(token, escapeMap, escapeFragments) {', 'function createAmbiguousRestoredRuntimeCandidates(token, escapeMap, escapeFragments) { return globalThis.__mpxAllocation.ambiguous(token, escapeFragments, () => createAmbiguousRestoredRuntimeCandidatesImpl(token, escapeMap, escapeFragments)); }'],
        ['async function normalizeMiniProgramGeneratedCssForPostcss(css, options = {}) {', 'async function normalizeMiniProgramGeneratedCssForPostcssImpl(css, options = {}) {', 'async function normalizeMiniProgramGeneratedCssForPostcss(css, options = {}) { return globalThis.__mpxAllocation.css(css, options, () => normalizeMiniProgramGeneratedCssForPostcssImpl(css, options)); }'],
      ]
      for (const [signature, replacement, wrapper] of signatures) {
        if (source.includes(signature)) {
          source = source.replace(signature, replacement)
          wrappers.push(wrapper)
        }
      }
      if (wrappers.length) {
        record('instrument-module', { filename, originalSha256: sha(original), wrappers: wrappers.length })
        source += `\n${wrappers.join('\n')}\n`
      }
    }
    return compile.call(this, source, filename)
  }
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) record('gc', { startTime: entry.startTime, duration: entry.duration, detail: entry.detail })
  })
  observer.observe({ entryTypes: ['gc'] })
  record('identity', { pid: process.pid, ppid: process.ppid, node: process.version, argv: process.argv, samplingInterval: 1048576 })
  session.post('HeapProfiler.startSampling', { samplingInterval: 1048576, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true }, (error) => {
    if (error) throw error
    record('sampling-ready')
  })
  // 此独立批次会因 heap snapshot 触发诊断性的 GC，不能与原 RSS 门禁样本互换。
  process.once('beforeExit', () => {
    record('snapshot-start', { diagnosticGcExpected: true })
    const fd = fs.openSync(path.join(output, 'retained.heapsnapshot'), 'wx')
    let bytes = 0
    const writeChunk = ({ params }) => {
      const buffer = Buffer.from(params.chunk)
      if (bytes + buffer.length > 4294967296) throw new Error('snapshot limit exceeded')
      let written = 0
      while (written < buffer.length) {
        const count = fs.writeSync(fd, buffer, written)
        if (count <= 0) throw new Error('snapshot write made no progress')
        written += count
      }
      bytes += written
    }
    session.on('HeapProfiler.addHeapSnapshotChunk', writeChunk)
    session.post('HeapProfiler.takeHeapSnapshot', { reportProgress: false }, (error) => {
      session.removeListener('HeapProfiler.addHeapSnapshotChunk', writeChunk)
      fs.closeSync(fd)
      if (error) throw error
      record('snapshot-end', { bytes, diagnosticGcExpected: true })
    })
  })
  process.once('exit', (code) => {
    record('exit', { code, calls, histogramEntries: histogram.size, inputBytes, inputFiles: inputs.size })
    let profileWritten = false
    session.post('HeapProfiler.getSamplingProfile', {}, (error, value) => {
      if (error) throw error
      fs.writeFileSync(path.join(output, 'allocation.heapprofile'), JSON.stringify(value.profile))
      profileWritten = true
    })
    fs.writeFileSync(path.join(output, 'events.json'), JSON.stringify(events, null, 2))
    fs.writeFileSync(path.join(output, 'tokens.json'), JSON.stringify([...histogram], null, 2))
    fs.writeFileSync(path.join(output, 'declarations.json'), JSON.stringify([...declarations], null, 2))
    fs.writeFileSync(path.join(output, 'receipt.json'), JSON.stringify({ pid: process.pid, code, profileWritten, diagnosticOnly: true, diagnosticGcExpected: true, noGuard: true, inputBytes, inputFiles: inputs.size }, null, 2))
    session.disconnect()
    observer.disconnect()
  })
}
