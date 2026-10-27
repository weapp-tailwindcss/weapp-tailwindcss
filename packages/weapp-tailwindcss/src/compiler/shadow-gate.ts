import type { CompilerShadowRunSnapshot } from './shadow-report-session'
import process from 'node:process'
import { resolveCompilerMode } from './mode'
import { completeCompilerShadowReportRun } from './shadow-report-session'

export const COMPILER_SHADOW_GATE_ENV = 'WEAPP_TAILWINDCSS_COMPILER_SHADOW_GATE'

export type CompilerShadowGateMode = 'off' | 'report' | 'error'

export type CompilerShadowGateIssue
  = | 'semantic-mismatch'
    | 'truncated-report'
    | 'dropped-report'

export interface CompilerShadowGateResult {
  mode: CompilerShadowGateMode
  passed: boolean
  issues: CompilerShadowGateIssue[]
  snapshot: CompilerShadowRunSnapshot
}

export interface CompilerShadowGatePayload {
  mode: CompilerShadowGateMode
  passed: boolean
  issues: CompilerShadowGateIssue[]
  revision: number
  summary: CompilerShadowRunSnapshot['summary']
}

export interface FinalizeCompilerShadowRunOptions {
  emit?: ((payload: CompilerShadowGatePayload) => void) | undefined
  env?: NodeJS.ProcessEnv | undefined
  revision?: number | undefined
}

export function resolveCompilerShadowGateMode(
  env: NodeJS.ProcessEnv,
): CompilerShadowGateMode {
  const value = env[COMPILER_SHADOW_GATE_ENV]?.trim().toLowerCase()
  return value === 'report' || value === 'error' ? value : 'off'
}

export function evaluateCompilerShadowGate(
  snapshot: CompilerShadowRunSnapshot,
  mode: CompilerShadowGateMode = 'off',
): CompilerShadowGateResult {
  const issues: CompilerShadowGateIssue[] = []
  if (snapshot.summary.mismatched > 0) {
    issues.push('semantic-mismatch')
  }
  if (snapshot.summary.truncated > 0) {
    issues.push('truncated-report')
  }
  if (snapshot.summary.dropped > 0) {
    issues.push('dropped-report')
  }
  return {
    mode,
    passed: issues.length === 0,
    issues,
    snapshot,
  }
}

export function emitCompilerShadowGateResult(payload: CompilerShadowGatePayload) {
  process.stdout.write(`[weapp-tailwindcss:compiler-shadow] ${JSON.stringify(payload)}\n`)
}

export function finalizeCompilerShadowRun(
  owner: object,
  options: FinalizeCompilerShadowRunOptions = {},
) {
  const env = options.env ?? {}
  if (resolveCompilerMode(env) !== 'shadow') {
    return undefined
  }
  const snapshot = completeCompilerShadowReportRun(owner, options.revision)
  if (!snapshot) {
    return undefined
  }
  const result = evaluateCompilerShadowGate(snapshot, resolveCompilerShadowGateMode(env))
  if (result.mode !== 'off') {
    const payload: CompilerShadowGatePayload = {
      mode: result.mode,
      passed: result.passed,
      issues: result.issues,
      revision: snapshot.revision,
      summary: snapshot.summary,
    }
    if (options.emit) {
      options.emit(payload)
    }
    else {
      emitCompilerShadowGateResult(payload)
    }
  }
  if (result.mode === 'error' && !result.passed) {
    throw new Error(
      `weapp-tailwindcss shadow gate failed: ${result.issues.join(', ')}`,
    )
  }
  return result
}
