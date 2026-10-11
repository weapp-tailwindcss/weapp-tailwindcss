import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Tokenizer } from '@/wxml/Tokenizer'
import { JavaScriptTokenizer } from '@/wxml/tokenizer/javascript'

const native = vi.hoisted(() => ({ tokenizeWxml: vi.fn(), available: true }))
vi.mock('@/native', () => ({
  nativeCompilerConfigured: true,
  loadNativeCompiler: () => native.available ? { tokenizeWxml: native.tokenizeWxml } : undefined,
}))

describe('native WXML tokenizer integration', () => {
  beforeEach(() => {
    native.available = true
    native.tokenizeWxml.mockReset()
  })

  it('hydrates native spans from the original UTF-16 source without losing lone surrogates', () => {
    const source = '😀 \uD800{{中}}\uDC00'
    native.tokenizeWxml.mockReturnValue(Uint32Array.from([0, 2, 0, 3, 10, 1, 4, 9]))
    expect(new Tokenizer().run(source)).toEqual([
      { start: 0, end: 2, value: '😀', expressions: [] },
      {
        start: 3,
        end: 10,
        value: '\uD800{{中}}\uDC00',
        expressions: [{ start: 4, end: 9, value: '{{中}}' }],
      },
    ])
    expect(native.tokenizeWxml).toHaveBeenCalledWith(source)
  })

  it('uses the original scanner when a binding is unavailable and remains reusable', () => {
    native.available = false
    const tokenizer = new Tokenizer()
    const fallback = new JavaScriptTokenizer()
    for (const source of ['{{unterminated', ' ', 'x {{ a }} y', '\\{a}}', '\uD800 \uDC00']) {
      expect(tokenizer.run(source)).toEqual(fallback.run(source))
      tokenizer.reset()
    }
    expect(native.tokenizeWxml).not.toHaveBeenCalled()
  })

  it('accepts an empty native result without switching to the fallback', () => {
    native.tokenizeWxml.mockReturnValue(new Uint32Array())
    expect(new Tokenizer().run(' \t\u00A0')).toEqual([])
    expect(native.tokenizeWxml).toHaveBeenCalledOnce()
  })
})
