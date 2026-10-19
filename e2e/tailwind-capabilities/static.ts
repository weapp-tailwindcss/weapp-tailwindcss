import type { RunContext } from './context'
import type { CaseContract } from './types'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { arbitrarySyntaxCases, compatibilityCandidateMap, tailwindParityCandidates } from '@weapp-tailwindcss/test-catalog'
import { escape } from 'weapp-tailwindcss/escape'
import { compileNativeStylesheet } from '../../packages/react-native/src/compiler'
import { encodeLynxCss } from '../lynx/batch-encode'
import { newReport, persistReport } from './context'
import { cssDeclarations, retainsDeclarations, retainsRuleContexts } from './css'
import { withGeneratorFixture } from './fixture'
import { collectInventory, loadDefaultDesignSystem, loadInventory, validateInventory } from './inventory/index'
import { valueCases } from './inventory/value-cases'
import { assertionPassed, receipt, validateCapabilityReport, verifyReportArtifacts } from './report'

export async function staticCases() {
  const inventory = await loadInventory()
  const design = await loadDefaultDesignSystem()
  const cases = [
    ...inventory.completions.map(item => ({ id: `completion/${item.candidate}`, candidate: item.candidate, features: ['completion'] })),
    ...inventory.utilities.flatMap(item => [{ id: item.id, candidate: item.witness, features: [item.id] }, ...item.profileWitnesses.map(profile => ({ id: `${item.id}/${profile.profile}`, candidate: profile.candidate, features: [item.id, profile.profile] }))]),
    ...inventory.variants.map(item => ({ id: item.id, candidate: item.witness, features: [item.id] })),
    ...tailwindParityCandidates.map(candidate => ({ id: `parity/${candidate}`, candidate, features: ['parity'] })),
    ...compatibilityCandidateMap.filter(item => !item.caseId.startsWith('directive-')).flatMap(item => item.candidates.map(value => ({ id: `compatibility/${value.id}`, candidate: value.candidate, features: [item.caseId] }))),
    ...arbitrarySyntaxCases.map(item => ({ id: `syntax/${item.id}`, candidate: item.candidate, features: ['syntax', item.id] })),
    ...valueCases(inventory, design),
  ]
  return { inventory, cases }
}

export async function runStatic(context: RunContext) {
  const { inventory, cases: all } = await staticCases()
  validateInventory(await collectInventory(), inventory)
  const cases = all.filter(item => !context.caseFilter || context.caseFilter.test(item.id))
  const markers = new Set(['group', 'peer'])
  const contracts: CaseContract[] = cases.map(item => ({ ...item, fixture: 'default-theme', expectation: { support: 'supported', stage: 'generation' }, requiredAssertions: ['generated', 'declarations', 'context'], expectedValues: { generated: !markers.has(item.candidate), declarations: true, context: true } }))
  const report = await newReport(context, 'static', contracts, inventory, { mode: 'generation-and-conversion-audit', batchSize: 256 })
  const design = await loadDefaultDesignSystem()
  const byCandidate = new Map<string, typeof cases>()
  for (const item of cases) {
    byCandidate.set(item.candidate, [...byCandidate.get(item.candidate) ?? [], item])
  }
  const candidates = [...byCandidate.keys()]
  const css = '@import "tailwindcss" source(none);'
  await withGeneratorFixture(context.root, css, {}, async (generator) => {
    for (let start = 0; start < candidates.length; start += 256) {
      const batch = candidates.slice(start, start + 256)
      const ids = batch.flatMap(candidate => byCandidate.get(candidate)!.map(item => item.id))
      const stem = `batch-${String(start / 256).padStart(4, '0')}`
      try {
        const generated = await generator.generate({ target: 'web', candidates: batch, scanSources: false })
        const conversionErrors: Record<string, string> = {}
        let weappCss = ''
        let native: ReturnType<typeof compileNativeStylesheet> | undefined
        let lynx: Awaited<ReturnType<typeof encodeLynxCss>> | undefined
        try {
          weappCss = (await generator.generate({ target: 'weapp', candidates: batch, scanSources: false })).css
        }
        catch (error) { conversionErrors.weapp = String(error) }
        try {
          native = compileNativeStylesheet(generated.rawCss, { classSet: generated.classSet })
        }
        catch (error) { conversionErrors.reactNative = String(error) }
        try {
          lynx = await encodeLynxCss(generated.rawCss)
        }
        catch (error) { conversionErrors.lynx = String(error) }
        const reference = design.candidatesToCss(batch)
        const actual = cssDeclarations(generated.rawCss)
        const converted = cssDeclarations(weappCss)
        const encoded = cssDeclarations(lynx?.css ?? '')
        const audit = batch.map((candidate, index) => {
          const referenceParsed = cssDeclarations(reference[index] ?? '')
          const expected = referenceParsed.byClass.get(candidate) ?? []
          const contextRetained = markers.has(candidate) || retainsRuleContexts(actual.contextsByClass.get(candidate) ?? [], referenceParsed.contextsByClass.get(candidate) ?? [])
          const declarations = actual.byClass.get(candidate) ?? []
          return { candidate, conversionErrors, contextRetained, reference: expected, raw: declarations, weapp: converted.byClass.get(escape(candidate)) ?? [], lynx: encoded.byClass.get(candidate) ?? [], reactNative: native?.rules[candidate] ?? [], generated: generated.classSet.has(candidate), declarationsRetained: markers.has(candidate) || retainsDeclarations(declarations, expected) }
        })
        const artifacts = [
          { name: `${stem}.css`, content: generated.rawCss, kind: 'css' as const },
          { name: `${stem}.wxss`, content: weappCss || JSON.stringify({ conversionErrors }), kind: 'css' as const },
          { name: `${stem}.native.json`, content: JSON.stringify(native ?? { conversionErrors }), kind: 'bundle' as const },
          { name: `${stem}.lynx.json`, content: JSON.stringify(lynx ?? { conversionErrors }), kind: 'bundle' as const },
          { name: `${stem}.audit.json`, content: JSON.stringify(audit), kind: 'measurements' as const },
        ]
        for (const artifact of artifacts) {
          const file = path.join(context.directory, artifact.name)
          await writeFile(file, artifact.content || '\n')
          report.artifacts.push(await receipt(file, context.directory, context.runId, ids, artifact.kind))
        }
        for (const observed of audit) {
          for (const item of byCandidate.get(observed.candidate)!) {
            const assertions = [
              { name: 'generated', stage: 'generation' as const, actual: observed.generated, expected: !markers.has(item.candidate) },
              { name: 'declarations', stage: 'generation' as const, actual: observed.declarationsRetained, expected: true },
              { name: 'context', stage: 'generation' as const, actual: observed.contextRetained, expected: true },
            ]
            const passed = assertions.every(assertionPassed)
            report.results.push({ id: item.id, status: passed ? 'passed' : 'failed', support: 'supported', assertions, warnings: [], artifacts: artifacts.map(value => value.name), ...(!passed ? { reason: '生成候选或声明与固定 Tailwind 注册表参考不符' } : {}) })
          }
        }
      }
      catch (error) {
        const reason = String(error)
        const file = path.join(context.directory, `${stem}.error.json`)
        await writeFile(file, JSON.stringify({ batch, reason }, null, 2))
        const artifact = await receipt(file, context.directory, context.runId, ids, 'log')
        report.artifacts.push(artifact)
        const completed = new Set(report.results.map(item => item.id))
        for (const id of ids.filter(id => !completed.has(id))) {
          report.results.push({ id, status: 'failed', support: 'supported', assertions: [], artifacts: [artifact.path], reason, warnings: [] })
        }
      }
      process.stdout.write(`[tailwind] 生成与转换 ${Math.min(start + 256, candidates.length)}/${candidates.length}\n`)
    }
  })
  validateCapabilityReport(report, contracts, report.identity, context.runId, 'static')
  await verifyReportArtifacts(report, context.directory)
  await persistReport(context, report, contracts)
  return report
}
