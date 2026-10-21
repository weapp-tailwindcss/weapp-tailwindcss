import { expect, it } from 'vitest'
import { finalizeMiniProgramCss, removeCssCoveredByRootStyleSources, removeScopedTailwindPreflightCss } from '../src/compat'

it.each(['/* tokens:', '/*tokens:', '/*! tokens:', '/*!tokens:', '/*! TOKENS:'])('清理生成规则时同时移除 %s 追踪，保留作者规则与重要注释', (prefix) => {
  const css = `${prefix} container <= <tailwind generated> */.container{width:100%}/*! author */.author{color:red}`
  const result = finalizeMiniProgramCss(css)
  expect(result).not.toContain('.container')
  expect(result).not.toMatch(/tokens:/i)
  expect(result).toContain('.author')
  expect(result).toContain('/*! author */')
})

it.each(['/* tokens:', '/*tokens:', '/*! tokens:', '/*!tokens:'])('移除 scoped preflight 和重复规则后清除悬空的 %s 注释', (prefix) => {
  const preflight = `/*! tailwindcss v4 */ ${prefix} generated <= <tailwind generated> */ *[data-v-a]{margin:0} ${prefix} stale <= src/stale.vue */`
  expect(removeScopedTailwindPreflightCss(preflight)).toBe('')
  const css = `${prefix} a <= page.vue */.a{color:red}${prefix} stale <= src/stale.vue */ /*! author */`
  const result = removeCssCoveredByRootStyleSources(css, ['.a{color:red}'])
  expect(result).not.toContain('tokens:')
})
