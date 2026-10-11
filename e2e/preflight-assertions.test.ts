import { describe, expect, it } from 'vitest'
import { assertMiniProgramPreflight } from './preflight-assertions'

describe('mini-program preflight declarations', () => {
  const base = 'view,text,::after,::before{border:0 solid;box-sizing:border-box;margin:0;padding:0;--tw-content:"";--tw-rotate-x:}'

  it('accepts merged variable initialization without dropping preflight checks', () => {
    expect(() => assertMiniProgramPreflight(base)).not.toThrow()
  })

  it.each(['border:0 solid;', 'box-sizing:border-box;', 'margin:0;', 'padding:0;'])('rejects missing %s', (declaration) => {
    expect(() => assertMiniProgramPreflight(base.replace(declaration, ''))).toThrow()
  })

  it('rejects later overrides and incomplete selector coverage', () => {
    expect(() => assertMiniProgramPreflight(`${base}view,text,::after,::before{padding:1px}`)).toThrow()
    expect(() => assertMiniProgramPreflight(base.replace(',::before', ''))).toThrow()
  })
})
