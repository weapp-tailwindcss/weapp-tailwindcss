export const RN_PHASE_EVIDENCE_VERSION = 1

export const nativeRuntimePhases = [
  { id: 'baseline', revision: 'rn-hmr-baseline-10b981', marker: 'rn-hmr-baseline', markerClass: 'bg-emerald-500', cssColor: '#10b981' },
  { id: 'tsx-hmr', revision: 'rn-hmr-updated-10b981', marker: 'rn-hmr-updated', markerClass: 'bg-rose-500', cssColor: '#10b981' },
  { id: 'css-hmr', revision: 'rn-hmr-updated-f59e0b', marker: 'rn-hmr-updated', markerClass: 'bg-rose-500', cssColor: '#f59e0b' },
] as const

export const nativeEncodingArtifactNames = ['manifest.json', 'manifest.ready', 'snapshot.json', 'run-context.json', 'static-evidence.json', 'tailwind-input.cjs'] as const

export type NativeRuntimePhase = typeof nativeRuntimePhases[number]

/** 归档目录只能来自固定阶段合同，不能拼接报告提供的 revision。 */
export function nativePhaseForRevision(revision: string): NativeRuntimePhase {
  const phase = nativeRuntimePhases.find(item => item.revision === revision)
  if (!phase) {
    throw new Error(`React Native 未登记的阶段 revision：${revision}`)
  }
  return phase
}
