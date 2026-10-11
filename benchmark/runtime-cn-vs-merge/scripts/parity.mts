import { writeFileSync } from 'node:fs'
import { staticCases, resolveArgs } from '../src/cases'
import { collectEnv } from '../src/env'
import { ensureDataDir, parityPath } from '../src/paths'
import type { CaseParity } from '../src/results'
import { SUBJECTS, loadSubject, type SubjectId } from '../src/subjects'

export type { CaseParity }

async function main() {
  const fns = Object.fromEntries(
    await Promise.all(SUBJECTS.map(async subject => [subject.id, await loadSubject(subject.id)] as const)),
  ) as Record<SubjectId, (...inputs: any[]) => string>

  const cases: CaseParity[] = staticCases.map((benchCase) => {
    const args = resolveArgs(benchCase)
    const outputs = Object.fromEntries(
      SUBJECTS.map(subject => [subject.id, fns[subject.id](...args)]),
    ) as Record<SubjectId, string>

    return {
      id: benchCase.id,
      title: benchCase.title,
      conflict: benchCase.conflict,
      outputs,
      weappEqual: outputs['weapp-cn'] === outputs['weapp-merge']
        && outputs['weapp-merge-slim'] === outputs['weapp-merge'],
      weappCnVsMerge: outputs['weapp-cn'] === outputs['weapp-merge'],
      weappSlimVsMerge: outputs['weapp-merge-slim'] === outputs['weapp-merge'],
      upstreamEqual: outputs['upstream-cn'] === outputs['upstream-twmerge-clsx'],
      upstreamMergeEqual: outputs['upstream-cn-twmerge'] === outputs['upstream-twmerge'],
      escapeDelta: outputs['weapp-cn'] !== outputs['upstream-cn']
        || outputs['weapp-merge'] !== outputs['upstream-twmerge-clsx'],
    }
  })

  const summary = {
    total: cases.length,
    weappCnVsMergeMismatches: cases.filter(item => !item.weappCnVsMerge).map(item => item.id),
    weappSlimVsMergeMismatches: cases.filter(item => !item.weappSlimVsMerge).map(item => item.id),
    upstreamMismatches: cases.filter(item => !item.upstreamEqual).map(item => item.id),
    upstreamMergeMismatches: cases.filter(item => !item.upstreamMergeEqual).map(item => item.id),
  }

  ensureDataDir()
  writeFileSync(parityPath, `${JSON.stringify({ env: collectEnv(), summary, cases }, null, 2)}\n`)
  console.log(`parity written to ${parityPath}`)
  console.log(`cn vs merge mismatches: ${summary.weappCnVsMergeMismatches.join(', ') || 'none'}`)
  console.log(`slim vs merge mismatches: ${summary.weappSlimVsMergeMismatches.join(', ') || 'none'}`)
  console.log(`upstream cn vs twMerge mismatches: ${summary.upstreamMismatches.join(', ') || 'none'}`)
  console.log(`cn.twMerge vs tailwind-merge mismatches: ${summary.upstreamMergeMismatches.join(', ') || 'none'}`)
}

await main()
