import type { IStyleHandlerOptions } from '@/types'
import { escape, MappingChars2String } from '@weapp-tailwindcss/escape'
import postcss from 'postcss'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { escapeNativeSelectorClasses, transformNativeSelector } from '@/selectorParser/native'
import { ruleTransformSync } from '@/selectorParser/rule-transformer'
import { internalCssSelectorReplacer } from '@/shared'

afterEach(() => vi.unstubAllEnvs())

function transform(options: IStyleHandlerOptions, mode: string) {
  vi.stubEnv('WEAPP_TW_NATIVE', mode)
  const root = postcss.parse(String.raw`.a\:b.w-\[2px\]{color:red}`)
  root.walkRules(rule => ruleTransformSync(rule, options))
  return root.toString()
}

describe('CSS escape 映射内容失效', () => {
  it('同一对象 add/update/delete 后，原生批次、JS 与规则缓存一起失效', () => {
    const map: Record<string, string> = { ':': 'ONE' }
    const nativeOptions = { escapeMap: map }
    const jsOptions = { escapeMap: map }
    const values = ['a:b', 'w-[2px]']
    for (const mutate of [
      () => {},
      () => { map[':'] = 'TWO' },
      () => { map['['] = 'OPEN' },
      () => { delete map[':'] },
      () => { map[']'] = undefined as unknown as string },
    ]) {
      mutate()
      const expected = values.map(value => escape(value, { map: { ...map } }))
      vi.stubEnv('WEAPP_TW_NATIVE', 'required')
      expect(escapeNativeSelectorClasses(values, nativeOptions)).toEqual(expected)
      expect(values.map(value => internalCssSelectorReplacer(value, jsOptions))).toEqual(expected)
      const native = transform(nativeOptions, 'required')
      expect(native).toBe(transform(jsOptions, 'off'))
      expect(native).toContain(expected[0])
    }
  })

  it('显式默认映射对象发生突变时不使用固定 Rust 默认映射', () => {
    const original = MappingChars2String[':']
    const options = { escapeMap: MappingChars2String }
    try {
      const before = transform(options, 'required')
      MappingChars2String[':'] = 'UPDATED'
      vi.stubEnv('WEAPP_TW_NATIVE', 'required')
      expect(transformNativeSelector(String.raw`.a\:b`, options)).toBeUndefined()
      expect(escapeNativeSelectorClasses(['a:b'], options)).toEqual(['aUPDATEDb'])
      const after = transform(options, 'required')
      expect(after).not.toBe(before)
      expect(after).toBe(transform({ escapeMap: MappingChars2String }, 'off'))
      expect(after).toContain('aUPDATEDb')
    }
    finally {
      MappingChars2String[':'] = original
    }
  })
})
