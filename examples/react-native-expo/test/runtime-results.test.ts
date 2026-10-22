import type { NativeCaseReceipt, ReactNativeCaseResult } from '../src/compatibility/protocol'
import { expect, it } from 'vitest'
import { projectRuntimeResults } from '../src/compatibility/runtime-results'

const result: ReactNativeCaseResult = { id: 'sizing-size', status: 'unverified', generated: true, encoded: true, encodedStyle: {}, generatedDeclarations: [], warnings: [], checkpoints: [] }
const checkpoints = (phase: string) => ['geometry', 'pixel', 'control', 'style'].map(kind => ({ name: `runtime:${phase}:${kind}`, passed: true }))
const receipts = (phases: string[]) => phases.map(phase => ({ id: 'sizing-size', phase })) as NativeCaseReceipt[]

it('只有 default 完成时仍未验证，保留其断言', () => {
  const observed = checkpoints('default')
  const [actual] = projectRuntimeResults([result], new Map([[result.id, observed]]), receipts(['default']))
  expect(actual).toMatchObject({ status: 'unverified', checkpoints: observed })
})

it('全部预声明阶段及唯一回执完整通过后才支持', () => {
  const phases = ['default', 'image', 'scroll-initial', 'scroll-offset', 'scroll-restored']
  const observed = phases.flatMap(checkpoints)
  expect(projectRuntimeResults([result], new Map([[result.id, observed]]), receipts(phases))[0]).toMatchObject({ status: 'supported' })
})

it('旧 default 和 image 完整记录仍不能替代新增 ScrollView 三阶段', () => {
  const observed = [...checkpoints('default'), ...checkpoints('image')]
  expect(projectRuntimeResults([result], new Map([[result.id, observed]]), receipts(['default', 'image']))[0]!.status).toBe('unverified')
})

it.each(['duplicate-checkpoints', 'duplicate-receipt', 'missing-receipt'] as const)('%s 不能替代缺失阶段', (kind) => {
  const observed = [...checkpoints('default'), ...checkpoints(kind === 'duplicate-checkpoints' ? 'default' : 'image')]
  const saved = receipts(kind === 'duplicate-receipt' ? ['default', 'default'] : kind === 'missing-receipt' ? ['default'] : ['default', 'image'])
  expect(projectRuntimeResults([result], new Map([[result.id, observed]]), saved)[0]!.status).toBe('unverified')
})

it('最后阶段失败保留已完成阶段和原始错误', () => {
  const observed = checkpoints('default')
  const [actual] = projectRuntimeResults([result], new Map([[result.id, observed]]), receipts(['default']), { id: result.id, phase: 'image', error: new Error('owned-failure') })
  expect(actual).toMatchObject({ status: 'failed', reason: 'Error: owned-failure' })
  expect(actual!.checkpoints).toEqual([...observed, { name: 'runtime:image:failure', passed: false, actual: 'Error: owned-failure' }])
})
