import { describe, expect, it } from 'vitest'
import { retainUniAppXAuthorApplyCss } from '@/uni-app-x/vite/author-apply'

describe('author apply variant preservation', () => {
  it('keeps theme and media expansions but removes unrelated generated utilities', () => {
    const css = retainUniAppXAuthorApplyCss(
      '.base{color:red}.theme-dark .local[data-v-123]{color:blue}.local[data-v-123].theme-dark{color:blue}@media(prefers-color-scheme:dark){.local[data-v-123]{color:white}}.generated{display:flex}',
      '.base{@apply text-red-500}.local[data-v-123]{@apply dark:text-blue-500}',
    )
    expect(css).toContain('.theme-dark .local[data-v-123]')
    expect(css).toContain('.local[data-v-123].theme-dark')
    expect(css).toContain('@media')
    expect(css).not.toContain('.generated')
  })
})
