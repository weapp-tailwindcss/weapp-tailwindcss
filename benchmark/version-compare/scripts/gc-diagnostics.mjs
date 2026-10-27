import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { appendNodeImport, sameFilesystemPath } from './gc-paths.mjs'
import { getGcDiagnosticService } from './gc-projects.mjs'

const preloadSourcePath = fileURLToPath(new URL('./gc-preload.mjs', import.meta.url))
const pathHelperSourcePath = fileURLToPath(new URL('./gc-paths.mjs', import.meta.url))
const maxBoundaries = 256

function reportFailure(error) {
  process.stderr.write(`[benchmark-gc] 诊断证据未能交付：${error instanceof Error ? error.message : String(error)}\n`)
}

async function inspectProcessFile(sessionDirectory, file, expectedEntry, preloadSha256, pathHelperSha256, identity) {
  try {
    const content = await fs.readFile(path.join(sessionDirectory, file), 'utf8')
    const lines = content.slice(0, content.lastIndexOf('\n') + 1).trimEnd().split('\n')
    const records = []
    let recordIntegrityUnavailable = !content.endsWith('\n')
    let readError
    for (const line of lines) {
      try {
        records.push(JSON.parse(line))
      }
      catch (error) {
        recordIntegrityUnavailable = true
        readError = error instanceof Error ? error.message : String(error)
        break
      }
    }
    const startup = records[0]
    if (!startup) {
      return { file, ready: false, recordIntegrityUnavailable: true, readError }
    }
    const lastAccounting = records.findLast(record => record.type === 'accounting')
    const dataRecords = records.filter(record => record.type !== 'accounting').length
    return {
      file,
      pid: startup.pid,
      ready: startup.type === 'process-start'
        && startup.preloadSha256 === preloadSha256
        && startup.pathHelperSha256 === pathHelperSha256
        && file === `gc-${startup.pid}.ndjson`
        && startup.identity?.role === identity.role
        && startup.identity?.project === identity.project
        && startup.identity?.kind === identity.kind
        && startup.identity?.run === identity.run
        && sameFilesystemPath(startup.actualEntry, expectedEntry),
      bytes: Buffer.byteLength(content),
      completeFinalLine: content.endsWith('\n'),
      recordIntegrityUnavailable,
      readError,
      lastWriteAccounted: !recordIntegrityUnavailable && lastAccounting?.costs.dataWrites === dataRecords,
      recordingError: records.findLast(record => record.type === 'recording-error'),
      lastAccounting,
    }
  }
  catch (error) {
    return { file, ready: false, readError: error instanceof Error ? error.message : String(error) }
  }
}

export async function createGcDiagnostics({ cwd, versionMeta, projectMeta, directory, kind, run, env = {} }) {
  const serviceMetadata = getGcDiagnosticService(projectMeta.key)
  if (!directory || !serviceMetadata) {
    return undefined
  }

  const role = versionMeta.diagnosticIdentity?.role ?? versionMeta.version
  const safeRole = role.replace(/[^a-z\d-]/gi, '_').slice(0, 64)
  let sessionDirectory
  try {
    await fs.mkdir(directory, { recursive: true })
    sessionDirectory = await fs.mkdtemp(path.join(directory, `${safeRole}-${kind}-${run}-`))
  }
  catch (error) {
    reportFailure(error)
    return undefined
  }
  const boundaries = []
  let boundaryCount = 0
  let rootPid
  let setupError
  let childEnv
  let expectedEntry
  let preloadSha256
  let pathHelperSha256
  const identity = {
    ...versionMeta.diagnosticIdentity,
    role,
    version: versionMeta.version,
    root: versionMeta.root,
    project: projectMeta.key,
    kind,
    run,
    sessionDirectory,
  }
  const preloadPath = path.join(sessionDirectory, 'gc-preload.mjs')

  try {
    const require = createRequire(path.join(cwd, 'package.json'))
    const packagePath = require.resolve(`${serviceMetadata.packageName}/package.json`)
    const service = JSON.parse(await fs.readFile(packagePath, 'utf8'))
    const entry = service.bin?.[serviceMetadata.binName]
    if (service.name !== serviceMetadata.packageName || typeof entry !== 'string' || !entry) {
      throw new Error(`GC 诊断 service 身份或 bin 不匹配：${serviceMetadata.packageName}`)
    }
    // Taro runner 在加载 CLI 前改写 argv；preload 必须绑定 Node 最初执行的仓库入口。
    expectedEntry = await fs.realpath(serviceMetadata.repositoryEntry
      ? path.resolve(versionMeta.root, serviceMetadata.repositoryEntry)
      : path.resolve(path.dirname(packagePath), entry))
    await fs.copyFile(preloadSourcePath, preloadPath)
    await fs.copyFile(pathHelperSourcePath, path.join(sessionDirectory, 'gc-paths.mjs'))
    preloadSha256 = createHash('sha256').update(await fs.readFile(preloadPath)).digest('hex')
    pathHelperSha256 = createHash('sha256').update(await fs.readFile(path.join(sessionDirectory, 'gc-paths.mjs'))).digest('hex')
    childEnv = {
      NODE_OPTIONS: appendNodeImport(env.NODE_OPTIONS ?? process.env.NODE_OPTIONS, preloadPath),
      WEAPP_TW_BENCH_GC_EXPECTED_ENTRY: expectedEntry,
      WEAPP_TW_BENCH_GC_SESSION: JSON.stringify({ ...identity, expectedPreloadSha256: preloadSha256, expectedPathHelperSha256: pathHelperSha256 }),
    }
  }
  catch (error) {
    setupError = error instanceof Error ? error.message : String(error)
  }

  return {
    env: childEnv ?? {},
    mark(type, round) {
      boundaryCount += 1
      if (boundaries.length < maxBoundaries) {
        boundaries.push({ type, round, atEpochMs: Date.now(), atMonotonicMs: performance.now() })
      }
    },
    spawned(pid) {
      rootPid = pid
      this.mark('spawn')
    },
    async finish() {
      try {
        const processFiles = (await fs.readdir(sessionDirectory)).filter(file => /^gc-\d+\.ndjson$/.test(file))
        const processEvidence = await Promise.all(processFiles.map(file => inspectProcessFile(sessionDirectory, file, expectedEntry, preloadSha256, pathHelperSha256, identity)))
        await fs.writeFile(path.join(sessionDirectory, 'controller.json'), `${JSON.stringify({
          schemaVersion: 1,
          identity,
          controller: { pid: process.pid, nodeVersion: process.version, rootPid, timeOrigin: performance.timeOrigin },
          expectedEntry,
          preloadPath,
          preloadSourcePath,
          preloadSha256,
          pathHelperSha256,
          setupError,
          processEvidence,
          missingPreloadEvidence: !processEvidence.some(item => item.ready),
          boundaries,
          boundaryCount,
          truncatedBoundaries: boundaryCount - boundaries.length,
          // 证据只覆盖最后一个完整的同步写入，不以缺失 GC 记录证明没有发生 GC。
          recordingBoundary: 'last completed synchronous NDJSON callback write',
        }, null, 2)}\n`, 'utf8')
      }
      catch (error) {
        reportFailure(error)
      }
    },
  }
}
