import { execFileSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { getGcDiagnosticService } from './gc-projects.mjs'

export function validateBenchmarkDispatch({ baselineRef = '', gcDiagnostics = false, only = '', cwd = process.cwd() } = {}) {
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
      throw new Error('gc_diagnostics 需要通过 only 显式选择已支持的 Mpx 或 Uni Vite 小程序项目')
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validateBenchmarkDispatch({
    baselineRef: process.env.BENCH_DISPATCH_BASELINE_REF,
    gcDiagnostics: process.env.BENCH_DISPATCH_GC_DIAGNOSTICS === 'true',
    only: process.env.BENCH_ONLY,
  })
}
