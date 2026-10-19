import type { RunContext } from './context'
import type { ConversionObservation, ConversionSnapshot } from './conversion-audit'
import type { RuleContext } from './css'
import type { CaseContract } from './types'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { arbitrarySyntaxCases, compatibilityCandidateMap, tailwindParityCandidates } from '@weapp-tailwindcss/test-catalog'
import { escape } from 'weapp-tailwindcss/escape'
import { compileNativeStylesheet } from '../../packages/react-native/src/compiler'
import { encodeLynxCss } from '../lynx/batch-encode'
import { newReport, persistReport } from './context'
import { conversionCaseContract, conversionCaseResult, conversionTargets, staticCandidateResults } from './conversion-audit'
import { reviewedWeappOracleCoverage, reviewedWeappOracles } from './conversion-oracles/weapp'
import { cssDeclarations, retainsDeclarations, retainsRuleContexts, stylesheetDependenciesRetained } from './css'
import { withGeneratorFixture } from './fixture'
import { collectInventory, loadDefaultDesignSystem, loadInventory, validateInventory } from './inventory/index'
import { valueCases } from './inventory/value-cases'
import { defaultReferenceBuilder } from './reference'
import { assertionPassed, receipt, validateCapabilityReport, verifyReportArtifacts } from './report'

function cssSnapshot(contexts: readonly RuleContext[]): ConversionSnapshot {
  return { statements: contexts.map(item => ({ selector: item.selector, conditions: item.atRules, property: item.declaration.property, value: item.declaration.value ?? '', important: Boolean(item.declaration.important) })), diagnostics: [] }
}

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
  const byCandidate = new Map<string, typeof cases>()
  for (const item of cases) {
    byCandidate.set(item.candidate, [...byCandidate.get(item.candidate) ?? [], item])
  }
  const candidates = [...byCandidate.keys()]
  const buildReference = await defaultReferenceBuilder()
  // 先固定官方参考和已审查规则的合同，再执行任何目标端转换。
  const attempts = reviewedWeappOracles(candidates, await buildReference(candidates))
  const oracles = new Map(attempts.map(attempt => [attempt.candidate, attempt.oracle ? [attempt.oracle] : []]))
  const oracleFor = (candidate: string, target: typeof conversionTargets[number]) => oracles.get(candidate)?.find(oracle => oracle.target === target)
  const contracts: CaseContract[] = cases.flatMap(item => [
    { ...item, fixture: 'default-theme', expectation: { support: 'supported' as const, stage: 'generation' as const }, requiredAssertions: ['generated', 'declarations', 'context', 'dependencies'], expectedValues: { generated: !markers.has(item.candidate), declarations: true, context: true, dependencies: true } },
    ...conversionTargets.map(target => conversionCaseContract(item, target, oracleFor(item.candidate, target))),
  ])
  const coverage = reviewedWeappOracleCoverage(attempts)
  const report = await newReport(context, 'static', contracts, { inventory, coverage }, { mode: 'generation-and-conversion-audit', batchSize: 256 })
  const coverageFile = path.join(context.directory, 'conversion-oracle-coverage.json')
  await writeFile(coverageFile, JSON.stringify({ coverage, attempts }, null, 2))
  report.artifacts.push(await receipt(coverageFile, context.directory, context.runId, contracts.map(item => item.id), 'measurements'))
  const css = '@import "tailwindcss" source(none);'
  await withGeneratorFixture(context.root, css, {}, async (generator) => {
    for (let start = 0; start < candidates.length; start += 256) {
      const batch = candidates.slice(start, start + 256)
      const batchCases = batch.flatMap(candidate => byCandidate.get(candidate)!)
      const ids = batchCases.flatMap(item => [item.id, ...conversionTargets.map(target => conversionCaseContract(item, target, oracleFor(item.candidate, target)).id)])
      const stem = `batch-${String(start / 256).padStart(4, '0')}`
      try {
        const generated = await generator.generate({ target: 'web', candidates: batch, scanSources: false })
        const conversionErrors: Record<string, string> = {}
        let weappCss = ''
        let native: ReturnType<typeof compileNativeStylesheet> | undefined
        let lynx: Awaited<ReturnType<typeof encodeLynxCss>> | undefined
        let converted = cssDeclarations('')
        try {
          weappCss = (await generator.generate({ target: 'weapp', candidates: batch, scanSources: false })).css
          converted = cssDeclarations(weappCss)
        }
        catch (error) { conversionErrors.weapp = String(error) }
        try {
          native = compileNativeStylesheet(generated.rawCss, { classSet: generated.classSet })
        }
        catch (error) { conversionErrors['react-native'] = String(error) }
        try {
          lynx = await encodeLynxCss(generated.rawCss)
        }
        catch (error) { conversionErrors.lynx = String(error) }
        const reference = await buildReference(batch)
        const referenceParsed = cssDeclarations(reference)
        const dependenciesRetained = stylesheetDependenciesRetained(generated.rawCss, reference)
        const actual = cssDeclarations(generated.rawCss)
        const audit = batch.map((candidate) => {
          const expected = referenceParsed.byClass.get(candidate) ?? []
          const contextRetained = markers.has(candidate) || retainsRuleContexts(actual.contextsByClass.get(candidate) ?? [], referenceParsed.contextsByClass.get(candidate) ?? [])
          const declarations = actual.byClass.get(candidate) ?? []
          const observations: Record<typeof conversionTargets[number], ConversionObservation> = {
            'weapp': { execution: 'completed', snapshot: cssSnapshot(converted.contextsByClass.get(escape(candidate)) ?? []), diagnosticsScope: 'candidate' },
            'react-native': {
              execution: 'completed',
              snapshot: {
                statements: (native?.rules[candidate] ?? []).flatMap(rule => Object.entries(rule.style).map(([property, value]) => ({ selector: candidate, conditions: [rule.colorScheme ? `color-scheme:${rule.colorScheme}` : '', rule.platform ? `platform:${rule.platform}` : ''].filter(Boolean), property, value, important: Boolean(rule.important) }))),
                diagnostics: (native?.warnings ?? []).filter(warning => warning.className === candidate).map(warning => `${warning.property ?? ''}:${warning.message}`),
              },
              diagnosticsScope: 'candidate',
            },
            // decoder 的展示格式含 {{变量}} 和未转义选择器，不能当作标准 CSS 或输入 AST 的等价输出。
            'lynx': { execution: 'completed', outputFormat: 'lynx-decoder-template', reason: 'Lynx 编码已完成；decoder 展示文本不是标准 CSS，尚无独立输出语义读取器，原始展示文本、serializer 输入和诊断保留在批次产物中。' },
          }
          for (const target of conversionTargets) {
            if (conversionErrors[target]) {
              observations[target] = { execution: 'failed', reason: conversionErrors[target] }
            }
          }
          return { candidate, conversionErrors, observations, contextRetained, dependenciesRetained, reference: expected, raw: declarations, weapp: converted.byClass.get(escape(candidate)) ?? [], reactNative: native?.rules[candidate] ?? [], generated: generated.classSet.has(candidate), declarationsRetained: markers.has(candidate) || retainsDeclarations(declarations, expected) }
        })
        const artifacts = [
          { name: `${stem}.reference.css`, content: reference, kind: 'css' as const },
          { name: `${stem}.css`, content: generated.rawCss, kind: 'css' as const },
          { name: `${stem}.wxss`, content: weappCss, kind: 'css' as const },
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
              { name: 'dependencies', stage: 'generation' as const, actual: observed.dependenciesRetained, expected: true },
            ]
            const passed = assertions.every(assertionPassed)
            const evidence = artifacts.map(value => value.name)
            report.results.push(...staticCandidateResults(item, { id: item.id, status: passed ? 'passed' : 'failed', support: 'supported', assertions, warnings: [], artifacts: evidence, ...(!passed ? { reason: '生成候选或声明与固定 Tailwind 注册表参考不符' } : {}) }, observed.observations, evidence, oracles.get(item.candidate)))
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
        for (const item of batchCases) {
          if (!completed.has(item.id)) {
            report.results.push({ id: item.id, status: 'failed', support: 'supported', assertions: [], artifacts: [artifact.path], reason, warnings: [] })
          }
          for (const target of conversionTargets) {
            if (!completed.has(conversionCaseContract(item, target, oracleFor(item.candidate, target)).id)) {
              report.results.push(conversionCaseResult(item, target, { execution: 'not-run', reason: `批次未完成，缺少可验证的 ${target} 转换证据：${reason}` }, [artifact.path], oracleFor(item.candidate, target)))
            }
          }
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
