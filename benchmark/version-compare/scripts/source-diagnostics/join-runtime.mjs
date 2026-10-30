import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { diagnosticMutationMarker } from '../diagnostics/constants.mjs'
import { benchmarkProjects } from '../projects.mjs'
import { assertRuntimeMatrixAcceptance } from '../runtime-diagnostics/acceptance.mjs'
import { runtimeBindingDigest } from '../runtime-diagnostics/binding.mjs'
import { digestBytes, readBoundedFile, runtimeArtifactPath, sameRuntimePath } from '../runtime-diagnostics/bounded-file.mjs'
import { runtimeProject } from '../runtime-diagnostics/request.mjs'
import { verifyRuntimeEvidence } from '../runtime-diagnostics/verify.mjs'

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}
const positivePid = value => Number.isSafeInteger(value) && value > 0
function readJson(file, maximumBytes) {
  return JSON.parse(readBoundedFile(file, {
    maximumBytes,
  }).toString('utf8'))
}
async function readControllers(runtimeDirectory) {
  const root = await fs.realpath(runtimeDirectory)
  const entries = await fs.readdir(root, {
    withFileTypes: true,
  })
  assert(entries.length === 2 && entries.every(entry => entry.isDirectory() && !entry.isSymbolicLink()), 'runtime 必须恰有两个任务专属 HMR session 目录')
  const records = []
  for (const entry of entries) {
    const directory = runtimeArtifactPath(root, entry.name)
    assert(sameRuntimePath(await fs.realpath(directory), directory), 'runtime session 物理目录不符')
    const file = path.join(directory, 'controller.json')
    records.push({
      directory,
      file,
      controller: readJson(file, 8 * 1024 * 1024),
    })
  }
  return records
}
function assertController(record, expected) {
  const {
    controller,
    directory,
  } = record
  const identity = controller.identity
  if (Object.hasOwn(controller, 'firstFailure')) {
    throw new Error(`runtime controller 首败：${controller.firstFailure?.message ?? controller.firstFailure?.value ?? String(controller.firstFailure)}`, {
      cause: controller.firstFailure,
    })
  }
  assert(controller.diagnosticOnly === true && controller.budgetAcceptance === false && controller.attached === true && controller.closed === true && positivePid(controller.rootPid) && Array.isArray(controller.diagnosticFailures) && controller.diagnosticFailures.length === 0, 'runtime controller 未完整关闭、存在首败或诊断失败')
  assert(identity?.diagnosticOnly === true && identity.budgetAcceptance === false && identity.role === expected.diagnosticIdentity.role && identity.version === expected.version && identity.sourceCommit === expected.diagnosticIdentity.sourceCommit && identity.sourceTree === expected.diagnosticIdentity.sourceTree && identity.sourceWorkingTreeStatus === expected.diagnosticIdentity.sourceWorkingTreeStatus && identity.project === runtimeProject && identity.kind === 'hmr' && identity.run === 1 && sameRuntimePath(identity.root, expected.root) && sameRuntimePath(identity.sessionDirectory, directory), 'runtime controller 会话/产品身份不符')
  assert(runtimeBindingDigest(identity.binding) === runtimeBindingDigest(expected.diagnosticIdentity.binding), 'runtime controller product/lock/driver binding 不符')
  assert(controller.processResult && Object.hasOwn(controller.processResult, 'code') && Object.hasOwn(controller.processResult, 'signal') && (controller.processResult.code === null || Number.isInteger(controller.processResult.code)) && (controller.processResult.signal === null || typeof controller.processResult.signal === 'string'), 'runtime controller 缺少实际 wrapper close 回执')
  for (const name of ['stdout', 'stderr']) {
    const receipt = controller.logReceipts?.[name]
    assert(receipt?.file === `worker-${name}.log` && receipt.complete === true && Number.isSafeInteger(receipt.observedBytes) && receipt.observedBytes >= 0 && receipt.bytes === receipt.observedBytes, 'runtime wrapper 原始日志不完整')
    readBoundedFile(runtimeArtifactPath(directory, receipt.file), {
      maximumBytes: 8 * 1024 * 1024,
      receipt,
    })
  }
}
function reachesRoot(sample, workerPid, rootPid) {
  const processes = new Map(sample.processes.map(item => [item.pid, item]))
  const worker = processes.get(workerPid)
  if (!worker || !(worker.rssMb > 0) || !processes.has(rootPid)) {
    return false
  }
  const visited = new Set()
  let pid = workerPid
  while (!visited.has(pid)) {
    if (pid === rootPid) {
      return true
    }
    visited.add(pid)
    const item = processes.get(pid)
    if (!item) {
      return false
    }
    pid = item.ppid
  }
  return false
}
function joinRss(row, controller, verified, startup) {
  assert(positivePid(verified.pid) && startup.pid === verified.pid && Number.isFinite(startup.atEpochMs) && startup.atEpochMs > 0, 'runtime 真实 worker PID/启动时间缺失')
  const samples = row.hmrMemory.samples.filter(sample => sample.at >= startup.atEpochMs && reachesRoot(sample, verified.pid, controller.rootPid))
  assert(samples.length > 0, 'runtime HMR RSS 未观察到真实 worker 及其到 wrapper 的同样本祖先链')
  const builds = row.buildMemorySamples.map((sample) => {
    assert(positivePid(sample.rootPid) && sample.memory.samples.some(item => item.processes.some(process => process.pid === sample.rootPid && process.rssMb > 0)), 'runtime build RSS 未关联实际 build root PID')
    return {
      run: sample.run,
      rootPid: sample.rootPid,
      sampleCount: sample.memory.count,
    }
  })
  const workerSamples = samples.map(sample => ({
    atEpochMs: sample.at,
    workerRssMb: sample.processes.find(item => item.pid === verified.pid).rssMb,
    treeRssMb: sample.rssMb,
  }))
  return {
    wrapperRootPid: controller.rootPid,
    workerPid: verified.pid,
    workerStartedAtEpochMs: startup.atEpochMs,
    hmrSampleCount: row.hmrMemory.count,
    workerObservedSampleCount: workerSamples.length,
    workerSamples,
    builds,
    basis: '同一 HMR RSS 样本中真实 worker 的 ppid 链回到 controller wrapper；不是逐 profile 同步 RSS',
  }
}
function confirmWorkerGone(pid) {
  assert(positivePid(pid), 'runtime worker PID 无效')
  try {
    process.kill(pid, 0)
  }
  catch (error) {
    if (error.code === 'ESRCH') {
      return {
        pid,
        absent: true,
        checkedAtEpochMs: Date.now(),
        basis: 'process.kill(pid, 0) 返回 ESRCH；PID 复用或 EPERM 均保守失败',
      }
    }
    throw new Error(`runtime worker 退出未确认：${error.code ?? error.message}`, {
      cause: error,
    })
  }
  throw new Error('runtime worker PID 仍存在，禁止将 wrapper close 当作真实 worker 已退出')
}
function assertSourceRestored(row, controller, expected) {
  const project = benchmarkProjects.find(item => item.key === runtimeProject)
  assert(project, 'runtime 固定项目定义缺失')
  for (const name of ['project', 'sourceFile', 'buildScript', 'devScript', 'injectType', 'outputTemplate']) {
    assert(row[name] === project[name], `runtime matrix 项目定义不符：${name}`)
  }
  const sourcePath = path.resolve(expected.root, project.project, project.sourceFile)
  const writes = controller.sourceWrites
  assert(Array.isArray(writes) && writes.length === 10, 'runtime sourceWrites 必须为 initial 加三轮写入/回滚/回滚观察')
  for (const write of writes) {
    assert(sameRuntimePath(write.sourcePath, sourcePath) && Number.isSafeInteger(write.bytes) && write.bytes >= 0 && /^[a-f\d]{64}$/i.test(write.sha256 ?? ''), 'runtime sourceWrites 来源路径或字节回执不符')
  }
  const initial = writes[0]
  assert(initial.type === 'initial', 'runtime sourceWrites 缺少原文回执')
  const bytes = readBoundedFile(sourcePath, {
    maximumBytes: 4 * 1024 * 1024,
  })
  assert(bytes.length === initial.bytes && digestBytes(bytes) === initial.sha256, 'runtime 最终来源未恢复为 initial 原文')
  const original = new TextDecoder('utf-8', {
    fatal: true,
  }).decode(bytes)
  for (let round = 1; round <= 3; round++) {
    const marker = diagnosticMutationMarker(round, original)
    const [mutation, written, observed] = writes.slice(1 + (round - 1) * 3, 1 + round * 3)
    assert(mutation.type === 'mutation-written' && mutation.marker === marker && mutation.bytes > 0 && mutation.sha256 !== initial.sha256, `runtime 第 ${round} 轮实际修改回执缺失`)
    for (const [write, type] of [[written, 'rollback-written'], [observed, 'rollback-observed']]) {
      assert(write.type === type && write.marker === marker && write.bytes === initial.bytes && write.sha256 === initial.sha256, `runtime 第 ${round} 轮回滚未恢复原文：${type}`)
    }
  }
  return {
    path: sourcePath,
    bytes: initial.bytes,
    sha256: initial.sha256,
    restored: true,
    rounds: 3,
    sourceWrites: writes.length,
    basis: '实际最终文件与 initial 字节一致，三轮回滚写入及观察回执一致；完整 tracked tree 由 prepare after 另验',
  }
}

/** 合取 matrix、唯一 controller、八 profile、真实 worker/RSS 与来源恢复；任一失败均抛错。 */
export async function acceptRuntimeEvidence({
  report,
  expectedVersions,
  runtimeDirectory,
}) {
  const failures = []
  let matrix
  let records = []
  try {
    matrix = assertRuntimeMatrixAcceptance(report, expectedVersions)
  }
  catch (error) {
    failures.push(error)
  }
  try {
    records = await readControllers(runtimeDirectory)
  }
  catch (error) {
    failures.push(error)
  }
  const roles = []
  for (const expected of Array.isArray(expectedVersions) && expectedVersions.length === 2 ? expectedVersions : []) {
    try {
      const matching = records.filter(record => record.controller.identity?.role === expected.diagnosticIdentity.role)
      assert(matching.length === 1, `runtime ${expected.diagnosticIdentity.role} 必须恰有一个 controller`)
      const record = matching[0]
      assertController(record, expected)
      const row = report.rows.find(item => item.version === expected.version && item.key === runtimeProject)
      assert(row && !Object.hasOwn(row, 'error'), 'runtime 缺少成功 matrix 行')
      const verified = await verifyRuntimeEvidence(record.directory, record.controller.identity, record.controller.checkpoints)
      assert(verified.profiles.length === 8 && verified.diagnosticOnly === true && verified.budgetAcceptance === false, 'runtime 八份 profile 或诊断身份不完整')
      assert(JSON.stringify(verified) === JSON.stringify(record.controller.verification), 'runtime controller 缓存的验证结果与实际工件重验不符')
      const startup = readJson(path.join(record.directory, 'process-start.json'), 256 * 1024)
      const rss = joinRss(row, record.controller, verified, startup)
      const source = assertSourceRestored(row, record.controller, expected)
      const workerExit = confirmWorkerGone(verified.pid)
      roles.push({
        role: expected.diagnosticIdentity.role,
        version: expected.version,
        root: expected.root,
        controllerFile: record.file,
        sessionDirectory: record.directory,
        processResult: record.controller.processResult,
        verification: verified,
        rss,
        workerExit,
        source,
      })
    }
    catch (error) {
      failures.push(error)
    }
  }
  if (failures.length) {
    throw new AggregateError(failures, `runtime 完整证据合取失败；首错：${failures[0].message}`, {
      cause: failures[0],
    })
  }
  return {
    schemaVersion: 1,
    status: 'complete',
    complete: true,
    diagnosticOnly: true,
    budgetAcceptance: false,
    runtimeEvidenceVerified: true,
    matrix,
    buildRuns: 3,
    hmrRuns: 3,
    hmrSessionsPerSide: 1,
    profilesPerSide: 8,
    roles,
    scope: '只验本次独立 runtime 诊断证据；prepare before/after 全树校验及外部命令组回收由 orchestrator 负责，不代表正式性能预算',
  }
}
