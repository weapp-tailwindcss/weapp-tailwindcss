import { describe, expect, it } from 'vitest'
import { finalizeMiniProgramCssStructure } from '@/index'

describe('mini-program class presence specificity', () => {
  it.each([
    ['.a[class]', '.a.a'],
    ['.a[ class ]', '.a.a'],
    ['.a[class][class]', '.a.a.a'],
    ['.theme .a[class].scope', '.theme .a.a.scope'],
    ['[class].a:hover', '.a.a:hover'],
    ['.a:not(.b[class])', '.a:not(.b.b)'],
    ['.a[class]::before', '.a.a::before'],
  ])('preserves matching and specificity of %s', (source, expected) => {
    const result = finalizeMiniProgramCssStructure(`${source}{color:red}`)
    expect(result).toBe(`${expected}{color:red}`)
    expect(finalizeMiniProgramCssStructure(result)).toBe(result)
  })

  it.each(['[class]', '.a [class]', '[class~=a]', '.a[class=b]', '.a[svg|class]', ':is(.a)[class]'])('does not guess an equivalent class for %s', (selector) => {
    const source = `${selector}{color:red;content:"[class]"}`
    expect(finalizeMiniProgramCssStructure(source)).toBe(source)
  })
})
