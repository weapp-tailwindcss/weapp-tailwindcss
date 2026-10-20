import type { SemanticAssertion } from './types'
import { cssDeclarations, retainsDeclarations, retainsRuleContexts, stylesheetDependenciesRetained } from './css'

/** 参考只消费预先登记的期望候选，产品必须从自己的真实源码扫描，不能借参考补入候选。 */
export function scannerGenerationAssertions(actual: { rawCss: string, classSet: ReadonlySet<string> }, expected: { candidates: readonly string[], absentCandidates?: readonly string[] }, referenceCss: string): SemanticAssertion[] {
  const parsed = cssDeclarations(actual.rawCss)
  const reference = cssDeclarations(referenceCss)
  const candidates = expected.candidates
  const checks = {
    'case-defined': candidates.length > 0 || Boolean(expected.absentCandidates?.length),
    'expected': candidates.every(candidate => actual.classSet.has(candidate) && retainsDeclarations(parsed.byClass.get(candidate) ?? [], reference.byClass.get(candidate) ?? [])),
    'context': candidates.every(candidate => retainsRuleContexts(parsed.contextsByClass.get(candidate) ?? [], reference.contextsByClass.get(candidate) ?? [])),
    'dependencies': stylesheetDependenciesRetained(actual.rawCss, referenceCss),
    'excluded': (expected.absentCandidates ?? []).every(candidate => !actual.classSet.has(candidate) && !parsed.byClass.has(candidate)),
  }
  return Object.entries(checks).map(([name, actual]) => ({ name, stage: 'generation', actual, expected: true }))
}
