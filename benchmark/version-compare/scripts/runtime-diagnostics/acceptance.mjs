import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { runtimeBindingDigest, verifyRuntimeBinding } from './binding.mjs'
import { readBoundedFile, sameRuntimePath } from './bounded-file.mjs'
import { runtimeProject } from './request.mjs'

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}
const positive = value => Number.isFinite(value) && value > 0
function assertMemory(memory, label) {
  assert(Number.isSafeInteger(memory?.count) && memory.count > 0 && memory.count <= 100000 && Array.isArray(memory.samples) && memory.samples.length === memory.count && ['baselineRssMb', 'peakRssMb', 'steadyRssMb'].every(name => positive(memory[name])), `运行时诊断 ${label} RSS 零样本或摘要缺证`)
  for (const sample of memory.samples) {
    assert(positive(sample.at) && positive(sample.rssMb) && Number.isSafeInteger(sample.processCount) && sample.processCount > 0 && Array.isArray(sample.processes) && sample.processes.length === sample.processCount, `运行时诊断 ${label} RSS 原始进程树缺证`)
    const pids = new Set()
    let sum = 0
    for (const item of sample.processes) {
      assert(Number.isSafeInteger(item.pid) && item.pid > 0 && !pids.has(item.pid) && Number.isSafeInteger(item.ppid) && item.ppid >= 0 && Number.isFinite(item.rssMb) && item.rssMb >= 0 && typeof item.command === 'string', `运行时诊断 ${label} RSS 进程记录无效`)
      pids.add(item.pid)
      sum += item.rssMb
    }
    assert(Math.abs(sum - sample.rssMb) <= 1e-6, `运行时诊断 ${label} RSS 总和与进程树不符`)
  }
}

/** 原始报告先落盘；错误行、零 RSS 或缺轮次必须让独立验收进程非零退出。 */
export function assertRuntimeMatrixAcceptance(report, expectedVersions) {
  assert(report?.diagnosticOnly === true && report.budgetAcceptance === false && report.options?.buildRuns === 3 && report.options?.hmrRuns === 3 && report.selectedProjectKeys?.length === 1 && report.selectedProjectKeys[0] === runtimeProject, '运行时诊断必须保持 buildRuns=3、hmrRuns=3、单项目与非预算身份')
  assert(Array.isArray(expectedVersions) && expectedVersions.length === 2 && new Set(expectedVersions.map(item => item.version)).size === 2 && ['base', 'current'].every(role => expectedVersions.some(item => item.diagnosticIdentity?.role === role)), '运行时诊断必须绑定两侧准确版本')
  assert(Array.isArray(report.rows) && report.rows.length === 2 && Array.isArray(report.versions) && report.versions.length === 2, '运行时诊断矩阵两侧不完整')
  for (const row of report.rows) {
    assert(!Object.hasOwn(row, 'error'), `运行时诊断错误行禁止验收：${String(row.error)}`)
  }
  const rows = []
  for (const version of expectedVersions) {
    const metadata = report.versions.filter(item => item.version === version.version)
    const matching = report.rows.filter(row => row.version === version.version && row.key === runtimeProject)
    assert(metadata.length === 1 && matching.length === 1 && sameRuntimePath(metadata[0].root, version.root) && sameRuntimePath(matching[0].root, version.root), '运行时诊断矩阵版本、项目或准备根不符')
    assert(runtimeBindingDigest(metadata[0].diagnosticIdentity?.binding) === runtimeBindingDigest(version.diagnosticIdentity?.binding), '运行时诊断矩阵 product/lock/driver 身份不符')
    verifyRuntimeBinding(version.diagnosticIdentity.binding, {
      root: version.root,
      sourceCommit: version.diagnosticIdentity.sourceCommit,
      driverModule: {
        relativePath: 'benchmark/version-compare/scripts/runtime-diagnostics/acceptance.mjs',
        file: fileURLToPath(import.meta.url),
      },
    })
    const row = matching[0]
    assert(!Object.hasOwn(row, 'error'), `运行时诊断错误行禁止验收：${String(row.error)}`)
    assert(row.buildMode === 'build' && row.hmrMode === 'watch' && Array.isArray(row.buildMs) && row.buildMs.length === 3 && row.buildMs.every(positive) && Array.isArray(row.hmrMs) && row.hmrMs.length === 3 && row.hmrMs.every(positive) && Array.isArray(row.buildMemorySamples) && row.buildMemorySamples.length === 3, '运行时诊断实际 build/HMR 工作负载不完整')
    for (const [index, sample] of row.buildMemorySamples.entries()) {
      assert(sample.run === index + 1 && positive(sample.durationMs), '运行时诊断冷构建轮次无效')
      assertMemory(sample.memory, `${version.version}/build-${index + 1}`)
    }
    assertMemory(row.hmrMemory, `${version.version}/hmr-session-1`)
    rows.push({
      version: version.version,
      buildSampleCounts: row.buildMemorySamples.map(sample => sample.memory.count),
      hmrSampleCount: row.hmrMemory.count,
    })
  }
  return {
    matrixComplete: true,
    runtimeEvidenceVerified: false,
    diagnosticOnly: true,
    budgetAcceptance: false,
    buildRuns: 3,
    hmrRuns: 3,
    hmrSessions: 1,
    expectedCheckpointCountPerSide: 8,
    rows,
    scope: '仅验 matrix 身份、轮次与 RSS；adapter 另验每侧 controller 首败/关闭及 verifyRuntimeEvidence 八份 profile',
  }
}

/** 第二个参数必须来自独立准备 adapter，不能用 raw 内的自述版本替代期望身份。 */
export function acceptRuntimeMatrixFiles(rawFile, expectedVersionsFile) {
  assert(typeof rawFile === 'string' && typeof expectedVersionsFile === 'string', '用法：acceptance.mjs <matrix-raw.json> <expected-versions.json>')
  const report = JSON.parse(readBoundedFile(rawFile, {
    maximumBytes: 16 * 1024 * 1024,
  }).toString('utf8'))
  const expected = JSON.parse(readBoundedFile(expectedVersionsFile, {
    maximumBytes: 256 * 1024,
  }).toString('utf8'))
  return assertRuntimeMatrixAcceptance(report, expected)
}
if (process.argv[1] && sameRuntimePath(path.resolve(process.argv[1]), fileURLToPath(import.meta.url))) {
  try {
    process.stdout.write(`${JSON.stringify(acceptRuntimeMatrixFiles(process.argv[2], process.argv[3]))}\n`)
  }
  catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}
