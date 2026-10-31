import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { appendNodeImport, sameFilesystemPath } from '../gc-paths.mjs'
import { weappViteInputProject } from './constants.mjs'
import { createWorkerEvidence } from './worker-evidence.mjs'

const sha256 = value => createHash('sha256').update(value).digest('hex')

async function readSha(file) {
  try {
    return sha256(await fs.readFile(file))
  }
  catch (error) {
    if (error.code === 'ENOENT') {
      return undefined
    }
    throw error
  }
}

function safeRole(role) {
  return String(role).replace(/[^a-z\d-]/gi, '_').slice(0, 64)
}

/** 仅为 weapp-vite input-only 建立不加载 inspector 的 worker 身份。 */
export async function createInputDiagnostics({ cwd, versionMeta, projectMeta, directory, kind, run, env = {} }) {
  if (projectMeta.key !== weappViteInputProject) {
    return undefined
  }
  if (!directory) {
    return undefined
  }
  const role = versionMeta.diagnosticIdentity?.role ?? versionMeta.version
  await fs.mkdir(directory, { recursive: true })
  const sessionDirectory = await fs.mkdtemp(path.join(directory, `${safeRole(role)}-${kind}-${run}-`))
  const require = createRequire(path.join(cwd, 'package.json'))
  const packageFile = require.resolve('weapp-vite/package.json')
  const packageDirectory = path.dirname(packageFile)
  const packageJson = JSON.parse(await fs.readFile(packageFile, 'utf8'))
  if (packageJson.name !== 'weapp-vite' || packageJson.bin?.['weapp-vite'] !== 'bin/weapp-vite.js' || packageJson.bin?.wv !== 'bin/weapp-vite.js') {
    throw new Error('weapp-vite input-only service 身份或 bin 不匹配')
  }
  const expectedEntry = await fs.realpath(path.resolve(packageDirectory, packageJson.bin['weapp-vite']))
  const entrySha256 = await readSha(expectedEntry)
  const identity = {
    ...versionMeta.diagnosticIdentity,
    role,
    version: versionMeta.version,
    root: versionMeta.root,
    project: projectMeta.key,
    kind,
    run,
    mode: 'inputs',
    platform: process.platform,
    sessionDirectory,
    expectedEntry,
    service: {
      name: packageJson.name,
      version: packageJson.version,
      packageSha256: sha256(await fs.readFile(packageFile)),
      entrySha256,
    },
    packageLockSha256: await readSha(path.join(cwd, 'pnpm-lock.yaml')),
    startedAtEpochMs: Date.now(),
    startedAtMonotonicMs: performance.now(),
  }
  const sessionVariable = 'WEAPP_TW_BENCH_INPUT_SESSION'
  const expectedVariable = 'WEAPP_TW_BENCH_INPUT_EXPECTED_ENTRY'
  const envOutput = {
    ...env,
    [expectedVariable]: expectedEntry,
    [sessionVariable]: JSON.stringify(identity),
  }
  const worker = createWorkerEvidence(sessionDirectory)
  let rootPid
  let processResult
  let closed = false
  let closePromise = Promise.resolve()
  return {
    env: envOutput,
    sessionVariable,
    expectedVariable,
    identity,
    mark(type, round) {
      const phase = { type, round, atEpochMs: Date.now(), atMonotonicMs: performance.now() }
      writeFileSync(path.join(sessionDirectory, 'stage.json'), JSON.stringify(phase))
    },
    spawned(pid, child) {
      rootPid = pid
      if (child) {
        worker.attach(child)
        closePromise = new Promise((resolve) => {
          child.once('close', (code, signal) => {
            closed = true
            processResult = { code, signal }
            resolve()
          })
        })
      }
    },
    async finish() {
      await closePromise
      const startup = JSON.parse(await fs.readFile(path.join(sessionDirectory, 'process-start.json'), 'utf8'))
      const sessionIdentity = JSON.parse(envOutput[sessionVariable])
      const actualEntry = startup.actualEntry
      const actualEntrySha256 = typeof actualEntry === 'string' ? await readSha(actualEntry) : undefined
      if (!Number.isInteger(startup.pid) || startup.pid <= 0 || !Number.isInteger(startup.ppid) || startup.ppid <= 0 || !Number.isInteger(rootPid) || rootPid <= 0 || typeof actualEntry !== 'string' || !sameFilesystemPath(actualEntry, expectedEntry)
        || startup.identity?.project !== weappViteInputProject
        || startup.identity?.mode !== 'inputs'
        || startup.identity?.run !== run
        || startup.identity?.role !== role
        || !entrySha256 || actualEntrySha256 !== entrySha256 || !sessionIdentity.sourceCommit || !sessionIdentity.sourceTree || startup.executable === undefined || !closed) {
        throw new Error('weapp-vite input-only worker 入口或身份回执不完整')
      }
      await fs.writeFile(path.join(sessionDirectory, 'input-controller.json'), `${JSON.stringify({
        schemaVersion: 1,
        identity: sessionIdentity,
        controller: { pid: process.pid, rootPid, nodeVersion: process.version },
        worker: {
          pid: startup.pid,
          ppid: startup.ppid,
          ppidRelation: startup.ppid === rootPid ? 'direct' : 'launcher-chain',
        },
        expectedEntry,
        processResult,
        closed,
        entryMatches: sameFilesystemPath(actualEntry, expectedEntry),
        entrySha256,
        noInspector: true,
      }, null, 2)}\n`, 'utf8')
    },
    appendPreload(preloadPath) {
      envOutput.NODE_OPTIONS = appendNodeImport(envOutput.NODE_OPTIONS ?? process.env.NODE_OPTIONS, preloadPath)
    },
  }
}
