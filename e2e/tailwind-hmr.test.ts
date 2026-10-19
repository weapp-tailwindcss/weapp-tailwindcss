import { describe, expect, it } from 'vitest'
import { createTailwindCoverageCells } from './tailwind-capabilities/coverage'
import { hmrAssertions, hmrContract } from './tailwind-capabilities/hmr/contract'
import { hmrSource, hmrStates } from './tailwind-capabilities/hmr/fixture'
import { assertionPassed } from './tailwind-capabilities/report'

describe('Tailwind 源码 HMR 合同', () => {
  const state = hmrStates[1]
  const valid = { marker: 'run/added', width: 123, session: 'page', sourceUpdate: true, fullReload: false, instance: 'root' }
  const passes = (actual: typeof valid) => hmrAssertions(state, actual, 'run', 'page', 'root').every(assertionPassed)

  it('宽度正确仍必须具有本轮保存标识、同页面、同服务和源码 update 证据', () => {
    expect(passes(valid)).toBe(true)
    for (const mutation of [{ marker: 'old/added' }, { session: 'new-page' }, { sourceUpdate: false }, { fullReload: true }, { instance: 'other-root' }, { width: 147 }]) {
      expect(passes({ ...valid, ...mutation })).toBe(false)
    }
  })

  it('新增、替换、删除均来自真实文件，删除不会将候选藏进注释或共享目录', () => {
    expect(hmrSource('run', hmrStates[1])).toContain('w-[123px]')
    expect(hmrSource('run', hmrStates[2])).not.toContain('w-[123px]')
    expect(hmrSource('run', hmrStates[2])).toContain('w-[147px]')
    expect(hmrSource('run', hmrStates[3])).not.toMatch(/w-\[/)
  })

  it('所有阶段固定预期，HMR 计入独立覆盖层', () => {
    const contract = hmrContract()
    expect(contract.expectedValues['replaced/width']).toBe(147)
    expect(contract.expectedValues['deleted/width']).toBe(80)
    expect(contract.expectedValues['refresh/session-replaced']).toBe(true)
    const [cell] = createTailwindCoverageCells('web-chromium', [contract])
    expect(cell!.layers.hmr.status).toBe('ci-required')
    expect(cell!.layers.static.status).toBe('not-applicable')
  })
})
