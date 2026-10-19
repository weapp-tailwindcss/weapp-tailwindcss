import { expect, it } from 'vitest'
import { loadInventory } from './tailwind-capabilities/inventory'
import { nativeContracts } from './tailwind-capabilities/native-adapter'

it('RN padding 只为实际执行的 p/pl/pr 候选登记能力，不把等价数值冒充 py/px', async () => {
  const { contracts, coverage } = nativeContracts(await loadInventory())
  const padding = contracts.find(item => item.id === 'compatibility/spacing-padding')!
  expect(padding.candidate).toBe('p-[13px] pl-[7px] pr-[7px]')
  expect(padding.features).toEqual(['utility/functional/p', 'utility/functional/pl', 'utility/functional/pr'])
  for (const root of ['p', 'pl', 'pr']) {
    expect(coverage.find(item => item.featureId === `utility/functional/${root}`)!.caseIds).toContain(padding.id)
  }
  expect(coverage.find(item => item.featureId === 'utility/functional/px')!.caseIds).toEqual(['compatibility/spacing-logical'])
  expect(coverage.find(item => item.featureId === 'utility/functional/py')!.status).toBe('not-run')
  expect(contracts.some(item => item.id === 'inventory/utility/functional/py')).toBe(true)
})
