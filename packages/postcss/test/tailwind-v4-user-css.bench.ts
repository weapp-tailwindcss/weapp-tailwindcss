import { describe, test } from 'vitest'
import { filterTailwindV4ApplyOnlyGeneratedCss } from '../src/compat/tailwindcss-v4/user-css/apply-only'
import { preferScopedGeneratedCssRules } from '../src/compat/tailwindcss-v4/user-css/scoped-rules'

const selectors = Array.from({ length: 500 }, (_, index) => '.item-' + index)
const declarations = Array.from({ length: 30 }, (_, index) => '--token-' + index + ':0.5rem').join(';')
const css = selectors.join(',') + '{' + declarations + '}'
  + selectors.map(selector => selector + '[data-v-a]').join(',') + '{' + declarations + '}'
const applySource = selectors.join(',') + '{@apply flex}'

describe('Tailwind v4 user CSS (500 selectors, 30 declarations per rule)', () => {
  test('scoped coverage', async ({ bench }) => {
    await bench('scoped coverage', () => {
      preferScopedGeneratedCssRules(css)
    }).run()
  })
  test('apply filtering with shared output AST', async ({ bench }) => {
    await bench('apply filtering with shared output AST', () => {
      filterTailwindV4ApplyOnlyGeneratedCss(css, applySource, { preferScopedRules: true })
    }).run()
  })
})
