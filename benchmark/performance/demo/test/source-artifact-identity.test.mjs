import { expect, it } from 'vitest'
import { assertSameRegistryDependencies } from '../../scripts/source-generation/identity.mjs'
import { comparisonBatches } from '../../scripts/source-generation/ordering.mjs'
import { order } from '../model.mjs'

const locks = (external, local = 'before') => Object.fromEntries(['native', 'static', 'enabled'].map(mode => [mode, { snapshots: {}, packages: { [`weapp-tailwindcss@file:${local}.tgz`]: { resolution: { integrity: local } }, ...external } }]))
it('源码 tarball 路径与内容可不同，外部依赖必须固定', () => {
  const registry = { 'vite@8.0.0': { resolution: { integrity: 'sha512-vite' } } }
  expect(() => assertSameRegistryDependencies(locks(registry), locks(registry, 'after'))).not.toThrow()
  expect(() => assertSameRegistryDependencies(locks(registry), locks({ 'vite@8.0.1': registry['vite@8.0.0'] }))).toThrow('外部依赖图')
  expect(() => assertSameRegistryDependencies(locks(registry), locks({ 'vite@8.0.0': { resolution: { integrity: 'changed' } } }))).toThrow('外部依赖图')
})

it('依赖实验仅放行显式版本的新增或移除，并保存完整性证据', () => {
  const old = { resolution: { integrity: 'sha512-old' } }
  const next = { resolution: { integrity: 'sha512-next' } }
  const changes = [{ name: 'oxc-parser', before: '0.151.0', after: '0.152.0' }]
  const before = locks({ 'oxc-parser@0.151.0': old })
  const after = locks({ 'oxc-parser@0.152.0': next })
  expect(assertSameRegistryDependencies(before, after, changes).enabled).toHaveLength(2)
  expect(() => assertSameRegistryDependencies(before, locks({ 'oxc-parser@0.153.0': next }), changes)).toThrow('外部依赖图')
  expect(() => assertSameRegistryDependencies(before, locks({ 'oxc-parser@0.151.0': next }), changes)).toThrow('外部依赖图')
  expect(() => assertSameRegistryDependencies(before, after, [{ ...changes[0], after: '^0.152.0' }])).toThrow('确切版本')
  expect(assertSameRegistryDependencies(locks({ 'es-toolkit@1.52.0': old }), locks({}), [{ name: 'es-toolkit', before: '1.52.0', after: null }]).enabled).toEqual([{ key: 'es-toolkit@1.52.0', before: old, after: null }])
})

it('包列表相同时仍检查解析边，规范化内部 tarball 而不放行其他版本切换', () => {
  const before = locks({})
  const after = locks({}, 'after')
  for (const mode of ['native', 'static', 'enabled']) {
    before[mode].snapshots = { 'weapp-tailwindcss@file:before.tgz': { dependencies: { helper: '1.0.0' } } }
    after[mode].snapshots = { 'weapp-tailwindcss@file:after.tgz': { dependencies: { helper: '1.0.0' } } }
  }
  expect(() => assertSameRegistryDependencies(before, after)).not.toThrow()
  after.enabled.snapshots['weapp-tailwindcss@file:after.tgz'].dependencies.helper = '2.0.0'
  expect(() => assertSameRegistryDependencies(before, after)).toThrow('依赖解析关系')
})

it('显式升级允许对应 peer 身份变化，但保留其余依赖边验证', () => {
  const before = locks({ 'oxc-parser@0.151.0': {} })
  const after = locks({ 'oxc-parser@0.152.0': {} })
  for (const mode of ['native', 'static', 'enabled']) {
    before[mode].snapshots = { 'walker@1.0.0(oxc-parser@0.151.0)': { dependencies: { 'oxc-parser': '0.151.0', 'helper': '1.0.0' } } }
    after[mode].snapshots = { 'walker@1.0.0(oxc-parser@0.152.0)': { dependencies: { 'oxc-parser': '0.152.0', 'helper': '1.0.0' } } }
  }
  const changes = [{ name: 'oxc-parser', before: '0.151.0', after: '0.152.0' }]
  expect(() => assertSameRegistryDependencies(before, after, changes)).not.toThrow()
  after.static.snapshots['walker@1.0.0(oxc-parser@0.152.0)'].dependencies.helper = '2.0.0'
  expect(() => assertSameRegistryDependencies(before, after, changes)).toThrow('依赖解析关系')
})

it.each(['first', 'second'])('退化确认只有一批，版本顺序和三组轮换方向都与 %s 批相反', (batch) => {
  const initial = comparisonBatches().find(item => item.batch === batch)
  const confirmation = comparisonBatches(true, batch)
  expect(confirmation).toHaveLength(1)
  expect(confirmation[0].order).toEqual([...initial.order].reverse())
  for (let round = 0; round < 7; round++) {
    expect(order(round, confirmation[0].reverse)).toEqual([...order(round, initial.reverse)].reverse())
  }
})
