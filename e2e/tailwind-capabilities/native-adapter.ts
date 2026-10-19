import type { ReactNativeCaseResult, ReactNativeReport } from '../../examples/react-native-expo/src/compatibility/protocol'
import type { RunContext } from './context'
import type { TailwindInventory } from './inventory'
import type { ArtifactReceipt, CapabilityResult, CaseContract, SemanticAssertion, TailwindTarget } from './types'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { compatibilityCases } from '@weapp-tailwindcss/test-catalog'
import { expectedFixtureStyle, nativeBuildCases, nativeBuildFixtures, nativeFixtures, rejectedNativeCases, styleContains } from '../../examples/react-native-expo/src/compatibility/protocol'
import { validateNativeEncodingArtifacts } from '../react-native/encoding-evidence'
import { validateNativeArtifacts } from '../react-native/pair-evidence'
import { validateReactNativeReport } from '../react-native/reports'
import { newReport, persistReport } from './context'
import { loadInventory } from './inventory'
import { assertionPassed, receipt, validateCapabilityReport, verifyReportArtifacts } from './report'

type NativeTarget = Extract<TailwindTarget, `expo-${string}` | `react-native-${string}`>

/** 仅映射已审查的正向运行时夹具，不把组合拒绝或 build 结果扩散为整个 utility 的运行时结论。 */
const fixtureFeatures: Record<string, string[]> = {
  'layout-aspect': ['utility/functional/aspect'],
  'layout-overflow': ['utility/static/overflow-hidden'],
  'layout-position': ['utility/static/absolute', 'utility/functional/left', 'utility/functional/top'],
  'layout-z-index': ['utility/functional/z'],
  'flex-direction': ['utility/static/flex-row'],
  'flex-alignment': ['utility/static/items-center', 'utility/static/justify-between'],
  'spacing-margin': ['utility/functional/mt', 'utility/functional/ml'],
  'spacing-padding': ['utility/functional/p', 'utility/functional/pl', 'utility/functional/pr'],
  'spacing-logical': ['utility/functional/px'],
  'type-size': ['utility/functional/text', 'utility/functional/leading'],
  'type-weight-style': ['utility/functional/font', 'utility/static/italic'],
  'type-tracking': ['utility/functional/tracking'],
  'background-color': ['utility/functional/bg'],
  'border-width-color': ['utility/functional/border'],
  'border-radius': ['utility/functional/rounded'],
  'syntax-opacity-modifier': ['utility/functional/text'],
  'effect-ring': ['utility/functional/ring', 'utility/functional/inset-ring'],
  'transform-skew': ['utility/functional/skew-x', 'utility/functional/skew-y'],
  'effect-opacity': ['utility/functional/opacity'],
  'effect-shadow': ['utility/functional/shadow'],
  'variant-dark': ['variant/static/dark', 'utility/functional/text'],
  'syntax-important': ['utility/functional/bg'],
  'syntax-type-hint': ['utility/functional/text'],
  'flex-shorthand-shrink': ['utility/functional/flex'],
  'grid-align-content-self': ['utility/static/self-end'],
  'sizing-size': ['utility/functional/size'],
}

const caseId = (id: string) => `compatibility/${id}`
const missingReason = '尚未提供此注册能力的独立 React Native 运行时语义夹具；生成、编码和其它组合的拒绝不构成此能力的运行时证据。'

export function nativeContracts(inventory: TailwindInventory) {
  const contracts = compatibilityCases.map<CaseContract>((item) => {
    const negative = rejectedNativeCases.has(item.id)
    const build = nativeBuildCases.has(item.id)
    const fixture = nativeFixtures[item.id]
    if (!negative && !build && !fixture) {
      throw new Error(`${item.id} 缺少独立审查的原生支持预期`)
    }
    const requiredAssertions = negative ? ['generated', 'rejected'] : build ? ['generated', 'encoded'] : (fixture!.phases ?? ['default']).flatMap(phase => [`${phase}:style`, `${phase}:geometry`, `${phase}:pixel`, `${phase}:control`])
    return {
      id: caseId(item.id),
      features: fixtureFeatures[item.id] ?? [`authoring/${item.id}`],
      candidate: item.className,
      fixture: JSON.stringify({ native: fixture ?? nativeBuildFixtures[item.id], declarations: item.declarations }),
      expectation: { support: negative ? 'unsupported' : 'supported', stage: negative ? 'negative' : build ? 'encoding' : 'runtime', ...(negative ? { reason: '已审查的原生编码边界；仅验证此完整组合的拒绝。' } : {}) },
      requiredAssertions,
      expectedValues: Object.fromEntries(requiredAssertions.map(name => [name, true])),
      ...(negative || build ? { assertionStages: { generated: 'generation' as const } } : {}),
    }
  })
  const coverage = [...inventory.utilities, ...inventory.variants].map((feature) => {
    const caseIds = compatibilityCases.filter(item => nativeFixtures[item.id] && fixtureFeatures[item.id]?.includes(feature.id)).map(item => caseId(item.id))
    return { featureId: feature.id, caseIds, status: caseIds.length ? 'fixture-defined' : 'not-run', ...(!caseIds.length ? { reason: missingReason } : {}) }
  })
  for (const feature of coverage.filter(item => item.status === 'not-run')) {
    contracts.push({ id: `inventory/${feature.featureId}`, features: [feature.featureId], candidate: '', fixture: 'missing-native-runtime-fixture', expectation: { support: 'supported', stage: 'runtime' }, requiredAssertions: ['runtime'], expectedValues: { runtime: true } })
  }
  return { contracts, coverage }
}

function runtimeAssertions(result: ReactNativeCaseResult, platform: ReactNativeReport['platform']): SemanticAssertion[] {
  return (nativeFixtures[result.id]!.phases ?? ['default']).flatMap((phase) => {
    const style = result.checkpoints.find(item => item.name === `runtime:${phase}:style`)
    let stylePassed = false
    try {
      const actual = JSON.parse(style?.actual ?? 'null') as Record<string, unknown> | null
      const expected = expectedFixtureStyle(result.id, phase, platform)!
      stylePassed = Boolean(actual && styleContains(actual, expected) && (Object.keys(expected).length > 0 || actual.color === undefined))
    }
    catch {}
    // 几何和像素检查点已经由 validateNativeArtifacts 从 PNG 与原始坐标重新计算。
    return [
      { name: `${phase}:style`, stage: 'runtime' as const, actual: stylePassed, expected: true },
      ...(['geometry', 'pixel', 'control'] as const).map(kind => ({ name: `${phase}:${kind}`, stage: 'runtime' as const, actual: result.checkpoints.some(item => item.name === `runtime:${phase}:${kind}` && item.passed === true), expected: true })),
    ]
  })
}

export async function buildNativeCapabilityReport(context: RunContext, target: NativeTarget, raw: ReactNativeReport | undefined, validationError?: unknown) {
  const inventory = await loadInventory()
  const all = nativeContracts(inventory)
  const contracts = all.contracts.filter(item => !context.caseFilter || context.caseFilter.test(item.id))
  const coverage = all.coverage
  const report = await newReport(context, target, contracts, { nativeFixtures, build: nativeBuildFixtures, rejected: [...rejectedNativeCases], fixtureFeatures, coverage }, { provider: 'react-native', platform: raw?.platform ?? target, nativeRevision: raw?.revision ?? 'missing', scopeGaps: coverage.filter(item => item.status === 'not-run').length })
  if (raw) {
    report.identity.versions = { ...report.identity.versions, ...raw.versions }
    report.environment.nativeEnvironment = JSON.stringify(raw.environment)
  }
  const failures: unknown[] = validationError === undefined ? [] : [validationError]
  const directory = path.join(context.directory, 'native')
  const evidence = new Map<string, string[]>()
  const record = (artifact: ArtifactReceipt) => {
    const stored = report.artifacts.find(item => item.path === artifact.path)
    if (stored) {
      stored.caseIds = [...new Set([...stored.caseIds, ...artifact.caseIds])]
    }
    else {
      report.artifacts.push(artifact)
    }
    for (const id of artifact.caseIds) {
      evidence.set(id, [...new Set([...evidence.get(id) ?? [], artifact.path])])
    }
  }
  try {
    if (!raw) {
      throw new Error('缺少本轮 React Native 原始报告')
    }
    const platform = target.startsWith('expo-') ? 'web' : target.slice('react-native-'.length) as 'android' | 'ios'
    validateReactNativeReport(raw, platform, { runId: context.runId, revision: 'rn-hmr-updated-f59e0b' })
    await validateNativeArtifacts(raw, directory)
    for (const file of await validateNativeEncodingArtifacts(raw, directory)) {
      record(await receipt(file, context.directory, context.runId, [...nativeBuildCases].map(caseId), 'bundle'))
    }
    if (target.startsWith('expo-') && raw.environment.browser?.name !== target.slice('expo-'.length)) {
      throw new Error('Expo 原始报告的浏览器与本轮目标不一致')
    }
  }
  catch (error) {
    failures.push(error)
  }
  try {
    const file = path.join(directory, 'report.json')
    const stored = JSON.parse(await readFile(file, 'utf8'))
    if (!raw || JSON.stringify(stored) !== JSON.stringify(raw)) {
      throw new Error('React Native 归档原始 JSON 与本轮输入不一致')
    }
    record(await receipt(file, context.directory, context.runId, compatibilityCases.map(item => caseId(item.id)), 'bundle'))
    for (const saved of raw.receipts ?? []) {
      const id = caseId(saved.id)
      const expectedName = `case-${raw.revision}-${saved.id}-${saved.phase}.png`
      if (saved.artifact.name !== expectedName || !/^[\w.-]+$/.test(expectedName)) {
        throw new Error('原始截图文件名不符合案例身份')
      }
      for (const [name, kind] of [[saved.artifact.name, 'screenshot'], [`${saved.artifact.name}.json`, 'measurements']] as const) {
        record(await receipt(path.join(directory, name), context.directory, context.runId, [id], kind))
      }
    }
  }
  catch (error) {
    failures.push(error)
  }
  const reason = failures.map(error => String(error)).join('；')
  const named = compatibilityCases.filter(item => new RegExp(String.raw`\b${item.id}\b`).test(reason))
  const identified = new Set(named.length === 1 ? named.map(item => item.id) : [])
  const originals = new Map((raw?.results ?? []).map(item => [item.id, item]))
  for (const contract of contracts) {
    if (contract.id.startsWith('inventory/')) {
      report.results.push({ id: contract.id, support: contract.expectation.support, status: 'not-run', assertions: [], artifacts: [], warnings: [], reason: missingReason })
      continue
    }
    const id = contract.id.slice('compatibility/'.length)
    const original = originals.get(id)
    let result: CapabilityResult
    if (failures.length || !original) {
      result = { id: contract.id, support: contract.expectation.support, status: identified.has(id) ? 'failed' : 'blocked', assertions: [], artifacts: evidence.get(contract.id) ?? [], warnings: original?.warnings ?? [], reason: reason || '缺少本轮原生案例结果' }
    }
    else {
      const assertions: SemanticAssertion[] = rejectedNativeCases.has(id)
        ? [{ name: 'generated', stage: 'generation', actual: original.generated, expected: true }, { name: 'rejected', stage: 'negative', actual: !original.encoded && original.status === 'unsupported' && original.warnings.some(warning => warning.trim().length > 0), expected: true }]
        : nativeBuildCases.has(id)
          ? [{ name: 'generated', stage: 'generation', actual: original.generated, expected: true }, { name: 'encoded', stage: 'encoding', actual: original.encoded && original.warnings.length === 0 && styleContains(original.encodedStyle, nativeBuildFixtures[id]!.style), expected: true }]
          : runtimeAssertions(original, raw!.platform)
      const passed = assertions.every(assertionPassed)
      result = { id: contract.id, support: contract.expectation.support, status: passed ? 'passed' : 'failed', assertions, artifacts: evidence.get(contract.id) ?? [], warnings: original.warnings, ...(rejectedNativeCases.has(id) ? { reason: original.reason! } : !passed ? { reason: '原始运行时样式与独立原生夹具的语义不符' } : {}) }
    }
    report.results.push(result)
  }
  await persistReport(context, report, contracts)
  validateCapabilityReport(report, contracts, report.identity, context.runId, target)
  await verifyReportArtifacts(report, context.directory)
  return { report, contracts }
}
