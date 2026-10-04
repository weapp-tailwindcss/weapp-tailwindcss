import { MappingChars2String } from '@weapp-tailwindcss/escape'
import { describe, expect, it, vi } from 'vitest'
import { createJsHandler } from '@/js'
import { jsHandler } from '@/js/babel'
import { canUseOxcJsFastPath, isOxcParserRuntimeSupported, oxcJsHandler } from '@/js/fast-path/oxc'

function createOptions() {
  return {
    escapeMap: MappingChars2String,
    alwaysEscape: true,
    needEscaped: true,
    unescapeUnicode: true,
    experimentalJsFastPath: 'oxc' as const,
    generateMap: false,
    filename: '/project/pages/index.tsx',
    babelParserOptions: {
      sourceType: 'module' as const,
      plugins: ['typescript', 'jsx'] as any,
    },
  }
}

describe('OXC JS fast path', () => {
  it('keeps OXC behind the runtime versions supported by oxc-parser', () => {
    expect(isOxcParserRuntimeSupported('18.20.8')).toBe(false)
    expect(isOxcParserRuntimeSupported('20.18.1')).toBe(false)
    expect(isOxcParserRuntimeSupported('20.19.0')).toBe(true)
    expect(isOxcParserRuntimeSupported('21.7.3')).toBe(false)
    expect(isOxcParserRuntimeSupported('22.11.0')).toBe(false)
    expect(isOxcParserRuntimeSupported('22.12.0')).toBe(true)
    expect(isOxcParserRuntimeSupported('24.0.0')).toBe(true)
  })

  it('matches Babel output for string, template and JSX literals', () => {
    const options = createOptions()
    const source = [
      'const a = "w-[100px] hover:bg-red-500"',
      // eslint-disable-next-line no-template-curly-in-string -- 输入必须保留模板插值。
      'const b = `h-[20px] ${value} mt-2`',
      'const c = <view className="px-[12px]" />',
    ].join('\n')

    const fast = oxcJsHandler(source, options)
    const babel = jsHandler(source, options)

    expect(fast?.code).toBe(babel.code)
    expect(fast?.code).toContain('w-_b100px_B')
    expect(fast?.code).toContain('h-_b20px_B')
    expect(fast?.code).toContain('px-_b12px_B')
  })

  it('walks nested TSX nodes with oxc-walker and keeps Babel output parity', () => {
    const options = createOptions()
    const source = [
      'type Item = { className: string }',
      // eslint-disable-next-line no-template-curly-in-string -- 输入必须保留模板插值。
      'const items: Item[] = [{ className: "w-[100px]" }, { className: `h-[20px] ${value} mt-2` }]',
      'const view = <view data-state={{ active: "bg-[red]" }} className={items[0]!.className} />',
    ].join('\n')

    const fast = oxcJsHandler(source, options)
    const babel = jsHandler(source, options)

    expect(fast?.code).toBe(babel.code)
    expect(fast?.code).toContain('w-_b100px_B')
    expect(fast?.code).toContain('h-_b20px_B')
    expect(fast?.code).toContain('bg-_bred_B')
  })

  it('keeps conditional test literals unchanged through Babel parent-chain semantics', () => {
    const options = createOptions()
    const source = [
      'const direct = "w-[direct]" ? "h-[direct]" : "plain"',
      'const parenthesized = ("w-[parenthesized]") ? "h-[parenthesized]" : "plain"',
      'const nested = ("w-[nested]" ? "h-[inner]" : "plain") ? "h-[outer]" : "plain"',
      'const binary = value === "w-[binary]" ? "h-[binary]" : "plain"',
      'const call = matches("w-[call]") ? "h-[call]" : "plain"',
      'const logical = enabled && "w-[logical]" ? "h-[logical]" : "plain"',
      'const member = values["w-[member]"] ? "h-[member]" : "plain"',
      'const unary = !"w-[unary]" ? "h-[unary]" : "plain"',
    ].join('\n')

    const fast = oxcJsHandler(source, options)
    const babel = jsHandler(source, options)

    expect(fast?.code).toBe(babel.code)
    for (const name of ['direct', 'binary', 'call', 'logical', 'member', 'unary']) {
      expect(fast?.code).toContain(`"w-[${name}]"`)
      expect(fast?.code).toContain(`"h-_b${name}_B"`)
    }
    expect(fast?.code).toContain('"w-[nested]"')
    expect(fast?.code).toContain('"w-[parenthesized]"')
    expect(fast?.code).toContain('"h-_bparenthesized_B"')
    expect(fast?.code).toContain('"h-_binner_B"')
    expect(fast?.code).toContain('"h-_bouter_B"')
  })

  it('keeps non-class strings unchanged under classNameSet precision', () => {
    const source = 'const message = "not a class"; const cls = "w-[100px]"'
    const options = {
      ...createOptions(),
      alwaysEscape: false,
      classNameSet: new Set(['w-[100px]']),
    }

    const fast = oxcJsHandler(source, options)

    expect(fast?.code).toContain('"not a class"')
    expect(fast?.code).toContain('"w-_b100px_B"')
  })

  it('keeps polluted App business strings unchanged while transforming slash utilities', () => {
    const source = [
      `store.dispatch('user/getUserInfo')`,
      `request('order/get_order_amount')`,
      `const route = 'pages/order/detail'`,
      `const accept = 'text/event-stream'`,
      `const classes = 'w-1/2 bg-red-500/50 shadow-lg'`,
    ].join('\n')
    const options = {
      ...createOptions(),
      alwaysEscape: false,
      classNameSet: new Set([
        'user/getUserInfo',
        'order/get_order_amount',
        'pages/order/detail',
        'text/event-stream',
        'w-1/2',
        'bg-red-500/50',
        'shadow-lg',
      ]),
    }

    const fast = oxcJsHandler(source, options)
    const babel = jsHandler(source, options)

    for (const code of [fast?.code, babel.code]) {
      expect(code).toContain(`store.dispatch('user/getUserInfo')`)
      expect(code).toContain(`request('order/get_order_amount')`)
      expect(code).toContain(`const route = 'pages/order/detail'`)
      expect(code).toContain(`const accept = 'text/event-stream'`)
      expect(code).toContain(`const classes = 'w-1_f2 bg-red-500_f50 shadow-lg'`)
    }
  })

  it('falls back to Babel when source maps are requested', () => {
    const options = {
      ...createOptions(),
      generateMap: true,
    }

    expect(canUseOxcJsFastPath(options)).toBe(false)
    expect(oxcJsHandler('const cls = "w-[100px]"', options)).toBeUndefined()
  })

  it('rejects unsupported fast path options and unsupported source markers', () => {
    expect(isOxcParserRuntimeSupported('unknown')).toBe(false)
    expect(canUseOxcJsFastPath({
      ...createOptions(),
      alwaysEscape: false,
      classNameSet: new Set<string>(),
    })).toBe(false)
    expect(canUseOxcJsFastPath({
      ...createOptions(),
      wrapExpression: true,
    } as any)).toBe(false)
    expect(canUseOxcJsFastPath({
      ...createOptions(),
      moduleSpecifierReplacements: new Map(),
    } as any)).toBe(false)
    expect(canUseOxcJsFastPath({
      ...createOptions(),
      ignoreTaggedTemplateExpressionIdentifiers: ['tw'],
    })).toBe(false)
    expect(oxcJsHandler('eval("const cls = \\"w-[100px]\\"")', createOptions())).toBeUndefined()
    expect(oxcJsHandler('const marker = "weapp-tw ignore"; const cls = "w-[100px]"', createOptions())).toBeUndefined()
    expect(oxcJsHandler('const cls = "w-[100px]"', {
      ...createOptions(),
      filename: '/project/pages/index.unknown',
      babelParserOptions: {
        sourceType: 'commonjs' as any,
      },
    })).toBeUndefined()
  })

  it('falls back to Babel for ignore-call semantics', () => {
    const options = {
      ...createOptions(),
      ignoreCallExpressionIdentifiers: ['cn'],
    }

    expect(canUseOxcJsFastPath(options)).toBe(false)
    expect(oxcJsHandler('cn("w-[100px]")', options)).toBeUndefined()
  })

  it('uses OXC with tagged-template ignore options when the AST has no tagged template', () => {
    const options = {
      ...createOptions(),
      ignoreTaggedTemplateExpressionIdentifiers: ['weappTwIgnore'],
    }
    const source = 'const cls = "w-[100px]"'

    expect(canUseOxcJsFastPath(options)).toBe(false)
    expect(oxcJsHandler(source, options)?.code).toBe(jsHandler(source, options).code)
  })

  it('falls back to Babel when tagged-template ignore options meet any tagged template', () => {
    const options = {
      ...createOptions(),
      ignoreTaggedTemplateExpressionIdentifiers: ['weappTwIgnore'],
    }

    expect(oxcJsHandler('other`w-[100px]`', options)).toBeUndefined()
    expect(oxcJsHandler('weappTwIgnore`w-[100px]`', options)).toBeUndefined()
  })

  it('rejects the fast path when no runtime classes are confirmed', () => {
    const options = {
      ...createOptions(),
      alwaysEscape: false,
      jsArbitraryValueFallback: true,
      classNameSet: new Set<string>(),
    }

    expect(canUseOxcJsFastPath(options)).toBe(false)
    expect(oxcJsHandler('const message = "cost-[100px]"', options)).toBeUndefined()
  })

  it('ignores the legacy fallback option when a runtime class set is available', () => {
    const options = {
      ...createOptions(),
      alwaysEscape: false,
      jsArbitraryValueFallback: true,
      classNameSet: new Set<string>(['w-[100px]']),
    }

    expect(canUseOxcJsFastPath(options)).toBe(true)
    expect(oxcJsHandler('const cls = "w-[100px]"', options)?.code).toContain('w-_b100px_B')
  })

  it('returns unchanged code when OXC finds no literal replacements and falls back on parse errors', () => {
    const options = createOptions()

    expect(oxcJsHandler('const cls = "plain"', options)).toEqual({ code: 'const cls = "plain"' })
    expect(oxcJsHandler('const broken = ', options)).toBeUndefined()
  })

  it('createJsHandler uses OXC only when explicitly enabled', () => {
    const source = 'const cls = "w-[100px]"'
    const handler = createJsHandler({
      escapeMap: MappingChars2String,
      alwaysEscape: true,
      generateMap: false,
      experimentalJsFastPath: 'oxc',
    })
    const fallbackHandler = createJsHandler({
      escapeMap: MappingChars2String,
      alwaysEscape: true,
      generateMap: false,
    })

    expect(handler(source, new Set()).code).toBe(fallbackHandler(source, new Set()).code)
  })

  it('does not load the native OXC parser on unsupported Node versions', async () => {
    vi.stubEnv('WEAPP_TW_NATIVE', 'off')
    vi.resetModules()
    vi.doMock('@/js/babel', () => ({
      jsHandler: vi.fn(() => ({ code: 'babel-fallback' })),
    }))
    vi.doMock('oxc-parser', () => {
      throw new Error('Node 18 must not load oxc-parser')
    })
    vi.spyOn(process.versions, 'node', 'get').mockReturnValue('18.20.8')

    try {
      const { createJsHandler: createMockedJsHandler } = await import('@/js')
      const { jsHandler: mockedBabelHandler } = await import('@/js/babel')
      const handler = createMockedJsHandler({
        escapeMap: MappingChars2String,
        alwaysEscape: true,
        generateMap: false,
        experimentalJsFastPath: 'oxc',
      })

      const result = handler('const cls = "w-[100px]"', new Set())

      expect(result.code).toBe('babel-fallback')
      expect(mockedBabelHandler).toHaveBeenCalledTimes(1)
    }
    finally {
      vi.restoreAllMocks()
      vi.unstubAllEnvs()
      vi.doUnmock('@/js/babel')
      vi.doUnmock('oxc-parser')
    }
  })

  it('does not call Babel when the OXC fast path succeeds', async () => {
    vi.resetModules()
    vi.doMock('@/js/babel', () => ({
      jsHandler: vi.fn(() => ({ code: 'babel-fallback' })),
    }))

    const { createJsHandler: createMockedJsHandler } = await import('@/js')
    const { jsHandler: mockedBabelHandler } = await import('@/js/babel')
    const handler = createMockedJsHandler({
      escapeMap: MappingChars2String,
      alwaysEscape: true,
      generateMap: false,
      experimentalJsFastPath: 'oxc',
    })

    const result = handler('const cls = "w-[100px]"', new Set())

    expect(result.code).toContain('w-_b100px_B')
    expect(mockedBabelHandler).not.toHaveBeenCalled()
    vi.doUnmock('@/js/babel')
  })

  it.each([
    'const cls = "w-[100px]"',
    'const vendor = require("./vendor.js"); const cls = "w-[100px]"',
  ])('uses OXC for moduleGraph files without consumed dependency edges: %s', async (source) => {
    vi.resetModules()
    vi.doMock('@/js/babel', () => ({
      jsHandler: vi.fn(() => ({ code: 'babel-fallback' })),
    }))

    const { createJsHandler: createMockedJsHandler } = await import('@/js')
    const { jsHandler: mockedBabelHandler } = await import('@/js/babel')
    const handler = createMockedJsHandler({
      escapeMap: MappingChars2String,
      alwaysEscape: true,
      generateMap: false,
      experimentalJsFastPath: 'oxc',
    })

    const result = handler(source, new Set(), {
      filename: '/project/dist/index.js',
      moduleGraph: {
        resolve: vi.fn(),
        load: vi.fn(),
      },
    })

    expect(result.code).toContain('w-_b100px_B')
    expect(mockedBabelHandler).not.toHaveBeenCalled()
    vi.doUnmock('@/js/babel')
  })

  it('keeps Babel moduleGraph semantics when dependencies are present', async () => {
    vi.resetModules()
    vi.doMock('@/js/babel', () => ({
      jsHandler: vi.fn(() => ({
        code: 'babel-module-graph',
        linked: { '/project/dist/shared.js': { code: 'linked' } },
      })),
    }))

    const { createJsHandler: createMockedJsHandler } = await import('@/js')
    const { jsHandler: mockedBabelHandler } = await import('@/js/babel')
    const handler = createMockedJsHandler({
      escapeMap: MappingChars2String,
      alwaysEscape: true,
      generateMap: false,
      experimentalJsFastPath: 'oxc',
    })

    const result = handler('import "./shared.js"; const cls = "w-[100px]"', new Set(), {
      filename: '/project/dist/index.js',
      moduleGraph: {
        resolve: vi.fn(),
        load: vi.fn(),
      },
    })

    expect(result.code).toBe('babel-module-graph')
    expect(result.linked).toEqual({ '/project/dist/shared.js': { code: 'linked' } })
    expect(mockedBabelHandler).toHaveBeenCalledTimes(1)
    vi.doUnmock('@/js/babel')
  })
})
