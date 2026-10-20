import { expect, it } from 'vitest'
import { walkIds } from '../src/compat/native/selectors'

it('ID 按 AST 语义去重，等价转义和伪类分支保持归属', () => {
  expect(walkIds(String.raw`#probe-layout-overflow, #probe-layout-overfl\6fw, :is(#control-layout-overflow, .other)`)).toEqual(['probe-layout-overflow', 'control-layout-overflow'])
})

it('属性字面量中的 # 和 class 不能冒充 ID', () => {
  expect(walkIds('[data-id="#probe-layout-overflow"].probe-layout-overflow')).toEqual([])
})
