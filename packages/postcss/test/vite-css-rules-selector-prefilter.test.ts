import selectorParser from 'postcss-selector-parser'
import { describe, expect, it, vi } from 'vitest'
import { mergeMiniProgramPreflightRuleDeclarations, mergeMiniProgramThemeScopeRuleDeclarations } from '../src/vite-css-rules'

vi.mock('postcss-selector-parser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('postcss-selector-parser')>()
  return { ...actual, default: vi.fn(actual.default) }
})

describe('mini-program selector list prefilter', () => {
  it.each([
    {
      merge: mergeMiniProgramPreflightRuleDeclarations,
      baseSelector: 'view,text,::before,::after',
      incomingSelector: '::after, text, ::before, v\\69 ew',
    },
    {
      merge: mergeMiniProgramThemeScopeRuleDeclarations,
      baseSelector: ':host,page,.tw-root,wx-root-portal-content',
      incomingSelector: '.tw-root, wx-root-portal-content, :host, p\\61 ge',
    },
  ])('parses only selector lists while preserving escaped $baseSelector matching', ({ merge, baseSelector, incomingSelector }) => {
    const utilities = Array.from({ length: 2000 }, (_, index) => `.u${index}{padding:${index}px}`).join('\n')
    vi.mocked(selectorParser).mockClear()
    const result = merge(`${baseSelector}{color:red}\n${utilities}`, `${incomingSelector}{display:block}\n${utilities}`)

    expect(result.changed).toBe(true)
    expect(result.baseCss).toContain('display:block')
    expect(result.css).toBe(utilities)
    expect(selectorParser).toHaveBeenCalledTimes(2)
  })

  it.each(['.foo\\,bar', ':is(view,text,::before,::after)', '[data-items="view,text,::before,::after"]'])('does not confuse embedded commas with a matching selector list: %s', (selector) => {
    const baseCss = 'view,text,::before,::after{color:red}'
    const css = `${selector}{display:block}`
    expect(mergeMiniProgramPreflightRuleDeclarations(baseCss, css)).toEqual({ baseCss, css, changed: false })
  })
})
