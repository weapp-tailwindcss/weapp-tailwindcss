import { it } from 'vitest'
import { normalizeUniAppXStyleProperty, normalizeUniAppXStyleValue } from '../src/compat/uni-app-x-style-value'

const declarations = Array.from({ length: 10000 }, (_, index) => [
  index % 2 ? 'font-size' : 'line-height',
  `${index % 32}px`,
] as const)

it('uni-app x normalizes 10000 native declarations', async ({ bench }) => {
  await bench('property and value normalization', () => {
    return declarations.map(([property, value]) => [
      normalizeUniAppXStyleProperty(property),
      normalizeUniAppXStyleValue(property, value),
    ])
  }).run()
})
