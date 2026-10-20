import type { NativeCaseResult, NativePlatformReport } from '../../../examples/react-lynx/src/compatibility/types'
import type { RunContext } from '../context'
import type { CapabilityResult, CaseContract } from '../types'
import path from 'node:path'
import { compatibilityCases } from '@weapp-tailwindcss/test-catalog'
import { evaluateGeometry } from '../../../examples/react-lynx/src/compatibility/geometry'
import { evaluateColorScheme, validateColorSchemeReceipts } from '../../lynx/color-scheme'
import { evaluateImportantPriority } from '../../lynx/important-priority'
import { readOverflowEvidence } from '../../lynx/overflow-evidence'
import { evaluatePixelEffect } from '../../lynx/pixel-effects'
import { readResponsiveEvidence } from '../../lynx/responsive-evidence'
import { evaluateStructural } from '../../lynx/structural'
import { evaluateTextFlow } from '../../lynx/text-flow'
import { geometryValidators, pixelValidators } from './contracts'
import { readLynxFrame } from './evidence'
import { readLynxGeometry } from './geometry-evidence'

export async function validateLynxCase(context: RunContext, raw: NativePlatformReport, contract: CaseContract): Promise<Pick<CapabilityResult, 'status' | 'assertions' | 'reason'>> {
  const results = raw.results.filter(item => item.id === contract.id)
  if (results.length !== 1 || results[0]!.status === 'not-tested') {
    return { status: 'blocked', assertions: [], reason: '原始报告缺少完整且唯一的本案例运行结果' }
  }
  const result = results[0]!
  if (result.status !== contract.expectation.support) {
    return { status: 'failed', assertions: [], reason: `本轮 ${result.status} 偏离独立审查的 ${contract.expectation.support} 预期，不能自动降级平台支持状态` }
  }
  let measured: NativeCaseResult | undefined
  if (contract.id === 'layout-overflow' && contract.expectation.stage === 'visual') {
    if (!raw.evidence) {
      throw new Error('overflow 缺少本轮宿主身份')
    }
    measured = await readOverflowEvidence(raw, path.join(context.directory, 'native', 'crops', context.runId), { ...raw.evidence, runId: context.runId })
  }
  else if (contract.id === 'variant-responsive' && contract.expectation.stage === 'runtime') {
    if (!raw.evidence) {
      throw new Error('响应式缺少本轮宿主身份')
    }
    measured = (await readResponsiveEvidence(raw, path.join(context.directory, 'native', 'crops', context.runId), { ...raw.evidence, runId: context.runId })).measured
  }
  else if (geometryValidators.has(contract.id) && contract.expectation.stage === 'runtime') {
    measured = evaluateGeometry(compatibilityCases.find(item => item.id === contract.id)!, await readLynxGeometry(context, raw, contract.id))
  }
  else if (pixelValidators.has(contract.id) && contract.expectation.stage === 'visual') {
    const images = await Promise.all(pixelValidators.get(contract.id)!.map(frame => readLynxFrame(context, raw, `${contract.id}-${frame}.png`)))
    if (contract.id === 'variant-dark') {
      validateColorSchemeReceipts(result, context.runId)
      measured = evaluateColorScheme(images)
    }
    else if (contract.id === 'variant-structural') {
      measured = evaluateStructural(images)
    }
    else if (contract.id === 'type-flow') {
      measured = evaluateTextFlow(images)
    }
    else if (contract.id === 'syntax-important') {
      measured = evaluateImportantPriority(images)
    }
    else {
      measured = evaluatePixelEffect(contract.id, images[0]!, images[1]!)
    }
  }
  if (!measured || measured.status === 'not-tested') {
    return { status: 'blocked', assertions: [], reason: measured?.reason ?? `尚无完整的 ${contract.expectation.stage} 语义判定器；checkpoint 布尔值、生成标记或截图差异不能作为通过证据` }
  }
  const passed = measured.status === contract.expectation.support
  return {
    status: passed ? 'passed' : 'failed',
    assertions: [{ name: 'semantic-support', stage: contract.expectation.stage, actual: measured.status, expected: contract.expectation.support }],
    ...(passed ? contract.expectation.reason ? { reason: contract.expectation.reason } : {} : { reason: `独立重算得到 ${measured.status}，与预期 ${contract.expectation.support} 不一致` }),
  }
}
