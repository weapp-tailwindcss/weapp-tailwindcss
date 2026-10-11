import { test } from 'vitest'
import {
  collectApplyOnlyCssSelectors,
  collectApplyOnlyCssSelectorsRoot,
  filterApplyOnlyGeneratedCss,
  postcss,
} from '@/index'

function createApplyOnlyCss(size: number) {
  const parts = []
  for (let i = 0; i < size; i++) {
    parts.push([
      `.card-${i}:not(#\\#) {`,
      '  @apply flex opacity-80;',
      '}',
    ].join('\n'))
  }
  return parts.join('\n')
}

function createGeneratedCss(size: number) {
  const parts = [
    ':root { --spacing: 0.25rem; }',
  ]
  for (let i = 0; i < size; i++) {
    parts.push(`.card-${i} { display: flex; opacity: .8; }`)
    parts.push(`.unused-${i} { color: red; }`)
  }
  return parts.join('\n')
}

const rawCss = createApplyOnlyCss(400)
const generatedCss = createGeneratedCss(400)

test('apply-only generated css benchmark', async ({ bench }) => {
  await bench.compare(
    bench('collect selectors by parsing raw css', () => {
      collectApplyOnlyCssSelectors(rawCss)
    }),
    bench('collect selectors from existing root', () => {
      collectApplyOnlyCssSelectorsRoot(postcss.parse(rawCss))
    }),
    bench('filter generated css with collected selectors', () => {
      const selectors = collectApplyOnlyCssSelectorsRoot(postcss.parse(rawCss))
      filterApplyOnlyGeneratedCss(generatedCss, selectors)
    }),
  )
})
