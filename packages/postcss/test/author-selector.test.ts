import { describe, expect, it } from 'vitest'
import { createAuthorSelectorMatcher } from '../src/compat/author-selector'

describe('author selector variant ownership', () => {
  it('preserves expanded variants of exact author classes', () => {
    const matches = createAuthorSelectorMatcher(['.local', '#probe', '.author > .child', '.scoped[data-v-123]'])
    expect(matches('.theme-dark .local')).toBe(true)
    expect(matches('.local.theme-dark')).toBe(true)
    expect(matches('.local:hover')).toBe(true)
    expect(matches('#probe:focus')).toBe(true)
    expect(matches('.author > .child')).toBe(true)
    expect(matches('.scoped[data-v-123].theme-dark')).toBe(true)
    expect(matches('.theme-dark .scoped[data-v-123]')).toBe(true)
    expect(matches('.scoped[data-v-456]')).toBe(false)
    expect(matches('.local-other')).toBe(false)
    expect(matches(':not(.local)')).toBe(false)
    expect(matches('.generated')).toBe(false)
    expect(matches('.local .generated')).toBe(false)
    expect(matches('.local, .generated')).toBe(false)
  })

  it('preserves structural descendants without claiming unrelated utility subjects', () => {
    const matches = createAuthorSelectorMatcher(['.local', '.scoped[data-v-123]'])
    for (const selector of [
      '.local > view + view',
      '.local > view + text',
      '.local > :not([hidden]) ~ :not([hidden])',
      '.local > :not(.disabled)',
      '.local > :has(.child)',
      '.local :where(> :not(:last-child))',
      ':where(.local > :not(:last-child))',
      ':is(.local, .scoped[data-v-123]) > view + view',
      '.theme-dark .local:hover > * + *',
      '.scoped[data-v-123] > view.data-v-123 + view.data-v-123',
      '.local::before',
    ]) {
      expect(matches(selector), selector).toBe(true)
    }
    for (const selector of [
      '.local .generated',
      '.local + .generated',
      '.local > :is(.generated)',
      ':where(.local, .generated) > view + view',
      ':where(.local) .generated',
      ':has(.local) > view + view',
      '.local > #generated',
      '.local > view.data-v-other + view',
      ':not(.local) > view + view',
      '.local-other > view + view',
      '.scoped[data-v-456] > view + view',
      '.local > view + view, .generated',
    ]) {
      expect(matches(selector), selector).toBe(false)
    }
  })

  it('matches an authored scope pseudo as a complete anchor', () => {
    const matches = createAuthorSelectorMatcher([':global(.local)', ':deep(.nested)'])
    expect(matches(':global(.local) > view + view')).toBe(true)
    expect(matches(':where(:global(.local) > :not(:last-child))')).toBe(true)
    expect(matches(':deep(.nested) > :not(:last-child)')).toBe(true)
    expect(matches('.local > view + view')).toBe(false)
    expect(matches(':not(.local) > view + view')).toBe(false)
    expect(matches(':global(.local) .generated')).toBe(false)
  })

  it('preserves complete author chains and explicit type or attribute subjects', () => {
    const matches = createAuthorSelectorMatcher(['.parent > .child', 'button', '[data-active]'])
    expect(matches('.theme .parent > .child:hover')).toBe(true)
    expect(matches(':where(.parent > .child) > view + text')).toBe(true)
    expect(matches('button:hover')).toBe(true)
    expect(matches('[data-active]:focus')).toBe(true)
    expect(matches('.parent .child:hover')).toBe(false)
    expect(matches('.parent + .child:hover')).toBe(false)
    expect(matches('.other > .child:hover')).toBe(false)
    expect(matches('.button:hover')).toBe(false)
    expect(matches('[data-inactive]:focus')).toBe(false)
  })

  it('keeps complete selector-list ownership for long structural expansions', () => {
    const matches = createAuthorSelectorMatcher(['.local'])
    const selector = `.local${' > view:not([hidden]) + text'.repeat(100)}`
    expect(matches(`${selector}, .local::before`)).toBe(true)
    expect(matches(`${selector}, .unrelated`)).toBe(false)
  })
})
