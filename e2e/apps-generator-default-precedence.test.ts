import { expect, it } from 'vitest'
import { findLateGeneratorDefaults } from './apps-generator-default-precedence'

const utility = ':where(.space-y-reverse > :not(:last-child)){--tw-space-y-reverse:1}'
const defaults = '*,::before,::after,::backdrop{--tw-space-y-reverse:0}'

it('原始资产的可见节点和完整规则集合不能掩盖尾部默认值覆盖', () => {
  expect(findLateGeneratorDefaults(`${utility}${defaults}`)).toEqual([
    { property: '--tw-space-y-reverse', selector: ':where(.space-y-reverse > :not(:last-child))', value: '1', reset: '0' },
  ])
  expect(findLateGeneratorDefaults(`${defaults}${utility}`)).toEqual([])
  expect(findLateGeneratorDefaults(`${utility}@layer properties{${defaults}}`)).toEqual([])
})
