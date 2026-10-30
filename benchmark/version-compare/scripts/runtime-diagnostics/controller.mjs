import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { closeSync, openSync, writeSync } from 'node:fs'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { diagnosticMutationMarker } from '../diagnostics/constants.mjs'
import { runWithCleanup } from '../diagnostics/failures.mjs'
import { appendNodeImport } from '../gc-paths.mjs'
import { assertBoundWorkerModule, normalizeRuntimeBinding, verifyRuntimeBinding, workerModuleNames } from './binding.mjs'
import { readBoundedFile, readRuntimeControlFile } from './bounded-file.mjs'
import { writeRuntimeControllerReport } from './controller-report.mjs'
import { expectedRuntimePhases, runtimeProject } from './request.mjs'
import { verifyRuntimeEvidence } from './verify.mjs'
import { jsonBytes } from './worker-evidence.mjs'

const workerModules = workerModuleNames
const sha256 = value => createHash('sha256').update(value).digest('hex')
const maximumLogBytes = 8 * 1024 * 1024
const commandTimeoutMs = 10000
async function atomicJson(directory, name, value, sequence) {
  const temporary = path.join(directory, `${name}-${sequence}.pending`)
  jsonBytes(value, 64 * 1024 - 1)
  await fs.writeFile(temporary, `${JSON.stringify(value)}\n`, {
    flag: 'wx',
  })
  await fs.rename(temporary, path.join(directory, name))
}

/** 仅在原输出观察后取样；不伪造候选 store，也不引入生产关闭控制。 */
export async function createRuntimeDiagnostics({
  cwd,
  versionMeta,
  projectMeta,
  directory,
  kind,
  run,
  env = {},
}) {
  if (!directory) {
    return undefined
  }
  if (projectMeta.key !== runtimeProject || kind !== 'hmr' || run !== 1) {
    throw new Error('weapp runtime 观测只绑定已登记项目的一次真实 HMR 会话')
  }
  const root = await fs.realpath(versionMeta.root)
  try {
    await fs.access(path.join(root, '.git'))
    throw new Error('weapp runtime 诊断只能启动无 Git 元数据的独立准备副本')
  }
  catch (error) {
    if (error.code !== 'ENOENT') {
      throw error
    }
  }
  if (!/^[a-f\d]{40}$/i.test(versionMeta.diagnosticIdentity?.sourceCommit ?? '')) {
    throw new Error('weapp runtime 诊断缺少实际准备源码的完整提交身份')
  }
  const require = createRequire(path.join(cwd, 'package.json'))
  const manifestPath = await fs.realpath(require.resolve('weapp-vite/package.json'))
  const manifestBytes = readBoundedFile(manifestPath, {
    maximumBytes: 256 * 1024,
  })
  const manifest = JSON.parse(manifestBytes)
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.['weapp-vite']
  if (manifest.name !== 'weapp-vite' || typeof bin !== 'string' || !bin) {
    throw new Error('weapp runtime 包声明的真实 CLI bin 缺失或身份不符')
  }
  const expectedEntry = await fs.realpath(path.resolve(path.dirname(manifestPath), bin))
  const entryBytes = readBoundedFile(expectedEntry, {
    maximumBytes: 16 * 1024 * 1024,
  })
  const relativeEntry = path.relative(root, expectedEntry)
  if (relativeEntry === '..' || relativeEntry.startsWith(`..${path.sep}`) || path.isAbsolute(relativeEntry)) {
    throw new Error('weapp-vite 业务入口位于独立准备副本之外')
  }
  const binding = normalizeRuntimeBinding(versionMeta.diagnosticIdentity?.binding)
  const driverModule = {
    relativePath: 'benchmark/version-compare/scripts/runtime-diagnostics/controller.mjs',
    file: fileURLToPath(import.meta.url),
  }
  const bindingReceipt = verifyRuntimeBinding(binding, {
    root,
    sourceCommit: versionMeta.diagnosticIdentity.sourceCommit,
    expectedEntry,
    manifestPath,
    driverModule,
  })
  const initialSourcePath = path.resolve(cwd, projectMeta.sourceFile)
  const initialSource = readBoundedFile(initialSourcePath, {
    maximumBytes: 4 * 1024 * 1024,
  })
  await fs.mkdir(directory, {
    recursive: true,
  })
  const role = versionMeta.diagnosticIdentity.role ?? versionMeta.version
  const sessionDirectory = await fs.realpath(await fs.mkdtemp(path.join(directory, `${role.replace(/[^a-z\d-]/gi, '_').slice(0, 48)}-hmr-`)))
  const moduleHashes = {}
  for (const name of workerModules) {
    const bytes = readBoundedFile(new URL(name, import.meta.url), {
      maximumBytes: 1024 * 1024,
    })
    assertBoundWorkerModule(binding, name, bytes)
    await fs.writeFile(path.join(sessionDirectory, name), bytes, {
      flag: 'wx',
    })
    moduleHashes[name] = sha256(bytes)
  }
  const identity = {
    ...versionMeta.diagnosticIdentity,
    role,
    version: versionMeta.version,
    project: projectMeta.key,
    root,
    kind,
    run,
    expectedEntry,
    expectedEntrySha256: sha256(entryBytes),
    manifestPath,
    manifestSha256: sha256(manifestBytes),
    sessionDirectory,
    moduleHashes,
    binding,
    bindingReceipt,
    driverModule,
    diagnosticOnly: true,
    budgetAcceptance: false,
  }
  jsonBytes(identity, 96 * 1024)
  const childEnv = {
    NODE_OPTIONS: appendNodeImport(env.NODE_OPTIONS ?? process.env.NODE_OPTIONS, path.join(sessionDirectory, 'preload.mjs')),
    WEAPP_TW_BENCH_RUNTIME_EXPECTED_ENTRY: expectedEntry,
    WEAPP_TW_BENCH_RUNTIME_SESSION: JSON.stringify(identity),
  }
  const phases = []
  const sourceWrites = [{
    type: 'initial',
    sourcePath: initialSourcePath,
    bytes: initialSource.length,
    sha256: sha256(initialSource),
    atEpochMs: Date.now(),
  }]
  const checkpoints = []
  const expected = expectedRuntimePhases()
  const streams = {}
  try {
    for (const name of ['stdout', 'stderr']) {
      streams[name] = {
        fd: openSync(path.join(sessionDirectory, `worker-${name}.log`), 'wx'),
        bytes: 0,
        observedBytes: 0,
        hash: createHash('sha256'),
      }
    }
  }
  catch (error) {
    const failures = [error]
    for (const stream of Object.values(streams)) {
      try {
        closeSync(stream.fd)
      }
      catch (cleanupError) {
        failures.push(cleanupError)
      }
    }
    if (failures.length > 1) {
      throw new AggregateError(failures, 'worker 日志初始化与回收失败', {
        cause: error,
      })
    }
    throw error
  }
  let sequence = 0
  let rootPid
  let closed = false
  let attached = false
  let processResult
  let logFailure
  let stopping
  function collect(name, value) {
    const bytes = Buffer.from(value)
    const stream = streams[name]
    stream.observedBytes += bytes.length
    if (logFailure) {
      return
    }
    try {
      if (stream.bytes + bytes.length > maximumLogBytes) {
        throw new Error(`worker ${name} 超过固定字节上限`)
      }
      let offset = 0
      while (offset < bytes.length) {
        const written = writeSync(stream.fd, bytes, offset, bytes.length - offset)
        if (written === 0) {
          throw new Error('worker 日志写入没有推进')
        }
        stream.hash.update(bytes.subarray(offset, offset + written))
        offset += written
        stream.bytes += written
      }
    }
    catch (error) {
      logFailure ??= error
    }
  }
  async function checkpoint(type, round, stop = false) {
    const index = checkpoints.length
    if (expected[index]?.[0] !== type || expected[index]?.[1] !== round) {
      throw new Error(`weapp runtime 阶段顺序不符：${type}/${round}`)
    }
    const phase = {
      type,
      round,
      atEpochMs: Date.now(),
      sequence: ++sequence,
      interpretation: '输出观察或诊断停止；不是业务 finalizer 成功',
    }
    checkpoints.push(phase)
    await atomicJson(sessionDirectory, 'command.json', {
      type: stop ? 'stop' : 'capture',
      sequence,
      phase,
    }, sequence)
    const deadline = Date.now() + commandTimeoutMs
    while (Date.now() < deadline) {
      if (logFailure) {
        throw logFailure
      }
      if (closed) {
        throw new Error('业务会话已关闭，无法取得本阶段诊断回执')
      }
      try {
        const reply = JSON.parse(readRuntimeControlFile(path.join(sessionDirectory, 'reply.json')).toString('utf8'))
        if (reply.sequence === sequence) {
          if (!reply.complete || reply.error) {
            throw new Error(`weapp runtime 阶段失败：${reply.error ?? '未完成'}`)
          }
          return
        }
      }
      catch (error) {
        if (error.code !== 'ENOENT') {
          throw error
        }
      }
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    throw new Error(`weapp runtime 阶段回执超时：${type}/${round}`)
  }
  const controller = {
    env: childEnv,
    mutationMarker: diagnosticMutationMarker,
    spawned(pid, child) {
      if (attached || !child) {
        throw new Error('weapp runtime 的原工作负载进程必须唯一绑定')
      }
      attached = true
      rootPid = pid
      child.stdout.on('data', value => collect('stdout', value))
      child.stderr.on('data', value => collect('stderr', value))
      child.once('close', (code, signal) => {
        closed = true
        processResult = {
          code,
          signal,
        }
      })
    },
    mark(type, round) {
      if (phases.length >= 32) {
        throw new Error('weapp runtime 控制器阶段超过固定上限')
      }
      phases.push({
        type,
        round,
        atEpochMs: Date.now(),
      })
    },
    async source(type, sourcePath, expectedText, marker) {
      if (sourceWrites.length >= 16) {
        throw new Error('weapp runtime 来源写入记录超过固定上限')
      }
      const bytes = readBoundedFile(sourcePath, {
        maximumBytes: 4 * 1024 * 1024,
      })
      const receipt = {
        type,
        sourcePath,
        marker,
        bytes: bytes.length,
        sha256: sha256(bytes),
        atEpochMs: Date.now(),
      }
      if (expectedText !== undefined && receipt.sha256 !== sha256(Buffer.from(expectedText))) {
        throw new Error(`实际写入与预期不符：${type}`)
      }
      sourceWrites.push(receipt)
    },
    checkpoint,
    beforeStop() {
      stopping ??= checkpoint('watch-stop', undefined, true)
      return stopping
    },
    async finish(execution = {
      failed: false,
    }) {
      const receipts = {}
      let verification
      return runWithCleanup(async () => {
        if (logFailure) {
          throw logFailure
        }
        if (!attached || !closed) {
          throw new Error('weapp runtime 原工作负载日志未正常完成关闭')
        }
        verification = await verifyRuntimeEvidence(sessionDirectory, identity, checkpoints)
      }, [() => {
        const failures = []
        for (const [name, stream] of Object.entries(streams)) {
          try {
            closeSync(stream.fd)
          }
          catch (error) {
            failures.push(error)
          }
          receipts[name] = {
            file: `worker-${name}.log`,
            bytes: stream.bytes,
            sha256: stream.hash.digest('hex'),
            observedBytes: stream.observedBytes,
            complete: stream.bytes === stream.observedBytes,
          }
        }
        if (failures.length) {
          throw new AggregateError(failures, '任务所属 worker 日志关闭失败')
        }
      }, async (outcome) => {
        await writeRuntimeControllerReport({ sessionDirectory, identity, rootPid, attached, closed, processResult, phases, checkpoints, sourceWrites, receipts, verification, execution, outcome })
      }])
    },
  }
  return controller
}
