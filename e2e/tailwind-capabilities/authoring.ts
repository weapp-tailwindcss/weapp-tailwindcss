import type { RunContext } from './context'
import type { CaseContract, SemanticAssertion } from './types'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { authoringFixtures, sourceSyntaxCases } from '@weapp-tailwindcss/test-catalog'
import { scannerGenerationAssertions } from './authoring-generation'
import { newReport, persistReport } from './context'
import { cssDeclarations, retainsDeclarations } from './css'
import { withGeneratorFixture } from './fixture'
import { defaultReferenceBuilder } from './reference'
import { assertionPassed, receipt, validateCapabilityReport } from './report'

export async function runAuthoring(context: RunContext) {
  const fixtures = [
    ...authoringFixtures,
    ...sourceSyntaxCases.map(item => ({ id: `scan-${item.id}`, css: `@import "tailwindcss" source(none);\n@source "./probe.${item.language}";`, files: { [`probe.${item.language}`]: item.source }, candidates: [], expectedDeclarations: item.candidates.map(candidate => ({ candidate, declarations: [] })), absentCandidates: item.absentCandidates })),
  ].filter(item => !context.caseFilter || context.caseFilter.test(item.id))
  const contracts = fixtures.map((item): CaseContract => {
    const scanning = item.id.startsWith('scan-')
    return { id: item.id, features: [scanning ? 'source-scanning' : 'authoring'], candidate: scanning ? item.expectedDeclarations.map(value => value.candidate).join(' ') : item.candidates.join(' '), fixture: item.css, expectation: { support: 'supported', stage: 'generation' }, requiredAssertions: scanning ? ['case-defined', 'expected', 'excluded', 'context', 'dependencies'] : ['expected', 'excluded'], expectedValues: scanning ? { 'case-defined': true, 'expected': true, 'excluded': true, 'context': true, 'dependencies': true } : { expected: true, excluded: true } }
  })
  const report = await newReport(context, 'static', contracts, fixtures, { mode: 'isolated-source-scanning' })
  const referenceBuilder = await defaultReferenceBuilder()
  for (const fixture of fixtures) {
    try {
      await withGeneratorFixture(context.root, fixture.css, fixture.files, async (generator) => {
        // 扫描夹具只有各自文件入口，不能从共享目录或 inline 注入同一候选。
        const generated = await generator.generate({ target: 'web', candidates: fixture.candidates, scanSources: true })
        const parsed = cssDeclarations(generated.rawCss)
        const expected = fixture.expectedDeclarations.every((item) => {
          const declarations = item.candidate ? parsed.byClass.get(item.candidate) : parsed.bySelector.get(('selector' in item ? item.selector : '')!)
          return (item.candidate ? generated.classSet.has(item.candidate) : Boolean(declarations?.length))
            && (!item.declarations.length || retainsDeclarations(declarations ?? [], item.declarations))
        })
        const excluded = (fixture.absentCandidates ?? []).every(item => !generated.classSet.has(item))
        let assertions: SemanticAssertion[] = [{ name: 'expected', stage: 'generation', actual: expected, expected: true }, { name: 'excluded', stage: 'generation', actual: excluded, expected: true }]
        const artifacts: string[] = []
        if (fixture.id.startsWith('scan-')) {
          const candidates = fixture.expectedDeclarations.map(item => item.candidate!).filter(Boolean)
          const referenceCss = await referenceBuilder(candidates)
          assertions = scannerGenerationAssertions(generated, { candidates, absentCandidates: fixture.absentCandidates }, referenceCss)
          for (const [suffix, css] of [['reference', referenceCss], ['raw', generated.rawCss]]) {
            const name = `${fixture.id}.${suffix}.css`
            await writeFile(path.join(context.directory, name), css || '\n')
            report.artifacts.push(await receipt(path.join(context.directory, name), context.directory, context.runId, [fixture.id], 'css'))
            artifacts.push(name)
          }
        }
        const file = path.join(context.directory, `${fixture.id}.css`)
        await writeFile(file, generated.css || '\n')
        const artifact = await receipt(file, context.directory, context.runId, [fixture.id], 'css')
        report.artifacts.push(artifact)
        artifacts.push(artifact.path)
        const passed = assertions.every(assertionPassed)
        report.results.push({ id: fixture.id, support: 'supported', status: passed ? 'passed' : 'failed', warnings: [], artifacts, assertions, ...(!passed ? { reason: '独立扫描或 CSS 指令的声明、条件、依赖或排除结果不符' } : {}) })
      })
    }
    catch (error) {
      report.results.push({ id: fixture.id, status: 'failed', support: 'supported', reason: String(error), assertions: [], warnings: [], artifacts: [] })
    }
  }
  validateCapabilityReport(report, contracts, report.identity, context.runId, 'static')
  await persistReport(context, report, contracts)
  return report
}
