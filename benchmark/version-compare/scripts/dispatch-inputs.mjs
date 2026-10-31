import { execFileSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { validateAllocationRequest } from './diagnostics/constants.mjs'
import { getGcDiagnosticService } from './gc-projects.mjs'

export function validateBenchmarkDispatch({ baselineRef = '', gcDiagnostics = false, inputDiagnostics = false, allocationDiagnostics = false, buildRuns = 3, hmrRuns = 3, only = '', cwd = process.cwd() } = {}) {
  if (inputDiagnostics && allocationDiagnostics) {
    throw new Error('输入证据与分配采样必须分开运行')
  }
  validateAllocationRequest({ mode: inputDiagnostics ? 'inputs' : 'allocation', enabled: inputDiagnostics || allocationDiagnostics, guardMode: false, baselineRef, selectedProjects: only.split(',').filter(Boolean).map(key => ({ key: key.trim() })), buildRuns: Number(buildRuns), hmrRuns: Number(hmrRuns) })
  if (baselineRef) {
    if (!/^[a-f\d]{40}$/i.test(baselineRef)) {
      throw new Error('baseline_ref 必须是完整的 40 位 Git commit SHA')
    }
    let type
    try {
      type = execFileSync('git', ['cat-file', '-t', baselineRef], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    }
    catch {
      throw new Error(`baseline_ref 对象不存在：${baselineRef}`)
    }
    if (type !== 'commit') {
      throw new Error('baseline_ref 必须指向 commit 对象')
    }
  }
  if (gcDiagnostics) {
    const keys = only.split(',').map(key => key.trim()).filter(Boolean)
    if (!keys.length || keys.some(key => !getGcDiagnosticService(key))) {
      throw new Error('gc_diagnostics 需要通过 only 显式选择已支持的 Mpx、Uni 或 Taro Vite 小程序项目')
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validateBenchmarkDispatch({
    baselineRef: process.env.BENCH_DISPATCH_BASELINE_REF,
    gcDiagnostics: process.env.BENCH_DISPATCH_GC_DIAGNOSTICS === 'true',
    inputDiagnostics: process.env.BENCH_DISPATCH_INPUT_DIAGNOSTICS === 'true',
    allocationDiagnostics: process.env.BENCH_DISPATCH_ALLOCATION_DIAGNOSTICS === 'true',
    buildRuns: process.env.BENCH_BUILD_RUNS,
    hmrRuns: process.env.BENCH_HMR_RUNS,
    only: process.env.BENCH_ONLY,
  })
}
