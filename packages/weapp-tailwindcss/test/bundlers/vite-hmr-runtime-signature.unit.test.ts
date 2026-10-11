import { describe, expect, it } from 'vitest'
import { hasFrameworkHmrRuntimeSourceChange } from '../../src/bundlers/vite/shared/framework-hmr-runtime-signature'

describe('Vite framework HMR runtime signature', () => {
  it('does not treat a template-only class update as an existing @apply change', () => {
    const previous = '<template><view class="flex" /></template>\n<style scoped>.button { @apply flex; }</style>'
    const next = '<template><view class="flex mt-200" /></template>\n<style scoped>.button { @apply flex; }</style>'

    expect(hasFrameworkHmrRuntimeSourceChange('C:\\project\\pages\\index.uvue', previous, next)).toBe(false)
  })

  it('detects a Tailwind directive change inside an SFC style block', () => {
    const previous = '<template><view /></template>\n<style scoped>.button { @apply flex; }</style>'
    const next = '<template><view /></template>\n<style scoped>.button { @apply flex items-center; }</style>'

    expect(hasFrameworkHmrRuntimeSourceChange('/project/pages/index.uvue', previous, next)).toBe(true)
  })

  it('detects a Tailwind root CSS theme change', () => {
    expect(hasFrameworkHmrRuntimeSourceChange(
      '/project/main.css',
      '@theme { --color-brand: red; }',
      '@theme { --color-brand: blue; }',
    )).toBe(true)
  })

  it.each([
    ['"A  B"', '"A B"'],
    ['"/* label */"', '""'],
    ['"A : B"', '"A:B"'],
  ])('invalidates a theme string change from %s to %s', (previous, next) => {
    expect(hasFrameworkHmrRuntimeSourceChange(
      '/project/theme.css',
      `@theme { --font-label: ${previous}; }`,
      `@theme { --font-label: ${next}; }`,
    )).toBe(true)
  })
})
