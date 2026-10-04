import type { ITemplateHandlerOptions } from '@/types'
import type { NativeWxmlEscapeEntry } from '@/wxml/native/types'
import type { Tokenizer } from '@/wxml/Tokenizer'
import { ComplexMappingChars2String, escape } from '@weapp-tailwindcss/escape'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getNativeWxmlEscapeEntries } from '@/wxml/native/escape'
import { JavaScriptTokenizer } from '@/wxml/tokenizer/javascript'
import { templateReplacer } from '@/wxml/utils/template-fragments'

const native = vi.hoisted(() => ({ load: vi.fn(), create: vi.fn(), transform: vi.fn(), tokenize: vi.fn() }))
vi.mock('@/native', () => ({ loadNativeCompiler: native.load }))

beforeEach(() => {
  vi.clearAllMocks()
  native.load.mockReturnValue({ createWxmlTransformer: native.create, tokenizeWxml: native.tokenize })
  native.create.mockReturnValue({ transformStatic: native.transform })
  native.transform.mockReturnValue('native result')
  native.tokenize.mockImplementation((source: string) => Uint32Array.from(new JavaScriptTokenizer().run(source).flatMap(token => [
    token.start,
    token.end,
    token.expressions.length,
    ...token.expressions.flatMap(expression => [expression.start, expression.end]),
  ])))
})

describe('native static WXML adapter', () => {
  it('reuses the transformer, returns native empty output, and queries current exact candidates only', () => {
    const runtimeSet = new Set(['w-[1px]'])
    const options: ITemplateHandlerOptions = { classSetMode: 'exact', runtimeSet }
    expect(templateReplacer('w-[1px]', options)).toBe('native result')
    const contains = native.transform.mock.calls[0]![1] as (value: string) => boolean
    expect(contains('w-[1px]')).toBe(true)
    runtimeSet.clear()
    runtimeSet.add('w-[2px]')
    expect(contains('w-[1px]')).toBe(false)
    expect(contains('w-[2px]')).toBe(true)
    native.transform.mockReturnValue('')
    expect(templateReplacer('w-[2px]', options)).toBe('')
    expect(native.create).toHaveBeenCalledOnce()
    expect(native.tokenize).not.toHaveBeenCalled()
  })

  it('preserves whitespace-only input without constructing a map or calling a predicate', () => {
    expect(templateReplacer('\r\n \u00A0')).toBe('\r\n \u00A0')
    expect(native.create).not.toHaveBeenCalled()
    expect(native.transform).not.toHaveBeenCalled()
  })

  it('keeps dynamic expressions and callback order in the existing pipeline', () => {
    const jsHandler = vi.fn((source: string) => ({ code: source }))
    expect(templateReplacer(`w-[1px] {{foo}} h-[2px]`, { jsHandler, runtimeSet: new Set() })).toBe('w-_b1px_B {{foo}} h-_b2px_B')
    expect(jsHandler).toHaveBeenCalledExactlyOnceWith('foo', expect.any(Set), undefined)
    expect(native.create).not.toHaveBeenCalled()
    expect(native.transform).not.toHaveBeenCalled()
  })

  it('keeps explicitly supplied tokenizer behavior', () => {
    const tokenizer = { run: vi.fn(() => []), reset: vi.fn() } as unknown as Tokenizer
    expect(templateReplacer('w-[1px]', {}, tokenizer)).toBe('w-[1px]')
    expect(tokenizer.run).toHaveBeenCalledWith('w-[1px]')
    expect(native.load).not.toHaveBeenCalled()
  })

  it('uses JavaScript after absent native support or explicit null, and propagates execution errors', () => {
    native.load.mockReturnValue(undefined)
    expect(templateReplacer('w-[1px]')).toBe('w-_b1px_B')
    native.load.mockReturnValue({ createWxmlTransformer: native.create, tokenizeWxml: native.tokenize })
    native.transform.mockReturnValue(null)
    expect(templateReplacer('w-[1px]')).toBe('w-_b1px_B')
    const error = new Error('native execution failure')
    native.transform.mockImplementation(() => {
      throw error
    })
    expect(() => templateReplacer('w-[1px]')).toThrow(error)
  })

  it('does not silently accept an outdated native ABI', () => {
    native.load.mockReturnValue({ tokenizeWxml: native.tokenize })
    expect(() => templateReplacer('w-[1px]')).toThrow('createWxmlTransformer')
  })

  it('keeps overridden Set.has receiver, ordering, and exception identity', () => {
    const error = new Error('user predicate')
    const runtimeSet = new Set<string>()
    const has = vi.fn(function (this: Set<string>, _candidate: string): boolean {
      expect(this).toBe(runtimeSet)
      throw error
    })
    runtimeSet.has = has
    expect(() => templateReplacer('w-[1px]', { classSetMode: 'exact', runtimeSet })).toThrow(error)
    expect(has).toHaveBeenCalledExactlyOnceWith('w-[1px]')
    expect(native.transform).not.toHaveBeenCalled()
  })

  it('does not snapshot an exact custom mapping until a class actually matches', () => {
    const escapeMap = { '[': 'first' }
    const runtimeSet = new Set<string>()
    const options: ITemplateHandlerOptions = { classSetMode: 'exact', runtimeSet, escapeMap }
    expect(templateReplacer('w-[1px]', options)).toBe('w-[1px]')
    escapeMap['['] = 'second'
    runtimeSet.add('w-[1px]')
    expect(templateReplacer('w-[1px]', options)).toBe('w-second1px_B')
    expect(native.transform).not.toHaveBeenCalled()
  })
})

describe('native WXML effective escape table', () => {
  it('preserves merged custom mappings, empty replacements and identity head mappings', () => {
    const map = { '[': 'open', ']': '', '-': '-', '2': '2' }
    const entries = getNativeWxmlEscapeEntries(map)!
    const dictionary = Object.fromEntries(entries.map(entry => [entry.character, entry.replacement]))
    expect(dictionary).toMatchObject({ '[': 'open', ']': '', '-': '-', '2': '2', ':': '_c' })
    map['['] = 'changed'
    expect(getNativeWxmlEscapeEntries(map)).toBe(entries)
    expect(escape('[', { map })).toBe('open')
  })

  it('does not freeze direct complex-map mutations or invoke custom getters', () => {
    expect(getNativeWxmlEscapeEntries(ComplexMappingChars2String)).toBeUndefined()
    const get = vi.fn(() => 'getter')
    const map = Object.defineProperty({}, '[', { get, enumerable: true })
    expect(getNativeWxmlEscapeEntries(map)).toBeUndefined()
    expect(get).not.toHaveBeenCalled()
  })

  it('passes UTF-16 replacement contents through the factory unchanged', () => {
    templateReplacer('w-[1px]', { escapeMap: { '[': '\uD800', ']': '😀' } })
    const entries = native.create.mock.calls[0]![0] as NativeWxmlEscapeEntry[]
    expect(entries).toContainEqual({ character: '[', replacement: '\uD800' })
    expect(entries).toContainEqual({ character: ']', replacement: '😀' })
  })
})
