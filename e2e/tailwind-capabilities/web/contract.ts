import type { CapabilityResult, CaseContract, SemanticAssertion } from '../types'
import type { WebObservation } from './actions'
import type { WebProbe } from './probes'
import { assertionPassed } from '../report'
import { pixelAssertionName, rgbaChannels } from './pixels'

function layoutValues(probe: WebProbe) {
  if (!probe.layout) {
    return []
  }
  return [
    { key: 'display', expected: probe.layout.display },
    { key: 'width', expected: probe.layout.width, tolerance: 0.25 },
    { key: 'height', expected: probe.layout.height, tolerance: 0.25 },
    { key: 'child-count', expected: probe.layout.children.length },
    ...probe.layout.children.flatMap((child, index) => (['left', 'top', 'width', 'height'] as const).map(property => ({ key: `child-${index}/${property}`, expected: child[property], tolerance: 0.25 }))),
  ]
}

export function webContract(probe: WebProbe): CaseContract {
  const checkpoints = probe.checkpoints ?? []
  if (new Set(checkpoints.map(item => item.name)).size !== checkpoints.length || checkpoints.some(item => ['before', 'after', 'restored', 'computed', 'generated'].includes(item.name) || !Number.isInteger(item.afterControl) || item.afterControl < 1 || item.afterControl >= (probe.controls?.length ?? 0))) {
    throw new Error(`${probe.id} 中间负控制必须位于两个真实动作之间，并使用独立名称`)
  }
  const states = probe.action ? ['before', ...checkpoints.map(item => item.name), 'after', 'restored'] : ['computed']
  const expectedValues = Object.fromEntries(states.map(state => [state, checkpoints.find(item => item.name === state)?.expected ?? (state === 'before' || state === 'restored' ? probe.before! : probe.expected)]))
  const pixels = (probe.pixels ?? []).flatMap(sample => rgbaChannels.map((channel, index) => ({ name: pixelAssertionName(sample, channel), expected: sample.expected[index]!, tolerance: sample.tolerance })))
  const layout = states.flatMap(state => layoutValues(probe).map(item => ({ ...item, name: `${state}/layout/${item.key}` })))
  const guards = states.flatMap(state => (probe.guards ?? []).map(guard => ({ name: `${state}/guard/${guard.name}`, expected: (state === 'before' || state === 'restored') ? guard.before ?? guard.expected : guard.expected })))
  const render = probe.controls?.some(control => control.kind === 'media') ? states.map(state => ({ name: `${state}/render-checkpoint`, expected: true })) : []
  const styles = states.flatMap(state => Object.entries(probe.styles ?? {}).map(([property, expected]) => ({ name: `${state}/style/${property}`, expected })))
  return {
    id: `runtime/${probe.id}`,
    features: probe.features,
    candidate: probe.candidate,
    fixture: probe.html,
    expectation: { support: 'supported', stage: 'runtime' },
    requiredAssertions: ['generated', ...states, ...layout.map(item => item.name), ...guards.map(item => item.name), ...styles.map(item => item.name), ...render.map(item => item.name), ...pixels.map(item => item.name)],
    expectedValues: { generated: true, ...expectedValues, ...Object.fromEntries([...layout, ...guards, ...styles, ...render, ...pixels].map(item => [item.name, item.expected])) },
    ...(pixels.length || layout.length ? { tolerances: Object.fromEntries([...layout, ...pixels].filter(item => item.tolerance !== undefined).map(item => [item.name, item.tolerance!])) } : {}),
    assertionStages: { generated: 'generation', ...Object.fromEntries(pixels.map(item => [item.name, 'visual' as const])) },
  }
}

export function webRuntimeAssertions(probe: WebProbe, state: string, observation: Pick<WebObservation, 'actual' | 'layout' | 'guards' | 'renderFrames' | 'styles'>): SemanticAssertion[] {
  const values: Record<string, string | number> = observation.layout
    ? {
        'display': observation.layout.display,
        'width': observation.layout.width,
        'height': observation.layout.height,
        'child-count': observation.layout.children.length,
        ...Object.fromEntries(observation.layout.children.flatMap((child, index) => Object.entries(child).map(([property, value]) => [`child-${index}/${property}`, value]))),
      }
    : {}
  return [
    { name: state, stage: 'runtime', actual: observation.actual, expected: probe.checkpoints?.find(item => item.name === state)?.expected ?? (state === 'before' || state === 'restored' ? probe.before! : probe.expected) },
    ...Object.entries(probe.styles ?? {}).map(([property, expected]) => ({ name: `${state}/style/${property}`, stage: 'runtime' as const, actual: observation.styles?.[property] ?? null, expected })),
    ...layoutValues(probe).map(item => ({ name: `${state}/layout/${item.key}`, stage: 'runtime' as const, actual: values[item.key] ?? null, expected: item.expected, ...(item.tolerance !== undefined ? { tolerance: item.tolerance } : {}) })),
    ...(probe.guards ?? []).map(guard => ({ name: `${state}/guard/${guard.name}`, stage: 'runtime' as const, actual: observation.guards?.[guard.name] ?? null, expected: (state === 'before' || state === 'restored') ? guard.before ?? guard.expected : guard.expected })),
    ...(probe.controls?.some(control => control.kind === 'media') ? [{ name: `${state}/render-checkpoint`, stage: 'runtime' as const, actual: observation.renderFrames?.length === 2 && observation.renderFrames.every(Number.isFinite) && observation.renderFrames[1]! > observation.renderFrames[0]!, expected: true }] : []),
  ]
}

/** 原生对照也无法触发时保留环境阻塞；候选差异、缺证和生成错误仍是失败。 */
export function webRuntimeOutcome(probe: WebProbe, assertions: readonly SemanticAssertion[]): Pick<CapabilityResult, 'status' | 'reason'> {
  const checks = new Map(assertions.map(assertion => [assertion.name, assertion]))
  if (checks.size !== assertions.length || webContract(probe).requiredAssertions.some(name => !checks.has(name))) {
    return { status: 'failed', reason: '运行时缺少完整的独立语义断言或存在重复断言' }
  }
  const failed = assertions.filter(assertion => !assertionPassed(assertion))
  if (!failed.length) {
    return { status: 'passed' }
  }
  const states = probe.action ? ['before', ...(probe.checkpoints ?? []).map(item => item.name), 'after', 'restored'] : ['computed']
  const environment = states.flatMap(state => (probe.guards ?? []).filter(guard => guard.environment).map(guard => `${state}/guard/${guard.name}`))
  const nativeFailures = failed.filter(assertion => environment.includes(assertion.name))
  const comparisons = states.flatMap(state => (probe.guards ?? []).filter(guard => guard.kind === 'compare-style').map(guard => `${state}/guard/${guard.name}`))
  if (nativeFailures.length && comparisons.length && comparisons.every(name => assertionPassed(checks.get(name)!)) && failed.every(assertion => environment.includes(assertion.name) || states.includes(assertion.name))) {
    return { status: 'blocked', reason: `原生媒体或独立 CSS 对照未达到预先声明的状态：${nativeFailures.map(assertion => `${assertion.name}=${String(assertion.actual)}，预期 ${String(assertion.expected)}`).join('；')}` }
  }
  return { status: 'failed', reason: '实际 computed style、候选与独立对照或状态前后恢复与独立预期不符' }
}

export function renderWebProbe(probe: WebProbe) {
  if (probe.action && probe.before === undefined) {
    throw new Error(`${probe.id} 缺少独立定义的状态前置和恢复预期`)
  }
  return probe.html.replaceAll('CANDIDATE', probe.candidate.replaceAll('&', '&amp;').replaceAll('"', '&quot;'))
}
