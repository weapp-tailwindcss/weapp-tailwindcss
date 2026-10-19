import type { RunContext } from './context'
import type { CaseContract } from './types'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { authoringFixtures, sourceSyntaxCases } from '@weapp-tailwindcss/test-catalog'
import { newReport, persistReport } from './context'
import { cssDeclarations, retainsDeclarations } from './css'
import { withGeneratorFixture } from './fixture'
import { receipt, validateCapabilityReport } from './report'

export async function runAuthoring(context: RunContext) {
  const fixtures = [
    ...authoringFixtures,
    ...sourceSyntaxCases.map(item => ({ id: `scan-${item.id}`, css: `@import "tailwindcss" source(none);\n@source "./probe.${item.language}";`, files: { [`probe.${item.language}`]: item.source }, candidates: [], expectedDeclarations: item.candidates.map(candidate => ({ candidate, declarations: [] })), absentCandidates: item.absentCandidates })),
  ].filter(item => !context.caseFilter || context.caseFilter.test(item.id))
  const contracts: CaseContract[] = fixtures.map(item => ({ id: item.id, features: [item.id.startsWith('scan-') ? 'source-scanning' : 'authoring'], candidate: item.candidates.join(' '), fixture: item.css, expectation: { support: 'supported', stage: 'generation' }, requiredAssertions: ['expected', 'excluded'], expectedValues: { expected: true, excluded: true } }))
  const report = await newReport(context, 'static', contracts, fixtures, { mode: 'isolated-source-scanning' })
  for (const fixture of fixtures) {
    try {
      await withGeneratorFixture(context.root, fixture.css, fixture.files, async (generator) => {
        // 扫描夹具只有各自文件入口，不能从共享目录或 inline 注入同一候选。
        const generated = await generator.generate({ target: 'web', candidates: fixture.candidates, scanSources: true })
        const parsed = cssDeclarations(generated.css)
        const expected = fixture.expectedDeclarations.every((item) => {
          const declarations = item.candidate ? parsed.byClass.get(item.candidate) : parsed.bySelector.get(('selector' in item ? item.selector : '')!)
          return (item.candidate ? generated.classSet.has(item.candidate) : Boolean(declarations?.length))
            && (!item.declarations.length || retainsDeclarations(declarations ?? [], item.declarations))
        })
        const excluded = (fixture.absentCandidates ?? []).every(item => !generated.classSet.has(item))
        const file = path.join(context.directory, `${fixture.id}.css`)
        await writeFile(file, generated.css || '\n')
        const artifact = await receipt(file, context.directory, context.runId, [fixture.id], 'css')
        report.artifacts.push(artifact)
        report.results.push({ id: fixture.id, support: 'supported', status: expected && excluded ? 'passed' : 'failed', warnings: [], artifacts: [artifact.path], assertions: [{ name: 'expected', stage: 'generation', actual: expected, expected: true }, { name: 'excluded', stage: 'generation', actual: excluded, expected: true }], ...(!expected || !excluded ? { reason: '独立扫描或 CSS 指令的声明/排除结果不符' } : {}) })
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
