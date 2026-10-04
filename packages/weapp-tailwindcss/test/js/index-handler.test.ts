import { MappingChars2String } from '@weapp-tailwindcss/escape'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createJsHandler } from '@/js'
import * as babel from '@/js/babel'
import { defaultJsPreserveClass } from '@/js/default-preserve'

const STYLED_TAG_REGEXP = /^styled$/
const OVERRIDE_CALL_REGEXP = /^override$/

function createBaseOptions() {
  return {
    escapeMap: { base: '_' },
    arbitraryValues: { allowDoubleQuotes: true },
    jsPreserveClass: vi.fn(),
    generateMap: true,
    needEscaped: true,
    alwaysEscape: true,
    unescapeUnicode: true,
    babelParserOptions: { sourceType: 'module' as const },
    ignoreCallExpressionIdentifiers: ['cn'],
    ignoreTaggedTemplateExpressionIdentifiers: [STYLED_TAG_REGEXP],
    uniAppX: true,
  }
}

describe('createJsHandler', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('merges base options with per-call overrides', () => {
    const spy = vi.spyOn(babel, 'jsHandler').mockReturnValue({ code: 'ok' })
    const base = createBaseOptions()
    const handler = createJsHandler(base)
    const override = {
      needEscaped: false,
      escapeMap: { override: '_' },
      ignoreCallExpressionIdentifiers: [OVERRIDE_CALL_REGEXP],
    }
    const classNameSet = new Set(['foo'])

    const result = handler('raw-source', classNameSet, override)

    expect(result.code).toBe('ok')
    expect(spy).toHaveBeenCalledTimes(1)

    const [, resolved] = spy.mock.calls[0]

    expect(resolved.classNameSet).toBe(classNameSet)
    expect(resolved.classNameSet).toBe(classNameSet)
    expect(resolved.escapeMap).toMatchObject(override.escapeMap)
    expect(resolved.escapeMap!.base).toBe(base.escapeMap.base)
    expect(resolved.arbitraryValues).toBe(base.arbitraryValues)
    expect(resolved.jsPreserveClass).toBe(base.jsPreserveClass)
    expect(resolved.generateMap).toBe(true)
    expect(resolved.needEscaped).toBe(override.needEscaped)
    expect(resolved.alwaysEscape).toBe(true)
    expect(resolved.unescapeUnicode).toBe(true)
    expect(resolved.babelParserOptions).toBe(base.babelParserOptions)
    expect(resolved.babelParserOptions).toBe(base.babelParserOptions)
    expect(resolved.ignoreTaggedTemplateExpressionIdentifiers).toBe(base.ignoreTaggedTemplateExpressionIdentifiers)
    expect(resolved.uniAppX).toBe(true)
  })

  it('reuses the cached configuration when no overrides are supplied', () => {
    const spy = vi.spyOn(babel, 'jsHandler').mockReturnValue({ code: 'secondary' })
    const base = createBaseOptions()
    const handler = createJsHandler(base)

    const output = handler('another-source')
    handler('another-source-2')

    expect(output.code).toBe('secondary')
    expect(spy).toHaveBeenCalledTimes(2)

    const [, resolved] = spy.mock.calls[0]
    const [, resolvedAgain] = spy.mock.calls[1]
    expect(resolved).toBe(resolvedAgain)
    expect(resolved.classNameSet).toBeUndefined()
    expect(resolved.escapeMap).toEqual(base.escapeMap)
    expect(resolved.escapeMap).not.toBe(base.escapeMap)
    expect(Object.isFrozen(resolved.escapeMap)).toBe(true)
    expect(resolved.ignoreCallExpressionIdentifiers).toBe(base.ignoreCallExpressionIdentifiers)
    expect(resolved.needEscaped).toBe(true)
    expect(resolved.alwaysEscape).toBe(true)
    expect(resolved.unescapeUnicode).toBe(true)
  })

  it('reuses the cached configuration when overrides only contain undefined values', () => {
    const spy = vi.spyOn(babel, 'jsHandler').mockReturnValue({ code: 'undefined-cache' })
    const base = createBaseOptions()
    const handler = createJsHandler(base)
    const classNameSet = new Set(['foo'])

    handler('source-a', classNameSet)
    handler('source-b', classNameSet, {
      needEscaped: undefined,
      alwaysEscape: undefined,
    })

    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy.mock.calls[0][1]).toBe(spy.mock.calls[1][1])
    expect(spy.mock.calls[1][1].classNameSet).toBe(classNameSet)
  })

  it('reuses the cached configuration for the same runtime classNameSet when no overrides are supplied', () => {
    const spy = vi.spyOn(babel, 'jsHandler').mockReturnValue({ code: 'set-cache' })
    const base = createBaseOptions()
    const handler = createJsHandler(base)
    const classNameSet = new Set(['foo'])

    handler('source-a', classNameSet)
    handler('source-b', classNameSet)

    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy.mock.calls[0][1]).toBe(spy.mock.calls[1][1])
    expect(spy.mock.calls[0][1].classNameSet).toBe(classNameSet)
  })

  it('caches repeated short-source transform results for the same resolved options', () => {
    const spy = vi.spyOn(babel, 'jsHandler').mockReturnValue({ code: 'cached-result' })
    const base = createBaseOptions()
    const handler = createJsHandler({ ...base, jsPreserveClass: defaultJsPreserveClass })
    const classNameSet = new Set(['foo'])
    const override = {
      wrapExpression: true as const,
    }

    const first = handler('item.checked ? "foo" : ""', classNameSet, override)
    const second = handler('item.checked ? "foo" : ""', classNameSet, override)

    expect(first.code).toBe('cached-result')
    expect(second.code).toBe('cached-result')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('does not cache bundler path results because outer file caches own them', () => {
    const spy = vi.spyOn(babel, 'jsHandler').mockReturnValue({ code: 'bundler-result' })
    const base = createBaseOptions()
    const handler = createJsHandler(base)

    const override = {
      filename: '/project/dist/index.js',
      moduleGraph: {
        resolve: vi.fn(),
        load: vi.fn(),
      },
    }

    handler('import "./chunk.js"', undefined, override)
    handler('import "./chunk.js"', undefined, override)

    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('does not cache transform results when linked field is present', () => {
    const spy = vi.spyOn(babel, 'jsHandler').mockReturnValue({
      code: 'linked-result',
      linked: { '/project/dist/chunk.js': { code: 'chunk' } },
    })
    const base = createBaseOptions()
    const handler = createJsHandler(base)

    const override = {
      filename: '/project/dist/index.js',
      moduleGraph: {
        resolve: vi.fn(),
        load: vi.fn(),
      },
    }

    handler('import "./chunk.js"', undefined, override)
    handler('import "./chunk.js"', undefined, override)

    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('escapes class names when alwaysEscape is provided at creation time', () => {
    const handler = createJsHandler({
      escapeMap: MappingChars2String,
      alwaysEscape: true,
    })

    const { code } = handler('const cls = "w-[100px]"', new Set())
    expect(code).toContain('w-_b100px_B')
  })
})
