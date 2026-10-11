import type { InternalUserDefinedOptions, TailwindcssRuntimeLike } from '@/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const logger = {
  warn: vi.fn(),
}

vi.mock('@weapp-tailwindcss/logger', () => ({
  logger,
}))

function createCtx(overrides: Partial<InternalUserDefinedOptions> = {}): InternalUserDefinedOptions {
  return {
    tailwindcssBasedir: process.cwd(),
    supportCustomLengthUnits: true,
    tailwindcss: undefined,
    tailwindcssRuntimeOptions: undefined,
    cssEntries: undefined,
    appType: 'taro',
    customReplaceDictionary: {},
    logLevel: 'silent',
    customAttributes: {},
    cssCalc: undefined,
    ...overrides,
  } as InternalUserDefinedOptions
}

function createRuntime(majorVersion?: number): TailwindcssRuntimeLike {
  return {
    majorVersion,
  } as unknown as TailwindcssRuntimeLike
}

async function loadModule() {
  return import('@/tailwindcss/v4/config')
}

describe('tailwindcss/v4/config', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('warns once when tailwindcss@4 has no cssEntries', async () => {
    const ctx = createCtx()
    const runtime = createRuntime(4)

    const { warnMissingCssEntries } = await loadModule()
    warnMissingCssEntries(ctx, runtime)
    warnMissingCssEntries(ctx, runtime)

    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(logger.warn.mock.calls[0][0]).toContain('cssEntries')
  })

  it('skips warning when runtime is missing', async () => {
    const ctx = createCtx()
    const { warnMissingCssEntries } = await loadModule()

    warnMissingCssEntries(ctx, undefined)

    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('skips warning when cssEntries are provided via options', async () => {
    const ctx = createCtx({
      tailwindcssRuntimeOptions: {
        tailwindcss: {
          v4: {
            cssEntries: ['/abs/app.css'],
          },
        },
      },
    })
    const runtime = createRuntime(4)

    const { warnMissingCssEntries } = await loadModule()
    warnMissingCssEntries(ctx, runtime)

    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('skips warning when tailwindcss v4 cssEntries are present on context', async () => {
    const ctx = createCtx({
      tailwindcss: {
        v4: {
          cssEntries: ['/ctx/app.css'],
        },
      },
    })
    const runtime = createRuntime(4)
    const { warnMissingCssEntries } = await loadModule()

    warnMissingCssEntries(ctx, runtime)

    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('skips warning when tailwindcss v4 cssSources are present on context', async () => {
    const ctx = createCtx({
      tailwindcss: {
        v4: {
          cssSources: [
            {
              file: '/ctx/app.css',
              css: '@import "tailwindcss";',
            },
          ],
        },
      },
    })
    const runtime = createRuntime(4)
    const { warnMissingCssEntries } = await loadModule()

    warnMissingCssEntries(ctx, runtime)

    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('warns when tailwindcss v4 cssSources point to non-css files', async () => {
    const ctx = createCtx({
      tailwindcss: {
        v4: {
          cssSources: [
            {
              file: '/ctx/app.scss',
              css: '@import "tailwindcss";',
            },
          ],
        },
      },
    })
    const runtime = createRuntime(4)
    const { warnMissingCssEntries } = await loadModule()

    warnMissingCssEntries(ctx, runtime)

    expect(logger.warn).toHaveBeenCalledTimes(1)
  })

  it('warns when modern runtime options omit cssEntries', async () => {
    const ctx = createCtx({
      tailwindcssRuntimeOptions: {
        tailwindcss: {},
      },
    })
    const runtime = createRuntime(4)
    const { warnMissingCssEntries } = await loadModule()

    warnMissingCssEntries(ctx, runtime)

    expect(logger.warn).toHaveBeenCalledTimes(1)
  })

  it('skips warning when cssEntries are set on the context root', async () => {
    const ctx = createCtx({
      cssEntries: ['/ctx/root.css'],
    })
    const runtime = createRuntime(4)
    const { warnMissingCssEntries } = await loadModule()

    warnMissingCssEntries(ctx, runtime)

    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('skips warning when cssEntries are provided via modern tailwind runtime options', async () => {
    const ctx = createCtx({
      tailwindcssRuntimeOptions: {
        tailwindcss: {
          v4: {
            cssEntries: ['/modern/path.css'],
          },
        },
      },
    })
    const runtime = createRuntime(4)
    const { warnMissingCssEntries } = await loadModule()

    warnMissingCssEntries(ctx, runtime)

    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('skips warning when cssSources are provided via modern tailwind runtime options', async () => {
    const ctx = createCtx({
      tailwindcssRuntimeOptions: {
        tailwindcss: {
          v4: {
            cssSources: [
              {
                file: '/modern/path.css',
                css: '@import "tailwindcss";',
              },
            ],
          },
        },
      },
    })
    const runtime = createRuntime(4)
    const { warnMissingCssEntries } = await loadModule()

    warnMissingCssEntries(ctx, runtime)

    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('warns when modern tailwind runtime cssSources point to non-css files', async () => {
    const ctx = createCtx({
      tailwindcssRuntimeOptions: {
        tailwindcss: {
          v4: {
            cssSources: [
              {
                file: '/modern/path.vue',
                css: '@import "tailwindcss";',
              },
            ],
          },
        },
      },
    })
    const runtime = createRuntime(4)
    const { warnMissingCssEntries } = await loadModule()

    warnMissingCssEntries(ctx, runtime)

    expect(logger.warn).toHaveBeenCalledTimes(1)
  })

  it('保留未指定的 cssCalc，交由已解析平台决定默认策略', async () => {
    const runtime = createRuntime(4)
    const { applyV4CssCalcDefaults } = await loadModule()

    const result = applyV4CssCalcDefaults(undefined, runtime)

    expect(result).toBeUndefined()
  })

  it('preserves boolean cssCalc selection when users explicitly enable it', async () => {
    const runtime = createRuntime(4)
    const { applyV4CssCalcDefaults } = await loadModule()

    const result = applyV4CssCalcDefaults(true, runtime)

    expect(result).toBe(true)
  })

  it('merges missing custom properties when defaults are provided', async () => {
    const runtime = createRuntime(4)
    const { applyV4CssCalcDefaults, DEFAULT_CSS_CALC_CUSTOM_PROPERTIES } = await loadModule()

    DEFAULT_CSS_CALC_CUSTOM_PROPERTIES.push('--spacing')
    try {
      const result = applyV4CssCalcDefaults({
        includeCustomProperties: ['--gap'],
      }, runtime) as { includeCustomProperties: string[] }

      expect(result.includeCustomProperties).toEqual(['--gap', '--spacing'])
    }
    finally {
      DEFAULT_CSS_CALC_CUSTOM_PROPERTIES.length = 0
    }
  })

  it('fills includeCustomProperties when provided value is an object without array', async () => {
    const runtime = createRuntime(4)
    const { applyV4CssCalcDefaults, DEFAULT_CSS_CALC_CUSTOM_PROPERTIES } = await loadModule()
    DEFAULT_CSS_CALC_CUSTOM_PROPERTIES.push(/^--foo$/)

    try {
      const result = applyV4CssCalcDefaults({
        precision: 4,
      } as any, runtime) as { includeCustomProperties: RegExp[] }

      expect(result.includeCustomProperties).toEqual([/^--foo$/])
    }
    finally {
      DEFAULT_CSS_CALC_CUSTOM_PROPERTIES.length = 0
    }
  })

  it('keeps object cssCalc untouched when defaults are empty', async () => {
    const runtime = createRuntime(4)
    const { applyV4CssCalcDefaults, DEFAULT_CSS_CALC_CUSTOM_PROPERTIES } = await loadModule()
    DEFAULT_CSS_CALC_CUSTOM_PROPERTIES.length = 0

    const cssCalc = { includeCustomProperties: ['--keep'] }
    expect(applyV4CssCalcDefaults(cssCalc as any, runtime)).toBe(cssCalc)
  })

  it('respects regex and string matching when merging defaults', async () => {
    const runtime = createRuntime(4)
    const { applyV4CssCalcDefaults, DEFAULT_CSS_CALC_CUSTOM_PROPERTIES } = await loadModule()
    DEFAULT_CSS_CALC_CUSTOM_PROPERTIES.push('match-me', /^--bar$/)

    try {
      const result = applyV4CssCalcDefaults({
        includeCustomProperties: [/match-me/, '--bar'],
      }, runtime) as { includeCustomProperties: (string | RegExp)[] }

      expect(result.includeCustomProperties).toEqual([/match-me/, '--bar'])
    }
    finally {
      DEFAULT_CSS_CALC_CUSTOM_PROPERTIES.length = 0
    }
  })

  it('returns original cssCalc when runtime is not v4', async () => {
    const runtime = createRuntime(3)
    const { applyV4CssCalcDefaults } = await loadModule()

    expect(applyV4CssCalcDefaults(false, runtime)).toBe(false)
  })

  it('returns user provided cssCalc string when tailwindcss@4', async () => {
    const runtime = createRuntime(4)
    const { applyV4CssCalcDefaults } = await loadModule()

    expect(applyV4CssCalcDefaults('inline-calc' as any, runtime)).toBe('inline-calc')
  })

  it('keeps array cssCalc unchanged when no defaults exist', async () => {
    const runtime = createRuntime(4)
    const { applyV4CssCalcDefaults } = await loadModule()

    const cssCalc = ['--gap']
    expect(applyV4CssCalcDefaults(cssCalc as any, runtime)).toBe(cssCalc)
  })

  it('merges defaults for array cssCalc entries', async () => {
    const runtime = createRuntime(4)
    const { applyV4CssCalcDefaults, DEFAULT_CSS_CALC_CUSTOM_PROPERTIES } = await loadModule()
    DEFAULT_CSS_CALC_CUSTOM_PROPERTIES.push('token-array')

    try {
      const cssCalc = [/token-array/]
      expect(applyV4CssCalcDefaults(cssCalc as any, runtime)).toEqual(cssCalc)
    }
    finally {
      DEFAULT_CSS_CALC_CUSTOM_PROPERTIES.length = 0
    }
  })

  it('appends missing defaults for array cssCalc entries', async () => {
    const runtime = createRuntime(4)
    const { applyV4CssCalcDefaults, DEFAULT_CSS_CALC_CUSTOM_PROPERTIES } = await loadModule()
    DEFAULT_CSS_CALC_CUSTOM_PROPERTIES.push('append-me')

    try {
      const result = applyV4CssCalcDefaults([] as any, runtime) as string[]
      expect(result).toEqual(['append-me'])
    }
    finally {
      DEFAULT_CSS_CALC_CUSTOM_PROPERTIES.length = 0
    }
  })

  it('normalizes cssEntries config from different shapes', async () => {
    const { normalizeCssEntriesConfig } = await loadModule()

    expect(normalizeCssEntriesConfig('  app.css  ')).toEqual(['app.css'])
    expect(normalizeCssEntriesConfig(['', 'main.css', ' '])).toEqual(['main.css'])
    expect(normalizeCssEntriesConfig(42)).toBeUndefined()
    expect(normalizeCssEntriesConfig('   ')).toBeUndefined()
    expect(normalizeCssEntriesConfig([' a.css ', 123 as any])).toEqual(['a.css'])
    expect(normalizeCssEntriesConfig([' app.scss ', ' app.less ', ' app.css '])).toEqual(['app.css'])
    expect(normalizeCssEntriesConfig([' app.scss ', ' app.less '])).toBeUndefined()
    expect(normalizeCssEntriesConfig([])).toBeUndefined()
  })

  it('avoids duplicating regex defaults when already provided', async () => {
    const runtime = createRuntime(4)
    const { applyV4CssCalcDefaults, DEFAULT_CSS_CALC_CUSTOM_PROPERTIES } = await loadModule()
    DEFAULT_CSS_CALC_CUSTOM_PROPERTIES.push(/token-regex/i)

    try {
      const cssCalc = [/token-regex/i]
      expect(applyV4CssCalcDefaults(cssCalc as any, runtime)).toBe(cssCalc)
    }
    finally {
      DEFAULT_CSS_CALC_CUSTOM_PROPERTIES.length = 0
    }
  })
})
