import { describe, expect, it } from 'vitest'
import { selection } from './selection'

describe('语言与画幅选择', () => {
  it('默认选择四个版本，支持单语言及单画幅', () => {
    expect(selection([]).variants).toHaveLength(4)
    expect(selection(['--locale', 'all']).variants).toHaveLength(4)
    expect(selection(['--locale', 'zh']).variants).toEqual([{ locale: 'zh', format: 'landscape' }, { locale: 'zh', format: 'portrait' }])
    expect(selection(['frames', '--locale', 'en', '--format', 'portrait'], true)).toEqual({ mode: 'frames', variants: [{ locale: 'en', format: 'portrait' }] })
    expect(selection(['portrait', '--locale', 'en']).variants).toEqual([{ locale: 'en', format: 'portrait' }])
  })
  it('无效、缺失、重复与冲突参数均报错', () => {
    for (const args of [['--locale'], ['--locale', 'fr'], ['--locale', 'en', '--locale', 'zh'], ['portrait', '--format', 'landscape'], ['--unknown'], ['frames']]) {
      expect(() => selection(args)).toThrow()
    }
  })
})
