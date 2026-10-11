import { describe, expect, it } from 'vitest'
import { filterApplyOnlyGeneratedCss } from '@/generation/user-css/apply-only'
import { removeScopedTailwindPreflightCss } from '@/bundlers/vite/processed-css-assets'

describe('uni-app x Web runtime properties across scoped cleanup', () => {
  const css = `
    *[data-v-test], [data-v-test]::before { --tw-inset-shadow: 0 0 #0000; }
    *[data-v-test] { box-sizing: border-box; }
    :root { --color-red: red; }
    .local[data-v-test] { box-shadow: var(--tw-inset-shadow), 0 4px red; }
    @property --tw-inset-shadow { syntax: "*"; inherits: false; initial-value: 0 0 #0000; }
  `

  it('keeps required initialization through apply filtering then scoped cleanup', () => {
    const filtered = filterApplyOnlyGeneratedCss(css, '.local { @apply shadow-md; }', {
      preserveVariables: false,
      preserveRuntimeProperties: true,
    })
    const result = removeScopedTailwindPreflightCss(filtered, { preserveRuntimeProperties: true })
    expect(result).toContain('--tw-inset-shadow: 0 0 #0000')
    expect(result).toContain('@property --tw-inset-shadow')
    expect(result).toContain('.local[data-v-test]')
    expect(result).not.toContain('box-sizing')
    expect(result).not.toContain(':root')
    expect(removeScopedTailwindPreflightCss(result, { preserveRuntimeProperties: true })).toBe(result)
  })

  it('retains the existing non-Web cleanup policy', () => {
    const result = removeScopedTailwindPreflightCss(css)
    expect(result).not.toContain('--tw-inset-shadow: 0 0 #0000')
    expect(result).not.toContain('@property')
    expect(result).toContain('.local[data-v-test]')
  })
})
