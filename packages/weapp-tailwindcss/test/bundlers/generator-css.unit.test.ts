import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { postcss } from '@weapp-tailwindcss/postcss'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { captureFrameworkPostcssOptions } from '@/generation/framework-postcss'
import { withGeneratorSourceMetadata } from '@/generation/source-resolver/metadata'

function withTestGeneratorSourceMetadata<T extends object>(
  source: T,
  metadata: Parameters<typeof withGeneratorSourceMetadata>[1],
) {
  return withGeneratorSourceMetadata(source as any, metadata) as T
}

function normalizeGeneratorOptions(options: any) {
  if (options === false) {
    return { enabled: false, target: 'weapp', importFallback: false }
  }
  if (options == null) {
    return { enabled: true, target: 'weapp', importFallback: false }
  }
  return {
    enabled: true,
    target: options.target ?? 'weapp',
    config: options.config,
    styleOptions: options.styleOptions,
    importFallback: options.importFallback ?? false,
  }
}

function createDefaultGeneratorMock(overrides: Record<string, any> = {}) {
  return {
    normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
    resolveTailwindV4Source: vi.fn(async (options: any = {}) => ({
      projectRoot: process.cwd(),
      base: process.cwd(),
      baseFallbacks: [],
      css: options.css ?? '@import "tailwindcss";',
      dependencies: options.cssEntries ?? [],
    })),
    resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
      projectRoot: process.cwd(),
      base: process.cwd(),
      baseFallbacks: [],
      css: '@import "tailwindcss";',
      dependencies: [],
    })),
    resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
      projectRoot: process.cwd(),
      baseFallbacks: [],
    })),
    ...overrides,
  }
}

function firstResolvedCssSourceOption(options: any = {}) {
  return options.cssSources?.[0] ?? {
    base: options.base,
    css: options.css,
    file: options.file ?? options.sourceFile,
  }
}

function expectMiniProgramPreflight(css: string | undefined) {
  const normalized = css?.replace(/\s+/g, '') ?? ''
  expect(normalized).toContain('view,text,::after,::before{border:0solid;box-sizing:border-box;margin:0;padding:0')
}

describe('bundlers/shared generator css', () => {
  afterEach(() => {
    vi.doUnmock('@/generator')
    vi.doUnmock('@/generation/index')
    vi.doUnmock('node:fs')
    vi.resetModules()
  })

  it('skips Tailwind generation when generator is disabled', async () => {
    const createWeappTailwindcssGenerator = vi.fn()
    vi.doMock('@/generator', () => createDefaultGeneratorMock({
      createWeappTailwindcssGenerator,
    }))

    const { generateTailwindV4Css } = await import('@/generation/service')
    const result = await generateTailwindV4Css({
      opts: {
        cssPreflight: 'view',
        generator: false,
        styleHandler: vi.fn(async (code: string) => ({ css: code })),
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: new Set(['text-[24rpx]']),
      rawSource: '@import "tailwindcss";',
      file: '/workspace/src/app.css',
      outputFile: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: '/workspace/src/app.css',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: '/workspace/src/app.css',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler: vi.fn(async (code: string) => ({ css: code })),
      debug: vi.fn(),
    })

    expect(result).toBeUndefined()
    expect(createWeappTailwindcssGenerator).not.toHaveBeenCalled()
  })

  it('keeps classSet validation from generated CSS when generator is disabled', async () => {
    const createWeappTailwindcssGenerator = vi.fn()
    vi.doMock('@/generator', () => createDefaultGeneratorMock({
      createWeappTailwindcssGenerator,
    }))

    const { validateCandidatesByGenerator } = await import('@/generation/index')
    const result = await validateCandidatesByGenerator({
      opts: {
        generator: false,
        escapeMap: {
          '[': '_b',
          ']': '_B',
        },
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      candidates: new Set(['text-[24rpx]', 'bg-red-500']),
      rawSource: '.text-_b24rpx_B{font-size:24rpx}',
      file: '/workspace/src/app.css',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: '/workspace/src/app.css',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {} as any,
      styleHandler: vi.fn(),
      debug: vi.fn(),
    })

    expect(result).toEqual(new Set(['text-[24rpx]']))
    expect(createWeappTailwindcssGenerator).not.toHaveBeenCalled()
  })

  it('returns standardized Tailwind v4 generation metadata and exact class set', async () => {
    vi.doMock('@/generator', () => createDefaultGeneratorMock({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: vi.fn(async () => ({
          css: '.text-\\[24rpx\\]{font-size:24rpx}',
          rawCss: '.text-\\[24rpx\\]{font-size:24rpx}',
          target: 'weapp',
          classSet: new Set(['text-[24rpx]']),
          dependencies: ['/workspace/tailwind.config.ts'],
          root: null,
        })),
      })),
    }))

    const { generateTailwindV4Css } = await import('@/generation/service')
    const result = await generateTailwindV4Css({
      opts: {
        cssPreflight: 'view',
        generator: {
          target: 'weapp',
        },
        styleHandler: vi.fn(async (code: string) => ({ css: code })),
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: new Set(['text-[24rpx]']),
      rawSource: '@import "tailwindcss";',
      file: '/workspace/src/app.css',
      outputFile: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: '/workspace/src/app.css',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: '/workspace/src/app.css',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler: vi.fn(async (code: string) => ({ css: code })),
      debug: vi.fn(),
    })

    expect(result?.classSet).toEqual(new Set(['text-[24rpx]']))
    expect(result?.dependencies).toEqual(['/workspace/tailwind.config.ts'])
    expect(result?.metadata).toMatchObject({
      file: '/workspace/src/app.css',
      majorVersion: 4,
      outputFile: 'app.wxss',
    })
  })

  it('keeps the compiler owner alive until an in-flight generation finishes', async () => {
    let releaseGeneration: (() => void) | undefined
    let markGenerationStarted: (() => void) | undefined
    const generationGate = new Promise<void>((resolve) => {
      releaseGeneration = resolve
    })
    const generationStarted = new Promise<void>((resolve) => {
      markGenerationStarted = resolve
    })
    let disposed = false
    const dispose = vi.fn(() => {
      disposed = true
    })
    vi.doMock('@/generator', () => createDefaultGeneratorMock({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        dispose,
        async generate() {
          markGenerationStarted?.()
          await generationGate
          if (disposed) {
            throw new Error('generator was disposed during generation')
          }
          return {
            css: '.text-\\[24rpx\\]{font-size:24rpx}',
            rawCss: '.text-\\[24rpx\\]{font-size:24rpx}',
            target: 'weapp',
            classSet: new Set(['text-[24rpx]']),
            dependencies: [],
            root: null,
          }
        },
      })),
    }))

    const runtimeState = {
      tailwindRuntime: { majorVersion: 4 } as any,
      readyPromise: Promise.resolve(),
    }
    const { generateTailwindV4Css } = await import('@/generation/service')
    const { disposeCompilerOwner } = await import('@/compiler')
    const generation = generateTailwindV4Css({
      opts: {
        generator: { target: 'weapp' },
        styleHandler: vi.fn(async (code: string) => ({ css: code })),
      } as any,
      runtimeState,
      runtime: new Set(['text-[24rpx]']),
      rawSource: '@import "tailwindcss";',
      file: '/workspace/src/app.css',
      outputFile: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {} as any,
      styleHandler: vi.fn(async (code: string) => ({ css: code })),
      debug: vi.fn(),
    })

    await generationStarted
    const disposal = disposeCompilerOwner(runtimeState)
    await Promise.resolve()
    expect(dispose).not.toHaveBeenCalled()

    releaseGeneration?.()
    await expect(generation).resolves.toMatchObject({
      classSet: new Set(['text-[24rpx]']),
    })
    await disposal
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('acquires compiler sessions before asynchronous source resolution', async () => {
    let continueResolution: (() => void) | undefined
    let markResolutionStarted: (() => void) | undefined
    const resolutionGate = new Promise<void>((resolve) => {
      continueResolution = resolve
    })
    const resolutionStarted = new Promise<void>((resolve) => {
      markResolutionStarted = resolve
    })
    const dispose = vi.fn()
    vi.doMock('@/generator', () => createDefaultGeneratorMock({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        dispose,
        async generate() {
          return {
            css: '.text-\\[24rpx\\]{font-size:24rpx}',
            rawCss: '.text-\\[24rpx\\]{font-size:24rpx}',
            target: 'weapp',
            classSet: new Set(['text-[24rpx]']),
            dependencies: [],
            root: null,
          }
        },
      })),
      async resolveTailwindV4Source(options: any = {}) {
        markResolutionStarted?.()
        await resolutionGate
        return {
          projectRoot: process.cwd(),
          base: process.cwd(),
          baseFallbacks: [],
          css: options.css ?? '@import "tailwindcss";',
          dependencies: options.cssEntries ?? [],
        }
      },
    }))

    const runtimeState = {
      tailwindRuntime: { majorVersion: 4 } as any,
      readyPromise: Promise.resolve(),
    }
    const { generateTailwindV4Css } = await import('@/generation/service')
    const { disposeCompilerOwner } = await import('@/compiler')
    const generation = generateTailwindV4Css({
      opts: {
        generator: { target: 'weapp' },
        styleHandler: vi.fn(async (code: string) => ({ css: code })),
      } as any,
      runtimeState,
      runtime: new Set(['text-[24rpx]']),
      rawSource: '@import "tailwindcss";',
      file: '/workspace/src/app.css',
      outputFile: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {} as any,
      styleHandler: vi.fn(async (code: string) => ({ css: code })),
      debug: vi.fn(),
    })

    await resolutionStarted
    const disposal = disposeCompilerOwner(runtimeState)
    continueResolution?.()

    await expect(generation).resolves.toMatchObject({
      classSet: new Set(['text-[24rpx]']),
    })
    await disposal
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('adapts generated mini-program CSS through the complete framework PostCSS pipeline', async () => {
    const frameworkPlugin = {
      postcssPlugin: 'framework-token-transform',
      Declaration(decl: { value: string }) {
        decl.value = decl.value.replaceAll('framework-token', 'processed-token')
      },
    }
    vi.doMock('@/generation/index', () => ({
      generateCssByGenerator: vi.fn(async (options: { deferCssAdaptation?: boolean }) => {
        expect(options.deferCssAdaptation).toBe(true)
        return {
          css: '.theme-token{--value:framework-token}',
          target: 'weapp',
          classSet: new Set(['theme-token']),
          dependencies: [],
          source: 'generator',
          metadata: {
            file: '/workspace/src/theme.css',
            preflightMode: { inject: false, preserve: false },
          },
        }
      }),
    }))
    const styleHandler = vi.fn(async (css: string, options: any) => {
      return postcss(options.postcssOptions.plugins).process(css, options.postcssOptions.options)
    })

    const frameworkPostcssOwner = {
      cssPreflight: false,
      generator: { target: 'weapp' },
      styleHandler,
    } as any
    const opts = { ...frameworkPostcssOwner }
    captureFrameworkPostcssOptions(frameworkPostcssOwner, { plugins: [frameworkPlugin] })
    const { generateTailwindV4Css } = await import('@/generation/service')
    const result = await generateTailwindV4Css({
      opts,
      runtimeState: {
        tailwindRuntime: { majorVersion: 4 } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: new Set(['theme-token']),
      rawSource: '@import "tailwindcss";',
      file: '/workspace/src/theme.css',
      outputFile: 'theme.wxss',
      cssHandlerOptions: { isMainChunk: false, majorVersion: 4 } as any,
      cssUserHandlerOptions: {} as any,
      styleHandler,
      debug: vi.fn(),
      frameworkPostcssOwner,
      cssStage: 'framework-processed',
    })

    expect(result?.target).toBe('weapp')
    expect(result?.css).toBe('.theme-token{--value:processed-token}')
    expect(result?.classSet).toEqual(new Set(['theme-token']))
    expect(styleHandler).toHaveBeenCalledTimes(1)
  })

  it('replays the framework pipeline for late web generation', async () => {
    const frameworkPlugin = {
      postcssPlugin: 'framework-token-transform',
      Declaration(decl: { value: string }) {
        decl.value = decl.value.replaceAll('4px', 'processed-token')
      },
    }
    vi.doMock('@/generator', () => createDefaultGeneratorMock({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: vi.fn(async () => ({
          css: ':root{--spacing:4px}',
          rawCss: ':root{--spacing:4px}',
          target: 'web',
          classSet: new Set(['p-4']),
          dependencies: ['/workspace/tailwind.css'],
          root: null,
          metadata: {
            file: '/workspace/generated.css',
            outputFile: 'generated.css',
          },
        })),
      })),
    }))

    const styleHandler = vi.fn(async (css: string, options: any) => {
      return postcss(options.postcssOptions.plugins).process(css, options.postcssOptions.options)
    })
    const opts = {
      generator: { target: 'web' },
      styleHandler,
    } as any
    captureFrameworkPostcssOptions(opts, { plugins: [frameworkPlugin] })
    const { generateTailwindV4Css } = await import('@/generation/service')
    const result = await generateTailwindV4Css({
      opts,
      runtimeState: {
        tailwindRuntime: { majorVersion: 4 } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: new Set(['p-4']),
      rawSource: '@import "tailwindcss";',
      file: '/workspace/src/app.css',
      outputFile: 'app.css',
      cssHandlerOptions: { majorVersion: 4 } as any,
      cssUserHandlerOptions: {} as any,
      styleHandler,
      debug: vi.fn(),
      cssStage: 'framework-processed',
    })

    expect(result?.css).toBe(':root{--spacing:processed-token}')
    expect(result?.metadata).toMatchObject({
      file: '/workspace/src/app.css',
      majorVersion: 4,
      outputFile: 'app.css',
    })
    expect(styleHandler).not.toHaveBeenCalled()
  })

  it('rejects non-v4 Tailwind generation', async () => {
    const { generateTailwindV4Css } = await import('@/generation/service')
    await expect(generateTailwindV4Css({
      opts: {} as any,
      runtimeState: {
        tailwindRuntime: { majorVersion: 3 } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: new Set(),
      rawSource: '',
      file: '/workspace/src/app.css',
      cssHandlerOptions: {} as any,
      cssUserHandlerOptions: {} as any,
      styleHandler: vi.fn(),
      debug: vi.fn(),
    })).rejects.toThrow('仅支持 Tailwind CSS v4')
  })

  it('fills standard metadata when generation returns no metadata', async () => {
    vi.doMock('@/generation/index', () => ({
      generateCssByGenerator: vi.fn(async () => ({
        css: '.p-4{padding:1rem}',
        target: 'web',
        classSet: new Set(['p-4']),
        dependencies: [],
      })),
    }))
    const { generateTailwindV4Css } = await import('@/generation/service')
    const result = await generateTailwindV4Css({
      opts: {} as any,
      runtimeState: {
        tailwindRuntime: { majorVersion: 4 } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: new Set(['p-4']),
      rawSource: '',
      file: '/workspace/src/app.css',
      outputFile: 'app.css',
      cssHandlerOptions: {} as any,
      cssUserHandlerOptions: {} as any,
      styleHandler: vi.fn(),
      debug: vi.fn(),
    })

    expect(result?.metadata).toEqual({
      file: '/workspace/src/app.css',
      majorVersion: 4,
      outputFile: 'app.css',
    })
  })

  it('defers mini-program css adaptation while preserving generated source imports', async () => {
    const styleHandler = vi.fn(async (code: string) => ({ css: `adapted:${code}` }))
    const createWeappTailwindcssGenerator = vi.fn(() => ({
      generate: vi.fn(async () => ({
        css: '.space-y-4>view+view{margin-top:adapted}',
        rawCss: [
          'html:not(#\\#){line-height:1.5}',
          '@layer utilities {',
          '  .space-y-4:not(#\\#){&>:not([hidden])~:not([hidden]){margin-top:calc((var(--spacing)*4)*(1 - var(--tw-space-y-reverse)))}}',
          '  .wx\\:bg-blue{@weapp-tw-ifdef "MP-WEIXIN"{&{background:blue}}}',
          '  .not-wx\\:bg-red{@weapp-tw-ifndef "MP-WEIXIN"{&{background:red}}}',
          '}',
        ].join('\n'),
        target: 'weapp',
        classSet: new Set(['space-y-4']),
        dependencies: [],
        root: null,
      })),
    }))
    vi.doMock('@/generator', () => createDefaultGeneratorMock({
      createWeappTailwindcssGenerator,
      resolveTailwindV4Source: vi.fn(async () => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: '@import "./vendor.css";\n@import "./tailwind-internal.css";\n@layer utilities;',
        dependencies: [],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const result = await generateCssByGenerator({
      opts: {
        cssPreflight: {
          border: '0 solid',
        },
        platform: 'mp-weixin',
        generator: {
          target: 'weapp',
        },
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: new Set(['space-y-4']),
      rawSource: '@import "tailwindcss";\n@import "./vendor.css";',
      file: '/workspace/src/app.css',
      cssHandlerOptions: {
        isMainChunk: true,
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {} as any,
      styleHandler,
      debug: vi.fn(),
      deferCssAdaptation: true,
      generatorPlatform: 'mp-weixin',
    })

    expect(result?.css).toContain('@import "./vendor.css";')
    expect(result?.css).toMatch(/:not\(\[hidden\]\)\s*~\s*:not\(\[hidden\]\)/)
    expect(result?.css).not.toContain(':not(#\\#)')
    expect(result?.css).not.toContain('@layer')
    expect(result?.css).not.toContain('@weapp-tw-')
    expect(result?.css).not.toContain('&')
    expect(result?.css).not.toContain('html')
    expect(result?.css).not.toContain('margin-top:adapted')
    expect(result?.css).toContain('.wx\\:bg-blue')
    expect(result?.css).not.toContain('.not-wx\\:bg-red')
    expect(result?.metadata?.preflightMode).toEqual({
      inject: true,
      preserve: true,
    })
    expect(createWeappTailwindcssGenerator).toHaveBeenCalledWith(expect.objectContaining({
      css: '@import "./tailwind-internal.css";\n@layer utilities;',
    }))
    expect(createWeappTailwindcssGenerator.mock.calls[0]?.[0]?.css).not.toContain('./vendor.css')
    expect(styleHandler).not.toHaveBeenCalled()
  })

  it('preserves user native pseudo selectors in deferred mini-program css adaptation', async () => {
    const userCss = '@layer base { button::after, wx-button::after { display:none; border:none; content:""; } }'
    const styleHandler = vi.fn(async (code: string) => ({ css: code }))
    vi.doMock('@/generator', () => createDefaultGeneratorMock({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: vi.fn(async () => ({
          css: '.bg-blue-500{background-color:blue}',
          rawCss: [
            'html:not(#\\#){line-height:1.5}',
            userCss,
            '@layer utilities { .bg-blue-500:not(#\\#){background-color:blue} }',
          ].join('\n'),
          target: 'weapp',
          classSet: new Set(['bg-blue-500']),
          dependencies: [],
          root: null,
        })),
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const result = await generateCssByGenerator({
      opts: {
        generator: {
          target: 'weapp',
        },
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: new Set(['bg-blue-500']),
      rawSource: ['@import "tailwindcss";', userCss].join('\n'),
      file: '/workspace/src/app.css',
      cssHandlerOptions: {
        isMainChunk: true,
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
      deferCssAdaptation: true,
      generatorPlatform: 'mp-weixin',
    })

    expect(result?.css).toContain('button::after')
    expect(result?.css).toContain('wx-button::after')
    expect(result?.css).toContain('border:none')
    expect(result?.css).not.toContain('__workaround_weapp_tailwind')
    expect(result?.css).not.toContain('@layer')
    expect((result?.css.replace(/\s+/g, '').match(/button::after,wx-button::after/g) ?? [])).toHaveLength(1)
    expect(result?.css.indexOf('button::after')).toBeLessThan(result?.css.indexOf('.bg-blue-500'))
    expect(styleHandler).toHaveBeenCalledWith(expect.stringContaining('button::after'), expect.objectContaining({
      isMainChunk: false,
    }))
  })

  it('filters standalone utilities from deferred apply-only component css', async () => {
    vi.doMock('@/generator', () => createDefaultGeneratorMock({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: vi.fn(async () => ({
          css: '',
          rawCss: [
            ':root{--spacing:0.25rem}',
            '.gap-2{gap:calc(var(--spacing)*2)}',
            '.px-4{padding-left:calc(var(--spacing)*4);padding-right:calc(var(--spacing)*4)}',
            '.hello-world-shell{display:flex;gap:calc(var(--spacing, 0.25rem)*2);padding-left:calc(var(--spacing, 0.25rem)*4);padding-right:calc(var(--spacing, 0.25rem)*4)}',
            '.hello-world-shell.data-v-04bcf89b{display:flex;gap:calc(var(--spacing, .25rem)*2);padding-left:calc(var(--spacing, .25rem)*4);padding-right:calc(var(--spacing, .25rem)*4)}',
          ].join('\n'),
          target: 'weapp',
          classSet: new Set(['flex', 'gap-2', 'px-4']),
          dependencies: [],
          root: null,
        })),
      })),
    }))

    const { generateTailwindV4Css } = await import('@/generation/service')
    const result = await generateTailwindV4Css({
      opts: {
        generator: {
          target: 'weapp',
        },
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: new Set(['flex', 'gap-2', 'px-4']),
      rawSource: [
        '@reference "tailwindcss";',
        '.hello-world-shell {',
        '  @apply flex gap-2 px-4;',
        '}',
      ].join('\n'),
      file: '/workspace/src/components/HelloWorld.scss',
      cssHandlerOptions: {
        isMainChunk: false,
        majorVersion: 4,
        sourceOptions: {
          requestFile: '/workspace/src/components/HelloWorld.vue?vue&type=style&index=0&scoped=true&lang=scss',
        },
      } as any,
      cssUserHandlerOptions: {} as any,
      styleHandler: vi.fn(),
      debug: vi.fn(),
      deferCssAdaptation: true,
      generatorPlatform: 'mp-weixin',
    })

    expect(result?.css).toContain('--spacing:0.25rem')
    expect(result?.css).toContain('.hello-world-shell.data-v-04bcf89b')
    expect(result?.css).not.toMatch(/\.hello-world-shell\s*\{/)
    expect(result?.css).not.toContain('.gap-2{')
    expect(result?.css).not.toContain('.px-4{')
  })

  it('precomputes configured rpx theme calc in deferred mini-program css', async () => {
    const { generateTailwindV4Css } = await import('@/generation/service')
    const result = await generateTailwindV4Css({
      opts: {
        cssOptions: {
          cssCalc: ['--spacing'],
        },
        generator: {
          target: 'weapp',
        },
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: new Set(['w-32', 'p-4']),
      rawSource: [
        '@import "tailwindcss" source(none);',
        '@theme { --spacing: 1rpx; }',
      ].join('\n'),
      file: '/workspace/src/components/Spacing.scss',
      cssHandlerOptions: {
        isMainChunk: false,
        majorVersion: 4,
        sourceOptions: {
          requestFile: '/workspace/src/components/Spacing.vue?vue&type=style&index=0&scoped=true&lang=scss',
        },
      } as any,
      cssUserHandlerOptions: {} as any,
      styleHandler: vi.fn(),
      debug: vi.fn(),
      deferCssAdaptation: true,
      generatorPlatform: 'mp-weixin',
    })

    expect(result?.css).toMatch(/width:\s*32rpx/)
    expect(result?.css).toMatch(/padding:\s*4rpx/)
    expect(result?.css).not.toContain('calc(var(--spacing)')
  })

  it('matches hashed css assets back to their Tailwind v4 source css file', async () => {
    const { scoreTailwindV4CssSourceFileMatch } = await import('@/generation/source-resolver/matching')
    const score = scoreTailwindV4CssSourceFileMatch(
      '/project/dist/wx/styles/app0671d720.wxss',
      '/project/src/app.css',
      {
        outputRoot: '/project/dist/wx',
        projectRoot: '/project',
        cwd: '/project',
      },
    )

    expect(score).toBeGreaterThan(0)
  })

  it('detects generated Tailwind CSS markers without treating plain css as generated', async () => {
    const { hasTailwindGeneratedCssMarkers } = await import('@/generation/index')
    expect(hasTailwindGeneratedCssMarkers('.flex{display:flex}')).toBe(false)
    expect(hasTailwindGeneratedCssMarkers('.hover\\:bg-sky-500:hover{background-color:var(--color-sky-500)}')).toBe(true)
    expect(hasTailwindGeneratedCssMarkers('@property --tw-gradient-from{syntax:"*";inherits:false}')).toBe(true)
    expect(hasTailwindGeneratedCssMarkers('/*! weapp-tailwindcss generator-placeholder */')).toBe(true)
  })

  it('finalizes Tailwind v4 gradient interpolation for wx generator css', async () => {
    const { finalizeMiniProgramGeneratorCss } = await import('@/generation/generation-helpers')

    const css = finalizeMiniProgramGeneratorCss([
      '.bg-gradient-to-r {',
      '  --tw-gradient-position: to right in oklab;',
      '  background-image: linear-gradient(var(--tw-gradient-stops));',
      '}',
    ].join('\n'), 'wx', 4, false)

    expect(css).toContain('--tw-gradient-position: to right')
    expect(css).not.toContain('in oklab')
  })

  it('unwraps Tailwind v4 user layer blocks for mini-program generator user css', async () => {
    const { transformGeneratorUserCss } = await import('@/generation/user-css')
    const styleHandler = vi.fn(async (code: string) => ({ css: code }))

    const css = await transformGeneratorUserCss([
      '@layer components {',
      '  .layer-card-v4 {',
      '    display: flex;',
      '    color: var(--color-midnight);',
      '  }',
      '}',
    ].join('\n'), {
      generatorTarget: 'weapp',
      generatorStyleOptions: {},
      cssUserHandlerOptions: {} as any,
      styleHandler,
      importFallback: true,
    })

    expect(css).not.toContain('@layer')
    expect(css).toContain('.layer-card-v4')
    expect(css).toContain('display: flex')
    expect(css).toContain('color: var(--color-midnight)')
  })

  it('keeps processed webpack user css without running the style handler again', async () => {
    const { transformGeneratorUserCss } = await import('@/generation/user-css')
    const styleHandler = vi.fn(async (code: string) => ({ css: `handled:${code}` }))

    const css = await transformGeneratorUserCss('@charset "UTF-8";.nut-icon{display:inline-block}.nut-icon:hover{color:red}', {
      generatorTarget: 'weapp',
      generatorStyleOptions: {},
      cssUserHandlerOptions: {} as any,
      styleHandler,
      importFallback: true,
      processed: true,
    })

    expect(styleHandler).not.toHaveBeenCalled()
    expect(css).toContain('.nut-icon')
    expect(css).not.toContain(':hover')
    expect(css).not.toContain('handled:')
  })

  it('preserves empty user css rules while removing Tailwind v4 generator at-rules', async () => {
    const { transformGeneratorUserCss } = await import('@/generation/user-css')
    const styleHandler = vi.fn(async (code: string) => ({ css: code }))

    const css = await transformGeneratorUserCss([
      '@source "./pages/**/*.{ts,tsx}";',
      '.app{}',
      '@keyframes rotation {',
      '  0% {}',
      '  to {}',
      '}',
    ].join('\n'), {
      generatorTarget: 'weapp',
      generatorStyleOptions: {},
      cssUserHandlerOptions: {} as any,
      styleHandler,
      importFallback: true,
    })

    expect(css).not.toContain('@source')
    expect(css).toContain('.app')
    expect(css).toContain('@keyframes rotation')
    expect(css).toContain('0%')
    expect(css).toContain('to')
  })

  it('removes Tailwind v4 generated preflight artifacts before preserving mini-program user css', async () => {
    const { transformGeneratorUserCss } = await import('@/generation/user-css')
    const styleHandler = vi.fn(async (code: string) => ({ css: code }))

    const css = await transformGeneratorUserCss([
      '/*! tailwindcss v4.3.0 | MIT License | https://tailwindcss.com */',
      'view,text,::after,::before{box-sizing:border-box;margin:0;padding:0;border:0 solid;--tw-content:""}',
      ':host,page,.tw-root,wx-root-portal-content{--color-slate-900:#0f172a;--font-sans:ui-sans-serif;--default-font-family:var(--font-sans)}',
      '/* Deprecated */',
      '/* Prevent padding and border from affecting element width. (https://github.com/mozdevs/cssremedy/issues/4) */',
      'abbr[title]{text-decoration:underline;text-decoration:underline dotted}',
      'button,input[type="button"],input[type="reset"],input[type="submit"]{appearance:button}',
      '[hidden]:not([hidden="until-found"]){display:none!important}',
      '.weapp-tw-user-ui-card{display:inline-flex;color:var(--weapp-tw-user-ui-color,#175e75)}',
      '.weapp-tw-user-ui-loading{animation:weappTwUserUiRotation 1s linear infinite}',
      '@keyframes weappTwUserUiRotation{to{transform:rotate(360deg)}}',
    ].join('\n'), {
      generatorTarget: 'weapp',
      generatedSource: ':root,:host{--color-slate-900:#0f172a;--font-sans:ui-sans-serif;--default-font-family:var(--font-sans)}',
      generatorStyleOptions: {},
      cssUserHandlerOptions: {} as any,
      styleHandler,
      importFallback: true,
    })

    expect(styleHandler).toHaveBeenCalledWith(
      expect.not.stringContaining('Deprecated'),
      expect.anything(),
    )
    expect(css).toContain('.weapp-tw-user-ui-card')
    expect(css).toContain('.weapp-tw-user-ui-loading')
    expect(css).toContain('@keyframes weappTwUserUiRotation')
    expect(css).not.toContain('cssremedy')
    expect(css).not.toContain('abbr[title]')
    expect(css).not.toContain('appearance:button')
    expect(css).not.toContain('[hidden]:not')
    expect(css).not.toContain('--default-font-family')
  })

  it('removes Tailwind v4 source media wrappers before preserving web user css', async () => {
    const { transformGeneratorUserCss } = await import('@/generation/user-css')
    const styleHandler = vi.fn(async (code: string) => ({ css: code }))

    const css = await transformGeneratorUserCss([
      '/*! tailwindcss v4.3.1 | MIT License | https://tailwindcss.com */',
      '@media source(none){',
      '  @tailwind utilities;',
      '}',
      '.home-hero{display:grid}',
      '.home-v5{color:#0f172a}',
      '@keyframes homePulse{to{opacity:.65}}',
    ].join('\n'), {
      generatorTarget: 'web',
      generatorStyleOptions: {},
      cssUserHandlerOptions: {} as any,
      styleHandler,
      importFallback: true,
    })

    expect(styleHandler).not.toHaveBeenCalled()
    expect(css).toContain('.home-hero')
    expect(css).toContain('.home-v5')
    expect(css).toContain('@keyframes homePulse')
    expect(css).not.toContain('@media source(none)')
    expect(css).not.toContain('@tailwind utilities')
  })

  it('removes Tailwind v4 source media wrappers from processed web user css', async () => {
    const { transformGeneratorUserCss } = await import('@/generation/user-css')
    const styleHandler = vi.fn(async (code: string) => ({ css: code }))

    const css = await transformGeneratorUserCss([
      '.home-hero{display:grid}',
      '@media source(none){',
      '  @tailwind utilities;',
      '}',
      '.home-v5{color:#0f172a}',
    ].join('\n'), {
      generatorTarget: 'web',
      generatorStyleOptions: {},
      cssUserHandlerOptions: {} as any,
      styleHandler,
      importFallback: true,
      processed: true,
    })

    expect(styleHandler).not.toHaveBeenCalled()
    expect(css).toContain('.home-hero')
    expect(css).toContain('.home-v5')
    expect(css).not.toContain('@media source(none)')
    expect(css).not.toContain('@tailwind utilities')
  })

  it('removes post-transform Tailwind v4 preflight fragments without generated css markers', async () => {
    const { removeTailwindV4GeneratedUserCssArtifacts } = await import('@/generation/user-css')

    const css = removeTailwindV4GeneratedUserCssArtifacts([
      '.weapp-tw-user-ui-card {',
      '  display: inline-flex;',
      '  color: var(--weapp-tw-user-ui-color, #175e75);',
      '}',
      '@keyframes weappTwUserUiRotation {',
      '  to {',
      '    transform: rotate(360deg);',
      '  }',
      '}',
      '/* Deprecated */',
      '/*',
      '  1. Prevent padding and border from affecting element width. (https://github.com/mozdevs/cssremedy/issues/4)',
      '  2. Remove default margins and padding',
      '  3. Reset all borders.',
      '*/',
      '/*',
      '  1. Use a consistent sensible line-height in all browsers.',
      '  4. Use the user\'s configured `sans` font-family by default.',
      '*/',
      ':host {',
      '  line-height: 1.5; /* 1 */ /* 2 */',
      '  tab-size: 4; /* 3 */',
      '  font-family: --theme(--default-font-family, ui-sans-serif, system-ui, sans-serif); /* 4 */',
      '  font-feature-settings: --theme(--default-font-feature-settings, normal); /* 5 */',
      '  font-variation-settings: --theme(--default-font-variation-settings, normal); /* 6 */',
      '}',
      '/* Add the correct text decoration in Chrome, Edge, and Safari. */',
      'abbr[title] {',
      '  text-decoration: underline;',
      '  text-decoration: underline dotted;',
      '}',
      'button,input[type="button"],input[type="reset"],input[type="submit"] {',
      '  appearance: button;',
      '}',
      '/* Make elements with the HTML hidden attribute stay hidden by default. */',
      '[hidden]:not([hidden="until-found"]) {',
      '  display: none !important;',
      '}',
    ].join('\n'))

    expect(css).toContain('.weapp-tw-user-ui-card')
    expect(css).toContain('@keyframes weappTwUserUiRotation')
    expect(css).not.toContain('Deprecated')
    expect(css).not.toContain('cssremedy')
    expect(css).not.toContain(':host')
    expect(css).not.toContain('--theme(')
    expect(css).not.toContain('abbr[title]')
    expect(css).not.toContain('appearance: button')
    expect(css).not.toContain('[hidden]:not')
  })

  it('removes Tailwind v4 generated preflight artifacts before appending legacy compat css', async () => {
    const { appendLegacyCompatCss } = await import('@/generation/legacy-compat')
    const styleHandler = vi.fn(async (code: string) => ({ css: code }))
    const css = await appendLegacyCompatCss(
      '.bg-page-marker{background-color:#2563eb}',
      [
        '/*! tailwindcss v4.3.0 | MIT License | https://tailwindcss.com */',
        'view,text,::after,::before{box-sizing:border-box;margin:0;padding:0;border:0 solid;--tw-content:""}',
        ':host,page,.tw-root,wx-root-portal-content{--font-sans:ui-sans-serif;--default-font-family:var(--font-sans)}',
        '/* Deprecated */',
        '/* Prevent padding and border from affecting element width. (https://github.com/mozdevs/cssremedy/issues/4) */',
        'abbr[title]{text-decoration:underline;text-decoration:underline dotted}',
        '.weapp-tw-user-ui-card{display:inline-flex}',
      ].join('\n'),
      'weapp',
      styleHandler,
      {} as any,
      {},
      { generatedSource: ':root,:host{--font-sans:ui-sans-serif;--default-font-family:var(--font-sans)}' },
    )

    expect(css).toContain('.bg-page-marker')
    expect(css).toContain('.weapp-tw-user-ui-card')
    expect(css).not.toContain('Deprecated')
    expect(css).not.toContain('cssremedy')
    expect(css).not.toContain('abbr[title]')
    expect(css).not.toContain('--default-font-family')
  })

  it('keeps matched Tailwind v4 css source user layers when generated css markers exist', async () => {
    const rawSource = [
      '/*! tailwindcss v4.3.0 | MIT License | https://tailwindcss.com */',
      '@layer theme {',
      '  :host,page,.tw-root,wx-root-portal-content { --color-midnight: #121063; }',
      '}',
      '.flex{display:flex}',
      '@layer components {',
      '  .layer-card-v4 {',
      '    display: flex;',
      '    color: var(--color-midnight);',
      '  }',
      '}',
    ].join('\n')

    vi.doMock('@/generator', () => createDefaultGeneratorMock({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: vi.fn(async () => ({
          css: [
            '/*! tailwindcss v4.3.0 | MIT License | https://tailwindcss.com */',
            ':host,page,.tw-root,wx-root-portal-content{--color-midnight:#121063}',
            '.flex{display:flex}',
          ].join('\n'),
          rawCss: rawSource,
          target: 'weapp',
          classSet: new Set(['flex']),
          dependencies: [],
          sources: [
            withTestGeneratorSourceMetadata({}, {
              matchedCssSourceFile: 'app.wxss',
            }),
          ],
          root: null,
        })),
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const result = await generateCssByGenerator({
      opts: {
        cssPreflight: 'view',
        generator: {
          target: 'weapp',
        },
        styleHandler: vi.fn(async (code: string) => ({ css: code })),
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: new Set(['flex']),
      rawSource,
      cssSources: [
        {
          base: process.cwd(),
          css: rawSource,
          file: 'app.wxss',
        },
      ],
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler: vi.fn(async (code: string) => ({ css: code })),
      debug: vi.fn(),
    })

    const css = result?.css ?? ''
    expect(css).not.toContain('@layer')
    expect(css).toContain('.layer-card-v4')
    expect(css).toMatch(/display:\s*flex/)
    expect(css).toMatch(/color:\s*var\(--color-midnight\)/)
  })

  it('keeps third-party css from matched Tailwind v4 cssEntries even when candidates do not reference it', async () => {
    const rawSource = [
      '/*! tailwindcss v4.3.0 | MIT License | https://tailwindcss.com */',
      ':host,page,.tw-root,wx-root-portal-content{--color-sky-500:#0ea5e9}',
      '.bg-sky-500{background-color:var(--color-sky-500)}',
      '.u-cell{display:flex;color:var(--u-cell-color,#303133)}',
      '.u-cell--clickable:active{background-color:var(--u-cell-active-color,#f5f7fa)}',
      '.u-loading-icon{animation:u-rotate 1s linear infinite}',
      '@keyframes u-rotate{to{transform:rotate(360deg)}}',
    ].join('\n')

    vi.doMock('@/generator', () => createDefaultGeneratorMock({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: vi.fn(async () => ({
          css: '.bg-sky-500{background-color:var(--color-sky-500)}',
          rawCss: [
            '/*! tailwindcss v4.3.0 | MIT License | https://tailwindcss.com */',
            ':host,page,.tw-root,wx-root-portal-content{--color-sky-500:#0ea5e9}',
            '.bg-sky-500{background-color:var(--color-sky-500)}',
          ].join('\n'),
          target: 'weapp',
          classSet: new Set(['bg-sky-500']),
          dependencies: [],
          sources: [
            withTestGeneratorSourceMetadata({}, {
              matchedCssSourceFile: 'app.wxss',
            }),
          ],
          root: null,
        })),
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: code }))
    const result = await generateCssByGenerator({
      opts: {
        cssPreflight: 'view',
        generator: {
          target: 'weapp',
        },
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: new Set(['bg-sky-500']),
      sourceCandidates: new Set(['bg-sky-500']),
      rawSource,
      cssSources: [
        {
          base: process.cwd(),
          css: rawSource,
          file: 'app.wxss',
        },
      ],
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    const css = result?.css ?? ''
    expect(css).toContain('.bg-sky-500')
    expect(css).toContain('.u-cell')
    expect(css).toContain('--u-cell-color')
    expect(css).toContain('.u-cell--clickable:active')
    expect(css).toContain('.u-loading-icon')
    expect(css).toContain('@keyframes u-rotate')
    expect(css.match(/\.bg-sky-500/g)).toHaveLength(1)
  })

  it('does not preserve app-entry preflight for non-entry assets matched only by candidates', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'weapp-tw-candidate-preflight-'))
    try {
      const srcDir = path.join(dir, 'src')
      const appCss = path.join(srcDir, 'app.css')
      const pageCssFile = path.join(srcDir, 'pages/index/index.css')
      await mkdir(path.dirname(pageCssFile), { recursive: true })
      await writeFile(appCss, [
        '@import "tailwindcss" source(none);',
        '@source "./pages/**/*.{tsx,ts}";',
      ].join('\n'))
      await writeFile(pageCssFile, '.tw-page-style-watch-anchor{color:inherit}')

      const generatedCss = [
        'view,text,::after,::before{border:0 solid;box-sizing:border-box;margin:0;padding:0}',
        '.page-only{display:flex}',
      ].join('\n')
      const rawGeneratedCss = [
        '/*! tailwindcss v4.3.0 | MIT License | https://tailwindcss.com */',
        generatedCss,
      ].join('\n')
      const generateMock = vi.fn(async ({ candidates }: { candidates: Set<string> }) => ({
        css: [
          'view,text,::after,::before{border:0 solid;box-sizing:border-box;margin:0;padding:0}',
          ...[...candidates].sort().map(candidate => `.${candidate}{display:flex}`),
        ].join('\n'),
        rawCss: rawGeneratedCss,
        target: 'weapp',
        classSet: new Set(candidates),
        dependencies: [],
        sources: [],
        root: null,
      }))

      vi.doMock('@/generator', () => createDefaultGeneratorMock({
        createWeappTailwindcssGenerator: vi.fn(() => ({
          generate: generateMock,
        })),
        resolveTailwindV4Source: vi.fn(async (options: any = {}) => ({
          projectRoot: dir,
          base: options.base ?? dir,
          baseFallbacks: [],
          css: options.css ?? '@import "tailwindcss";',
          dependencies: options.cssEntries ?? [],
        })),
        resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
          projectRoot: dir,
          base: dir,
          baseFallbacks: [],
          css: '@import "tailwindcss";',
          dependencies: [],
        })),
        resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
          projectRoot: dir,
          base: dir,
          baseFallbacks: [],
          cssEntries: [appCss],
        })),
      }))

      const { generateCssByGenerator } = await import('@/generation/index')
      const styleHandler = vi.fn(async (code: string) => ({ css: code }))
      const baseOptions = {
        opts: {
          cssPreflight: {
            border: '0 solid',
          },
          generator: {
            target: 'weapp',
          },
          styleHandler,
        } as any,
        runtimeState: {
          tailwindRuntime: {
            majorVersion: 4,
          } as any,
          readyPromise: Promise.resolve(),
        },
        runtime: new Set(['page-only']),
        cssUserHandlerOptions: {
          isMainChunk: false,
          majorVersion: 4,
        } as any,
        styleHandler,
        debug: vi.fn(),
        getSourceCandidatesForEntries: () => new Set(['page-only']),
      }

      const pageResult = await generateCssByGenerator({
        ...baseOptions,
        rawSource: rawGeneratedCss,
        file: path.join(dir, 'dist/pages/index/index.wxss'),
        cssHandlerOptions: {
          isMainChunk: false,
          postcssOptions: {
            options: {
              from: path.join(dir, 'dist/pages/index/index.wxss'),
            },
          },
          majorVersion: 4,
        } as any,
      })

      const pageCss = pageResult?.css ?? ''
      expect(pageCss).toContain('.page-only')
      expect(pageCss).not.toContain('view,text,::after,::before')
      expect(pageCss).not.toContain('box-sizing:border-box')

      const pageLocalResult = await generateCssByGenerator({
        ...baseOptions,
        forceGenerator: true,
        rawSource: '.tw-page-style-watch-anchor{color:inherit}',
        file: path.join(dir, 'dist/pages/index/index.wxss'),
        cssHandlerOptions: {
          isMainChunk: false,
          postcssOptions: {
            options: {
              from: path.join(dir, 'dist/pages/index/index.wxss'),
            },
          },
          sourceOptions: {
            sourceFile: pageCssFile,
          },
          majorVersion: 4,
        } as any,
      })

      const pageLocalCss = pageLocalResult?.css ?? ''
      expect(pageLocalCss).toContain('.page-only')
      expect(pageLocalCss).not.toContain('view,text,::after,::before')
      expect(pageLocalCss).not.toContain('box-sizing:border-box')

      const appResult = await generateCssByGenerator({
        ...baseOptions,
        rawSource: '@import "tailwindcss" source(none);',
        file: path.join(dir, 'dist/app.wxss'),
        cssHandlerOptions: {
          isMainChunk: true,
          postcssOptions: {
            options: {
              from: path.join(dir, 'dist/app.wxss'),
            },
          },
          majorVersion: 4,
        } as any,
      })

      expectMiniProgramPreflight(appResult?.css)
    }
    finally {
      await rm(dir, { force: true, recursive: true })
    }
  })

  it('generates mini-program css and skips legacy style handler for matching Tailwind v4 output', async () => {
    const runtimeSet = new Set(['w-[100px]'])
    const rawTailwindCss = '/*! tailwindcss v4.2.4 | MIT License | https://tailwindcss.com */\n.w-\\[100px\\]{width:100px}'
    const weappCss = '.w-_b100px_B{width:100px}'
    const generateMock = vi.fn(async () => ({
      css: weappCss,
      rawCss: rawTailwindCss,
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source: vi.fn(async (options: any) => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: options.css,
        dependencies: [],
      })),
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: process.cwd(),
        baseFallbacks: [],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: code }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: rawTailwindCss,
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
      forceGenerator: true,
    })

    expect(result?.css).toBe(weappCss)
    expect(result?.target).toBe('weapp')
    expect(generateMock).toHaveBeenCalledWith(expect.objectContaining({
      candidates: runtimeSet,
      incrementalCache: true,
      scanSources: false,
      target: 'weapp',
    }))
    expect(styleHandler).not.toHaveBeenCalled()
  })

  it('generates mini-program css from Tailwind directives in default auto mode', async () => {
    const runtimeSet = new Set(['w-[100px]'])
    const rawSource = '@import "tailwindcss";\n.card{color:red}'
    const rawTailwindCss = '/*! tailwindcss v4.2.4 | MIT License | https://tailwindcss.com */\n.w-\\[100px\\]{width:100px}'
    const weappCss = '.w-_b100px_B{width:100px}'
    const generateMock = vi.fn(async () => ({
      css: weappCss,
      rawCss: rawTailwindCss,
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      ...createDefaultGeneratorMock(),
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: `legacy:${code}` }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource,
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
      forceGenerator: true,
    })

    expect(result).toMatchObject({
      css: `${weappCss}\nlegacy:.card{color:red}`,
      target: 'weapp',
      source: 'generator',
      dependencies: [],
    })
    expect(result?.classSet).toEqual(new Set(['w-[100px]']))
    expect(generateMock).toHaveBeenCalledWith(expect.objectContaining({
      candidates: runtimeSet,
      target: 'weapp',
    }))
    expect(styleHandler).toHaveBeenCalledWith('.card{color:red}', expect.objectContaining({
      isMainChunk: true,
    }))
  })

  it('scans Tailwind v4 sources for web target even when runtime candidates exist', async () => {
    const runtimeSet = new Set(['bg-[#07c160]'])
    const generateMock = vi.fn(async ({ candidates, scanSources, target }: { candidates: Set<string>, scanSources: boolean, target: string }) => {
      const rawCss = [
        '.bg-\\[\\#07c160\\]{background-color:#07c160}',
        ...(scanSources
          ? [
              '.inline-flex{display:inline-flex}',
              '.items-center{align-items:center}',
            ]
          : []),
      ].join('\n')
      return {
        css: rawCss,
        rawCss,
        target,
        classSet: new Set([
          ...candidates,
          ...(scanSources ? ['inline-flex', 'items-center'] : []),
        ]),
        dependencies: [],
        sources: [],
        root: null,
      }
    })

    vi.doMock('@/generator', () => ({
      ...createDefaultGeneratorMock(),
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: code }))
    const result = await generateCssByGenerator({
      opts: {
        generator: {
          target: 'web',
        },
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: '@import "tailwindcss";\n@source "./src/**/*.{tsx,html}";',
      file: 'app.css',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.css',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.css',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(generateMock).toHaveBeenCalledWith(expect.objectContaining({
      candidates: runtimeSet,
      scanSources: true,
      target: 'web',
    }))
    expect(result?.css).toContain('.inline-flex{display:inline-flex}')
    expect(result?.css).toContain('.items-center{align-items:center}')
    expect(result?.css).toContain('.bg-\\[\\#07c160\\]')
    expect(result?.css).not.toContain('.bg-_b_h07c160_B')
  })

  it('scans Tailwind v4 sources for web target when the css entry is path matched', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-web-source-scan-'))
    const cssEntry = path.join(root, 'src/css/tailwind.css')
    const css = '@import "tailwindcss" source(none);\n@source "../../src/**/*.{tsx,mdx}";'
    await mkdir(path.dirname(cssEntry), { recursive: true })
    await writeFile(cssEntry, css, 'utf8')

    const runtimeSet = new Set(['bg-[#0284c7]'])
    const generateMock = vi.fn(async ({ candidates, scanSources, target }: { candidates: Set<string>, scanSources: boolean, target: string }) => {
      const rawCss = [
        '.bg-\\[\\#0284c7\\]{background-color:#0284c7}',
        ...(scanSources
          ? [
              '.sr-only{position:absolute;width:1px;height:1px}',
              '.min-h-10{min-height:calc(var(--spacing)*10)}',
              '.min-h-12{min-height:calc(var(--spacing)*12)}',
              '.rounded-full{border-radius:9999px}',
              '.border-slate-200{border-color:var(--color-slate-200)}',
              '.bg-white{background-color:var(--color-white)}',
              '.px-3{padding-inline:calc(var(--spacing)*3)}',
              '.py-2{padding-block:calc(var(--spacing)*2)}',
              '.text-slate-700{color:var(--color-slate-700)}',
            ]
          : []),
      ].join('\n')
      return {
        css: rawCss,
        rawCss,
        target,
        classSet: new Set([
          ...candidates,
          ...(scanSources ? ['sr-only', 'min-h-10', 'min-h-12', 'rounded-full', 'border-slate-200', 'bg-white', 'px-3', 'py-2', 'text-slate-700'] : []),
        ]),
        dependencies: [],
        sources: [],
        root: null,
      }
    })

    vi.doMock('@/generator', () => ({
      ...createDefaultGeneratorMock({
        resolveTailwindV4Source: vi.fn(async (options: any) => ({
          projectRoot: root,
          base: path.dirname(cssEntry),
          baseFallbacks: [],
          css: options.css,
          dependencies: [cssEntry],
        })),
        resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
          projectRoot: root,
          baseFallbacks: [],
          cssEntries: [cssEntry],
        })),
      }),
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
    }))

    try {
      const { generateCssByGenerator } = await import('@/generation/index')
      const styleHandler = vi.fn(async (code: string) => ({ css: code }))
      const result = await generateCssByGenerator({
        opts: {
          cssEntries: [cssEntry],
          generator: {
            target: 'web',
          },
          styleHandler,
        } as any,
        runtimeState: {
          tailwindRuntime: {
            majorVersion: 4,
          } as any,
          readyPromise: Promise.resolve(),
        },
        runtime: runtimeSet,
        rawSource: '/*! tailwindcss v4.3.0 | MIT License | https://tailwindcss.com */\n.bg-\\[\\#0284c7\\]{background-color:#0284c7}',
        file: path.join(root, 'build/assets/css/styles.css'),
        cssHandlerOptions: {
          isMainChunk: true,
          postcssOptions: {
            options: {
              from: path.join(root, 'build/assets/css/styles.css'),
            },
          },
          majorVersion: 4,
        } as any,
        cssUserHandlerOptions: {
          isMainChunk: false,
          postcssOptions: {
            options: {
              from: path.join(root, 'build/assets/css/styles.css'),
            },
          },
          majorVersion: 4,
        } as any,
        styleHandler,
        debug: vi.fn(),
      })

      expect(generateMock).toHaveBeenCalledWith(expect.objectContaining({
        candidates: runtimeSet,
        scanSources: true,
        target: 'web',
      }))
      expect(result?.css).toContain('.sr-only{position:absolute')
      expect(result?.css).toContain('.min-h-10')
      expect(result?.css).toContain('.min-h-12')
      expect(result?.css).toContain('.rounded-full')
      expect(result?.css).toContain('.border-slate-200')
      expect(result?.css).toContain('.bg-white')
      expect(result?.css).toContain('.px-3')
      expect(result?.css).toContain('.py-2')
      expect(result?.css).toContain('.text-slate-700')
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('generates default web utilities from Tailwind v4 explicit @source entries', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-web-real-source-scan-'))
    const cssEntry = path.join(root, 'src/css/tailwind.css')
    const page = path.join(root, 'src/pages/index.tsx')
    try {
      await mkdir(path.dirname(cssEntry), { recursive: true })
      await mkdir(path.dirname(page), { recursive: true })
      await writeFile(cssEntry, [
        '@import "tailwindcss" source(none);',
        '@source "../../src/**/*.{ts,tsx}";',
      ].join('\n'), 'utf8')
      await writeFile(page, 'export default <div className="flex grid items-center bg-[#0284c7]"></div>', 'utf8')

      const { createContext } = await import('./vite-plugin.testkit')
      const { generateTailwindV4Css } = await import('@/generation/service')
      const styleHandler = vi.fn(async (code: string) => ({ css: code }))
      const ctx = createContext({
        generator: {
          target: 'web',
        },
        styleHandler,
        tailwindRuntime: {
          options: {
            projectRoot: root,
            tailwindcss: {
              cwd: root,
              v4: {
                base: root,
                cssEntries: [cssEntry],
              },
            },
          },
        },
        tailwindcss: {
          v4: {
            base: root,
            cssEntries: [cssEntry],
          },
        },
      } as any)
      const rawSource = await readFile(cssEntry, 'utf8')
      const result = await generateTailwindV4Css({
        opts: ctx as any,
        runtimeState: {
          tailwindRuntime: ctx.tailwindRuntime as any,
          readyPromise: Promise.resolve(),
        },
        runtime: new Set(),
        rawSource,
        file: cssEntry,
        outputFile: cssEntry,
        cssHandlerOptions: {
          isMainChunk: true,
          postcssOptions: {
            options: {
              from: cssEntry,
            },
          },
          majorVersion: 4,
        } as any,
        cssUserHandlerOptions: {
          isMainChunk: false,
          postcssOptions: {
            options: {
              from: cssEntry,
            },
          },
          majorVersion: 4,
        } as any,
        styleHandler,
        debug: vi.fn(),
      })

      expect([...(result?.classSet ?? new Set())]).toEqual(expect.arrayContaining([
        'flex',
        'grid',
        'items-center',
        'bg-[#0284c7]',
      ]))
      expect(result?.css).toContain('.flex')
      expect(result?.css).toContain('.grid')
      expect(result?.css).toContain('.items-center')
      expect(result?.css).toContain('.bg-\\[\\#0284c7\\]')
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('preserves plain bundled css when Tailwind v4 web target generates the main chunk', async () => {
    const runtimeSet = new Set(['inline-flex'])
    const rawSource = '.home-v5{display:flex;color:#0f172a}'
    const generatedCss = '.inline-flex{display:inline-flex}'
    const generateMock = vi.fn(async ({ target }: { target: string }) => ({
      css: generatedCss,
      rawCss: generatedCss,
      target,
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      ...createDefaultGeneratorMock(),
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: `legacy:${code}` }))
    const result = await generateCssByGenerator({
      opts: {
        generator: {
          target: 'web',
        },
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource,
      file: 'custom.css',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'custom.css',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'custom.css',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(result?.css).toBe(`${generatedCss}\n${rawSource}`)
    expect(generateMock).toHaveBeenCalledWith(expect.objectContaining({
      scanSources: true,
      target: 'web',
    }))
    expect(styleHandler).not.toHaveBeenCalled()
  })

  it('adds a Tailwind v4 root import for web assets that only retain source directives', async () => {
    const runtimeSet = new Set(['rounded-full', 'bg-[#07c160]', 'text-[22px]'])
    const rawSource = [
      '@source inline("rounded-full bg-[#07c160] text-[22px]");',
      '.home-hero{display:grid}',
    ].join('\n')
    const generatedCss = [
      '.rounded-full{border-radius:9999px}',
      '.bg-\\[\\#07c160\\]{background-color:#07c160}',
      '.text-\\[22px\\]{font-size:22px}',
    ].join('')
    const generateMock = vi.fn(async ({ target }: { target: string }) => ({
      css: generatedCss,
      rawCss: generatedCss,
      target,
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))
    const resolveTailwindV4Source = vi.fn(async (options: any = {}) => ({
      projectRoot: process.cwd(),
      base: process.cwd(),
      baseFallbacks: [],
      css: options.css ?? '@import "tailwindcss";',
      dependencies: [],
    }))

    vi.doMock('@/generator', () => ({
      ...createDefaultGeneratorMock({
        resolveTailwindV4Source,
      }),
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: code }))
    const result = await generateCssByGenerator({
      opts: {
        generator: {
          target: 'web',
        },
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource,
      file: 'styles.css',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'styles.css',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'styles.css',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(resolveTailwindV4Source).toHaveBeenCalledWith(expect.objectContaining({
      css: expect.stringContaining('@import "tailwindcss" source(none);'),
    }))
    expect(result?.css).toContain('.rounded-full')
    expect(result?.css).toContain('.bg-\\[\\#07c160\\]')
    expect(result?.css).toContain('.home-hero')
    expect(result?.css).not.toContain('@source inline')
  })

  it('preserves mixed generated and custom bundled css for Tailwind v4 web target fallback', async () => {
    const runtimeSet = new Set(['inline-flex'])
    const generatedCss = '.inline-flex{display:inline-flex}'
    const rawSource = [
      '/*! tailwindcss v4.3.0 | MIT License | https://tailwindcss.com */',
      '.items-center{align-items:center}',
      '.home-v5{display:flex;color:#0f172a}',
    ].join('\n')
    const generateMock = vi.fn(async ({ target }: { target: string }) => ({
      css: generatedCss,
      rawCss: '.different-generated-output{display:block}',
      target,
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      ...createDefaultGeneratorMock(),
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: code }))
    const result = await generateCssByGenerator({
      opts: {
        generator: {
          target: 'web',
        },
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource,
      file: 'styles.css',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'styles.css',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'styles.css',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(result?.css).toContain(generatedCss)
    expect(result?.css).toContain('.items-center{align-items:center}')
    expect(result?.css).toContain('.home-v5{display:flex;color:#0f172a}')
  })

  it('reuses transformed legacy compat css for stable source during hmr', async () => {
    const firstRuntimeSet = new Set(['bg-blue-500'])
    const secondRuntimeSet = new Set(['bg-red-500'])
    const rawSource = '@import "tailwindcss";\n.card{color:red}'
    const generateMock = vi.fn(async (options: any) => {
      const candidate = [...options.candidates][0]
      return {
        css: `.${candidate}{background-color:red}`,
        rawCss: `.${candidate}{background-color:red}`,
        target: 'weapp',
        classSet: options.candidates,
        dependencies: [],
        sources: [],
        root: null,
      }
    })

    vi.doMock('@/generator', () => ({
      ...createDefaultGeneratorMock(),
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: `legacy:${code}` }))
    const baseOptions = {
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      rawSource,
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    }

    const first = await generateCssByGenerator({
      ...baseOptions,
      runtime: firstRuntimeSet,
    })
    const second = await generateCssByGenerator({
      ...baseOptions,
      runtime: secondRuntimeSet,
    })

    expect(first?.css).toContain('legacy:.card{color:red}')
    expect(second?.css).toContain('legacy:.card{color:red}')
    expect(styleHandler).toHaveBeenCalledTimes(1)
  })

  it('treats weapp-tailwindcss imports as Tailwind v4 source entries when import fallback is enabled', async () => {
    const runtimeSet = new Set(['w-[100px]'])
    const rawSource = '@import "weapp-tailwindcss";\n.card{color:red}'
    const rawTailwindCss = '/*! tailwindcss v4.2.4 | MIT License | https://tailwindcss.com */\n.w-\\[100px\\]{width:100px}'
    const weappCss = '.w-_b100px_B{width:100px}'
    const resolveTailwindV4Source = vi.fn(async (options: any) => ({
      projectRoot: process.cwd(),
      base: options.base,
      baseFallbacks: [],
      css: options.css,
      dependencies: [],
    }))
    const generateMock = vi.fn(async () => ({
      css: weappCss,
      rawCss: rawTailwindCss,
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      ...createDefaultGeneratorMock({
        resolveTailwindV4Source,
      }),
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: `legacy:${code}` }))
    const result = await generateCssByGenerator({
      opts: {
        generator: {
          importFallback: true,
        },
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource,
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(result).toMatchObject({
      css: `${weappCss}\nlegacy:.card{color:red}`,
      target: 'weapp',
      source: 'generator',
      dependencies: [],
    })
    expect(result?.classSet).toEqual(new Set(['w-[100px]']))
    expect(resolveTailwindV4Source).toHaveBeenCalledWith(expect.objectContaining({
      css: '@import "tailwindcss";\n.card{color:red}',
    }))
    expect(styleHandler).toHaveBeenCalledWith('.card{color:red}', expect.objectContaining({
      isMainChunk: true,
    }))
  })

  it('does not treat weapp-tailwindcss imports as the current Tailwind source entry when import fallback is disabled', async () => {
    const runtimeSet = new Set(['w-[100px]'])
    const rawSource = '@import "weapp-tailwindcss";'
    const resolveTailwindV4Source = vi.fn(async (options: any) => ({
      projectRoot: process.cwd(),
      base: options.base,
      baseFallbacks: [],
      css: options.css,
      dependencies: [],
    }))
    const resolveTailwindV4SourceFromRuntime = vi.fn(async () => ({
      projectRoot: process.cwd(),
      base: process.cwd(),
      baseFallbacks: [],
      css: '@import "tailwindcss";',
      dependencies: [],
    }))
    const generateMock = vi.fn(async () => ({
      css: '.w-_b100px_B{width:100px}',
      rawCss: '.w-\\[100px\\]{width:100px}',
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      ...createDefaultGeneratorMock({
        resolveTailwindV4Source,
        resolveTailwindV4SourceFromRuntime,
      }),
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: code }))
    const result = await generateCssByGenerator({
      opts: {
        generator: {
          importFallback: false,
        },
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource,
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(resolveTailwindV4Source).not.toHaveBeenCalledWith(expect.objectContaining({
      css: rawSource,
    }))
    expect(resolveTailwindV4SourceFromRuntime).toHaveBeenCalled()
  })

  it('normalizes duplicate fallback imports before resolving Tailwind v4 source', async () => {
    const { resolveCssEntrySource } = await import('@/generation/index')
    const source = resolveCssEntrySource(
      '@import "tailwindcss";\n@import "weapp-tailwindcss";\n@import "weapp-tailwindcss/theme.css";',
      process.cwd(),
      { importFallback: true, removeConfig: false },
    )

    expect(source?.css).toBe('@import "tailwindcss";\n@import "tailwindcss/theme.css";')
  })

  it('extracts Tailwind directives from Sass and Less sources when PostCSS cannot parse them', async () => {
    const { hasTailwindSourceDirectives, resolveCssEntrySource } = await import('@/generation/index')
    const rawSource = [
      '$brand: #123456;',
      '// sass comment',
      '@import "tailwindcss";',
      '@import "weapp-tailwindcss";',
      '@config "./tailwind.config.ts";',
      '@source inline("w-[100px] text-[#123456]");',
      '@reference "tailwindcss";',
      '.card {',
      '  color: $brand;',
      '  @include rounded;',
      '  .title { color: red; }',
      '}',
    ].join('\n')

    expect(hasTailwindSourceDirectives(rawSource, { importFallback: true })).toBe(true)

    const source = resolveCssEntrySource(rawSource, __dirname, {
      importFallback: true,
      removeConfig: false,
    })

    expect(source).toEqual(expect.objectContaining({
      css: [
        '@import "tailwindcss";',
        '@config "./tailwind.config.ts";',
        '@source inline("w-[100px] text-[#123456]");',
        '@reference "tailwindcss";',
      ].join('\n'),
      base: __dirname,
    }))
    expect(source?.css).not.toContain('$brand')
    expect(source?.css).not.toContain('@include')
  })

  it('keeps Tailwind v4 @plugin option blocks from preprocessor sources', async () => {
    const { normalizeTailwindSourceForGenerator, resolveCssEntrySource } = await import('@/generation/index')
    const rawSource = [
      '$brand: #123456;',
      '@import "tailwindcss";',
      '@plugin "@iconify/tailwind4" {',
      '  prefix: "iconify";',
      '  scale: 1.2;',
      '}',
      '@source inline("iconify-[mdi--home]");',
      '.card { color: $brand; }',
    ].join('\n')
    const expected = [
      '@import "tailwindcss";',
      '@source inline("iconify-[mdi--home]");',
      '@plugin "@iconify/tailwind4" {',
      '  prefix: "iconify";',
      '  scale: 1.2;',
      '}',
    ].join('\n')

    expect(normalizeTailwindSourceForGenerator(rawSource)).toBe(expected)
    expect(resolveCssEntrySource(rawSource, __dirname)?.css).toBe(expected)
  })

  it('detects complex Tailwind v4 directive sources through shared PostCSS analysis', async () => {
    const {
      hasTailwindApplyDirective,
      hasTailwindNonRootGenerationDirectives,
      hasTailwindRootDirectives,
      hasTailwindSourceDirectives,
    } = await import('@/generation/directives')
    const rawSource = [
      '@import "weapp-tailwindcss";',
      '@plugin "@iconify/tailwind4" {',
      '  prefix: "i";',
      '}',
      '@custom-variant any-hover {',
      '  @media (any-hover: hover) {',
      '    &:hover {',
      '      @slot;',
      '    }',
      '  }',
      '}',
      '.btn {',
      '  @apply flex flex-col gap-3 rounded-[28rpx] text-white;',
      '}',
    ].join('\n')

    expect(hasTailwindRootDirectives(rawSource, { importFallback: true })).toBe(true)
    expect(hasTailwindSourceDirectives(rawSource, { importFallback: true })).toBe(true)
    expect(hasTailwindNonRootGenerationDirectives(rawSource, { importFallback: true })).toBe(true)
    expect(hasTailwindApplyDirective(rawSource)).toBe(true)
  })

  it('normalizes registered generator sources from preprocessor syntax', async () => {
    const { normalizeTailwindSourceForGenerator, removeTailwindSourceDirectives } = await import('@/generation/index')
    const rawSource = [
      '// source comment',
      '$brand: #123456;',
      '@import "weapp-tailwindcss";',
      '@config "./tailwind.config.ts";',
      '@source inline("w-[100px]");',
      '.card { color: $brand; }',
    ].join('\n')

    expect(normalizeTailwindSourceForGenerator(rawSource, { importFallback: true })).toBe([
      '@import "tailwindcss";',
      '@config "./tailwind.config.ts";',
      '@source inline("w-[100px]");',
    ].join('\n'))
    expect(removeTailwindSourceDirectives(rawSource, { importFallback: true })).toBe('')
  })

  it('keeps Tailwind layer blocks from preprocessor sources when extracting fallback sources', async () => {
    const { normalizeTailwindSourceForGenerator, removeTailwindSourceDirectives, resolveCssEntrySource } = await import('@/generation/index')
    const { hasTailwindApplyDirective } = await import('@/generation/directives')
    const rawSource = [
      '$brand: #123456;',
      '@use "tailwindcss";',
      '@layer components {',
      '  .raw-btn {',
      '    // formatter note',
      '    @apply after:border-none inline-flex items-center gap-[8rpx] rounded-[8rpx] text-[24rpx] font-[600] transition-all;',
      '  }',
      '',
      '  .btn {',
      '    // use custom raw-btn',
      '    @apply raw-btn bg-gradient-to-r from-[#9e58e9] to-blue-500 px-2 py-1 text-white w-[137px];',
      '  }',
      '}',
      '.card { color: $brand; }',
    ].join('\n')
    const expectedLayer = [
      '@layer components {',
      '  .raw-btn {',
      '    @apply after:border-none inline-flex items-center gap-[8rpx] rounded-[8rpx] text-[24rpx] font-[600] transition-all;',
      '  }',
      '  .btn {',
      '    @apply raw-btn bg-gradient-to-r from-[#9e58e9] to-blue-500 px-2 py-1 text-white w-[137px];',
      '  }',
      '}',
    ].join('\n')

    expect(hasTailwindApplyDirective(rawSource)).toBe(true)
    expect(normalizeTailwindSourceForGenerator(rawSource)).toBe([
      '@import "tailwindcss";',
      expectedLayer,
    ].join('\n'))
    expect(resolveCssEntrySource(rawSource, __dirname)?.css).toBe([
      '@import "tailwindcss";',
      expectedLayer,
    ].join('\n'))
    expect(removeTailwindSourceDirectives(rawSource)).toBe(expectedLayer)
  })

  it('keeps fallback layer blocks with Less variables and quoted double-slash values', async () => {
    const { normalizeTailwindSourceForGenerator, removeTailwindSourceDirectives } = await import('@/generation/index')
    const rawSource = [
      '@brand: #123456;',
      '@import "tailwindcss";',
      '@layer components {',
      '  .asset-card {',
      '    --asset-url: "https://example.com/a//b";',
      '    // less comment',
      '    @apply flex items-center text-sm;',
      '  }',
      '}',
      '.card { color: @brand; }',
    ].join('\n')
    const expectedLayer = [
      '@layer components {',
      '  .asset-card {',
      '    --asset-url: "https://example.com/a//b";',
      '    @apply flex items-center text-sm;',
      '  }',
      '}',
    ].join('\n')

    expect(normalizeTailwindSourceForGenerator(rawSource)).toBe([
      '@import "tailwindcss";',
      expectedLayer,
    ].join('\n'))
    expect(removeTailwindSourceDirectives(rawSource)).toBe(expectedLayer)
  })

  it('keeps Tailwind v4 top-level layer statements when extracting fallback sources', async () => {
    const { normalizeTailwindSourceForGenerator } = await import('@/generation/index')
    const rawSource = [
      '// force fallback extraction',
      '@layer theme, base, components, utilities;',
      '@import "tailwindcss/theme.css" layer(theme);',
      '@import "tailwindcss/utilities.css" layer(utilities) source(none);',
      '@source "../index.html";',
      '$brand: #123456;',
      '.card { color: $brand; }',
    ].join('\n')

    expect(normalizeTailwindSourceForGenerator(rawSource, { importFallback: true })).toBe([
      '@layer theme, base, components, utilities;',
      '@import "tailwindcss/theme.css" layer(theme);',
      '@import "tailwindcss/utilities.css" layer(utilities) source(none);',
      '@source "../index.html";',
    ].join('\n'))
  })

  it('extracts Tailwind v4 @tailwind directives from Less sources', async () => {
    const { resolveCssEntrySource } = await import('@/generation/index')
    const rawSource = [
      '@brand: #123456;',
      '// less comment',
      '@tailwind base;',
      '@tailwind components;',
      '@tailwind utilities;',
      '.card { color: @brand; }',
    ].join('\n')
    const source = resolveCssEntrySource(rawSource, __dirname)

    expect(source?.css).toBe([
      '@tailwind base;',
      '@tailwind components;',
      '@tailwind utilities;',
    ].join('\n'))
  })

  it('extracts Tailwind v4 Sass @use root imports before preprocessing', async () => {
    const { hasTailwindSourceDirectives, resolveCssEntrySource } = await import('@/generation/index')
    const { hasTailwindRootDirectives } = await import('@/generation/directives')
    const rawSource = [
      '$brand: #123456;',
      '@use "tailwindcss";',
      '.page {',
      '  color: $brand;',
      '}',
    ].join('\n')

    expect(hasTailwindRootDirectives(rawSource)).toBe(true)
    expect(hasTailwindSourceDirectives(rawSource)).toBe(true)

    const source = resolveCssEntrySource(rawSource, __dirname)
    expect(source).toEqual(expect.objectContaining({
      css: [
        '@import "tailwindcss";',
      ].join('\n'),
      base: __dirname,
    }))
    expect(source?.css).not.toContain('$brand')
    expect(source?.css).not.toContain('@use')
  })

  it('generates Tailwind v4 css from package.json subpath imports in default auto mode', async () => {
    const runtimeSet = new Set(['w-[100px]'])
    const rawSource = '@import "#tailwind.css";\n.card{color:red}'
    const rawTailwindCss = '/*! tailwindcss v4.2.4 | MIT License | https://tailwindcss.com */\n.w-\\[100px\\]{width:100px}.card{color:red}'
    const weappCss = '.w-_b100px_B{width:100px}.card{color:red}'
    const resolveTailwindV4Source = vi.fn(async (options: any) => ({
      projectRoot: process.cwd(),
      base: options.base,
      baseFallbacks: [],
      css: options.css,
      dependencies: [],
    }))
    const generateMock = vi.fn(async () => ({
      css: weappCss,
      rawCss: rawTailwindCss,
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      ...createDefaultGeneratorMock(),
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      resolveTailwindV4Source,
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: code }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource,
      file: 'src/app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'src/app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'src/app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(result?.css).toContain(weappCss)
    expect(resolveTailwindV4Source).toHaveBeenCalledWith(expect.objectContaining({
      base: path.resolve('src'),
      css: expect.stringContaining(rawSource),
    }))
    expect(styleHandler).not.toHaveBeenCalled()
  })

  it('generates Tailwind v4 main css from registered css sources without css entries', async () => {
    const runtimeSet = new Set(['text-[23px]'])
    const rawSource = '@import "tailwindcss" source(none);\n@source "../src/**/*.{tsx}";'
    const generateMock = vi.fn(async (options: any) => {
      const suffix = [...options.candidates].join('-')
      return {
        css: `.generated-${suffix}{color:red}`,
        rawCss: `.generated-${suffix}{color:red}`,
        target: 'weapp',
        classSet: new Set(options.candidates),
        dependencies: [],
        sources: [],
        root: null,
      }
    })
    const cssSources = [
      {
        file: path.resolve('src/app.css'),
        base: path.resolve('src'),
        css: rawSource,
      },
    ]
    const resolveTailwindV4Source = vi.fn(async (options: any) => ({
      projectRoot: process.cwd(),
      base: firstResolvedCssSourceOption(options).base ?? process.cwd(),
      baseFallbacks: [],
      css: firstResolvedCssSourceOption(options).css ?? '@import "tailwindcss";',
      dependencies: [],
    }))

    vi.doMock('@/generator', () => ({
      ...createDefaultGeneratorMock({
        resolveTailwindV4Source,
        resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
          projectRoot: process.cwd(),
          baseFallbacks: [],
          cssSources,
        })),
      }),
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: code }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: '.page{}',
      file: 'dist/app-origin.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'dist/app-origin.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        majorVersion: 4,
      } as any,
      cssSources,
      getSourceCandidatesForEntries: vi.fn(() => runtimeSet),
      styleHandler,
      debug: vi.fn(),
    })

    expect(result?.css).toContain('.generated-text-[23px]{color:red}')
    expect(resolveTailwindV4Source).toHaveBeenCalledWith(expect.objectContaining({
      base: cssSources[0]!.base,
      css: cssSources[0]!.css,
    }))
    expect(generateMock).toHaveBeenCalledWith(expect.objectContaining({
      candidates: runtimeSet,
      scanSources: false,
    }))
  })

  it('uses Tailwind v4 generation mode from the fallback runtime major version', async () => {
    const runtimeSet = new Set(['w-[100px]'])
    const rawSource = '@import "tailwindcss";'
    const generateMock = vi.fn(async () => ({
      css: '.w-_b100px_B{width:100px}',
      rawCss: '.w-\\[100px\\]{width:100px}',
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))
    const resolveTailwindV4SourceFromRuntime = vi.fn(async () => ({
      projectRoot: process.cwd(),
      base: process.cwd(),
      baseFallbacks: [],
      css: '@import "tailwindcss";',
      dependencies: [],
    }))
    const resolveTailwindV4Source = vi.fn(async (options: any) => ({
      projectRoot: process.cwd(),
      base: options.base,
      baseFallbacks: [],
      css: options.css,
      dependencies: [],
    }))

    vi.doMock('@/generator', () => ({
      ...createDefaultGeneratorMock({        resolveTailwindV4SourceFromRuntime,
        resolveTailwindV4Source,
      }),
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: code }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource,
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(result?.css).toBe('.w-_b100px_B{width:100px}')
    expect(resolveTailwindV4Source).toHaveBeenCalledWith(expect.objectContaining({
      css: rawSource,
    }))
    expect(resolveTailwindV4SourceFromRuntime).not.toHaveBeenCalled()
    expect(generateMock).toHaveBeenCalledWith(expect.objectContaining({
      incrementalCache: true,
      scanSources: false,
      target: 'weapp',
    }))
  })

  it('appends legacy-only selectors for force mode even when raw css matches', async () => {
    const runtimeSet = new Set(['w-[100px]'])
    const rawTailwindCss = '/*! tailwindcss v4.2.4 | MIT License | https://tailwindcss.com */\n.container{width:100%}.w-\\[100px\\]{width:100px}'
    const generateMock = vi.fn(async () => ({
      css: '.w-_b100px_B{width:100px}',
      rawCss: rawTailwindCss,
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source: vi.fn(async (options: any) => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: options.css,
        dependencies: [],
      })),
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: process.cwd(),
        baseFallbacks: [],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({
      css: code.replace('/*! tailwindcss v4.2.4 | MIT License | https://tailwindcss.com */\n', ''),
    }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: rawTailwindCss,
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(result?.css).toBe('.w-_b100px_B{width:100px}')
    expect(styleHandler).not.toHaveBeenCalledWith(
      expect.stringContaining('.container{width:100%}'),
      expect.anything(),
    )
  })

  it('does not append container compatibility for weapp when @config disables container in an external config file', async () => {
    const runtimeSet = new Set(['w-[100px]'])
    const projectRoot = path.resolve(__dirname, '../fixtures/generator-css-container-config')
    const cssFile = path.join(projectRoot, 'app.wxss')
    const configFile = path.join(projectRoot, 'tailwind.config.js')
    const rawTailwindCss = '@import "tailwindcss";\n@config "./tailwind.config.js";\n.w-\\[100px\\]{width:100px}'
    const generateMock = vi.fn(async () => ({
      css: '.w-_b100px_B{width:100px}',
      rawCss: rawTailwindCss,
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('node:fs', async (importOriginal) => ({
      ...await importOriginal<typeof import('node:fs')>(),
      existsSync: vi.fn((file: string) => file === configFile),
      readFileSync: vi.fn((file: string) => {
        if (file === configFile) {
          return 'export default { corePlugins: { container: false } }'
        }
        throw new Error(`unexpected readFileSync: ${file}`)
      }),
    }))
    vi.doMock('@/generator', () => createDefaultGeneratorMock({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot,
        cwd: projectRoot,
        baseFallbacks: [],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: code.replaceAll('rem', 'rpx') }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: rawTailwindCss,
      file: cssFile,
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: cssFile,
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: cssFile,
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(result?.css).toContain('.w-_b100px_B{width:100px}')
    expect(result?.css).not.toContain('.container')
    expect(result?.css).not.toContain('max-width: 40rpx')
  })

  it('does not append container compatibility for weapp in force fallback branch', async () => {
    const runtimeSet = new Set(['w-[100px]'])
    const rawTailwindCss = '.other{color:red}.w-\\[100px\\]{width:100px}'
    const generateMock = vi.fn(async () => ({
        css: '.w-_b100px_B{width:100px}',
        rawCss: '.unknown{color:blue}.w-\\[100px\\]{width:100px}',
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => createDefaultGeneratorMock({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: '@import "tailwindcss";\n@config "./container.config.js";',
        dependencies: [],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: code }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: rawTailwindCss,
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(result?.source).toBe('generator')
    expect(result?.css).not.toContain('.container')
    expect(result?.css).not.toContain('.other{color:red}')
  })

  it('forwards top-level unit transform options to generator css handling', async () => {
    const runtimeSet = new Set(['m-5', 'p-4'])
    const rawTailwindCss = '/*! tailwindcss v4.2.4 | MIT License | https://tailwindcss.com */\n.m-5{margin:20px}.p-4{padding:1rem}'
    const generateMock = vi.fn(async () => ({
      css: '.m-5{margin:40rpx}.p-4{padding:32rpx}',
      rawCss: rawTailwindCss,
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source: vi.fn(async (options: any) => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: options.css,
        dependencies: [],
      })),
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: process.cwd(),
        baseFallbacks: [],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: `legacy:${code}` }))
    const result = await generateCssByGenerator({
      opts: {
        platform: 'weapp',
        rem2rpx: true,
        px2rpx: {
          designWidth: 750,
          platform: 'weapp',
        },
        unitConversion: {
          platforms: {
            weapp: {
              rules: [
                { from: 'px', to: 'rpx', factor: 2 },
              ],
            },
          },
        },
        cssChildCombinatorReplaceValue: ['view', 'text'],
        cssRemoveHoverPseudoClass: true,
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: rawTailwindCss,
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(result?.css).toBe('.m-5{margin:40rpx}.p-4{padding:32rpx}')
    expect(generateMock).toHaveBeenCalledWith(expect.objectContaining({
      styleOptions: expect.objectContaining({
        rem2rpx: true,
        px2rpx: expect.objectContaining({
          designWidth: 750,
          platform: 'weapp',
        }),
        unitConversion: {
          platforms: {
            weapp: {
              rules: [
                { from: 'px', to: 'rpx', factor: 2 },
              ],
            },
          },
        },
        platform: 'weapp',
        cssChildCombinatorReplaceValue: ['view', 'text'],
        cssRemoveHoverPseudoClass: true,
        isMainChunk: true,
        majorVersion: 4,
      }),
    }))
  })

  it('inherits legacy rpx declarations for generated selectors', async () => {
    const runtimeSet = new Set(['m-[20px]', 'mt-2'])
    const rawTailwindCss = '/*! tailwindcss v4.2.4 | MIT License | https://tailwindcss.com */\n.m-\\[20px\\]{margin:20px}.-mt-2{margin-top:-0.5rem}'
    const legacyCss = '/*! tailwindcss v4.2.4 | MIT License | https://tailwindcss.com */\n.m-\\[20px\\]{margin:40rpx}.-mt-2{margin-top:-16rpx}'
    const generateMock = vi.fn(async () => ({
      css: '.m-_b20px_B{margin:20px}.-mt-2{margin-top:-0.5rem}',
      rawCss: rawTailwindCss,
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source: vi.fn(async (options: any) => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: options.css,
        dependencies: [],
      })),
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: process.cwd(),
        baseFallbacks: [],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: code }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: legacyCss,
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(result?.css).toContain('.m-_b20px_B{margin:40rpx}')
    expect(result?.css).toContain('.-mt-2{margin-top:-16rpx}')
    expect(result?.css).not.toContain('margin:20px')
    expect(result?.css).not.toContain('margin-top:-0.5rem')
  })

  it('passes appended user css through the mini-program style handler', async () => {
    const runtimeSet = new Set(['w-[100px]'])
    const rawTailwindCss = '/*! tailwindcss v4.2.4 | MIT License | https://tailwindcss.com */\n.w-\\[100px\\]{width:100px}'
    const userCss = '\n.card:hover{color:red}'
    const generateMock = vi.fn(async () => ({
      css: '.w-_b100px_B{width:100px}',
      rawCss: rawTailwindCss,
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      resolveTailwindV4Source: vi.fn(async (options: any) => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: options.css,
        dependencies: [],
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: `user:${code}` }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: `${rawTailwindCss}${userCss}`,
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(result?.css).toBe(`.w-_b100px_B{width:100px}\nuser:${userCss}`)
    expect(styleHandler).toHaveBeenCalledWith(userCss, expect.objectContaining({
      isMainChunk: false,
    }))
  })

  it('preserves appended native element user css through Tailwind v4 generator output', async () => {
    const runtimeSet = new Set(['w-[100px]'])
    const rawTailwindCss = '/*! tailwindcss v4.2.4 | MIT License | https://tailwindcss.com */\n.w-\\[100px\\]{width:100px}'
    const userCss = [
      '',
      'view{box-sizing:border-box;--weapp-tw-native-view-regression:1}',
      'text{box-sizing:border-box;--weapp-tw-native-text-regression:1}',
      'button{box-sizing:border-box;--weapp-tw-native-button-regression:1}',
      'input{box-sizing:border-box;--weapp-tw-native-input-regression:1}',
    ].join('\n')
    const generateMock = vi.fn(async () => ({
      css: '.w-_b100px_B{width:100px}',
      rawCss: rawTailwindCss,
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      resolveTailwindV4Source: vi.fn(async (options: any) => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: options.css,
        dependencies: [],
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: code }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: `${rawTailwindCss}${userCss}`,
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(result?.css).toContain('.w-_b100px_B{width:100px}')
    expect(result?.css).toContain('--weapp-tw-native-view-regression:1')
    expect(result?.css).toContain('--weapp-tw-native-text-regression:1')
    expect(result?.css).toContain('--weapp-tw-native-button-regression:1')
    expect(result?.css).toContain('--weapp-tw-native-input-regression:1')
    expect(styleHandler).toHaveBeenCalledWith(userCss, expect.objectContaining({
      isMainChunk: false,
    }))
  })

  it('appends missing native element user css when matched Tailwind v4 source markers are already represented', async () => {
    const runtimeSet = new Set(['w-[100px]'])
    const userCss = [
      '.weapp-tw-dynamic-regression{min-width:0}',
      'view{box-sizing:border-box;--weapp-tw-native-view-regression:1}',
      'text{box-sizing:border-box;--weapp-tw-native-text-regression:1}',
    ].join('\n')
    const generateMock = vi.fn(async () => ({
      css: [
        '.w-_b100px_B{width:100px}',
        '.weapp-tw-dynamic-regression{min-width:0}',
      ].join('\n'),
      rawCss: '.w-\\[100px\\]{width:100px}',
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [
        withTestGeneratorSourceMetadata({}, {
          matchedCssSourceFile: 'app.wxss',
        }),
      ],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      resolveTailwindV4Source: vi.fn(async (options: any) => withTestGeneratorSourceMetadata({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: options.css,
        dependencies: [],
      }, {
        matchedCssSourceFile: 'app.wxss',
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: code }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: [
        '@import "tailwindcss" source(none);',
        '@source "../src/**/*.{ts,tsx}";',
        userCss,
      ].join('\n'),
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(result?.css.match(/\.weapp-tw-dynamic-regression/g)).toHaveLength(1)
    expect(result?.css).toContain('--weapp-tw-native-view-regression:1')
    expect(result?.css).toContain('--weapp-tw-native-text-regression:1')
  })

  it('keeps user css before Tailwind v4 generated css when source order places it first', async () => {
    const runtimeSet = new Set(['flex'])
    const userCss = '.reset-button{display:block}'
    const rawTailwindCss = '/*! tailwindcss v4.2.4 | MIT License | https://tailwindcss.com */\n.flex{display:flex}'
    const generateMock = vi.fn(async () => ({
      css: '.flex{display:flex}',
      rawCss: rawTailwindCss,
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source: vi.fn(async (options: any) => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: options.css,
        dependencies: [],
      })),
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: `user:${code}` }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: `${userCss}\n${rawTailwindCss}`,
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(result?.css).toBe(`user:${userCss}\n.flex{display:flex}`)
    expect(result?.css.indexOf('.reset-button')).toBeLessThan(result?.css.indexOf('.flex') ?? -1)
    expect(styleHandler).toHaveBeenCalledWith(`${userCss}\n`, expect.objectContaining({
      isMainChunk: false,
    }))
  })

  it('keeps user css before Tailwind v4 generated css when a generator placeholder marks the Tailwind position', async () => {
    const runtimeSet = new Set(['flex'])
    const userCss = '.reset-button{display:block}'
    const rawTailwindCss = '.flex{display:flex}'
    const generateMock = vi.fn(async () => ({
      css: '.flex{display:flex}',
      rawCss: rawTailwindCss,
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
      resolveTailwindV4Source: vi.fn(async (options: any) => ({
        projectRoot: process.cwd(),
        base: options.base ?? process.cwd(),
        baseFallbacks: [],
        css: options.css,
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        packageName: 'tailwindcss',
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: `user:${code}` }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: `${userCss}\n/*! weapp-tailwindcss generator-placeholder */`,
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(result?.css).toBe(`user:${userCss}\n.flex{display:flex}`)
    expect(result?.css.indexOf('.reset-button')).toBeLessThan(result?.css.indexOf('.flex') ?? -1)
    expect(styleHandler).toHaveBeenCalledWith(`${userCss}\n`, expect.objectContaining({
      isMainChunk: false,
    }))
  })

  it('does not restore raw local css imports into Tailwind v4 web generator output', async () => {
    const runtimeSet = new Set(['flex'])
    const rawTailwindCss = '/*! tailwindcss v4.3.1 | MIT License | https://tailwindcss.com */\n.flex{display:flex}'
    const generateMock = vi.fn(async () => ({
      css: '.flex{display:flex}',
      rawCss: rawTailwindCss,
      target: 'web',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
      resolveTailwindV4Source: vi.fn(async (options: any) => ({
        projectRoot: process.cwd(),
        base: options.base ?? process.cwd(),
        baseFallbacks: [],
        css: options.css,
        dependencies: [],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: `user:${code}` }))
    const result = await generateCssByGenerator({
      opts: {
        generator: {
          target: 'web',
        },
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: [
        '@import "./theme.css";',
        '@import "tailwindcss";',
        '@source inline("flex");',
      ].join('\n'),
      file: '/project/src/app.css',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: '/project/src/app.css',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: '/project/src/app.css',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
      restoreLocalCssImports: false,
    })

    expect(result?.css).toContain('.flex{display:flex}')
    expect(result?.css).not.toContain('@import "./theme.css"')
    expect(result?.css).not.toContain('@import "tailwindcss"')
  })

  it('keeps user css before Tailwind v4 base and theme rules when final css is hoisted', async () => {
    const runtimeSet = new Set(['flex'])
    const userCss = [
      '.reset-button{padding:0;background-color:transparent;font-size:inherit;line-height:inherit;color:inherit}',
      '.reset-button::after{border:none}',
    ].join('\n')
    const rawTailwindCss = '.flex{display:flex}'
    const weappCss = [
      'view,text,::after,::before{box-sizing:border-box;margin:0;padding:0;border:0 solid}',
      ':host,page,.tw-root,wx-root-portal-content{--color-blue-500:rgb(50,128,255)}',
      '.flex{display:flex}',
    ].join('\n')
    const generateMock = vi.fn(async () => ({
      css: weappCss,
      rawCss: rawTailwindCss,
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: code }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: `${userCss}\n/*! weapp-tailwindcss generator-placeholder */`,
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    const css = result?.css ?? ''
    expect(css.indexOf('.reset-button')).toBeLessThan(css.indexOf('view,text,::after,::before'))
    expect(css.indexOf('.reset-button')).toBeLessThan(css.indexOf(':host,page,.tw-root,wx-root-portal-content'))
    expect(css.indexOf('view,text,::after,::before')).toBeLessThan(css.indexOf('.flex'))
    expect(css.indexOf(':host,page,.tw-root,wx-root-portal-content')).toBeLessThan(css.indexOf('.flex'))
  })

  it('removes Tailwind display-p3 supports from exact split user css', async () => {
    const runtimeSet = new Set(['bg-blue-500'])
    const rawTailwindCss = '/*! tailwindcss v4.2.4 | MIT License | https://tailwindcss.com */\n.bg-blue-500{background-color:var(--color-blue-500)}'
    const displayP3Css = [
      '',
      ':host,page,.tw-root,wx-root-portal-content{--color-blue-500:rgb(50, 128, 255)}',
      '@supports (color: color(display-p3 0 0 0%)){',
      ':host,page,.tw-root,wx-root-portal-content{--color-blue-500:color(display-p3 0.26642 0.49122 0.98862)}',
      '}',
      '.card{color:var(--color-blue-500)}',
    ].join('\n')
    const generateMock = vi.fn(async () => ({
      css: '.bg-blue-500{background-color:var(--color-blue-500)}',
      rawCss: rawTailwindCss,
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: `user:${code}` }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: `${rawTailwindCss}${displayP3Css}`,
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(result?.css).toContain('.card{color:var(--color-blue-500)}')
    expect(result?.css).not.toContain('@supports')
    expect(result?.css).not.toContain('display-p3')
    expect(styleHandler.mock.calls[0]?.[0]).not.toContain('@supports')
    expect(styleHandler.mock.calls[0]?.[0]).not.toContain('display-p3')
  })

  it('does not append official tailwind css prefix as user css in forced generation', async () => {
    const runtimeSet = new Set(['w-[100px]', 'text-red-500'])
    const rawSource = '.w-\\[100px\\]{width:100px}'
    const rawTailwindCss = `${rawSource}.text-red-500{color:red}`
    const weappCss = '.w-_b100px_B{width:100px}.text-red-500{color:red}'
    const generateMock = vi.fn(async () => ({
      css: weappCss,
      rawCss: rawTailwindCss,
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: `user:${code}` }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource,
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(result?.css).toContain(weappCss)
    expect(styleHandler).not.toHaveBeenCalled()
  })

  it('removes Tailwind source directives when force generation owns raw css input', async () => {
    const runtimeSet = new Set(['w-[100px]'])
    const rawSource = [
      '@config "./tailwind.config.js";',
      '@import "tailwindcss";',
      '@source "./src";',
      '@theme { --color-brand: #123456; }',
      '.card:hover{color:red}',
    ].join('\n')
    const generateMock = vi.fn(async () => ({
      css: '.w-_b100px_B{width:100px}',
      rawCss: '/*! tailwindcss v4.2.4 | MIT License | https://tailwindcss.com */\n.w-\\[100px\\]{width:100px}',
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source: vi.fn(async (options: any) => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: options.css,
        dependencies: [],
      })),
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: process.cwd(),
        baseFallbacks: [],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: `user:${code}` }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource,
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(result?.css).toBe('.w-_b100px_B{width:100px}\nuser:.card:hover{color:red}')
    expect(styleHandler).toHaveBeenCalledTimes(1)
    expect(styleHandler.mock.calls[0]?.[0]).not.toContain('@import "tailwindcss"')
    expect(styleHandler.mock.calls[0]?.[0]).not.toContain('@source')
    expect(styleHandler.mock.calls[0]?.[0]).not.toContain('@theme')
    expect(styleHandler.mock.calls[0]?.[0]).toContain('.card:hover')
  })

  it('removes Tailwind v4 directives from legacy compat css after an unclosed imported rule', async () => {
    const runtimeSet = new Set(['w-[100px]'])
    const rawSource = [
      ':host,page,.tw-root,wx-root-portal-content {',
      '  --third-party-color: #303133;',
      '@config "../tailwind.config.js";',
      '@tailwind base;',
      '@tailwind components;',
      '@tailwind utilities;}',
      '.raw-btn {',
      '@apply after:border-none inline-flex items-center;',
      '}',
    ].join('\n')
    const generateMock = vi.fn(async () => ({
      css: '.w-_b100px_B{width:100px}',
      rawCss: '.w-\\[100px\\]{width:100px}',
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      ...createDefaultGeneratorMock(),
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: code }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource,
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(result?.css).toContain('.w-_b100px_B{width:100px}')
    expect(result?.css).toContain('--third-party-color: #303133')
    expect(result?.css).not.toMatch(/@(config|tailwind|apply)\b/)
  })

  it('keeps local import wrapper assets out of forced generator replacement', async () => {
    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: `legacy:${code}` }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: new Set(['w-[100px]']),
      rawSource: '@import "styles/app252bdc3c.wxss";\n',
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(result).toBeUndefined()
    expect(styleHandler).not.toHaveBeenCalled()
  })

  it('removes Tailwind source directives from local import wrapper assets', async () => {
    const runtimeSet = new Set(['w-[100px]'])
    const generateMock = vi.fn(async () => ({
      css: '.w-_b100px_B{width:100px}',
      rawCss: '.w-\\[100px\\]{width:100px}',
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      ...createDefaultGeneratorMock(),
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: code }))
    const result = await generateCssByGenerator({
      opts: {
        generator: {
          target: 'weapp',
        },
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: '@import "./index.wxss";\n@source "../src";',
      file: 'styles/app.wxss',
      cssHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'styles/app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'styles/app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(result?.css).toBe('/* webpackIgnore: true */\n@import "./index.wxss";')
    expect(result?.css).not.toContain('@source')
    expect(styleHandler).not.toHaveBeenCalled()
    expect(generateMock).not.toHaveBeenCalled()
  })

  it('uses forced generator for ordinary main css assets backed by configured Tailwind source', async () => {
    const runtimeSet = new Set(['w-[100px]'])
    const rawSource = '.third-party:hover{color:red}'
    const rawTailwindCss = '.w-\\[100px\\]{width:100px}'
    const weappCss = '.w-_b100px_B{width:100px}'
    const generateMock = vi.fn(async () => ({
      css: weappCss,
      rawCss: rawTailwindCss,
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: `legacy:${code}` }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource,
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
      forceGenerator: true,
    })

    expect(result?.css).toBe(`${weappCss}\nlegacy:.third-party:hover{color:red}`)
    expect(generateMock).toHaveBeenCalledTimes(1)
    expect(styleHandler).toHaveBeenCalledWith(rawSource, expect.objectContaining({
      isMainChunk: true,
    }))
  })

  it('generates Tailwind v4 css in auto mode when @tailwind utilities is present', async () => {
    const rawSource = [
      '@tailwind utilities;',
      '.card{color:red}',
    ].join('\n')
    const generateMock = vi.fn(async () => ({
      css: '.w-_b100px_B{width:100px}',
      rawCss: '.w-\\[100px\\]{width:100px}',
      target: 'weapp',
      classSet: new Set(['w-[100px]']),
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      ...createDefaultGeneratorMock(),
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: `legacy:${code}` }))
    const result = await generateCssByGenerator({
      opts: {
        generator: {
          target: 'weapp',
        },
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: new Set(['w-[100px]']),
      rawSource,
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(result?.css).toBe('.w-_b100px_B{width:100px}\nlegacy:.card{color:red}')
    expect(generateMock).toHaveBeenCalledTimes(1)
    expect(generateMock).toHaveBeenCalledWith(expect.objectContaining({
      scanSources: false,
    }))
    expect(styleHandler).toHaveBeenCalledWith('.card{color:red}', expect.objectContaining({
      isMainChunk: true,
    }))
  })

  it('keeps Tailwind v4 scoped subpackage css sources isolated from the full runtime set', async () => {
    const rawSource = [
      '@tailwind utilities;',
      '.card{color:red}',
    ].join('\n')
    const generateMock = vi.fn(async ({ candidates }: { candidates: Set<string> }) => {
      const css = [...candidates].map(candidate => `.${candidate}{color:red}`).join('\n')
      return {
        css,
        rawCss: css,
        target: 'weapp',
        classSet: new Set(candidates),
        dependencies: [],
        sources: [],
        root: null,
      }
    })

    vi.doMock('@/generator', () => ({
      ...createDefaultGeneratorMock(),
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      resolveTailwindV4Source: vi.fn(async (options: any) => withTestGeneratorSourceMetadata({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: options.css ?? '@import "tailwindcss";',
        dependencies: [],
      }, {
        sourceEntries: [{ pattern: 'pages/**/*', base: process.cwd() }],
      })),
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => withTestGeneratorSourceMetadata({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      }, {
        sourceEntries: [{ pattern: 'pages/**/*', base: process.cwd() }],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: process.cwd(),
        baseFallbacks: [],
        cssSources: [withTestGeneratorSourceMetadata({
          css: '@source "./pages/**/*";\n@tailwind utilities;',
          base: process.cwd(),
        }, {
          sourceEntries: [{ pattern: 'pages/**/*', base: process.cwd() }],
        })],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async () => ({ css: 'legacy:.card{color:red}' }))
    const baseOptions = {
      opts: {
        generator: {
          target: 'weapp',
        },
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: new Set(['bg-normal-subpackage-marker', 'bg-independent-subpackage-marker']),
      rawSource,
      cssHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'pages/index/index.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'pages/index/index.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    }

    const normal = await generateCssByGenerator({
      ...baseOptions,
      file: 'sub-normal/pages/index.wxss',
      getSourceCandidatesForEntries: () => new Set(['bg-normal-subpackage-marker']),
    })
    const independent = await generateCssByGenerator({
      ...baseOptions,
      file: 'sub-independent/pages/index.wxss',
      getSourceCandidatesForEntries: () => new Set(['bg-independent-subpackage-marker']),
    })

    expect(normal?.css).toContain('.bg-normal-subpackage-marker')
    expect(normal?.css).not.toContain('.bg-independent-subpackage-marker')
    expect(independent?.css).toContain('.bg-independent-subpackage-marker')
    expect(independent?.css).not.toContain('.bg-normal-subpackage-marker')
    expect(generateMock).toHaveBeenCalledTimes(2)
    expect(generateMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      candidates: new Set(['bg-normal-subpackage-marker']),
      incrementalCache: true,
    }))
    expect(generateMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      candidates: new Set(['bg-independent-subpackage-marker']),
      incrementalCache: true,
    }))
  })

  it('does not append raw Tailwind v4 @apply rules after generated css', async () => {
    const rawSource = [
      '@tailwind base;',
      '@tailwind components;',
      '@tailwind utilities;',
      '.raw-btn {',
      '  @apply after:border-none inline-flex items-center gap-2 rounded text-sm font-semibold transition-all;',
      '}',
      '.btn {',
      '  @apply raw-btn bg-gradient-to-r from-[#9e58e9] to-blue-500 px-2 py-1 text-white;',
      '}',
      '.card{color:red}',
    ].join('\n')
    const generateMock = vi.fn(async () => ({
      css: '.raw-btn{display:inline-flex}.btn{color:#fff}.card{color:red}',
      rawCss: '.raw-btn{display:inline-flex}.btn{color:#fff}.card{color:red}',
      target: 'weapp',
      classSet: new Set([
        'after:border-none',
        'inline-flex',
        'items-center',
        'gap-2',
        'rounded',
        'text-sm',
        'font-semibold',
        'transition-all',
        'raw-btn',
        'bg-gradient-to-r',
        'from-[#9e58e9]',
        'to-blue-500',
        'px-2',
        'py-1',
        'text-white',
      ]),
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      ...createDefaultGeneratorMock(),
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: `legacy:${code}` }))
    const result = await generateCssByGenerator({
      opts: {
        generator: {
          target: 'weapp',
        },
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: new Set(['after:border-none', 'bg-[#123456]']),
      rawSource,
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(result?.css).toBe('.raw-btn{display:inline-flex}.btn{color:#fff}.card{color:red}')
    expect(result?.css).not.toContain('@tailwind')
    expect(result?.css).not.toContain('@apply')
    expect(styleHandler).not.toHaveBeenCalled()
  })

  it('keeps Tailwind v4 component classes only referenced by @apply in app css output', async () => {
    const rawSource = [
      '@tailwind base;',
      '@tailwind components;',
      '@tailwind utilities;',
      '@layer components {',
      '  .raw-btn {',
      '    @apply after:border-none inline-flex items-center gap-[8rpx] rounded-[8rpx] text-[24rpx] font-[600] transition-all;',
      '  }',
      '  .btn {',
      '    @apply after:border-none inline-flex items-center gap-[8rpx] rounded-[8rpx] text-[24rpx] font-[600] transition-[all] bg-gradient-to-r from-[#9e58e9] to-[#3b82f6] px-[8rpx] py-[4rpx] text-[#fff];',
      '  }',
      '}',
      '@layer utilities {',
      '  .filter-none {',
      '    filter: none;',
      '  }',
      '}',
    ].join('\n')

    vi.doMock('@/generator', async () => {
      const actual = await vi.importActual<typeof import('@/generator')>('@/generator')
      return {
        ...actual,
        normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      }
    })

    const { generateCssByGenerator } = await import('@/generation/index')
    const result = await generateCssByGenerator({
      opts: {
        generator: {
          target: 'weapp',
          importFallback: true,
        },
        styleHandler: vi.fn(async (code: string) => ({ css: code })),
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
          options: {
            projectRoot: process.cwd(),
          },
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: new Set(['btn', 'flex']),
      rawSource,
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler: vi.fn(async (code: string) => ({ css: code })),
      debug: vi.fn(),
    })
    const css = result?.css ?? ''

    expect(css).toContain('.raw-btn')
    expect(css).toContain('.raw-btn::after')
    expect(css).toContain('.btn')
    expect(css).toContain('.btn::after')
    expect(css).toContain('.filter-none')
    expect(css).toContain('filter: none')
    expect(css).toContain('background-image: linear-gradient(var(--tw-gradient-stops))')
    expect(css).not.toContain('@apply')
  })

  it('keeps Tailwind v4 component layer classes from Sass app css in dev output', async () => {
    const rawSource = [
      '$brand: #123456;',
      '@use "tailwindcss";',
      '@layer components {',
      '  .raw-btn {',
      '    // formatter note',
      '    @apply after:border-none inline-flex items-center gap-[8rpx] rounded-[8rpx] text-[24rpx] font-[600] transition-all;',
      '  }',
      '  .btn {',
      '    // use custom raw-btn',
      '    @apply after:border-none inline-flex items-center gap-[8rpx] rounded-[8rpx] text-[24rpx] font-[600] transition-[all] bg-gradient-to-r from-[#9e58e9] to-[#3b82f6] px-[8rpx] py-[4rpx] text-[#fff];',
      '  }',
      '}',
    ].join('\n')

    vi.doMock('@/generator', async () => {
      const actual = await vi.importActual<typeof import('@/generator')>('@/generator')
      return {
        ...actual,
        normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      }
    })

    const { generateCssByGenerator } = await import('@/generation/index')
    const result = await generateCssByGenerator({
      opts: {
        generator: {
          target: 'weapp',
          importFallback: true,
        },
        styleHandler: vi.fn(async (code: string) => ({ css: code })),
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
          options: {
            projectRoot: process.cwd(),
          },
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: new Set(['btn', 'flex']),
      rawSource,
      file: '/project/dist/dev/mp-weixin/app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: '/project/dist/dev/mp-weixin/app.wxss',
          },
        },
        majorVersion: 4,
        sourceOptions: {
          outputRoot: '/project/dist/dev/mp-weixin',
        },
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: '/project/dist/dev/mp-weixin/app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler: vi.fn(async (code: string) => ({ css: code })),
      debug: vi.fn(),
    })
    const css = result?.css ?? ''

    expect(css).toContain('.raw-btn')
    expect(css).toContain('.raw-btn::after')
    expect(css).toContain('.btn')
    expect(css).toContain('.btn::after')
    expect(css).toContain('display: inline-flex')
    expect(css).toContain('background-image: linear-gradient(var(--tw-gradient-stops))')
    expect(css.indexOf('.raw-btn')).toBeGreaterThanOrEqual(0)
    expect(css.indexOf('.flex')).toBeGreaterThanOrEqual(0)
    expect(css.indexOf('.raw-btn')).toBeLessThan(css.indexOf('.flex'))
    expect(css).not.toContain('@apply')
    expect(css).not.toContain('@layer')
    expect(css).not.toContain('// formatter note')
  })

  it('rebuilds Tailwind v4 mini-program layer css instead of appending incremental utilities after previous css', async () => {
    const rawSource = [
      '@tailwind base;',
      '@tailwind components;',
      '@tailwind utilities;',
      '@layer components {',
      '  .raw-cache-btn {',
      '    @apply inline-flex items-center;',
      '  }',
      '}',
    ].join('\n')

    vi.doMock('@/generator', async () => {
      const actual = await vi.importActual<typeof import('@/generator')>('@/generator')
      return {
        ...actual,
        normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      }
    })

    const { generateCssByGenerator } = await import('@/generation/index')
    const baseOptions = {
      opts: {
        generator: {
          target: 'weapp',
        },
        styleHandler: vi.fn(async (code: string) => ({ css: code })),
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
          options: {
            projectRoot: process.cwd(),
          },
        } as any,
        readyPromise: Promise.resolve(),
      },
      rawSource,
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler: vi.fn(async (code: string) => ({ css: code })),
      debug: vi.fn(),
    }

    await generateCssByGenerator({
      ...baseOptions,
      runtime: new Set(['raw-cache-btn']),
    })
    const result = await generateCssByGenerator({
      ...baseOptions,
      runtime: new Set(['raw-cache-btn', 'flex']),
      previousCss: '.flex { display: flex; }',
    })
    const css = result?.css ?? ''

    expect(css).toContain('.raw-cache-btn')
    expect(css.indexOf('.raw-cache-btn')).toBeGreaterThanOrEqual(0)
    expect(css.indexOf('.flex')).toBeGreaterThanOrEqual(0)
    expect(css.indexOf('.raw-cache-btn')).toBeLessThan(css.indexOf('.flex'))
    expect(css).not.toContain('@layer')
    expect(css).not.toContain('@apply')
  })

  it('appends Tailwind v4 incremental css to previous mini-program css without user layers', async () => {
    const runtimeSet = new Set(['flex', 'text-red-500'])
    const generateMock = vi.fn(async () => ({
      css: '.flex{display:flex}.text-red-500{color:red}',
      incrementalCss: '.text-red-500{color:red}',
      rawCss: '.flex{display:flex}.text-red-500{color:red}',
      target: 'weapp',
      classSet: new Set(['text-red-500']),
      dependencies: ['tailwind.config.ts'],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => createDefaultGeneratorMock({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const result = await generateCssByGenerator({
      opts: {
        generator: {
          target: 'weapp',
        },
        styleHandler: vi.fn(async (code: string) => ({ css: code })),
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: '@tailwind utilities;',
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler: vi.fn(async (code: string) => ({ css: code })),
      debug: vi.fn(),
      previousCss: '.flex{display:flex}',
      forceGenerator: true,
    })

    expect(result).toMatchObject({
      css: '.flex{display:flex}\n.text-red-500{color:red}',
      dependencies: ['tailwind.config.ts'],
      incremental: true,
      source: 'generator',
      target: 'weapp',
    })
    expect(result?.classSet).toEqual(new Set(['text-red-500', 'flex']))
    expect(generateMock).toHaveBeenCalledWith(expect.objectContaining({
      incrementalCache: true,
      target: 'weapp',
    }))
  })

  it('keeps user-defined Tailwind layer blocks when removing source directives', async () => {
    const { removeTailwindSourceDirectives } = await import('@/generation/index')
    const rawSource = [
      '@tailwind base;',
      '@tailwind components;',
      '@tailwind utilities;',
      '@layer components {',
      '  .raw-btn {',
      '    @apply after:border-none inline-flex items-center gap-2 rounded text-sm font-semibold transition-all;',
      '  }',
      '  .btn {',
      '    @apply raw-btn bg-gradient-to-r from-[#9e58e9] to-blue-500 px-2 py-1 text-white;',
      '  }',
      '}',
    ].join('\n')

    expect(removeTailwindSourceDirectives(rawSource)).toBe([
      '@layer components {',
      '  .raw-btn {',
      '    @apply after:border-none inline-flex items-center gap-2 rounded text-sm font-semibold transition-all;',
      '  }',
      '  .btn {',
      '    @apply raw-btn bg-gradient-to-r from-[#9e58e9] to-blue-500 px-2 py-1 text-white;',
      '  }',
      '}',
    ].join('\n'))
  })

  it('preserves Tailwind apply context while disabling source scanning', async () => {
    const { removeTailwindSourceDirectives } = await import('@/generation/index')
    const result = removeTailwindSourceDirectives([
      '@import "tailwindcss" source(none);',
      '@source inline("bg-primary");',
      '@reference "/project/main.css";',
      '@config "/project/tailwind.config.js";',
      '@theme { --color-primary: #0957de; }',
      '@plugin "./plugin.js";',
      '@utility project-card { display: flex; }',
      '.probe { @apply bg-primary project-card; }',
    ].join('\n'), {
      importFallback: true,
      preserveApplyContext: true,
    })

    expect(result).not.toContain('@import')
    expect(result).not.toContain('@source')
    expect(result).toContain('@reference "/project/main.css";')
    expect(result).toContain('@config "/project/tailwind.config.js";')
    expect(result).toContain('@theme { --color-primary: #0957de; }')
    expect(result).toContain('@plugin "./plugin.js";')
    expect(result).toContain('@utility project-card { display: flex; }')
    expect(result).toContain('@apply bg-primary project-card;')
  })

  it('resolves current css asset directives for generator source', async () => {
    const rawSource = [
      '@config "./generator-css.unit.test.ts";',
      '@tailwind base;',
      '@tailwind components;',
      '@tailwind utilities;',
    ].join('\n')
    const { resolveCssEntrySource } = await import('@/generation/index')
    const source = resolveCssEntrySource(rawSource, __dirname)
    expect(source).toEqual(expect.objectContaining({
      css: [
        '@tailwind base;',
        '@tailwind components;',
        '@tailwind utilities;',
      ].join('\n'),
      config: path.resolve(__dirname, 'generator-css.unit.test.ts'),
      base: __dirname,
    }))
  })

  it('keeps Tailwind v4 package.json subpath @config imports unresolved for Tailwind itself', async () => {
    const rawSource = [
      '@config "#tw-config";',
      '@import "#tailwind.css";',
    ].join('\n')
    const { resolveCssEntrySource } = await import('@/generation/index')
    const source = resolveCssEntrySource(rawSource, __dirname, { removeConfig: false })
    expect(source).toEqual(expect.objectContaining({
      css: rawSource,
      config: undefined,
      configRequest: '#tw-config',
      base: __dirname,
    }))
  })

  it('resolves @apply-only css assets as generator source entries', async () => {
    const rawSource = [
      '.test {',
      '  @apply flex bg-[#123456];',
      '}',
    ].join('\n')
    const { resolveCssEntrySource } = await import('@/generation/index')
    const source = resolveCssEntrySource(rawSource, __dirname)
    expect(source).toEqual(expect.objectContaining({
      css: rawSource,
      base: __dirname,
    }))
  })

  it('does not treat generated Tailwind layer css as generator source entries', async () => {
    const rawSource = [
      '@layer theme, base, components, utilities;',
      '@layer theme {',
      '  :host,page,.tw-root,wx-root-portal-content {',
      '    --tw-content: "";',
      '    --color-gray-200: #e5e7eb;',
      '  }',
      '  @theme default {',
      '    @-webkit-keyframes spin {',
      '      to {',
      '        -webkit-transform: rotate(1turn);',
      '        transform: rotate(1turn);',
      '      }',
      '    }',
      '  }',
      '}',
    ].join('\n')
    const { hasTailwindSourceDirectives, resolveCssEntrySource } = await import('@/generation/index')

    expect(hasTailwindSourceDirectives(rawSource)).toBe(false)
    expect(resolveCssEntrySource(rawSource, __dirname)).toBeUndefined()
  })

  it('adds Tailwind v4 import source for @apply-only local css sources', async () => {
    const rawSource = [
      '.test {',
      '  @apply min-w-0 bg-[#102938];',
      '}',
      '.title {',
      '  @apply text-[#f7fbff] w-[173px];',
      '}',
    ].join('\n')
    const resolveTailwindV4Source = vi.fn(async (options: any) => ({
      projectRoot: process.cwd(),
      base: process.cwd(),
      baseFallbacks: [],
      css: options.css,
      dependencies: [],
    }))
    vi.doMock('@/generator', () => ({
      ...createDefaultGeneratorMock({
        resolveTailwindV4Source,
        resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
          projectRoot: process.cwd(),
          packageName: 'tailwindcss',
        })),
      }),
    }))

    const { resolveGeneratorSource } = await import('@/generation/source-resolver')
    await resolveGeneratorSource(
      4,
      {
        tailwindRuntime: {
          majorVersion: 4,
          options: {},
        } as any,
      },
      rawSource,
      'pages/index/index.wxss',
      {
        isMainChunk: false,
        majorVersion: 4,
        postcssOptions: {
          options: {
            from: 'pages/index/index.wxss',
          },
        },
      } as any,
    )

    expect(resolveTailwindV4Source).toHaveBeenCalledWith(expect.objectContaining({
      css: `@import "tailwindcss" source(none);\n@source inline("bg-[#102938] min-w-0 text-[#f7fbff] w-[173px]");\n${rawSource}`,
    }))
  })

  it('inherits the unique configured Tailwind v4 config for @apply-only local css sources', async () => {
    const root = '/project'
    const config = `${root}/tailwind.config.js`
    const rawSource = '.theme { @apply bg-primary; }'
    const resolveTailwindV4Source = vi.fn(async (options: any) => ({
      projectRoot: root,
      base: options.base,
      baseFallbacks: [],
      css: options.css,
      dependencies: [],
    }))
    vi.doMock('@/generator', () => createDefaultGeneratorMock({
      resolveTailwindV4Source,
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: root,
        packageName: 'tailwindcss',
        cssSources: [
          {
            file: `${root}/main.css`,
            base: root,
            css: `@import "tailwindcss" source(none);\n@config "${config}";`,
          },
        ],
      })),
    }))

    const { resolveGeneratorSource } = await import('@/generation/source-resolver')
    await resolveGeneratorSource(
      4,
      {
        tailwindRuntime: {
          majorVersion: 4,
          options: {},
        } as any,
      },
      rawSource,
      `${root}/pages/index/index.uvue?vue&type=style&index=0&lang.scss`,
      {
        isMainChunk: false,
        majorVersion: 4,
        postcssOptions: {
          options: {
            from: `${root}/pages/index/index.uvue`,
          },
        },
      } as any,
    )

    expect(resolveTailwindV4Source).toHaveBeenCalledWith(expect.objectContaining({
      css: expect.stringContaining(`@config "${config}";`),
    }))
  })

  it('skips forced generator for ordinary non-main css assets', async () => {
    const runtimeSet = new Set(['w-[100px]'])
    const rawSource = '.page{color:red}'
    const generateMock = vi.fn(async () => ({
      css: '.w-_b100px_B{width:100px}',
      rawCss: '.w-\\[100px\\]{width:100px}',
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: `legacy:${code}` }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource,
      file: 'pages/index/index.wxss',
      cssHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'pages/index/index.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'pages/index/index.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(result).toBeUndefined()
    expect(generateMock).not.toHaveBeenCalled()
    expect(styleHandler).not.toHaveBeenCalled()
  })

  it('skips forced Tailwind v4 generator for ordinary non-main css assets', async () => {
    const rawSource = '.page{color:red}'
    const generateMock = vi.fn(async () => ({
      css: '.w-_b100px_B{width:100px}',
      rawCss: '.w-\\[100px\\]{width:100px}',
      target: 'weapp',
      classSet: new Set(['w-[100px]']),
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: `legacy:${code}` }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: new Set(['w-[100px]']),
      rawSource,
      file: 'pages/index/index.wxss',
      cssHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'pages/index/index.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'pages/index/index.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(result).toBeUndefined()
    expect(generateMock).not.toHaveBeenCalled()
    expect(styleHandler).not.toHaveBeenCalled()
  })

  it('replaces tailwind generated css embedded after existing bundle css', async () => {
    const runtimeSet = new Set(['w-[100px]'])
    const rawTailwindCss = '/*! tailwindcss v4.2.4 | MIT License | https://tailwindcss.com */\n.w-\\[100px\\]{width:100px}'
    const weappCss = '.w-_b100px_B{width:100px}'
    const generateMock = vi.fn(async () => ({
      css: weappCss,
      rawCss: rawTailwindCss,
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: `user:${code}` }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: `.existing{color:red}\n${rawTailwindCss}\n/*$vite$:1*/`,
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(result?.css).toBe(`user:.existing{color:red}\n${weappCss}\n/*$vite$:1*/`)
    expect(styleHandler).toHaveBeenCalledWith('.existing{color:red}\n', expect.objectContaining({
      isMainChunk: false,
    }))
  })

  it('does not pass Tailwind v4 generator at-rules to mini-program user css transform', async () => {
    const runtimeSet = new Set(['icon-[mdi--weather-sunny]'])
    const rawTailwindCss = [
      '/*! tailwindcss v4.2.4 | MIT License | https://tailwindcss.com */',
      '.icon-\\[mdi--weather-sunny\\]{display:inline-block}',
    ].join('\n')
    const weappCss = '.icon-_bmdi--weather-sunny_B{display:inline-block}'
    const generateMock = vi.fn(async () => ({
      css: weappCss,
      rawCss: rawTailwindCss,
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source: vi.fn(async (options: any) => withTestGeneratorSourceMetadata({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: options.css ?? '@import "tailwindcss";',
        dependencies: [],
      }, {
        matchedCssSourceFile: 'app.wxss',
      })),
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: `user:${code}` }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: [
        '@import "tailwindcss";',
        '',
        '@plugin "@iconify/tailwind4" {',
        '  prefixes: mdi;',
        '  icon-selector: ".i-{prefix}-{name}";',
        '}',
        '',
        '@source "./**/*.{wxml,js,ts}";',
        '.page { color: red; }',
      ].join('\n'),
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(result?.css).toContain(weappCss)
    expect(styleHandler).toHaveBeenCalledWith('.page { color: red; }', expect.objectContaining({
      isMainChunk: false,
    }))
    expect(result?.css).not.toContain('@plugin')
    expect(result?.css).not.toContain('@source')
  })

  it('removes appended tailwind banner block when raw css cannot be split exactly', async () => {
    const runtimeSet = new Set(['w-[100px]'])
    const generatedRawTailwindCss = '/*! tailwindcss v4.2.4 | MIT License | https://tailwindcss.com */\n.w-\\[100px\\]{width:100px}'
    const appendedRawTailwindCss = '/*! tailwindcss v4.2.4 | MIT License | https://tailwindcss.com */\n@supports (display:grid){.w-\\[100px\\]{width:100px}}'
    const weappCss = '.w-_b100px_B{width:100px}'
    const generateMock = vi.fn(async () => ({
      css: weappCss,
      rawCss: generatedRawTailwindCss,
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: `user:${code}` }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: `.existing{color:red}\n${appendedRawTailwindCss}\n/*$vite$:1*/`,
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(result?.css).toBe(`user:.existing{color:red}\n${weappCss}\n/*$vite$:1*/`)
    expect(result?.css).not.toContain('@supports')
    expect(result?.css).not.toContain('tailwindcss v')
    expect(styleHandler).toHaveBeenCalledWith(expect.stringContaining('.existing{color:red}'), expect.objectContaining({
      isMainChunk: false,
    }))
    expect(result?.css).toContain('/*$vite$:1*/')
    expect(styleHandler.mock.calls[0]?.[0]).not.toContain('/*$vite$:1*/')
    expect(styleHandler.mock.calls[0]?.[0]).not.toContain('@supports')
    expect(styleHandler.mock.calls[0]?.[0]).not.toContain('tailwindcss v')
  })

  it('keeps user css before Tailwind v4 css when fallback banner splitting is used', async () => {
    const runtimeSet = new Set(['flex'])
    const userCss = '.reset-button{display:block}'
    const generatedRawTailwindCss = '/*! tailwindcss v4.2.4 | MIT License | https://tailwindcss.com */\n.flex{display:flex}'
    const rawSource = [
      userCss,
      '/*! tailwindcss v4.2.4 | MIT License | https://tailwindcss.com */',
      '@supports (display:grid){.flex{display:flex}}',
    ].join('\n')
    const generateMock = vi.fn(async () => ({
      css: '.flex{display:flex}',
      rawCss: generatedRawTailwindCss,
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: `user:${code}` }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource,
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(result?.css).toBe(`user:${userCss}\n.flex{display:flex}`)
    expect(result?.css.indexOf('.reset-button')).toBeLessThan(result?.css.indexOf('.flex') ?? -1)
    expect(result?.css).not.toContain('@supports')
    expect(result?.css).not.toContain('tailwindcss v')
  })

  it('does not append generated Tailwind marker css on forced prefix mismatch', async () => {
    const runtimeSet = new Set(['bg-blue-500'])
    const rawSource = [
      '::before,::after{--tw-content:""}',
      '.bg-blue-500{background-color:rgb(50,128,255)}',
    ].join('\n')
    const rawTailwindCss = '.bg-blue-500{background-color:var(--color-blue-500)}'
    const weappCss = '.bg-blue-500{background-color:var(--color-blue-500)}'
    const generateMock = vi.fn(async () => ({
      css: weappCss,
      rawCss: rawTailwindCss,
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: `legacy:${code}` }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource,
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(result?.css).toBe(weappCss)
    expect(styleHandler).not.toHaveBeenCalled()
  })

  it('preserves distinct user layer css once on forced prefix mismatch', async () => {
    const runtimeSet = new Set(['bg-blue-500'])
    const generatorRawSource = [
      '/*! tailwindcss v4.2.4 | MIT License | https://tailwindcss.com */',
      '.stale-generated{display:block}',
      '@config "./tailwind.config.js";',
      '@source "./src/**/*.{tsx,ts}";',
    ].join('\n')
    const userRawSource = [
      '@layer base { button::after, wx-button::after { display: none; border: none; content: ""; } }',
      '@layer components { .layer-card-v4 { display: flex; } }',
    ].join('\n')
    const generatedCss = '.bg-blue-500{background-color:var(--color-blue-500)}'
    const generateMock = vi.fn(async () => ({
      css: generatedCss,
      rawCss: '.bg-blue-500{background-color:var(--color-blue-500)}',
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      ...createDefaultGeneratorMock(),
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: code }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: generatorRawSource,
      userRawSource,
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(result?.css.match(/(?:^|[,{])\s*button::after/g)).toHaveLength(1)
    expect(result?.css.match(/wx-button::after/g)).toHaveLength(1)
    expect(result?.css.match(/\.layer-card-v4/g)).toHaveLength(1)
    expect(result?.css).not.toContain('@layer')
    expect(result?.css).toContain('.bg-blue-500')
  })

  it('removes Tailwind display-p3 supports from forced legacy compat css', async () => {
    const runtimeSet = new Set(['bg-blue-500'])
    const rawSource = [
      '.existing{color:red}',
      '@supports (color: color(display-p3 0 0 0%)){',
      ':host,page,.tw-root,wx-root-portal-content{--color-blue-500:color(display-p3 0.26642 0.49122 0.98862)}',
      '}',
    ].join('\n')
    const rawTailwindCss = '.bg-blue-500{background-color:var(--color-blue-500)}'
    const weappCss = '.bg-blue-500{background-color:var(--color-blue-500)}'
    const generateMock = vi.fn(async () => ({
      css: weappCss,
      rawCss: rawTailwindCss,
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: `legacy:${code}` }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource,
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(result?.css).not.toContain('.existing{color:red}')
    expect(result?.css).not.toContain('@supports')
    expect(result?.css).not.toContain('display-p3')
    expect(styleHandler).not.toHaveBeenCalled()
  })

  it('keeps Tailwind CSS output scoped when preflight is hoisted', async () => {
    const runtimeSet = new Set(['bg-[#534312]'])
    const rawSource = [
      '.card{color:red}',
      'view,text,::before,::after{--tw-border-spacing-x:0;box-sizing:border-box;border-width:0;border-style:solid}',
      '::before,::after{--tw-content:""}',
    ].join('\n')
    const rawTailwindCss = '.bg-\\[\\#534312\\]{background-color:#534312}'
    const weappCss = '.bg-_b_h534312_B{background-color:#534312}'
    const legacyCss = [
      '.card{color:red}',
      'view,text,::before,::after{--tw-border-spacing-x:0;box-sizing:border-box;border-width:0;border-style:solid}',
      '::before,::after{--tw-content:""}',
    ].join('\n')
    const generateMock = vi.fn(async () => ({
      css: weappCss,
      rawCss: rawTailwindCss,
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async () => ({ css: legacyCss }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource,
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    const css = result?.css ?? ''
    expect(css).toContain('.bg-_b_h534312_B{background-color:#534312}')
    expect(css).not.toContain('.card{color:red}')
    expect(css).not.toContain('box-sizing:border-box;border-width:0;border-style:solid')
    expect(css).not.toContain('--tw-border-spacing-x:0')
  })

  it('keeps user css before hoisted Tailwind v4 theme variables', async () => {
    const runtimeSet = new Set(['bg-blue-500', 'bg-blue-500/50'])
    const rawSource = [
      '.card{color:red}',
      ':host,page,.tw-root,wx-root-portal-content{--spacing:8rpx;--color-blue-500:rgb(50,128,255);--color-primary:#155dfc;--font-mono:ui-monospace}',
      'view,text,::before,::after{--tw-border-spacing-x:0;box-sizing:border-box;border-width:0;border-style:solid}',
      '::before,::after{--tw-content:""}',
    ].join('\n')
    const rawTailwindCss = '.bg-blue-500{background-color:var(--color-blue-500)}'
    const weappCss = [
      '.bg-blue-500{background-color:var(--color-blue-500)}',
      '.font-sans{font-family:var(--font-sans)}',
      ':host,page,.tw-root,wx-root-portal-content{--color-blue-500:rgb(50,128,255);--spacing:8rpx;--font-sans:ui-sans-serif}',
      '@media (color-gamut: p3){.bg-blue-500_f50{background-color:color(display-p3 0.26642 0.49122 0.98862 / 0.5)}}',
    ].join('\n')
    const legacyCss = [
      '.card{color:red}',
      ':host,page,.tw-root,wx-root-portal-content{--spacing:8rpx;--color-blue-500:rgb(50,128,255);--color-primary:#155dfc;--font-mono:ui-monospace}',
      'view,text,::before,::after{--tw-border-spacing-x:0;box-sizing:border-box;border-width:0;border-style:solid}',
      '::before,::after{--tw-content:""}',
    ].join('\n')
    const generateMock = vi.fn(async () => ({
      css: weappCss,
      rawCss: rawTailwindCss,
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async () => ({ css: legacyCss }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource,
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    const css = result?.css ?? ''
    expect(css.split(':host,page,.tw-root,wx-root-portal-content')).toHaveLength(2)
    expect(css).toContain('--color-blue-500:rgb(50,128,255)')
    expect(css).toContain('--spacing:8rpx')
    expect(css).not.toContain('--color-primary:#155dfc')
    expect(css).not.toContain('color-gamut')
    expect(css).not.toContain('display-p3')
    expect(css).toContain('font-family:var(--font-sans)')
    expect(css).toContain('--font-sans')
    expect(css).not.toContain('--font-mono')
    expect(css).not.toContain('.card{color:red}')
    expect(css).not.toContain('::before,::after{--tw-content:""}')
  })

  it('generates Tailwind v4 css entries independently in force mode', async () => {
    const runtimeSet = new Set(['bg-emerald-500', 'bg-slate-50'])
    let activeGenerates = 0
    let maxActiveGenerates = 0
    const generateMock = vi.fn(async () => {
      const callIndex = generateMock.mock.calls.length
      activeGenerates++
      maxActiveGenerates = Math.max(maxActiveGenerates, activeGenerates)
      await Promise.resolve()
      activeGenerates--
      return callIndex === 1
        ? {
            css: '.bg-emerald-500{background-color:rgb(0,185,129)}',
            rawCss: '.bg-emerald-500{background-color:rgb(0,185,129)}',
            target: 'weapp',
            classSet: new Set(['bg-emerald-500']),
            dependencies: ['main.css'],
            sources: [],
            root: null,
          }
        : {
            css: '.bg-slate-50{background-color:rgb(248,250,252)}',
            rawCss: '.bg-slate-50{background-color:rgb(248,250,252)}',
            target: 'weapp',
            classSet: new Set(['bg-slate-50']),
            dependencies: ['common.css'],
            sources: [],
            root: null,
          }
    })

    const createGeneratorMock = vi.fn(() => ({
      generate: generateMock,
    }))
    const resolveTailwindV4SourceMock = vi.fn(async (options: any) => ({
      projectRoot: process.cwd(),
      base: process.cwd(),
      baseFallbacks: [],
      css: `@import "tailwindcss"; /* ${options.cssEntries[0]} */`,
      dependencies: options.cssEntries,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: createGeneratorMock,
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source: resolveTailwindV4SourceMock,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: process.cwd(),
        baseFallbacks: [],
        cssEntries: ['main.css', 'common.css'],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: code }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
          options: {
            tailwindcss: {
              v4: {
                cssEntries: ['main.css', 'common.css'],
              },
            },
          },
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: '/*! weapp-tailwindcss generator-placeholder */',
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(resolveTailwindV4SourceMock).toHaveBeenCalledTimes(2)
    expect(resolveTailwindV4SourceMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      cssEntries: ['main.css'],
    }))
    expect(resolveTailwindV4SourceMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      cssEntries: ['common.css'],
    }))
    expect(createGeneratorMock).toHaveBeenCalledTimes(2)
    expect(generateMock).toHaveBeenCalledTimes(2)
    expect(maxActiveGenerates).toBe(1)
    expect(result?.css).toContain('.bg-emerald-500{background-color:rgb(0,185,129)}')
    expect(result?.css).toContain('.bg-slate-50{background-color:rgb(248,250,252)}')
  })

  it('normalizes Tailwind v4 @config directives for main package and subpackage cssSources independently', async () => {
    const runtimeSet = new Set(['main-only', 'sub-normal-only', 'sub-independent-only'])
    const projectRoot = '/project'
    const mainCssFile = '/project/src/styles/app/index.css'
    const mainConfigFile = '/project/src/tailwind.config.js'
    const subNormalCssFile = '/project/src/sub-normal/pages/styles/index.css'
    const subNormalConfigFile = '/project/src/sub-normal/tailwind.config.js'
    const subIndependentCssFile = '/project/src/sub-independent/pages/styles/index.css'
    const subIndependentConfigFile = '/project/src/sub-independent/tailwind.config.js'
    const cssSources = [
      {
        file: mainCssFile,
        base: path.dirname(mainCssFile),
        css: [
          '@import "tailwindcss" source(none);',
          '@config "../../tailwind.config.js";',
          '@source "../../pages/**/*.{vue,ts}";',
        ].join('\n'),
      },
      {
        file: subNormalCssFile,
        base: path.dirname(subNormalCssFile),
        css: [
          '@import "tailwindcss" source(none);',
          '@config "../../tailwind.config.js";',
          '@source "../**/*.{vue,ts}";',
        ].join('\n'),
      },
      {
        file: subIndependentCssFile,
        base: path.dirname(subIndependentCssFile),
        css: [
          '@import "tailwindcss" source(none);',
          '@config "../../tailwind.config.js";',
          '@source "../**/*.{vue,ts}";',
        ].join('\n'),
      },
    ]
    const resolveTailwindV4Source = vi.fn(async (options: any) => {
      const cssSource = firstResolvedCssSourceOption(options)
      return {
        projectRoot,
        base: cssSource?.base ?? projectRoot,
        baseFallbacks: [],
        css: cssSource?.css ?? '@import "tailwindcss";',
        dependencies: cssSource?.file ? [cssSource.file] : options.cssEntries ?? [],
      }
    })

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: vi.fn(async () => ({
          css: '.main-only{display:block}.sub-normal-only{display:block}.sub-independent-only{display:block}',
          rawCss: '.main-only{display:block}.sub-normal-only{display:block}.sub-independent-only{display:block}',
          target: 'weapp',
          classSet: runtimeSet,
          dependencies: [],
          sources: [],
          root: null,
        })),
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot,
        base: projectRoot,
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot,
        baseFallbacks: [],
        cssEntries: [
          '/project/src/app.css',
          '/project/src/common.css',
        ],
        cssSources,
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const result = await generateCssByGenerator({
      opts: {
        styleHandler: vi.fn(async (code: string) => ({ css: code })),
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: '/*! weapp-tailwindcss generator-placeholder */',
      file: '/project/dist/app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: '/project/dist/app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: '/project/dist/app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler: vi.fn(async (code: string) => ({ css: code })),
      debug: vi.fn(),
    })

    const cssCalls = resolveTailwindV4Source.mock.calls
      .map(([options]) => options.css)
      .filter((css): css is string => typeof css === 'string')
    expect(cssCalls).toHaveLength(3)
    expect(cssCalls).toEqual(expect.arrayContaining([
      expect.stringContaining(`@config "${mainConfigFile}";`),
      expect.stringContaining(`@config "${subNormalConfigFile}";`),
      expect.stringContaining(`@config "${subIndependentConfigFile}";`),
    ]))
    for (const css of cssCalls) {
      expect(css).not.toContain('@config "../../tailwind.config.js";')
    }
    expect(result?.css).toContain('.main-only')
  })

  it('resolves Tailwind v4 output assets from matching configured css entries', async () => {
    const runtimeSet = new Set(['bg-slate-50'])
    const commonCss = '@import "tailwindcss";\n@config "../tailwind.config.order.js";'
    const resolveTailwindV4Source = vi.fn(async (options: any) => ({
      projectRoot: '/project',
      base: path.dirname(options.cssEntries[0]),
      baseFallbacks: [],
      css: commonCss,
      dependencies: options.cssEntries,
    }))

    vi.doMock('node:fs', () => ({
      existsSync: vi.fn((file: string) => file === '/project/src/common.css'),
      readFileSync: vi.fn(() => commonCss),
    }))
    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: vi.fn(async () => ({
          css: '.bg-slate-50{background-color:rgb(248,250,252)}',
          rawCss: commonCss,
          target: 'weapp',
          classSet: runtimeSet,
          dependencies: ['/project/src/common.css'],
          sources: [],
          root: null,
        })),
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: '/project',
        base: '/project',
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: '/project',
        baseFallbacks: [],
        cssEntries: ['/project/src/main.css', '/project/src/common.css'],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: code }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: commonCss,
      file: 'common.wxss',
      cssHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'common.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'common.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(resolveTailwindV4Source).toHaveBeenCalledWith(expect.objectContaining({
      cssEntries: ['/project/src/common.css'],
    }))
    expect(result?.css).toBe('.bg-slate-50{background-color:rgb(248,250,252)}')
  })

  it('resolves Tailwind v4 output assets from matching css source files before multi-entry fallback', async () => {
    const runtimeSet = new Set(['bg-slate-50'])
    const mainCss = '@import "tailwindcss";'
    const subCss = '@import "tailwindcss" source(none);\n@config "./tailwind.config.sub-normal.js";'
    const resolveTailwindV4Source = vi.fn(async (options: any) => ({
      projectRoot: '/project',
      base: firstResolvedCssSourceOption(options).base,
      baseFallbacks: [],
      css: firstResolvedCssSourceOption(options).css,
      dependencies: [firstResolvedCssSourceOption(options).file],
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: vi.fn(async () => ({
          css: '.bg-slate-50{background-color:rgb(248,250,252)}',
          rawCss: subCss,
          target: 'weapp',
          classSet: runtimeSet,
          dependencies: ['/project/sub-normal/pages/index.css'],
          sources: [],
          root: null,
        })),
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: '/project',
        base: '/project',
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: '/project',
        baseFallbacks: [],
        cssEntries: ['/project/app.css', '/project/sub-normal/pages/index.css'],
        cssSources: [
          {
            file: '/project/app.css',
            base: '/project',
            css: mainCss,
          },
          {
            file: '/project/sub-normal/pages/index.css',
            base: '/project/sub-normal/pages',
            css: subCss,
          },
        ],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const result = await generateCssByGenerator({
      opts: {
        styleHandler: vi.fn(async (code: string) => ({ css: code })),
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: subCss,
      file: '/project/dist/sub-normal/pages/index.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: '/project/sub-normal/pages/index.css',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: '/project/sub-normal/pages/index.css',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler: vi.fn(async (code: string) => ({ css: code })),
      debug: vi.fn(),
    })

    expect(resolveTailwindV4Source).toHaveBeenCalledTimes(1)
    expect(resolveTailwindV4Source).toHaveBeenCalledWith(expect.objectContaining({
      base: '/project/sub-normal/pages',
      css: expect.stringContaining('@config "/project/sub-normal/pages/tailwind.config.sub-normal.js";'),
    }))
    expect(result?.css).toBe('.bg-slate-50{background-color:rgb(248,250,252)}')
  })

  it('resolves Tailwind v4 output assets from matching css entries with repeated basenames', async () => {
    const runtimeSet = new Set(['bg-slate-50'])
    const entryCss = '@import "tailwindcss" source(none);\n@config "../../tailwind.config.js";'
    const resolveTailwindV4Source = vi.fn(async (options: any) => ({
      projectRoot: '/project',
      base: path.dirname(options.cssEntries[0]),
      baseFallbacks: [],
      css: entryCss,
      dependencies: options.cssEntries,
    }))

    vi.doMock('node:fs', () => ({
      existsSync: vi.fn((file: string) => file.endsWith('/index.css')),
      readFileSync: vi.fn(() => entryCss),
    }))
    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: vi.fn(async () => ({
          css: '.bg-slate-50{background-color:rgb(248,250,252)}',
          rawCss: entryCss,
          target: 'weapp',
          classSet: runtimeSet,
          dependencies: ['/project/src/subpackages/normal/pages/entry/index.css'],
          sources: [],
          root: null,
        })),
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: '/project',
        base: '/project',
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: '/project',
        baseFallbacks: [],
        cssEntries: [
          '/project/src/pages/index/index.css',
          '/project/src/subpackages/normal/pages/entry/index.css',
          '/project/src/subpackages/independent/pages/entry/index.css',
        ],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const result = await generateCssByGenerator({
      opts: {
        styleHandler: vi.fn(async (code: string) => ({ css: code })),
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: entryCss,
      file: 'subpackages/normal/pages/entry/index.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'subpackages/normal/pages/entry/index.wxss',
          },
        },
        majorVersion: 4,
        sourceOptions: {
          outputRoot: '/project/dist',
        },
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'subpackages/normal/pages/entry/index.wxss',
          },
        },
        majorVersion: 4,
        sourceOptions: {
          outputRoot: '/project/dist',
        },
      } as any,
      styleHandler: vi.fn(async (code: string) => ({ css: code })),
      debug: vi.fn(),
    })

    expect(resolveTailwindV4Source).toHaveBeenCalledTimes(1)
    expect(resolveTailwindV4Source).toHaveBeenCalledWith(expect.objectContaining({
      cssEntries: ['/project/src/subpackages/normal/pages/entry/index.css'],
    }))
    expect(result?.css).toBe('.bg-slate-50{background-color:rgb(248,250,252)}')
  })

  it('matches placeholder main css output to the css source whose source entries contain current candidates', async () => {
    const runtimeSet = new Set(['text-[188rpx]'])
    const mainCss = '@import "tailwindcss" source(none);\n@source "./pages/**/*.{vue,ts}";'
    const subCss = '@import "tailwindcss" source(none);\n@source "./sub/**/*.{vue,ts}";'
    const resolveTailwindV4Source = vi.fn(async (options: any) => ({
      projectRoot: '/project',
      base: firstResolvedCssSourceOption(options).base,
      baseFallbacks: [],
      css: firstResolvedCssSourceOption(options).css,
      dependencies: [firstResolvedCssSourceOption(options).file],
    }))
    const generateMock = vi.fn(async () => ({
      css: '.text-_b188rpx_B{font-size:188rpx}',
      rawCss: '.text-\\[188rpx\\]{font-size:188rpx}',
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: ['/project/src/main.css'],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: '/project',
        base: '/project',
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: '/project',
        baseFallbacks: [],
        cssSources: [
          {
            file: '/project/src/main.css',
            base: '/project/src',
            css: mainCss,
          },
          {
            file: '/project/src/sub/pages/index.css',
            base: '/project/src/sub/pages',
            css: subCss,
          },
        ],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: code }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: '/*! weapp-tailwindcss generator-placeholder */',
      file: '/project/dist/dev/mp-weixin/app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: '/project/dist/dev/mp-weixin/app.wxss',
          },
        },
        majorVersion: 4,
        sourceOptions: {
          outputRoot: '/project/dist/dev/mp-weixin',
        },
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: '/project/dist/dev/mp-weixin/app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
      getSourceCandidatesForEntries: vi.fn(entries =>
        entries?.some(entry => entry.base === '/project/src/pages')
          ? new Set(['text-[188rpx]'])
          : new Set(['sub-only']),
      ),
    })

    expect(resolveTailwindV4Source).toHaveBeenCalledWith(expect.objectContaining({
      base: '/project/src',
      css: mainCss,
    }))
    expect(generateMock).toHaveBeenCalledTimes(1)
    expect(result?.css.match(/text-_b188rpx_B/g) ?? []).toHaveLength(1)
  })

  it('matches ordinary main css output to one Tailwind v4 cssSource by source candidates', async () => {
    const runtimeSet = new Set(['text-[188rpx]'])
    const mainCss = '@import "tailwindcss" source(none);\n@source "./pages/**/*.{vue,ts}";'
    const subCss = '@import "tailwindcss" source(none);\n@source "./sub/**/*.{vue,ts}";'
    const resolveTailwindV4Source = vi.fn(async (options: any) => ({
      projectRoot: '/project',
      base: firstResolvedCssSourceOption(options).base,
      baseFallbacks: [],
      css: firstResolvedCssSourceOption(options).css,
      dependencies: [firstResolvedCssSourceOption(options).file],
    }))
    const generateMock = vi.fn(async () => ({
      css: '/*! tailwindcss v4.0.0 */\nview,text,::after,::before{box-sizing:border-box;margin:0;padding:0;border:0 solid}\n.text-_b188rpx_B{font-size:188rpx}',
      rawCss: 'view,text,::after,::before{box-sizing:border-box;margin:0;padding:0;border:0 solid}\n.text-\\[188rpx\\]{font-size:188rpx}',
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: ['/project/src/main.css'],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: '/project',
        base: '/project',
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: '/project',
        baseFallbacks: [],
        cssSources: [
          {
            file: '/project/src/main.css',
            base: '/project/src',
            css: mainCss,
          },
          {
            file: '/project/src/sub/pages/index.css',
            base: '/project/src/sub/pages',
            css: subCss,
          },
        ],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const result = await generateCssByGenerator({
      opts: {
        cssPreflight: {
          'box-sizing': 'border-box',
          margin: '0',
          padding: '0',
          border: '0 solid',
        },
        styleHandler: vi.fn(async (code: string) => ({ css: code })),
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: mainCss,
      file: '/project/dist/dev/mp-weixin/app.wxss',
      cssHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: '/project/dist/dev/mp-weixin/app.wxss',
          },
        },
        majorVersion: 4,
        sourceOptions: {
          outputRoot: '/project/dist/dev/mp-weixin',
        },
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: '/project/dist/dev/mp-weixin/app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler: vi.fn(async (code: string) => ({ css: code })),
      debug: vi.fn(),
      forceGenerator: true,
      cssSources: [
        {
          file: '/project/src/main.css',
          base: '/project/src',
          css: mainCss,
        },
        {
          file: '/project/src/sub/pages/index.css',
          base: '/project/src/sub/pages',
          css: subCss,
        },
      ],
      getSourceCandidatesForEntries: vi.fn(entries =>
        entries?.some(entry => entry.base === '/project/src/pages')
          ? new Set(['text-[188rpx]'])
          : new Set(['sub-only']),
      ),
    })

    expect(resolveTailwindV4Source).toHaveBeenCalledWith(expect.objectContaining({
      base: '/project/src',
      css: mainCss,
    }))
    expect(generateMock).toHaveBeenCalledTimes(1)
    expect(result?.css.match(/text-_b188rpx_B/g) ?? []).toHaveLength(1)
  })

  it('uses fresh Tailwind v4 source candidates when an upstream scoped runtime is empty', async () => {
    const mainCss = '@import "tailwindcss";\n@source "../src";'
    const scannedCandidates = new Set(['text-[102.43rpx]'])
    const resolveTailwindV4Source = vi.fn(async (options: any) => ({
      projectRoot: '/project',
      base: firstResolvedCssSourceOption(options).base,
      baseFallbacks: [],
      css: firstResolvedCssSourceOption(options).css,
      dependencies: [firstResolvedCssSourceOption(options).file],
    }))
    const generateMock = vi.fn(async (options: any) => ({
      css: options.candidates.has('text-[102.43rpx]')
        ? '/*! tailwindcss v4.0.0 */\n.text-_b102_d43rpx_B{font-size:102.43rpx}'
        : '/*! tailwindcss v4.0.0 */',
      rawCss: options.candidates.has('text-[102.43rpx]')
        ? '.text-\\[102\\.43rpx\\]{font-size:102.43rpx}'
        : '',
      target: 'weapp',
      classSet: new Set(options.candidates),
      dependencies: ['/project/src/app.css'],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: '/project',
        base: '/project',
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: '/project',
        baseFallbacks: [],
        cssSources: [
          {
            file: '/project/src/app.css',
            base: '/project/src',
            css: mainCss,
          },
        ],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const result = await generateCssByGenerator({
      opts: {
        styleHandler: vi.fn(async (code: string) => ({ css: code })),
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: new Set(),
      rawSource: '/*! weapp-tailwindcss generator-placeholder */',
      file: '/project/dist/wx/app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: '/project/dist/wx/app.wxss',
          },
        },
        majorVersion: 4,
        sourceOptions: {
          outputRoot: '/project/dist/wx',
          cssSources: [
            {
              file: '/project/src/app.css',
              base: '/project/src',
              css: mainCss,
            },
          ],
        },
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: '/project/dist/wx/app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler: vi.fn(async (code: string) => ({ css: code })),
      debug: vi.fn(),
      forceGenerator: true,
      cssSources: [
        {
          file: '/project/src/app.css',
          base: '/project/src',
          css: mainCss,
        },
      ],
      getSourceCandidatesForEntries: vi.fn(entries =>
        entries?.some(entry => entry.base === '/project/src')
          ? scannedCandidates
          : new Set<string>(),
      ),
      sourceCandidates: new Set(),
    })

    expect(generateMock).toHaveBeenCalledWith(expect.objectContaining({
      candidates: scannedCandidates,
      scanSources: false,
    }))
    expect(result?.classSet).toEqual(scannedCandidates)
    expect(result?.css).toContain('text-_b102_d43rpx_B')
  })

  it('keeps preflight out of non-primary Tailwind v4 cssSource outputs', async () => {
    const runtimeSet = new Set(['sub-only'])
    const mainCss = ':host,page,.tw-root,wx-root-portal-content { --spacing: 0.25rem; }'
    const subCss = '.sub-source{color:red}'
    const resolveTailwindV4Source = vi.fn(async (options: any) => ({
      projectRoot: '/project',
      base: firstResolvedCssSourceOption(options).base,
      baseFallbacks: [],
      css: firstResolvedCssSourceOption(options).css,
      dependencies: [firstResolvedCssSourceOption(options).file],
    }))
    const generateMock = vi.fn(async () => ({
      css: '/*! tailwindcss v4.0.0 */\n.sub-only{color:red}',
      rawCss: '.sub-only{color:red}',
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: ['/project/src/sub/pages/index.css'],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: '/project',
        base: '/project',
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: '/project',
        baseFallbacks: [],
        cssSources: [
          {
            file: '/project/src/main.css',
            base: '/project/src',
            css: mainCss,
          },
          {
            file: '/project/src/sub/pages/index.css',
            base: '/project/src/sub/pages',
            css: subCss,
          },
        ],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const result = await generateCssByGenerator({
      opts: {
        styleHandler: vi.fn(async (code: string) => ({ css: code })),
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: subCss,
      file: '/project/output/current.wxss',
      cssHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: '/project/output/current.wxss',
          },
        },
        majorVersion: 4,
        sourceOptions: {
          outputRoot: '/project/output',
        },
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: '/project/output/current.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler: vi.fn(async (code: string) => ({ css: code })),
      debug: vi.fn(),
      forceGenerator: true,
      cssSources: [
        {
          file: '/project/src/main.css',
          base: '/project/src',
          css: mainCss,
        },
        {
          file: '/project/output/current.wxss',
          base: '/project/src/sub/pages',
          css: subCss,
        },
      ],
      getSourceCandidatesForEntries: vi.fn(entries =>
        entries?.some(entry => entry.base === '/project/src/sub')
          ? new Set(['sub-only'])
          : new Set(['text-[188rpx]']),
      ),
    })

    expect(resolveTailwindV4Source).toHaveBeenCalledWith(expect.objectContaining({
      base: '/project/src/sub/pages',
      css: subCss,
    }))
    expect(generateMock).toHaveBeenCalledTimes(1)
    expect(result?.css).not.toContain('view,text,::after,::before')
    expect(result?.css).toContain('.sub-only')
  })

  it('injects mini-program preflight for raw CSS that imports full Tailwind without source metadata', async () => {
    const runtimeSet = new Set(['raw-entry-only'])
    const rawSource = '@import "tailwindcss" source(none);\n@source "./**/*.{ts,tsx}";'
    const resolveTailwindV4Source = vi.fn(async (options: any = {}) => ({
      projectRoot: '/workspace',
      base: '/workspace',
      baseFallbacks: [],
      css: options.css,
      dependencies: [],
    }))
    const generateMock = vi.fn(async () => ({
      css: '/*! tailwindcss v4.0.0 */\n.raw-entry-only{color:red}',
      rawCss: '.raw-entry-only{color:red}',
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: '/workspace',
        base: '/workspace',
        baseFallbacks: [],
        css: rawSource,
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: '/workspace',
        baseFallbacks: [],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const result = await generateCssByGenerator({
      opts: {
        cssPreflight: {
          border: '0 solid',
          'box-sizing': 'border-box',
          margin: '0',
          padding: '0',
        },
        styleHandler: vi.fn(async (code: string) => ({ css: code })),
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource,
      file: '/workspace/out/styles/current.css',
      cssHandlerOptions: {
        isMainChunk: false,
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        majorVersion: 4,
      } as any,
      styleHandler: vi.fn(async (code: string) => ({ css: code })),
      debug: vi.fn(),
      forceGenerator: true,
    })

    expect(resolveTailwindV4Source).toHaveBeenCalledWith(expect.objectContaining({
      css: rawSource,
    }))
    expect(generateMock).toHaveBeenCalledTimes(1)
    expectMiniProgramPreflight(result?.css)
    expect(result?.css).toContain('.raw-entry-only')
  })

  it('matches non-main Tailwind v4 cssEntries by source candidates before expanding every entry', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-css-entry-candidates-'))
    const mainCssFile = path.join(root, 'src/app.css')
    const subCssFile = path.join(root, 'src/sub/pages/index.css')
    const mainCss = '@import "tailwindcss" source(none);\n@source "./pages/**/*.{ts,tsx}";'
    const subCss = '@import "tailwindcss/theme.css" layer(theme);\n@import "tailwindcss/utilities.css" layer(utilities) source(none);\n@source "./**/*.{ts,tsx}";'
    await mkdir(path.dirname(mainCssFile), { recursive: true })
    await mkdir(path.dirname(subCssFile), { recursive: true })
    await writeFile(mainCssFile, mainCss)
    await writeFile(subCssFile, subCss)

    const runtimeSet = new Set(['sub-only'])
    const resolveTailwindV4Source = vi.fn(async (options: any) => ({
      projectRoot: root,
      base: firstResolvedCssSourceOption(options).base,
      baseFallbacks: [],
      css: firstResolvedCssSourceOption(options).css,
      dependencies: [firstResolvedCssSourceOption(options).file],
    }))
    const generateMock = vi.fn(async () => ({
      css: '/*! tailwindcss v4.0.0 */\n.sub-only{color:red}',
      rawCss: '.sub-only{color:red}',
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [subCssFile],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: root,
        base: root,
        baseFallbacks: [],
        css: mainCss,
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: root,
        baseFallbacks: [],
        cssEntries: [mainCssFile, subCssFile],
      })),
    }))

    try {
      const { generateCssByGenerator } = await import('@/generation/index')
      const result = await generateCssByGenerator({
        opts: {
          cssEntries: [mainCssFile, subCssFile],
          styleHandler: vi.fn(async (code: string) => ({ css: code })),
        } as any,
        runtimeState: {
          tailwindRuntime: {
            majorVersion: 4,
          } as any,
          readyPromise: Promise.resolve(),
        },
        runtime: runtimeSet,
        rawSource: subCss,
        file: path.join(root, 'dist/sub/pages/index.wxss'),
        cssHandlerOptions: {
          isMainChunk: true,
          majorVersion: 4,
        } as any,
        cssUserHandlerOptions: {
          isMainChunk: true,
          majorVersion: 4,
        } as any,
        styleHandler: vi.fn(async (code: string) => ({ css: code })),
        debug: vi.fn(),
        forceGenerator: true,
        getSourceCandidatesForEntries: vi.fn(entries =>
          entries?.some(entry => entry.base === path.dirname(subCssFile))
            ? new Set(['sub-only'])
            : new Set(['main-only']),
        ),
      })

      expect(resolveTailwindV4Source).toHaveBeenCalledWith(expect.objectContaining({
        base: path.dirname(subCssFile),
        css: subCss,
        cssEntries: [subCssFile],
      }))
      expect(resolveTailwindV4Source).not.toHaveBeenCalledWith(expect.objectContaining({
        cssEntries: [mainCssFile],
      }))
      expect(generateMock).toHaveBeenCalledTimes(1)
      expect(result?.css).not.toContain('view,text,::after,::before')
      expect(result?.css).toContain('.sub-only')
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('injects mini-program preflight for matched non-primary cssEntries that import full Tailwind', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-css-entry-full-preflight-'))
    const mainCssFile = path.join(root, 'src/app.css')
    const scopedCssFile = path.join(root, 'src/feature/pages/index.css')
    const mainCss = '@import "tailwindcss" source(none);\n@source "./pages/**/*.{ts,tsx}";'
    const scopedCss = '@import "tailwindcss" source(none);\n@source "./**/*.{ts,tsx}";'
    await mkdir(path.dirname(mainCssFile), { recursive: true })
    await mkdir(path.dirname(scopedCssFile), { recursive: true })
    await writeFile(mainCssFile, mainCss)
    await writeFile(scopedCssFile, scopedCss)

    const runtimeSet = new Set(['feature-only'])
    const resolveTailwindV4Source = vi.fn(async (options: any) => ({
      projectRoot: root,
      base: firstResolvedCssSourceOption(options).base,
      baseFallbacks: [],
      css: firstResolvedCssSourceOption(options).css,
      dependencies: [firstResolvedCssSourceOption(options).file],
    }))
    const generateMock = vi.fn(async () => ({
      css: '/*! tailwindcss v4.0.0 */\n.feature-only{color:red}',
      rawCss: '.feature-only{color:red}',
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [scopedCssFile],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: root,
        base: root,
        baseFallbacks: [],
        css: mainCss,
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: root,
        baseFallbacks: [],
        cssEntries: [mainCssFile, scopedCssFile],
      })),
    }))

    try {
      const { generateCssByGenerator } = await import('@/generation/index')
      const result = await generateCssByGenerator({
        opts: {
          cssEntries: [mainCssFile, scopedCssFile],
          cssPreflight: {
            border: '0 solid',
            'box-sizing': 'border-box',
            margin: '0',
            padding: '0',
          },
          styleHandler: vi.fn(async (code: string) => ({ css: code })),
        } as any,
        runtimeState: {
          tailwindRuntime: {
            majorVersion: 4,
          } as any,
          readyPromise: Promise.resolve(),
        },
        runtime: runtimeSet,
        rawSource: scopedCss,
        file: path.join(root, 'dist/feature/pages/index.wxss'),
        cssHandlerOptions: {
          isMainChunk: false,
          majorVersion: 4,
        } as any,
        cssUserHandlerOptions: {
          isMainChunk: false,
          majorVersion: 4,
        } as any,
        styleHandler: vi.fn(async (code: string) => ({ css: code })),
        debug: vi.fn(),
        forceGenerator: true,
        getSourceCandidatesForEntries: vi.fn(entries =>
          entries?.some(entry => entry.base === path.dirname(scopedCssFile))
            ? new Set(['feature-only'])
            : new Set(['main-only']),
        ),
      })

      expect(resolveTailwindV4Source).toHaveBeenCalledWith(expect.objectContaining({
        base: path.dirname(scopedCssFile),
        css: scopedCss,
        cssEntries: [scopedCssFile],
      }))
      expect(generateMock).toHaveBeenCalledTimes(1)
      expectMiniProgramPreflight(result?.css)
      expect(result?.css).toContain('.feature-only')
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('injects mini-program preflight for placeholder output matched to non-primary full Tailwind cssEntries', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-placeholder-entry-preflight-'))
    const mainCssFile = path.join(root, 'src/main.css')
    const scopedCssFile = path.join(root, 'src/sub-normal/pages/index.css')
    const mainCss = '@import "tailwindcss" source(none);\n@source "./pages/**/*.{vue,ts}";'
    const scopedCss = '@import "tailwindcss" source(none);\n@source "./**/*.{vue,ts}";'
    await mkdir(path.dirname(mainCssFile), { recursive: true })
    await mkdir(path.dirname(scopedCssFile), { recursive: true })
    await writeFile(mainCssFile, mainCss)
    await writeFile(scopedCssFile, scopedCss)

    const runtimeSet = new Set(['bg-normal-subpackage-marker'])
    const resolveTailwindV4Source = vi.fn(async (options: any) => ({
      projectRoot: root,
      base: firstResolvedCssSourceOption(options).base,
      baseFallbacks: [],
      css: firstResolvedCssSourceOption(options).css,
      dependencies: [firstResolvedCssSourceOption(options).file],
    }))
    const generateMock = vi.fn(async () => ({
      css: '/*! tailwindcss v4.0.0 */\n.bg-normal-subpackage-marker{background-color:#2563eb}',
      rawCss: '.bg-normal-subpackage-marker{background-color:#2563eb}',
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [scopedCssFile],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: root,
        base: root,
        baseFallbacks: [],
        css: mainCss,
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: root,
        baseFallbacks: [],
        cssEntries: [mainCssFile, scopedCssFile],
      })),
    }))

    try {
      const { generateCssByGenerator } = await import('@/generation/index')
      const result = await generateCssByGenerator({
        opts: {
          cssEntries: [mainCssFile, scopedCssFile],
          cssPreflight: {
            border: '0 solid',
            'box-sizing': 'border-box',
            margin: '0',
            padding: '0',
          },
          styleHandler: vi.fn(async (code: string) => ({ css: code })),
        } as any,
        runtimeState: {
          tailwindRuntime: {
            majorVersion: 4,
          } as any,
          readyPromise: Promise.resolve(),
        },
        runtime: runtimeSet,
        rawSource: '/*! weapp-tailwindcss generator-placeholder */',
        file: 'sub-normal/pages/index.wxss',
        cssHandlerOptions: {
          isMainChunk: false,
          postcssOptions: {
            options: {
              from: 'sub-normal/pages/index.wxss',
            },
          },
          majorVersion: 4,
        } as any,
        cssUserHandlerOptions: {
          isMainChunk: false,
          postcssOptions: {
            options: {
              from: 'sub-normal/pages/index.wxss',
            },
          },
          majorVersion: 4,
        } as any,
        styleHandler: vi.fn(async (code: string) => ({ css: code })),
        debug: vi.fn(),
        forceGenerator: true,
        getSourceCandidatesForEntries: vi.fn(entries =>
          entries?.some(entry => entry.base === path.dirname(scopedCssFile))
            ? new Set(['bg-normal-subpackage-marker'])
            : new Set(['main-only']),
        ),
      })

      expect(resolveTailwindV4Source).toHaveBeenCalledWith(expect.objectContaining({
        base: path.dirname(scopedCssFile),
        css: scopedCss,
        cssEntries: [scopedCssFile],
      }))
      expect(generateMock).toHaveBeenCalledTimes(1)
      expectMiniProgramPreflight(result?.css)
      expect(result?.css).toContain('.bg-normal-subpackage-marker')
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('preserves preflight emitted by explicit non-main Tailwind v4 cssSource outputs', async () => {
    const runtimeSet = new Set(['full-entry-only'])
    const mainCss = ':host,page,.tw-root,wx-root-portal-content { --spacing: 0.25rem; }'
    const fullEntryCss = '@import "tailwindcss" source(none);\n.full-entry-source{color:red}'
    const resolveTailwindV4Source = vi.fn(async (options: any) => ({
      projectRoot: '/project',
      base: firstResolvedCssSourceOption(options).base,
      baseFallbacks: [],
      css: firstResolvedCssSourceOption(options).css,
      dependencies: [firstResolvedCssSourceOption(options).file],
    }))
    const generateMock = vi.fn(async () => ({
      css: '/*! tailwindcss v4.0.0 */\nview,text,::after,::before{box-sizing:border-box;margin:0;padding:0;border:0 solid}\n.full-entry-only{color:red}',
      rawCss: 'view,text,::after,::before{box-sizing:border-box;margin:0;padding:0;border:0 solid}\n.full-entry-only{color:red}',
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: ['/project/src/feature/pages/index.css'],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: '/project',
        base: '/project',
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: '/project',
        baseFallbacks: [],
        cssSources: [
          {
            file: '/project/src/main.css',
            base: '/project/src',
            css: mainCss,
          },
          {
            file: '/project/src/feature/pages/index.css',
            base: '/project/src/feature/pages',
            css: fullEntryCss,
          },
        ],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const result = await generateCssByGenerator({
      opts: {
        cssPreflight: {
          border: '0 solid',
          'box-sizing': 'border-box',
          margin: '0',
          padding: '0',
        },
        styleHandler: vi.fn(async (code: string) => ({ css: code })),
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: fullEntryCss,
      file: '/project/output/current.wxss',
      cssHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: '/project/output/current.wxss',
          },
        },
        majorVersion: 4,
        sourceOptions: {
          outputRoot: '/project/output',
        },
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: '/project/output/current.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler: vi.fn(async (code: string) => ({ css: code })),
      debug: vi.fn(),
      forceGenerator: true,
      cssSources: [
        {
          file: '/project/src/main.css',
          base: '/project/src',
          css: mainCss,
        },
        {
          file: '/project/output/current.wxss',
          base: '/project/src/feature/pages',
          css: fullEntryCss,
        },
      ],
      getSourceCandidatesForEntries: vi.fn(entries =>
        entries?.some(entry => entry.base === '/project/src/feature')
          ? new Set(['full-entry-only'])
          : new Set(['text-[188rpx]']),
      ),
    })

    expect(resolveTailwindV4Source).toHaveBeenCalledWith(expect.objectContaining({
      base: '/project/src/feature/pages',
      css: fullEntryCss,
    }))
    expect(generateMock).toHaveBeenCalledTimes(1)
    expectMiniProgramPreflight(result?.css)
    expect(result?.css).toContain('.full-entry-only')
  })

  it('does not generate every Tailwind v4 cssSource when ordinary main css source is ambiguous', async () => {
    const runtimeSet = new Set(['text-[188rpx]'])
    const mainCss = '@import "tailwindcss" source(none);\n@source "./pages/**/*.{vue,ts}";'
    const subCss = '@import "tailwindcss" source(none);\n@source "./sub/**/*.{vue,ts}";'
    const resolveTailwindV4Source = vi.fn()
    const resolveTailwindV4SourceFromRuntime = vi.fn(async () => ({
      projectRoot: '/project',
      base: '/project',
      baseFallbacks: [],
      css: '@import "tailwindcss";',
      dependencies: [],
    }))
    const generateMock = vi.fn(async () => ({
      css: '.text-_b188rpx_B{font-size:188rpx}',
      rawCss: '.text-\\[188rpx\\]{font-size:188rpx}',
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: ['/project/src/main.css'],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source,
      resolveTailwindV4SourceFromRuntime,
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: '/project',
        baseFallbacks: [],
        cssSources: [
          {
            file: '/project/src/main.css',
            base: '/project/src',
            css: mainCss,
          },
          {
            file: '/project/src/sub/pages/index.css',
            base: '/project/src/sub/pages',
            css: subCss,
          },
        ],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const result = await generateCssByGenerator({
      opts: {
        styleHandler: vi.fn(async (code: string) => ({ css: code })),
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: ':host,page,.tw-root,wx-root-portal-content { --spacing: 0.25rem; }',
      file: '/project/dist/dev/mp-weixin/app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: '/project/dist/dev/mp-weixin/app.wxss',
          },
        },
        majorVersion: 4,
        sourceOptions: {
          outputRoot: '/project/dist/dev/mp-weixin',
        },
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: '/project/dist/dev/mp-weixin/app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler: vi.fn(async (code: string) => ({ css: code })),
      debug: vi.fn(),
      forceGenerator: true,
      getSourceCandidatesForEntries: vi.fn(() => new Set()),
    })

    expect(resolveTailwindV4Source).not.toHaveBeenCalled()
    expect(resolveTailwindV4SourceFromRuntime).toHaveBeenCalledTimes(1)
    expect(generateMock).toHaveBeenCalledTimes(1)
    expect(result?.css.match(/text-_b188rpx_B/g) ?? []).toHaveLength(1)
  })

  it('scopes Tailwind v4 generator candidates by matched css source entries', async () => {
    const appCss = '@import "tailwindcss" source(none);\n@source "./pages/**/*.{ts,tsx}";'
    const subCss = '@import "tailwindcss" source(none);\n@source "./sub-normal/**/*.{ts,tsx}";'
    const generateMock = vi.fn(async (options: any) => {
      const candidates = [...options.candidates].sort()
      return {
        css: candidates.map(candidate => `.${candidate}{}`).join('\n'),
        rawCss: candidates.map(candidate => `.${candidate}{}`).join('\n'),
        target: 'weapp',
        classSet: new Set(candidates),
        dependencies: [],
        sources: [],
        root: null,
      }
    })

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source: vi.fn(async (options: any) => ({
        projectRoot: '/project',
        base: firstResolvedCssSourceOption(options).base,
        baseFallbacks: [],
        css: firstResolvedCssSourceOption(options).css,
        dependencies: [firstResolvedCssSourceOption(options).file],
      })),
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: '/project',
        base: '/project',
        baseFallbacks: [],
        css: appCss,
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: '/project',
        baseFallbacks: [],
        cssSources: [
          {
            file: '/project/app.css',
            base: '/project',
            css: appCss,
          },
          {
            file: '/project/sub-normal/index.css',
            base: '/project',
            css: subCss,
          },
        ],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const result = await generateCssByGenerator({
      opts: {
        styleHandler: vi.fn(async (code: string) => ({ css: code })),
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: new Set(['main-only', 'sub-only']),
      rawSource: subCss,
      file: '/project/dist/sub-normal/index.wxss',
      cssHandlerOptions: {
        isMainChunk: false,
        majorVersion: 4,
        postcssOptions: {
          options: {
            from: '/project/sub-normal/index.css',
          },
        },
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        majorVersion: 4,
      } as any,
      getSourceCandidatesForEntries: vi.fn(() => new Set(['sub-only'])),
      styleHandler: vi.fn(async (code: string) => ({ css: code })),
      debug: vi.fn(),
    })

    const candidates = generateMock.mock.calls[0]?.[0]?.candidates as Set<string>
    expect([...candidates]).toEqual(['sub-only'])
  })

  it('scopes Tailwind v4 generator candidates by subpackage relative source entries', async () => {
    const root = path.resolve('/project')
    const subCssFile = path.join(root, 'sub-normal/pages/index.css')
    const subWxmlFile = path.join(root, 'sub-normal/pages/index.wxml')
    const subCss = '@import "tailwindcss" source(none);\n@config "../../tailwind.config.sub-normal.js";\n@source "../**/*.{css,wxml,html,js,ts,jsx,tsx,vue}";'
    const generateMock = vi.fn(async (options: any) => {
      const candidates = [...options.candidates].sort()
      return {
        css: candidates.map(candidate => `.${candidate}{}`).join('\n'),
        rawCss: candidates.map(candidate => `.${candidate}{}`).join('\n'),
        target: 'weapp',
        classSet: new Set(candidates),
        dependencies: [],
        sources: [],
        root: null,
      }
    })

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source: vi.fn(async (options: any) => ({
        projectRoot: root,
        base: firstResolvedCssSourceOption(options).base,
        baseFallbacks: [],
        css: firstResolvedCssSourceOption(options).css,
        dependencies: [firstResolvedCssSourceOption(options).file],
      })),
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: root,
        base: root,
        baseFallbacks: [],
        css: subCss,
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: root,
        baseFallbacks: [],
        cssSources: [
          {
            file: subCssFile,
            base: path.dirname(subCssFile),
            css: subCss,
          },
        ],
      })),
    }))

    const { createSourceCandidateCollector } = await import('@/bundlers/vite/source-candidates')
    const collector = createSourceCandidateCollector()
    await collector.merge(subWxmlFile, '<view class="bg-[#000000] text-[46px] h-[28px]"></view>')

    const { generateCssByGenerator } = await import('@/generation/index')
    await generateCssByGenerator({
      opts: {
        styleHandler: vi.fn(async (code: string) => ({ css: code })),
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: new Set(['bg-[#000000]', 'text-[46px]', 'h-[28px]']),
      rawSource: subCss,
      file: path.join(root, 'dist/sub-normal/pages/index.wxss'),
      cssHandlerOptions: {
        isMainChunk: false,
        majorVersion: 4,
        postcssOptions: {
          options: {
            from: subCssFile,
          },
        },
        sourceOptions: {
          outputRoot: path.join(root, 'dist'),
        },
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        majorVersion: 4,
      } as any,
      getSourceCandidatesForEntries: entries => collector.valuesForEntries(entries),
      styleHandler: vi.fn(async (code: string) => ({ css: code })),
      debug: vi.fn(),
    })

    const candidates = generateMock.mock.calls[0]?.[0]?.candidates as Set<string>
    expect([...candidates].sort()).toEqual(['bg-[#000000]', 'h-[28px]', 'text-[46px]'])
  })

  it('defers empty scoped Tailwind v4 css sources in the Vite css pipeline', async () => {
    const root = '/project'
    const subCssFile = `${root}/src/sub-normal/pages/index.css`
    const subCss = '@import "tailwindcss" source(none);\n@source "../**/*.{css,ts,tsx,jsx,js,html}";'
    const generateMock = vi.fn(async () => ({
      css: '.should-not-generate{}',
      rawCss: '.should-not-generate{}',
      target: 'weapp',
      classSet: new Set(),
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source: vi.fn(async (options: any) => ({
        projectRoot: root,
        base: firstResolvedCssSourceOption(options).base,
        baseFallbacks: [],
        css: firstResolvedCssSourceOption(options).css,
        dependencies: [firstResolvedCssSourceOption(options).file],
      })),
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: root,
        base: root,
        baseFallbacks: [],
        css: subCss,
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: root,
        baseFallbacks: [],
        cssSources: [
          {
            file: subCssFile,
            base: `${root}/src/sub-normal/pages`,
            css: subCss,
          },
        ],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const result = await generateCssByGenerator({
      opts: {
        styleHandler: vi.fn(async (code: string) => ({ css: code })),
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: new Set(),
      rawSource: subCss,
      file: subCssFile,
      cssHandlerOptions: {
        isMainChunk: false,
        majorVersion: 4,
        postcssOptions: {
          options: {
            from: subCssFile,
          },
        },
        sourceOptions: {
          outputRoot: `${root}/dist`,
        },
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        majorVersion: 4,
      } as any,
      getSourceCandidatesForEntries: vi.fn(() => new Set()),
      styleHandler: vi.fn(async (code: string) => ({ css: code })),
      debug: vi.fn(),
      deferEmptyScopedCssSource: true,
    })

    expect(result).toBeUndefined()
    expect(generateMock).not.toHaveBeenCalled()
  })

  it('matches Tailwind v4 cssSources by postcss input file before source content fallback', async () => {
    const appCss = '@import "tailwindcss" source(none);\n@source "./pages/**/*.{ts,tsx}";'
    const subCss = '@import "tailwindcss" source(none);\n@source "./sub-independent/**/*.{ts,tsx}";'
    const resolveTailwindV4Source = vi.fn(async (options: any) => ({
      projectRoot: '/project',
      base: firstResolvedCssSourceOption(options).base,
      baseFallbacks: [],
      css: firstResolvedCssSourceOption(options).css,
      dependencies: [firstResolvedCssSourceOption(options).file],
    }))
    const generateMock = vi.fn(async (options: any) => {
      const candidates = [...options.candidates].sort()
      return {
        css: candidates.map(candidate => `.${candidate}{}`).join('\n'),
        rawCss: candidates.map(candidate => `.${candidate}{}`).join('\n'),
        target: 'weapp',
        classSet: new Set(candidates),
        dependencies: [],
        sources: [],
        root: null,
      }
    })

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: '/project',
        base: '/project',
        baseFallbacks: [],
        css: appCss,
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: '/project',
        baseFallbacks: [],
        cssSources: [
          {
            file: '/project/src/app.css',
            base: '/project/src',
            css: appCss,
          },
          {
            file: '/project/src/sub-independent/pages/index.css',
            base: '/project/src/sub-independent/pages',
            css: subCss,
          },
        ],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    await generateCssByGenerator({
      opts: {
        styleHandler: vi.fn(async (code: string) => ({ css: code })),
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: new Set(['main-only', 'sub-only']),
      rawSource: subCss,
      file: '/project/dist/sub-independent/pages/index.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        majorVersion: 4,
        postcssOptions: {
          options: {
            from: '/project/src/sub-independent/pages/index.css',
          },
        },
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: true,
        majorVersion: 4,
      } as any,
      getSourceCandidatesForEntries: vi.fn(entries =>
        entries?.some(entry => entry.base.includes('sub-independent'))
          ? new Set(['sub-only'])
          : new Set(['main-only']),
      ),
      styleHandler: vi.fn(async (code: string) => ({ css: code })),
      debug: vi.fn(),
    })

    expect(resolveTailwindV4Source).toHaveBeenCalledTimes(1)
    expect(resolveTailwindV4Source).toHaveBeenCalledWith(expect.objectContaining({
      base: '/project/src/sub-independent/pages',
      css: subCss,
    }))
    const candidates = generateMock.mock.calls[0]?.[0]?.candidates as Set<string>
    expect([...candidates]).toEqual(['sub-only'])
  })

  it('matches Tailwind v4 cssSources by equivalent source content', async () => {
    const appCss = '@import "tailwindcss" source(none);\n@source "./pages/**/*.{ts,tsx}";'
    const subCss = '@import "tailwindcss" source(none);\n@source "./sub-independent/**/*.{ts,tsx}";'
    const resolveTailwindV4Source = vi.fn(async (options: any) => ({
      projectRoot: '/project',
      base: firstResolvedCssSourceOption(options).base,
      baseFallbacks: [],
      css: firstResolvedCssSourceOption(options).css,
      dependencies: [firstResolvedCssSourceOption(options).file],
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: vi.fn(async () => ({
          css: '',
          rawCss: '',
          target: 'weapp',
          classSet: new Set(),
          dependencies: [],
          sources: [],
          root: null,
        })),
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: '/project',
        base: '/project/src',
        baseFallbacks: [],
        css: appCss,
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: '/project',
        baseFallbacks: [],
        cssSources: [
          {
            file: '/project/src/app.css',
            base: '/project/src',
            css: appCss,
          },
          {
            file: '/project/src/sub-independent/pages/index.css',
            base: '/project/src/sub-independent/pages',
            css: subCss,
          },
        ],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    await generateCssByGenerator({
      opts: {
        styleHandler: vi.fn(async (code: string) => ({ css: code })),
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: new Set(['main-only']),
      rawSource: subCss,
      file: '/project/dist/sub-independent/pages/index.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: true,
        majorVersion: 4,
      } as any,
      getSourceCandidatesForEntries: vi.fn(() => new Set()),
      styleHandler: vi.fn(async (code: string) => ({ css: code })),
      debug: vi.fn(),
    })

    expect(resolveTailwindV4Source).toHaveBeenCalledWith(expect.objectContaining({
      base: '/project/src/sub-independent/pages',
      css: subCss,
    }))
  })

  it('does not match Tailwind v4 cssSources only by similar output and source paths', async () => {
    const appCss = '@import "tailwindcss" source(none);\n@source "./pages/**/*.{ts,tsx}";'
    const subCss = '@import "tailwindcss" source(none);\n@source "./sub-independent/**/*.{ts,tsx}";'
    const resolveTailwindV4Source = vi.fn(async (options: any) => ({
      projectRoot: '/project',
      base: options.base ?? firstResolvedCssSourceOption(options).base ?? '/project',
      baseFallbacks: [],
      css: options.css ?? firstResolvedCssSourceOption(options).css ?? appCss,
      dependencies: firstResolvedCssSourceOption(options).file ? [firstResolvedCssSourceOption(options).file] : [],
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: vi.fn(async () => ({
          css: '',
          rawCss: '',
          target: 'weapp',
          classSet: new Set(),
          dependencies: [],
          sources: [],
          root: null,
        })),
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: '/project',
        base: '/project/src',
        baseFallbacks: [],
        css: appCss,
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: '/project',
        baseFallbacks: [],
        cssSources: [
          {
            file: '/project/src/app.css',
            base: '/project/src',
            css: appCss,
          },
          {
            file: '/project/src/sub-independent/pages/index.css',
            base: '/project/src/sub-independent/pages',
            css: subCss,
          },
        ],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    await generateCssByGenerator({
      opts: {
        styleHandler: vi.fn(async (code: string) => ({ css: code })),
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: new Set(['main-only']),
      rawSource: '@import "tailwindcss" source(none);\n@source "./other/**/*.{ts,tsx}";',
      file: '/project/dist/sub-independent/pages/index.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: true,
        majorVersion: 4,
      } as any,
      getSourceCandidatesForEntries: vi.fn(() => new Set()),
      styleHandler: vi.fn(async (code: string) => ({ css: code })),
      debug: vi.fn(),
    })

    expect(resolveTailwindV4Source).not.toHaveBeenCalledWith(expect.objectContaining({
      cssSources: [expect.objectContaining({
        file: '/project/src/sub-independent/pages/index.css',
      })],
    }))
  })

  it('normalizes relative @config directives across auto-discovered Tailwind v4 cssSources', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-v4-css-sources-config-'))
    const appCssFile = path.join(root, 'src/app.css')
    const intellisenseCssFile = path.join(root, 'src/tailwind-intellisense.css')
    const configFile = path.join(root, 'tailwind.config.js')
    await mkdir(path.dirname(appCssFile), { recursive: true })
    await writeFile(configFile, 'module.exports = { content: ["./src/**/*.{ts,tsx}"] }\n')
    const appCss = '@import "tailwindcss" source(none);\n@config "../tailwind.config.js";\n@source "../src/**/*.{ts,tsx}";'
    const intellisenseCss = '@import "tailwindcss" source(none);\n@config "../tailwind.config.js";\n@source "../src/**/*.{ts,tsx}";'
    await writeFile(appCssFile, appCss)
    await writeFile(intellisenseCssFile, intellisenseCss)

    const resolveTailwindV4Source = vi.fn(async (options: any) => ({
      projectRoot: root,
      base: root,
      baseFallbacks: [],
      css: options.cssSources?.map((source: { css: string }) => source.css).join('\n') ?? options.css,
      dependencies: [],
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: vi.fn(async () => ({
          css: '',
          rawCss: '',
          target: 'weapp',
          classSet: new Set(),
          dependencies: [],
          sources: [],
          root: null,
        })),
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: root,
        base: root,
        baseFallbacks: [],
        css: appCss,
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: root,
        baseFallbacks: [],
        cssSources: [
          {
            file: appCssFile,
            base: path.dirname(appCssFile),
            css: appCss,
            dependencies: [configFile],
          },
          {
            file: intellisenseCssFile,
            base: path.dirname(intellisenseCssFile),
            css: intellisenseCss,
            dependencies: [configFile],
          },
        ],
      })),
    }))

    try {
      const { generateCssByGenerator } = await import('@/generation/index')
      await generateCssByGenerator({
        opts: {
          styleHandler: vi.fn(async (code: string) => ({ css: code })),
        } as any,
        runtimeState: {
          tailwindRuntime: {
            majorVersion: 4,
          } as any,
          readyPromise: Promise.resolve(),
        },
        runtime: new Set(),
        rawSource: '/*! tailwindcss v4.3.0 | MIT License | https://tailwindcss.com */\n.app{}',
        file: path.join(root, 'dist/app-origin.wxss'),
        cssHandlerOptions: {
          isMainChunk: true,
          majorVersion: 4,
          postcssOptions: {
            options: {
              from: path.join(root, 'dist/app-origin.wxss'),
            },
          },
        } as any,
        cssUserHandlerOptions: {
          isMainChunk: true,
          majorVersion: 4,
        } as any,
        getSourceCandidatesForEntries: vi.fn(() => new Set()),
        styleHandler: vi.fn(async (code: string) => ({ css: code })),
        debug: vi.fn(),
      })
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }

    const sourceOptions = resolveTailwindV4Source.mock.calls[0]?.[0]
    expect(sourceOptions.cssSources).toHaveLength(2)
    for (const cssSource of sourceOptions.cssSources) {
      expect(cssSource.css).toContain(configFile.replaceAll('\\', '/'))
      expect(cssSource.css).not.toContain('../tailwind.config.js')
    }
  })

  it('does not append unrelated generated raw css when a Tailwind v4 cssSource is path matched', async () => {
    const appCss = '@import "tailwindcss" source(none);\n@source "./pages/**/*.{ts,tsx}";'
    const subCss = '@import "tailwindcss" source(none);\n@source "./sub-independent/**/*.{ts,tsx}";'
    const rawAppGeneratedCss = '/*! tailwindcss v4.3.0 | MIT License | https://tailwindcss.com */\n.main-only{display:block}'
    const generateMock = vi.fn(async () => ({
      css: '/*! tailwindcss v4.3.0 | MIT License | https://tailwindcss.com */\n.sub-only{display:block}',
      rawCss: '.sub-only{display:block}',
      target: 'weapp',
      classSet: new Set(['sub-only']),
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source: vi.fn(async (options: any) => ({
        projectRoot: '/project',
        base: firstResolvedCssSourceOption(options).base,
        baseFallbacks: [],
        css: firstResolvedCssSourceOption(options).css,
        dependencies: [firstResolvedCssSourceOption(options).file],
      })),
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: '/project',
        base: '/project/src',
        baseFallbacks: [],
        css: appCss,
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: '/project',
        baseFallbacks: [],
        cssSources: [
          {
            file: '/project/src/app.css',
            base: '/project/src',
            css: appCss,
          },
          {
            file: '/project/src/sub-independent/pages/index.css',
            base: '/project/src/sub-independent/pages',
            css: subCss,
          },
        ],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const result = await generateCssByGenerator({
      opts: {
        styleHandler: vi.fn(async (code: string) => ({ css: code })),
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: new Set(['main-only', 'sub-only']),
      rawSource: rawAppGeneratedCss,
      file: '/project/dist/sub-independent/pages/index.wxss',
	      cssHandlerOptions: {
	        isMainChunk: false,
	        majorVersion: 4,
	        postcssOptions: {
	          options: {
	            from: '/project/src/sub-independent/pages/index.css',
	          },
	        },
	      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        majorVersion: 4,
      } as any,
      getSourceCandidatesForEntries: vi.fn(() => new Set(['sub-only'])),
      styleHandler: vi.fn(async (code: string) => ({ css: code })),
      debug: vi.fn(),
    })

    expect(result?.css).toContain('.sub-only')
    expect(result?.css).not.toContain('.main-only')
  })

  it('uses matched Tailwind v4 cssSource metadata to resolve dependency fallback entries', async () => {
    const appCss = '@import "tailwindcss" source(none);\n@source "./pages/**/*.{ts,tsx}";'
    const subCss = '@import "tailwindcss" source(none);\n@config "./tailwind.config.sub-independent.js";'
    const resolvedSubCss = '/*! tailwindcss v4.3.0 | MIT License | https://tailwindcss.com */\n'
    const subConfig = '/project/src/sub-independent/pages/tailwind.config.sub-independent.js'
    const generateMock = vi.fn(async (options: any) => {
      const candidates = [...options.candidates].sort()
      return {
        css: candidates.map(candidate => `.${candidate}{}`).join('\n'),
        rawCss: candidates.map(candidate => `.${candidate}{}`).join('\n'),
        target: 'weapp',
        classSet: new Set(candidates),
        dependencies: [],
        sources: [],
        root: null,
      }
    })

    vi.doMock('node:fs', () => ({
      existsSync: vi.fn((file: string) => file === subConfig),
      readFileSync: vi.fn(() => 'module.exports = { content: ["./**/*.{ts,tsx}"] }'),
    }))
    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source: vi.fn(async (options: any) => ({
        projectRoot: '/project',
        base: firstResolvedCssSourceOption(options).base,
        baseFallbacks: [],
        css: resolvedSubCss,
        dependencies: [firstResolvedCssSourceOption(options).file],
      })),
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: '/project',
        base: '/project/src',
        baseFallbacks: [],
        css: appCss,
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: '/project',
        baseFallbacks: [],
        cssSources: [
          {
            file: '/project/src/app.css',
            base: '/project/src',
            css: appCss,
          },
          {
            file: '/project/src/sub-independent/pages/index.css',
            base: '/project/src/sub-independent/pages',
            css: subCss,
            dependencies: [subConfig],
          },
        ],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    await generateCssByGenerator({
      opts: {
        styleHandler: vi.fn(async (code: string) => ({ css: code })),
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: new Set(['main-only']),
      rawSource: subCss,
      file: '/project/dist/sub-independent/pages/index.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        majorVersion: 4,
        postcssOptions: {
          options: {
            from: '/project/src/sub-independent/pages/index.css',
          },
        },
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: true,
        majorVersion: 4,
      } as any,
      getSourceCandidatesForEntries: vi.fn(entries =>
        entries?.some(entry => entry.base.endsWith('/src/sub-independent/pages'))
          ? new Set()
          : new Set(['main-only']),
      ),
      styleHandler: vi.fn(async (code: string) => ({ css: code })),
      debug: vi.fn(),
    })

    const generateOptions = generateMock.mock.calls[0]?.[0]
    expect(generateOptions.candidates).toEqual(new Set())
    expect(generateOptions.scanSources).toBe(false)
  })

  it('keeps Tailwind v4 @config css entries on the full runtime set', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-v4-config-runtime-'))
    const cssFile = path.join(root, 'src/app.wxss')
    const configFile = path.join(root, 'tailwind.config.js')
    await mkdir(path.dirname(cssFile), { recursive: true })
    await writeFile(configFile, 'module.exports = { content: ["./src/**/*.{wxml,ts}"] }')
    const generateMock = vi.fn(async ({ candidates }: { candidates: Set<string> }) => ({
      css: [...candidates].sort().join('\n'),
      rawCss: [...candidates].sort().join('\n'),
      target: 'weapp',
      classSet: new Set(candidates),
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      ...createDefaultGeneratorMock(),
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    await generateCssByGenerator({
      opts: {
        generator: {
          target: 'weapp',
        },
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: new Set(['i-mdi-ab-testing', 'mt-2']),
      rawSource: [
        '@config "../tailwind.config.js";',
        '@tailwind base;',
        '@tailwind components;',
        '@tailwind utilities;',
      ].join('\n'),
      file: cssFile,
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: cssFile,
          },
        },
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: true,
      } as any,
      getSourceCandidatesForEntries: vi.fn(() => new Set(['mt-2'])),
      styleHandler: vi.fn(async (code: string) => ({ css: code })),
      debug: vi.fn(),
    })

    const generateOptions = generateMock.mock.calls[0]?.[0]
    expect(generateOptions.candidates).toEqual(new Set(['i-mdi-ab-testing', 'mt-2']))
  })

  it('isolates Tailwind v4 generated subpackage css matched from source-side css entry', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-source-side-subpackage-'))
    const cssFile = path.join(root, 'src/sub-normal/pages/index.css')
    await mkdir(path.dirname(cssFile), { recursive: true })
    await writeFile(cssFile, [
      '@import "tailwindcss" source(none);',
      '@config "./tailwind.config.sub-normal.js";',
    ].join('\n'))
    await writeFile(path.join(root, 'src/sub-normal/pages/tailwind.config.sub-normal.js'), 'module.exports = { content: [] }')
    const generateMock = vi.fn(async (options: any) => {
      const candidates = [...options.candidates].sort()
      return {
        css: candidates.map(candidate => `.${candidate}{}`).join('\n'),
        rawCss: candidates.map(candidate => `.${candidate}{}`).join('\n'),
        target: 'weapp',
        classSet: new Set(candidates),
        dependencies: [],
        sources: [],
        root: null,
      }
    })

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source: vi.fn(async (options: any) => ({
        projectRoot: root,
        base: options.base,
        baseFallbacks: [],
        css: options.css,
        dependencies: [],
      })),
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: root,
        base: root,
        baseFallbacks: [],
        css: '@import "tailwindcss" source(none);\n@source "./src/**/*.{vue,ts}";',
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: root,
        baseFallbacks: [],
      })),
    }))

    try {
      const { generateCssByGenerator } = await import('@/generation/index')
      await generateCssByGenerator({
        opts: {
          styleHandler: vi.fn(async (code: string) => ({ css: code })),
        } as any,
        runtimeState: {
          tailwindRuntime: {
            majorVersion: 4,
          } as any,
          readyPromise: Promise.resolve(),
        },
        runtime: new Set(['main-only']),
        rawSource: [
          ':host,page,.tw-root,wx-root-portal-content { --color-slate-50: #f8fafc; }',
          '.main-only{}',
        ].join('\n'),
        file: path.join(root, 'dist/dev/mp-weixin/sub-normal/pages/index.wxss'),
        cssHandlerOptions: {
          isMainChunk: true,
          majorVersion: 4,
          sourceOptions: {
            outputRoot: path.join(root, 'dist/dev/mp-weixin'),
            sourceFile: cssFile,
            sourceCss: await readFile(cssFile, 'utf8'),
          },
          postcssOptions: {
            options: {
              from: path.join(root, 'dist/dev/mp-weixin/sub-normal/pages/index.wxss'),
            },
          },
        } as any,
        cssUserHandlerOptions: {
          isMainChunk: true,
          majorVersion: 4,
        } as any,
        getSourceCandidatesForEntries: vi.fn(() => new Set()),
        styleHandler: vi.fn(async (code: string) => ({ css: code })),
        debug: vi.fn(),
      })
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }

    const generateOptions = generateMock.mock.calls[0]?.[0]
    expect(generateOptions.candidates).toEqual(new Set())
    expect(generateOptions.scanSources).toBe(false)
  })

  it('prefers source-side Tailwind v4 subpackage css over auto-discovered global css sources', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-source-side-relative-subpackage-'))
    const mainCssFile = path.join(root, 'src/main.css')
    const subCssFile = path.join(root, 'src/sub-normal/pages/index.css')
    await mkdir(path.dirname(subCssFile), { recursive: true })
    await writeFile(mainCssFile, [
      '@import "tailwindcss" source(none);',
      '@source "../src/**/*.{vue,js,ts}";',
    ].join('\n'))
    await writeFile(subCssFile, [
      '@import "tailwindcss" source(none);',
      '@config "./tailwind.config.sub-normal.js";',
    ].join('\n'))
    await writeFile(path.join(root, 'src/sub-normal/pages/tailwind.config.sub-normal.js'), 'module.exports = { content: [] }')
    const generateMock = vi.fn(async (options: any) => {
      const candidates = [...options.candidates].sort()
      return {
        css: candidates.map(candidate => `.${candidate}{}`).join('\n'),
        rawCss: candidates.map(candidate => `.${candidate}{}`).join('\n'),
        target: 'weapp',
        classSet: new Set(candidates),
        dependencies: [],
        sources: [],
        root: null,
      }
    })
    const resolveTailwindV4Source = vi.fn(async (options: any) => ({
      projectRoot: root,
      base: options.base,
      baseFallbacks: [],
      css: options.css,
      dependencies: [],
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: root,
        base: root,
        baseFallbacks: [],
        css: '@import "tailwindcss" source(none);\n@source "./src/**/*.{vue,ts}";',
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: root,
        baseFallbacks: [],
        cssSources: [
          {
            file: mainCssFile,
            base: path.dirname(mainCssFile),
            css: '@import "tailwindcss" source(none);\n@source "../src/**/*.{vue,js,ts}";',
          },
          {
            file: subCssFile,
            base: path.dirname(subCssFile),
            css: '@import "tailwindcss" source(none);\n@config "./tailwind.config.sub-normal.js";',
          },
        ],
      })),
    }))

    try {
      const { generateCssByGenerator } = await import('@/generation/index')
      await generateCssByGenerator({
        opts: {
          styleHandler: vi.fn(async (code: string) => ({ css: code })),
        } as any,
        runtimeState: {
          tailwindRuntime: {
            majorVersion: 4,
          } as any,
          readyPromise: Promise.resolve(),
        },
        runtime: new Set(['main-only']),
        rawSource: [
          ':host,page,.tw-root,wx-root-portal-content { --color-slate-50: #f8fafc; }',
          '.main-only{}',
        ].join('\n'),
        file: 'sub-normal/pages/index.wxss',
        cssHandlerOptions: {
          isMainChunk: true,
          majorVersion: 4,
          postcssOptions: {
            options: {
              from: 'sub-normal/pages/index.wxss',
            },
          },
        } as any,
        cssUserHandlerOptions: {
          isMainChunk: true,
          majorVersion: 4,
        } as any,
        getSourceCandidatesForEntries: vi.fn(entries =>
          entries !== undefined
            ? new Set()
            : new Set(['main-only']),
        ),
        styleHandler: vi.fn(async (code: string) => ({ css: code })),
        debug: vi.fn(),
      })
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }

    expect(resolveTailwindV4Source).toHaveBeenCalledWith(expect.objectContaining({
      base: path.dirname(subCssFile),
      css: expect.stringContaining('tailwind.config.sub-normal.js'),
    }))
    const generateOptions = generateMock.mock.calls[0]?.[0]
    expect(generateOptions.candidates).toEqual(new Set())
    expect(generateOptions.scanSources).toBe(false)
  })

  it('normalizes Tailwind v4 @config directives when css import output no longer matches the source entry name', async () => {
    const runtimeSet = new Set(['bg-slate-50'])
    const css = '@import "tailwindcss";\n@config "../tailwind.config.order.js";'
    const resolveTailwindV4Source = vi.fn(async (options: any) => ({
      projectRoot: '/project',
      base: options.base,
      baseFallbacks: [],
      css: options.css,
      dependencies: [],
    }))

    vi.doMock('node:fs', () => ({
      existsSync: vi.fn((file: string) => file === '/project/tailwind.config.order.js'),
      readFileSync: vi.fn(() => '@import "tailwindcss";'),
    }))
    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: vi.fn(async () => ({
          css: '.bg-slate-50{background-color:rgb(248,250,252)}',
          rawCss: css,
          target: 'weapp',
          classSet: runtimeSet,
          dependencies: [],
          sources: [],
          root: null,
        })),
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: '/project',
        base: '/project',
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: '/project',
        baseFallbacks: [],
        cssEntries: ['/project/src/main.css', '/project/src/common.css'],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const result = await generateCssByGenerator({
      opts: {
        styleHandler: vi.fn(async (code: string) => ({ css: code })),
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: css,
      file: 'pages-order/index.wxss',
      cssHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'pages-order/index.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'pages-order/index.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler: vi.fn(async (code: string) => ({ css: code })),
      debug: vi.fn(),
    })

    expect(resolveTailwindV4Source).toHaveBeenCalledWith(expect.objectContaining({
      css: expect.stringContaining('@config "/project/tailwind.config.order.js";'),
    }))
    expect(result?.css).toBe('.bg-slate-50{background-color:rgb(248,250,252)}')
  })

  it('generates scoped tailwind css assets outside the main chunk', async () => {
    const runtimeSet = new Set(['bg-emerald-500'])
    const rawTailwindCss = '/*! tailwindcss v4.2.4 | MIT License | https://tailwindcss.com */\n.bg-emerald-500:not(#\\#){background-color:rgb(0,185,129)}'
    const weappCss = '.bg-emerald-500{background-color:rgb(0,185,129)}'
    const generateMock = vi.fn(async () => ({
      css: weappCss,
      rawCss: rawTailwindCss,
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: `legacy:${code}` }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: rawTailwindCss,
      file: 'pages-order/pages/home/home.wxss',
      cssHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'pages-order/pages/home/home.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'pages-order/pages/home/home.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(result?.css).toBe(weappCss)
    expect(styleHandler).not.toHaveBeenCalled()
  })

  it('treats generator placeholder marker as a Tailwind entry and removes it from output', async () => {
    const runtimeSet = new Set(['w-[100px]'])
    const rawTailwindCss = '.w-\\[100px\\]{width:100px}'
    const weappCss = '.w-_b100px_B{width:100px}'
    const generateMock = vi.fn(async () => ({
      css: weappCss,
      rawCss: rawTailwindCss,
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
    }))

    const { generateCssByGenerator, hasTailwindSourceDirectives } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: `legacy:${code}` }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: '/*! weapp-tailwindcss generator-placeholder */\n.card{color:red}',
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(hasTailwindSourceDirectives('/*! weapp-tailwindcss generator-placeholder */')).toBe(true)
    expect(result?.css).toBe('.w-_b100px_B{width:100px}\nlegacy:.card{color:red}')
    expect(result?.css).not.toContain('generator-placeholder')
    expect(styleHandler).toHaveBeenCalledWith('.card{color:red}', expect.objectContaining({
      isMainChunk: false,
    }))
  })

  it('removes media-wrapped generator placeholder and Tailwind v4 source directives from mini-program output', async () => {
    const runtimeSet = new Set(['w-[100px]'])
    const rawTailwindCss = '.w-\\[100px\\]{width:100px}'
    const weappCss = '.w-_b100px_B{width:100px}'
    const generateMock = vi.fn(async () => ({
      css: weappCss,
      rawCss: rawTailwindCss,
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
      resolveTailwindV4Source: vi.fn(async (options: any) => ({
        projectRoot: process.cwd(),
        base: options.base ?? process.cwd(),
        baseFallbacks: [],
        css: options.css,
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        packageName: 'tailwindcss',
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: `legacy:${code}` }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: [
        '/* uni variables */',
        '@media source(none){',
        '/*! weapp-tailwindcss generator-placeholder */',
        '}',
        '@config "./tailwind.config.js";',
        '@source "./App.uvue";',
        '@source not "./unpackage/**/*";',
      ].join('\n'),
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(result?.css).toContain(weappCss)
    expect(result?.css).toContain('legacy:/* uni variables */')
    expect(result?.css).not.toContain('@media source(none)')
    expect(result?.css).not.toContain('generator-placeholder')
    expect(result?.css).not.toContain('@config')
    expect(result?.css).not.toContain('@source')
    expect(result?.css).not.toMatch(/^\s*\}\s*$/m)
  })

  it('removes minified Tailwind v4 source media and directives before preserving web user css', async () => {
    const runtimeSet = new Set(['i-mdi-home'])
    const generatedCss = '.i-mdi-home{display:inline-block}'
    const rawSource = [
      '@media source(none){@layer theme, base, components, utilities;@layer utilities{.i-mdi-home{display:inline-block}}}',
      '@config "../tailwind.config.js";',
      '@source "../src/**/*.{vue,ts}";',
      '@custom-variant system-dark{@media (prefers-color-scheme: dark) {@slot;}}',
      '@theme{ --color-midnight: #121063; }',
      '@layer components{.layer-card-v4{display:flex}}',
      '.weapp-tw-user-ui-card{display:inline-flex}',
      '@keyframes weappTwUserUiRotation{to{transform:rotate(360deg)}}',
    ].join('')
    const generateMock = vi.fn(async ({ target }: { target: string }) => ({
      css: generatedCss,
      rawCss: generatedCss,
      target,
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      ...createDefaultGeneratorMock(),
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: code }))
    const result = await generateCssByGenerator({
      opts: {
        generator: {
          target: 'web',
        },
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource,
      file: 'assets/index.css',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'assets/index.css',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'assets/index.css',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(result?.css).toContain(generatedCss)
    expect(result?.css).toContain('.weapp-tw-user-ui-card{display:inline-flex}')
    expect(result?.css).toContain('@keyframes weappTwUserUiRotation')
    expect(result?.css).not.toContain('@media source(none)')
    expect(result?.css).not.toContain('@config')
    expect(result?.css).not.toContain('@source')
    expect(result?.css).not.toContain('@theme')
  })

  it('prefers configured Tailwind v4 css source over placeholder-expanded bundle css', async () => {
    const runtimeSet = new Set(['bg-linear-to-r'])
    const configuredCss = '@import "tailwindcss";\n@config "./tailwind.config.js";'
    const rawSource = [
      ':host,page,.tw-root,wx-root-portal-content{--color-gray-200:#e5e7eb}',
      '.container{width:100%}',
    ].join('\n')
    const rawTailwindCss = '.bg-linear-to-r{--tw-gradient-position:to right}'
    const weappCss = '.bg-linear-to-r{--tw-gradient-position:to right}'
    const generateMock = vi.fn(async () => ({
      css: weappCss,
      rawCss: rawTailwindCss,
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: ['src/app.css'],
      sources: [],
      root: null,
    }))
    const createGeneratorMock = vi.fn(() => ({
      generate: generateMock,
    }))
    const resolveTailwindV4Source = vi.fn(async (options: any) => ({
      projectRoot: '/project',
      base: '/project',
      baseFallbacks: [],
      css: options.css,
      config: '/project/src/tailwind.config.js',
      dependencies: ['src/app.css'],
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: createGeneratorMock,
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: '/project',
        base: '/project',
        baseFallbacks: [],
        css: configuredCss,
        config: '/project/src/tailwind.config.js',
        dependencies: ['src/app.css'],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: '/project',
        base: '/project',
        baseFallbacks: [],
        css: configuredCss,
        cssSources: [
          {
            file: '/project/src/app.css',
            css: configuredCss,
          },
        ],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: code.includes('.container') ? '.container{width:100%}' : code }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource,
      file: 'app-origin.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app-origin.wxss',
          },
        },
        majorVersion: 4,
        sourceOptions: {
          sourceFile: '/project/src/app.css',
        },
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app-origin.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(resolveTailwindV4Source).toHaveBeenCalledWith(expect.objectContaining({
      base: '/project/src',
      css: expect.stringContaining('@config "/project/src/tailwind.config.js";'),
    }))
    expect(createGeneratorMock).toHaveBeenCalledWith(expect.objectContaining({
      css: expect.stringContaining('@config "/project/src/tailwind.config.js";'),
    }))
    expect(result?.css).toContain(weappCss)
    expect(result?.css).not.toContain('.container{width:100%}')
  })

  it('isolates non-main scoped Tailwind v4 source candidates from current bundle runtime candidates', async () => {
    const runtimeSet = new Set(['text-[23px]'])
    const scopedSet = new Set(['bg-[#112233]'])
    const configuredCss = [
      '@import "tailwindcss" source(none);',
      '@source "../src/sub-independent/**/*.{vue,js,ts,jsx,tsx,html}";',
    ].join('\n')
    const generateMock = vi.fn(async ({ candidates }: { candidates: Set<string> }) => ({
      css: [...candidates].sort().join('\n'),
      rawCss: [...candidates].sort().join('\n'),
      target: 'weapp',
      classSet: new Set(candidates),
      dependencies: ['src/sub-independent/pages/index.css'],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: '/project',
        base: '/project',
        baseFallbacks: [],
        css: configuredCss,
        cssSources: [
          {
            file: '/project/src/sub-independent/pages/index.css',
            base: '/project/src/sub-independent',
            css: configuredCss,
          },
        ],
      })),
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: '/project',
        base: '/project/src/sub-independent',
        baseFallbacks: [],
        css: configuredCss,
        dependencies: ['src/sub-independent/pages/index.css'],
      })),
      resolveTailwindV4Source: vi.fn(async (options: any) => ({
        projectRoot: '/project',
        base: options.base ?? '/project/src/sub-independent',
        baseFallbacks: [],
        css: options.css ?? configuredCss,
        dependencies: ['src/sub-independent/pages/index.css'],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: code }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: '/*! weapp-tailwindcss generator-placeholder */',
      file: 'sub-independent/pages/index.wxss',
      cssHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'sub-independent/pages/index.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'sub-independent/pages/index.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      getSourceCandidatesForEntries: vi.fn(() => scopedSet),
      styleHandler,
      debug: vi.fn(),
    })

    const candidates = generateMock.mock.calls[0]?.[0]?.candidates as Set<string>
    expect(candidates).toEqual(scopedSet)
  })

  it('isolates non-main Tailwind v4 @apply-only css from app runtime candidates', async () => {
    const runtimeSet = new Set(['bg-[#app]', 'text-[#app]'])
    const rawSource = [
      '@import "../../uvue.wxss";',
      '.content {',
      '  @apply flex items-center py-4;',
      '}',
      '.test {',
      '  @apply bg-[#page] text-[#page];',
      '}',
    ].join('\n')
    const generateMock = vi.fn(async ({ candidates }: { candidates: Set<string> }) => ({
      css: [
        ':host,page,.tw-root,wx-root-portal-content { --spacing: 8rpx; }',
        '.flex { display: flex; }',
        '.items-center { align-items: center; }',
        '.py-4 { padding-top: 32rpx; padding-bottom: 32rpx; }',
        '.bg-_b_hpage_B { background-color: #page; }',
        '.content.data-v-abc { display: flex; align-items: center; padding-top: 32rpx; padding-bottom: 32rpx; }',
        '.test.data-v-abc { background-color: #page; color: #page; }',
        '.container { width: 100%; }',
      ].join('\n'),
      rawCss: [...candidates].sort().join('\n'),
      target: 'weapp',
      classSet: new Set(candidates),
      dependencies: ['pages/index/index.wxss'],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source: vi.fn(async (options: any) => ({
        projectRoot: '/project',
        base: options.base ?? '/project',
        baseFallbacks: [],
        css: options.css,
        dependencies: [],
      })),
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: '/project',
        base: '/project',
        baseFallbacks: [],
        css: '@import "tailwindcss" source(none);',
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: '/project',
        base: '/project',
        baseFallbacks: [],
        css: '@import "tailwindcss" source(none);',
        packageName: 'tailwindcss',
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: code }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource,
      file: 'pages/index/index.wxss',
      cssHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'pages/index/index.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'pages/index/index.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      getSourceCandidatesForEntries: vi.fn(() => new Set()),
      styleHandler,
      debug: vi.fn(),
    })

    const candidates = generateMock.mock.calls[0]?.[0]?.candidates as Set<string>
    expect(candidates).toEqual(new Set(['bg-[#page]', 'flex', 'items-center', 'py-4', 'text-[#page]']))
    expect(result?.css).toContain('@import "../../uvue.wxss";')
    expect(result?.css).toContain('.content.data-v-abc')
    expect(result?.css).toContain('.test.data-v-abc')
    expect(result?.css).toContain('--spacing')
    expect(result?.css).not.toContain('.flex')
    expect(result?.css).not.toContain('.items-center')
    expect(result?.css).not.toContain('bg-[#app]')
    expect(result?.css).not.toContain('.container')
    expect(result?.css).not.toContain('@apply')
  })

  it('keeps uni-app x local uvue import before lightweight border reset in isolated apply-only css', async () => {
    const rawSource = [
      '@import "../../uvue.wxss";',
      '.bind {',
      '  @apply border-[#111111] border-solid;',
      '}',
    ].join('\n')
    const generateMock = vi.fn(async () => ({
      css: [
        '.border-_b_h111111_B { border-color: #111111; }',
        '.border-solid { --tw-border-style: solid; border-style: solid; }',
        '.bind.data-v-abc { border-color: #111111; border-style: solid; }',
      ].join('\n'),
      rawCss: [
        '.border-\\[\\#111111\\] { border-color: #111111; }',
        '.border-solid { --tw-border-style: solid; border-style: solid; }',
        '.bind.data-v-abc { border-color: #111111; border-style: solid; }',
      ].join('\n'),
      target: 'weapp',
      classSet: new Set(['border-[#111111]', 'border-solid']),
      dependencies: ['components/BindClass.wxss'],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source: vi.fn(async (options: any) => ({
        projectRoot: '/project',
        base: options.base ?? '/project',
        baseFallbacks: [],
        css: options.css,
        dependencies: [],
      })),
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: '/project',
        base: '/project',
        baseFallbacks: [],
        css: '@import "tailwindcss" source(none);',
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: '/project',
        base: '/project',
        baseFallbacks: [],
        css: '@import "tailwindcss" source(none);',
        packageName: 'tailwindcss',
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: code }))
    const result = await generateCssByGenerator({
      opts: {
        cssPreflight: {
          'border-width': '0',
          'border-style': false,
          'border': false,
        },
        styleHandler,
        uniAppX: true,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: new Set(),
      rawSource,
      file: 'components/BindClass.wxss',
      cssHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'components/BindClass.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'components/BindClass.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      getSourceCandidatesForEntries: vi.fn(() => new Set()),
      styleHandler,
      debug: vi.fn(),
    })

    expect(result?.css).toContain('@import "../../uvue.wxss";')
    expect(result?.css).toMatch(/view,\s*text,[^{]*\{[^}]*border-width:\s*0/)
    expect(result?.css).not.toContain('border: 0 solid')
    const importIndex = result!.css.indexOf('@import "../../uvue.wxss";')
    const resetIndex = result!.css.indexOf('border-width: 0')
    const utilityIndex = result!.css.indexOf('.border-solid')
    expect(importIndex).toBeLessThan(resetIndex)
    expect(resetIndex).toBeLessThan(utilityIndex)
    const borderSolidBody = result!.css.match(/\.border-solid\s*\{([^}]*)\}/)?.[1]
    expect(borderSolidBody).toContain('border-style: solid')
    expect(borderSolidBody).not.toContain('border-width')
  })

  it('does not restore uni-app x local uvue import into uvue output itself', async () => {
    const rawSource = [
      '@import "/uvue.wxss";',
      '.uvue-local {',
      '  @apply bg-[#10b981] text-[#052e16];',
      '}',
    ].join('\n')
    const generateMock = vi.fn(async () => ({
      css: [
        '.bg-_b_h10b981_B { background-color: #10b981; }',
        '.text-_b_h052e16_B { color: #052e16; }',
        '.uvue-local { background-color: #10b981; color: #052e16; }',
      ].join('\n'),
      rawCss: [
        '.bg-\\[\\#10b981\\] { background-color: #10b981; }',
        '.text-\\[\\#052e16\\] { color: #052e16; }',
        '.uvue-local { background-color: #10b981; color: #052e16; }',
      ].join('\n'),
      target: 'weapp',
      classSet: new Set(['bg-[#10b981]', 'text-[#052e16]']),
      dependencies: ['uvue.wxss'],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source: vi.fn(async (options: any) => ({
        projectRoot: '/project',
        base: options.base ?? '/project',
        baseFallbacks: [],
        css: options.css,
        dependencies: [],
      })),
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: '/project',
        base: '/project',
        baseFallbacks: [],
        css: '@import "tailwindcss" source(none);',
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: '/project',
        base: '/project',
        baseFallbacks: [],
        css: '@import "tailwindcss" source(none);',
        packageName: 'tailwindcss',
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: code }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
        uniAppX: true,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: new Set(),
      rawSource,
      file: 'uvue.wxss',
      cssHandlerOptions: {
        isMainChunk: false,
        uniAppX: true,
        uniAppXCssTarget: 'uvue',
        postcssOptions: {
          options: {
            from: 'uvue.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'uvue.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      getSourceCandidatesForEntries: vi.fn(() => new Set()),
      styleHandler,
      debug: vi.fn(),
    })

    expect(result?.css).not.toContain('@import "/uvue.wxss"')
    expect(result?.css).toContain('.uvue-local')
  })

  it('generates Tailwind v4 css for non-main apply-only sources', async () => {
    const rawSource = [
      '.wtu-a {',
      '  @apply bg-[#102938];',
      '}',
      '.wtu-b {',
      '  @apply text-[#f7fbff] w-[173px];',
      '}',
    ].join('\n')
    const generateMock = vi.fn(async ({ candidates }: { candidates: Set<string> }) => ({
      css: [
        '.bg-_b_h102938_B { background-color: rgba(16,41,56,1); }',
        '.text-_b_hf7fbff_B { color: rgba(247,251,255,1); }',
        '.w-_b173px_B { width: 173px; }',
        '.wtu-a { background-color: rgba(16,41,56,1); }',
        '.wtu-b { color: rgba(247,251,255,1); width: 173px; }',
      ].join('\n'),
      rawCss: [...candidates].sort().join('\n'),
      target: 'weapp',
      classSet: new Set(candidates),
      dependencies: ['uni-app-x-harmony-apply.css'],
      sources: [],
      root: null,
      version: 4,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source: vi.fn(async (options: any) => ({
        projectRoot: '/project',
        base: options.base ?? '/project',
        baseFallbacks: [],
        css: options.css,
        dependencies: [],
      })),
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: '/project',
        base: '/project',
        baseFallbacks: [],
        css: '@import "tailwindcss" source(none);',
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: '/project',
        base: '/project',
        baseFallbacks: [],
        css: '@import "tailwindcss" source(none);',
        packageName: 'tailwindcss',
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: code }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: new Set(['bg-[#app]']),
      rawSource,
      file: 'uni-app-x-harmony-apply.css',
      cssHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'uni-app-x-harmony-apply.css',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'uni-app-x-harmony-apply.css',
          },
        },
        majorVersion: 4,
      } as any,
      getSourceCandidatesForEntries: vi.fn(() => new Set()),
      styleHandler,
      debug: vi.fn(),
    })

    const candidates = generateMock.mock.calls[0]?.[0]?.candidates as Set<string>
    expect(candidates).toEqual(new Set(['bg-[#102938]', 'text-[#f7fbff]', 'w-[173px]']))
    expect(result?.css).toContain('.wtu-a')
    expect(result?.css).toContain('background-color: rgba(16,41,56,1)')
    expect(result?.css).not.toContain('bg-[#app]')
  })

  it('removes Tailwind v4 shorthand border reset from uni-app x mini-program generator css', async () => {
    const generateMock = vi.fn(async () => ({
      css: [
        'view,text,::after,::before{box-sizing:border-box;margin:0;padding:0;border:0 solid}',
        '.border-solid{--tw-border-style:solid;border-style:solid}',
      ].join('\n'),
      rawCss: [
        'view,text,::after,::before{box-sizing:border-box;margin:0;padding:0;border:0 solid}',
        '.border-solid{--tw-border-style:solid;border-style:solid}',
      ].join('\n'),
      target: 'weapp',
      classSet: new Set(['border-solid']),
      dependencies: [],
      sources: [],
      root: null,
      version: 4,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source: vi.fn(async (options: any) => ({
        projectRoot: '/project',
        base: options.base ?? '/project',
        baseFallbacks: [],
        css: options.css,
        dependencies: [],
      })),
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: '/project',
        base: '/project',
        baseFallbacks: [],
        css: '@import "tailwindcss" source(none);',
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: '/project',
        base: '/project',
        baseFallbacks: [],
        css: '@import "tailwindcss" source(none);',
        packageName: 'tailwindcss',
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: code }))
    const result = await generateCssByGenerator({
      opts: {
        cssPreflight: {
          'box-sizing': 'border-box',
          margin: '0',
          padding: '0',
          'border-width': '0',
          'border-style': false,
          border: false,
        },
        styleHandler,
        uniAppX: true,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: new Set(['border-solid']),
      rawSource: '@import "tailwindcss" source(none);',
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      getSourceCandidatesForEntries: vi.fn(() => new Set(['border-solid'])),
      styleHandler,
      debug: vi.fn(),
    })

    expect(result?.css).toContain('view,text,::after,::before')
    expect(result?.css).toContain('border-width:0')
    expect(result?.css).not.toContain('border:0 solid')
    expect(result?.css).toContain('.border-solid{--tw-border-style:solid;border-style:solid}')
  })

  it('keeps non-apply Tailwind v4 rules beside @apply in non-main css assets', async () => {
    const runtimeSet = new Set(['bg-[#app]', 'text-[#app]'])
    const rawSource = [
      '@import "../../uvue.wxss";',
      '.content {',
      '  @apply flex items-center py-4;',
      '}',
      '.content-theme {',
      '  padding: theme("spacing.2");',
      '  margin-left: theme("spacing.3");',
      '}',
    ].join('\n')
    const generateMock = vi.fn(async () => ({
      css: [
        ':host,page,.tw-root,wx-root-portal-content { --spacing: 8rpx; }',
        '.flex { display: flex; }',
        '.items-center { align-items: center; }',
        '.py-4 { padding-top: 32rpx; padding-bottom: 32rpx; }',
        '.content.data-v-abc { display: flex; align-items: center; padding-top: 32rpx; padding-bottom: 32rpx; }',
        '.content-theme { padding: 16rpx; margin-left: 24rpx; }',
      ].join('\n'),
      rawCss: [
        '.flex { display: flex; }',
        '.items-center { align-items: center; }',
        '.py-4 { padding-top: 32rpx; padding-bottom: 32rpx; }',
        '.content.data-v-abc { display: flex; align-items: center; padding-top: 32rpx; padding-bottom: 32rpx; }',
        '.content-theme { padding: 16rpx; margin-left: 24rpx; }',
      ].join('\n'),
      target: 'weapp',
      classSet: new Set(['flex', 'items-center', 'py-4']),
      dependencies: ['pages/index/index.wxss'],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source: vi.fn(async (options: any) => ({
        projectRoot: '/project',
        base: options.base ?? '/project',
        baseFallbacks: [],
        css: options.css,
        dependencies: [],
      })),
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: '/project',
        base: '/project',
        baseFallbacks: [],
        css: '@import "tailwindcss" source(none);',
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: '/project',
        base: '/project',
        baseFallbacks: [],
        css: '@import "tailwindcss" source(none);',
        packageName: 'tailwindcss',
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: code }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource,
      file: 'pages/index/index.wxss',
      cssHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'pages/index/index.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'pages/index/index.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      getSourceCandidatesForEntries: vi.fn(() => new Set()),
      styleHandler,
      debug: vi.fn(),
    })

    const css = result?.css ?? ''
    expect(css).toContain('.content.data-v-abc')
    expect(css).toContain('.content-theme')
    expect(css).toContain('padding: 16rpx')
    expect(css).toContain('margin-left: 24rpx')
    expect(css).toContain('.flex')
    expect(css).not.toContain('theme(')
    expect(css).not.toContain('@apply')
  })

  it('deduplicates forced compat css after mini-program selector escaping', async () => {
    const runtimeSet = new Set(['from-[#2f73f1]'])
    const rawSource = [
      '/*! weapp-tailwindcss generator-placeholder */',
      '.from-\\[\\#2f73f1\\]{--tw-gradient-from:#2f73f1}',
      '.custom{color:red}',
    ].join('\n')
    const rawTailwindCss = '.from-\\[\\#2f73f1\\]{--tw-gradient-from:#2f73f1}'
    const weappCss = '.from-_b_h2f73f1_B{--tw-gradient-from:#2f73f1}'
    const generateMock = vi.fn(async () => ({
      css: weappCss,
      rawCss: rawTailwindCss,
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({
      css: code
        .replaceAll('.from-\\[\\#2f73f1\\]', '.from-_b_h2f73f1_B')
        .replace('/*! weapp-tailwindcss generator-placeholder */\n', ''),
    }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource,
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    const css = result?.css ?? ''
    expect(css).toContain('view,text,::after,::before{--tw-gradient-from:#0000}')
    expect(css).not.toContain(':host,page,.tw-root,wx-root-portal-content{--tw-gradient-from:#0000}')
    expect(css).toContain('.from-_b_h2f73f1_B{--tw-gradient-from:#2f73f1}')
    expect(css).toContain('.custom{color:red}')
    expect(css.indexOf('.from-_b_h2f73f1_B')).toBeLessThan(css.indexOf('.custom{color:red}'))
    expect(css.match(/from-_b_h2f73f1_B/g)).toHaveLength(1)
  })

  it('deduplicates identical rules when merging multiple Tailwind v4 sources', async () => {
    const { deduplicateGeneratedCssRules } = await import('@/generation/generation-helpers')
    const css = deduplicateGeneratedCssRules([
      'view,text,::after,::before{border:0 solid;box-sizing:border-box}',
      '.before_ccontent-_b_aindependent_a_B::before{--tw-content:"independent";content:var(--tw-content)}',
      '.before_ccontent-_b_aindependent_a_B::before{--tw-content:"independent";content:var(--tw-content)}',
      '.before_ccontent-_b_aindependent_subpackage_mpx-tailwindcss-v4_a_B::before{--tw-content:\'independent subpackage mpx-tailwindcss-v4\';content:var(--tw-content)}',
      '.before_ccontent-_b_aindependent_subpackage_mpx-tailwindcss-v4_a_B:before{--tw-content:"independent subpackage mpx-tailwindcss-v4";content:var(--tw-content)}',
      '.bg-independent-subpackage-marker{background-color:#dc2626}',
      '.bg-independent-subpackage-marker{background-color:#dc2626}',
      '.bg-independent-subpackage-marker{color:#fff}',
    ].join('\n'))

    expect(css.match(/before_ccontent-_b_aindependent_a_B/g)).toHaveLength(1)
    expect(css.match(/before_ccontent-_b_aindependent_subpackage_mpx-tailwindcss-v4_a_B/g)).toHaveLength(1)
    expect(css.match(/background-color:#dc2626/g)).toHaveLength(1)
    expect(css).toContain('.bg-independent-subpackage-marker{color:#fff}')
  })

  it('keeps Tailwind v4 gradient runtime variables on mini-program element scope', async () => {
    const runtimeSet = new Set(['bg-linear-to-r', 'from-amber-200', 'to-orange-200'])
    const rawTailwindCss = [
      '/*! tailwindcss v4.2.4 | MIT License | https://tailwindcss.com */',
      ':root,:host{--color-amber-200:#fde68a;--color-orange-200:#fed7aa}',
      '.bg-linear-to-r{--tw-gradient-position:to right;background-image:linear-gradient(var(--tw-gradient-stops))}',
      '.from-amber-200{--tw-gradient-from:var(--color-amber-200);--tw-gradient-stops:var(--tw-gradient-position),var(--tw-gradient-from),var(--tw-gradient-to)}',
      '.to-orange-200{--tw-gradient-to:var(--color-orange-200);--tw-gradient-stops:var(--tw-gradient-position),var(--tw-gradient-from),var(--tw-gradient-to)}',
    ].join('\n')
    const weappCss = [
      ':host,page,.tw-root,wx-root-portal-content{--tw-gradient-position:initial;--tw-gradient-from:rgba(0,0,0,0);--tw-gradient-to:rgba(0,0,0,0);--tw-gradient-from-position:0%;--tw-gradient-to-position:100%;--color-amber-200:#fde68a;--color-orange-200:#fed7aa}',
      '.bg-linear-to-r{--tw-gradient-position:to right;background-image:linear-gradient(var(--tw-gradient-stops))}',
      '.from-amber-200{--tw-gradient-from:var(--color-amber-200);--tw-gradient-stops:var(--tw-gradient-position),var(--tw-gradient-from),var(--tw-gradient-to)}',
      '.to-orange-200{--tw-gradient-to:var(--color-orange-200);--tw-gradient-stops:var(--tw-gradient-position),var(--tw-gradient-from),var(--tw-gradient-to)}',
    ].join('\n')
    const generateMock = vi.fn(async () => ({
      css: weappCss,
      rawCss: rawTailwindCss,
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: code }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: rawTailwindCss,
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    const css = result?.css ?? ''
    expect(css).toContain('view,text,::after,::before{--tw-gradient-position:initial')
    expect(css).toContain(':host,page,.tw-root,wx-root-portal-content{')
    expect(css).not.toContain(':host,page,.tw-root,wx-root-portal-content{--tw-gradient-position:initial')
    expect(css).toContain(':host')
    expect(css).toContain('--tw-gradient-from:#0000')
    expect(css).toContain('--tw-gradient-to:#0000')
    expect(css).toContain('--color-amber-200:#fde68a')
    expect(css).toContain('--color-orange-200:#fed7aa')
    expect(css).toContain('.from-amber-200{--tw-gradient-from:var(--color-amber-200)')
    expect(css).toContain('.to-orange-200{--tw-gradient-to:var(--color-orange-200)')
  })

  it('uses cssOptions for Tailwind v4 gradient fallback in generator finalization', async () => {
    const { finalizeMiniProgramGeneratorCss } = await import('@/generation/generation-helpers')
    const css = finalizeMiniProgramGeneratorCss([
      ':root,:host{--color-cyan-500:#06b6d4;--color-blue-500:#3b82f6}',
      '.bg-linear-to-r{--tw-gradient-position:to right;background-image:linear-gradient(var(--tw-gradient-stops))}',
      '.from-cyan-500{--tw-gradient-from:var(--color-cyan-500);--tw-gradient-stops:var(--tw-gradient-position),var(--tw-gradient-from),var(--tw-gradient-to)}',
      '.to-blue-500{--tw-gradient-to:var(--color-blue-500);--tw-gradient-stops:var(--tw-gradient-position),var(--tw-gradient-from),var(--tw-gradient-to)}',
    ].join('\n'), 'weapp', 4, {}, {
      styleOptions: {
        cssOptions: {
          tailwindcssV4GradientFallback: true,
        },
      },
    })

    expect(css).toContain('.bg-linear-to-r.from-cyan-500.to-blue-500')
    expect(css).toContain('background-image:linear-gradient(to right, #06b6d4, #3b82f6)')
  })

  it('preserves incremental at-rule placeholders during generator finalization', async () => {
    const { finalizeMiniProgramGeneratorCss } = await import('@/generation/generation-helpers')
    const css = finalizeMiniProgramGeneratorCss('@media screen{/* incremental placeholder */}', 'weapp', 4, false, {
      injectPreflight: false,
      removeEmptyAtRuleAncestors: false,
    })

    expect(css).toBe('@media screen{/* incremental placeholder */}')
  })

  it('does not inject Tailwind v4 mini-program preflight twice when generator css already has reset', async () => {
    const { finalizeMiniProgramGeneratorCss } = await import('@/generation/generation-helpers')
    const css = finalizeMiniProgramGeneratorCss([
      'view,text,::after,::before{box-sizing:border-box;margin:0;padding:0;border:0 solid;--tw-content:""}',
      ':host,page,.tw-root,wx-root-portal-content{--spacing:8rpx;--default-font-family:var(--font-sans)}',
      '.flex{display:flex}',
    ].join('\n'), 'weapp', 4, {
      border: '0 solid',
    })

    expect(css.match(/:host/g)).toHaveLength(1)
    expect(css).not.toContain('font-family:--theme')
    expect(css).not.toContain('font-family: --theme')
    expect(css).toContain('.flex')
  })

  it('drops Tailwind v4 mini-program reset but keeps runtime defaults when cssPreflight is disabled', async () => {
    const { finalizeMiniProgramGeneratorCss } = await import('@/generation/generation-helpers')
    const css = finalizeMiniProgramGeneratorCss([
      'view,text,::after,::before{box-sizing:border-box;margin:0;padding:0;border:0 solid;--tw-border-style:solid}',
      '.border{border-style:var(--tw-border-style);border-width:1px}',
    ].join('\n'), 'weapp', 4, false)

    expect(css).toContain('view,text,::after,::before{--tw-border-style:solid}')
    expect(css).not.toContain('box-sizing:border-box')
    expect(css).not.toContain(':host,page,.tw-root,wx-root-portal-content{--tw-border-style:solid}')
    expect(css).toContain('.border{border-style:var(--tw-border-style);border-width:1px}')
  })

  it('skips mini-program preflight for scoped Vue style sources', async () => {
    const { finalizeMiniProgramGeneratorCss } = await import('@/generation/generation-helpers')
    const css = finalizeMiniProgramGeneratorCss([
      '.card{padding:16px}',
    ].join('\n'), 'weapp', 4, {
      border: '0 solid',
    }, {
      styleOptions: {
        postcssOptions: {
          options: {
            from: '/workspace/src/pages/index.vue',
          },
        },
        sourceOptions: {
          requestFile: '/workspace/src/pages/index.vue?vue&type=style&index=0&scoped=true&lang.css',
        },
      },
    })

    expect(css).toContain('.card{padding:16px}')
    expect(css).not.toContain('view,text,::after,::before')
    expect(css).not.toContain('box-sizing:border-box')
  })

  it('disables generator preflight mode for scoped Vue style sources', async () => {
    const { resolveMiniProgramPreflightModeForGeneratorCss } = await import('@/generation/generation-helpers')
    const mode = resolveMiniProgramPreflightModeForGeneratorCss({
      cssPreflight: 'view',
    } as any, {
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: '/workspace/src/components/HelloWorld.vue',
          },
        },
        sourceOptions: {
          requestFile: '/workspace/src/components/HelloWorld.vue?vue&type=style&index=0&lang=scss&scoped=1',
        },
      } as any,
      isolateCurrentCssCandidates: false,
      primaryCssSource: true,
    })

    expect(mode).toEqual({
      inject: false,
      preserve: false,
    })
  })

  it('disables generator preflight mode for Vite scoped Vue style ids', async () => {
    const { resolveMiniProgramPreflightModeForGeneratorCss } = await import('@/generation/generation-helpers')
    const mode = resolveMiniProgramPreflightModeForGeneratorCss({
      cssPreflight: 'view',
    } as any, {
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: '/workspace/src/components/HelloWorld.vue?vue&type=style&index=0&scoped=04bcf89b&lang.scss',
          },
        },
      } as any,
      isolateCurrentCssCandidates: false,
      primaryCssSource: true,
    })

    expect(mode).toEqual({
      inject: false,
      preserve: false,
    })
  })

  it('removes preflight style options for scoped Vue style sources', async () => {
    const { resolveGeneratorStyleOptions } = await import('@/generation/generation-helpers')
    const styleOptions = resolveGeneratorStyleOptions({
      cssPreflight: 'view',
      cssPreflightRange: 'all',
    } as any, {
      postcssOptions: {
        options: {
          from: '/workspace/src/components/HelloWorld.vue',
        },
      },
      sourceOptions: {
        requestFile: '/workspace/src/components/HelloWorld.vue?vue&type=style&index=0&lang=scss&scoped',
      },
    } as any, undefined)

    expect(styleOptions.cssPreflight).toBe(false)
    expect(styleOptions.cssPreflightRange).toBeUndefined()
  })

  it('uses configured mini-program theme scope when finalizing generator css', async () => {
    const { finalizeMiniProgramGeneratorCss } = await import('@/generation/generation-helpers')
    const css = finalizeMiniProgramGeneratorCss([
      ':host,page,.tw-root,wx-root-portal-content{--color-blue-500:#155dfc}',
      '.text-blue-500{color:var(--color-blue-500)}',
    ].join('\n'), 'weapp', 4, false, {
      styleOptions: {
        cssSelectorReplacement: {
          root: [':host', '.tw-root'],
        },
      },
    })

    expect(css).toContain(':host,.tw-root{--color-blue-500:#155dfc}')
    expect(css).not.toContain('page')
    expect(css).not.toContain('wx-root-portal-content')
    expect(css).toContain('.text-blue-500{color:var(--color-blue-500)}')
  })

  it('drops split Tailwind source media fragments before transforming user css', async () => {
    const runtimeSet = new Set(['text-red-500'])
    const rawTailwindCss = '.text-red-500{color:red}'
    const weappCss = '.text-red-500{color:red}'
    const generateMock = vi.fn(async () => ({
      css: weappCss,
      rawCss: rawTailwindCss,
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source: vi.fn(async (options: any) => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: options.css,
        dependencies: [],
      })),
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: code }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: '/*! tailwindcss v4.3.0 | MIT License | https://tailwindcss.com */\n@media source(none){\n.text-red-500{color:red}\n}@source "./**/*.{vue,ts}";',
      file: 'pages-order/pages/home/home.wxss',
      cssHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'pages-order/pages/home/home.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'pages-order/pages/home/home.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(styleHandler).not.toHaveBeenCalledWith(
      expect.stringContaining('@media source(none){'),
      expect.anything(),
    )
    expect(styleHandler).not.toHaveBeenCalledWith(
      expect.stringContaining('}@source'),
      expect.anything(),
    )
    expect(result?.css).not.toContain('@media source(none){')
    expect(result?.css).not.toContain('}@source')
    expect(result?.css).not.toContain('@source')
    expect(result?.css).not.toMatch(/^\s*\}\s*$/m)
    expect(result?.css).toContain(weappCss)
  })

  it('drops leading Tailwind source media close fragments before transforming user css', async () => {
    const runtimeSet = new Set(['text-red-500'])
    const rawTailwindCss = '.text-red-500{color:red}'
    const weappCss = '.text-red-500{color:red}'
    const generateMock = vi.fn(async () => ({
      css: weappCss,
      rawCss: rawTailwindCss,
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: code }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: '/*! tailwindcss v4.3.0 | MIT License | https://tailwindcss.com */\n.text-red-500{color:red}\n}',
      file: 'index.css',
      cssHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'index.css',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'index.css',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(styleHandler).not.toHaveBeenCalledWith(
      expect.stringMatching(/^\s*\}\s*$/m),
      expect.anything(),
    )
    expect(result?.css).toContain(weappCss)
  })

  it('drops Tailwind source wrapper blocks before generator compilation', async () => {
    const runtimeSet = new Set(['text-red-500'])
    const rawTailwindCss = '.text-red-500{color:red}'
    const weappCss = '.text-red-500{color:red}'
    const generatorSources: Array<{ css: string }> = []
    const generateMock = vi.fn(async () => ({
      css: weappCss,
      rawCss: rawTailwindCss,
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn((source: { css: string }) => {
        generatorSources.push(source)
        return {
          generate: generateMock,
        }
      }),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source: vi.fn(async (options: any) => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: options.css,
        dependencies: [],
      })),
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: code }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: [
        '@import "tailwindcss";',
        '@source "../src" {',
        '.text-red-500{color:red}',
        '}',
        '.user-card{display:block}',
      ].join('\n'),
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(generatorSources[0]?.css).not.toContain('@source "../src" {')
    expect(generatorSources[0]?.css).not.toContain('.text-red-500{color:red}')
    expect(result?.css).not.toContain('@source "../src" {')
    expect(result?.css).toContain(weappCss)
    expect(result?.css).toContain('.user-card')
  })

  it('terminates minified Tailwind source directives before generator compilation', async () => {
    const runtimeSet = new Set(['text-red-500'])
    const rawTailwindCss = '.text-red-500{color:red}'
    const weappCss = '.text-red-500{color:red}'
    const generatorSources: Array<{ css: string }> = []
    const generateMock = vi.fn(async () => ({
      css: weappCss,
      rawCss: rawTailwindCss,
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn((source: { css: string }) => {
        generatorSources.push(source)
        return {
          generate: generateMock,
        }
      }),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4Source: vi.fn(async (options: any) => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: options.css,
        dependencies: [],
      })),
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: code }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: '@config "../tailwind.config.js";@source "../src";@source not "../src/sub-normal";@source not "../src/sub-independent"',
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: true,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(generatorSources[0]?.css).toContain('@source not "../src/sub-independent";')
    expect(result?.css).toContain(weappCss)
  })

  it('closes trailing legacy compat css fragments before style transforms', async () => {
    const runtimeSet = new Set(['text-red-500'])
    const rawTailwindCss = '.text-red-500{color:red}'
    const weappCss = '.text-red-500{color:red}'
    const generateMock = vi.fn(async () => ({
      css: weappCss,
      rawCss: rawTailwindCss,
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: normalizeGeneratorOptions,
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: process.cwd(),
        base: process.cwd(),
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
    }))

    const { generateCssByGenerator } = await import('@/generation/index')
    const styleHandler = vi.fn(async (code: string) => ({ css: `handled:${code}` }))
    const result = await generateCssByGenerator({
      opts: {
        styleHandler,
      } as any,
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
        readyPromise: Promise.resolve(),
      },
      runtime: runtimeSet,
      rawSource: [
        '/*! tailwindcss v4.3.0 | MIT License | https://tailwindcss.com */',
        '.text-red-500{color:red}',
        '[data-c-h="true"]{display:none',
      ].join('\n'),
      file: 'app.wxss',
      cssHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      cssUserHandlerOptions: {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: 'app.wxss',
          },
        },
        majorVersion: 4,
      } as any,
      styleHandler,
      debug: vi.fn(),
    })

    expect(result?.css).toContain('handled:')
    expect(styleHandler).toHaveBeenCalledWith(
      expect.stringContaining('[data-c-h="true"]{display:none'),
      expect.anything(),
    )
  })

  it('injects vite-processed component layer css before main utility css', async () => {
    const { injectViteProcessedCssIntoMainCssAssets } = await import('@/bundlers/vite/processed-css-assets')
    const bundle = {
      'app.wxss': {
        type: 'asset',
        fileName: 'app.wxss',
        source: [
          '.flex {',
          '  display: flex;',
          '}',
          '.raw-btn {',
          '  display: inline-flex;',
          '}',
          '.text-red-500 {',
          '  color: rgba(239, 68, 68, 1);',
          '}',
        ].join('\n'),
      },
    } as any

    const injected = injectViteProcessedCssIntoMainCssAssets(bundle, {
      opts: {
        cssMatcher: (file: string) => file.endsWith('.wxss'),
        mainCssChunkMatcher: (file: string) => file === 'app.wxss',
        appType: 'uni-app-vite',
      } as any,
      getViteProcessedCssAssetResults: () => [[
        '/src/App.vue',
        {
          css: [
            '/*! weapp-tailwindcss layer components start */',
            '.raw-btn {',
            '  display: inline-flex;',
            '}',
            '/*! weapp-tailwindcss layer components end */',
          ].join('\n'),
          injectIntoMain: true,
        },
      ]],
    })

    const css = bundle['app.wxss'].source
    expect(injected).toBe(1)
    expect(css).toContain('.raw-btn')
    expect(css).not.toContain('weapp-tailwindcss layer components')
    expect(css.match(/\.raw-btn\s*\{/g)).toHaveLength(1)
    expect(css.indexOf('.raw-btn')).toBeLessThan(css.indexOf('.flex'))
  })

  it('removes Tailwind v4 entry directives from main css before injecting vite-processed css', async () => {
    const { injectViteProcessedCssIntoMainCssAssets } = await import('@/bundlers/vite/processed-css-assets')
    const bundle = {
      'app.wxss': {
        type: 'asset',
        fileName: 'app.wxss',
        source: [
          '/* uni variables */',
          '@media source(none){',
          '/*! weapp-tailwindcss generator-placeholder */',
          '}',
          '@config "./tailwind.config.js";',
          '@source "./App.uvue";',
          '@source not "./unpackage/**/*";',
        ].join('\n'),
      },
    } as any

    const injected = injectViteProcessedCssIntoMainCssAssets(bundle, {
      opts: {
        cssMatcher: (file: string) => file.endsWith('.wxss'),
        mainCssChunkMatcher: (file: string) => file === 'app.wxss',
        appType: 'uni-app-x',
      } as any,
      getViteProcessedCssAssetResults: () => [[
        'app-origin.wxss',
        {
          css: '.w-_b100px_B{width:100px}',
          injectIntoMain: true,
        },
      ]],
    })

    const css = bundle['app.wxss'].source
    expect(injected).toBe(1)
    expect(css).toContain('/* uni variables */')
    expect(css).toContain('.w-_b100px_B{width:100px}')
    expect(css).not.toContain('@media source(none)')
    expect(css).not.toContain('generator-placeholder')
    expect(css).not.toContain('@config')
    expect(css).not.toContain('@source')
    expect(css).not.toMatch(/^\s*\}\s*$/m)
  })

  it('injects explicit vite-processed css into a css asset even when main matcher does not name it', async () => {
    const { injectViteProcessedCssIntoMainCssAssets } = await import('@/bundlers/vite/processed-css-assets')
    const bundle = {
      'bundle.acss': {
        type: 'asset',
        fileName: 'bundle.acss',
        source: '.existing{display:block}',
      },
    } as any

    const injected = injectViteProcessedCssIntoMainCssAssets(bundle, {
      opts: {
        cssMatcher: (file: string) => file.endsWith('.acss'),
        mainCssChunkMatcher: () => false,
        appType: 'uni-app-vite',
      } as any,
      getViteProcessedCssAssetResults: () => [[
        '/project/src/main.css',
        {
          css: '.layer-card-v4{display:flex;color:var(--color-midnight)}',
          injectIntoMain: true,
          outputFile: 'main.acss',
        },
      ]],
    })

    const css = bundle['bundle.acss'].source
    expect(injected).toBe(1)
    expect(css).toContain('.existing{display:block}')
    expect(css).toContain('.layer-card-v4')
    expect(css).toContain('color:var(--color-midnight)')
  })

  it('keeps root vite css replay enabled when a later same-output record disables self injection', async () => {
    const { injectViteProcessedCssIntoMainCssAssets } = await import('@/bundlers/vite/processed-css-assets')
    const records = new Map<string, { css: string, injectIntoMain?: boolean | undefined, outputFile?: string | undefined }>()
    const record = (file: string, css: string, options: { injectIntoMain?: boolean | undefined, outputFile?: string | undefined }) => {
      const previous = records.get(file)
      records.set(file, {
        css,
        injectIntoMain: previous?.injectIntoMain === true
          ? true
          : options.injectIntoMain ?? previous?.injectIntoMain,
        outputFile: options.outputFile ?? previous?.outputFile,
      })
    }
    record('/project/src/main.css', '.layer-card-v4{display:flex}', {
      injectIntoMain: true,
      outputFile: 'main.acss',
    })
    record('main.acss', '.layer-card-v4{display:flex}', {
      injectIntoMain: false,
      outputFile: 'main.acss',
    })

    const bundle = {
      'app.acss': {
        type: 'asset',
        fileName: 'app.acss',
        source: '.app-shell{display:block}',
      },
      'main.acss': {
        type: 'asset',
        fileName: 'main.acss',
        source: '.layer-card-v4{display:flex}',
      },
    } as any

    const injected = injectViteProcessedCssIntoMainCssAssets(bundle, {
      opts: {
        cssMatcher: (file: string) => file.endsWith('.acss'),
        mainCssChunkMatcher: () => false,
        appType: 'uni-app-vite',
      } as any,
      getViteProcessedCssAssetResults: () => records.entries(),
    })

    const css = bundle['app.acss'].source
    expect(injected).toBe(1)
    expect(css).toContain('.app-shell')
    expect(css).toContain('.layer-card-v4')
  })

  it('keeps imported vite-processed css out of main css when main css already imports it', async () => {
    const { injectViteProcessedCssIntoMainCssAssets } = await import('@/bundlers/vite/processed-css-assets')
    const bundle = {
      'app.wxss': {
        type: 'asset',
        fileName: 'app.wxss',
        source: '@import "app-origin.wxss";',
      },
    } as any

    const injected = injectViteProcessedCssIntoMainCssAssets(bundle, {
      opts: {
        cssMatcher: (file: string) => file.endsWith('.wxss'),
        mainCssChunkMatcher: (file: string) => file === 'app.wxss',
        appType: 'taro',
      } as any,
      getViteProcessedCssAssetResults: () => [[
        'app-origin.wxss',
        {
          css: '.from-origin{color:red}',
          injectIntoMain: true,
        },
      ]],
    })

    const css = bundle['app.wxss'].source
    expect(injected).toBe(0)
    expect(css).toBe('@import "app-origin.wxss";')
    expect(css).not.toContain('.from-origin')
  })

  it('keeps vite-processed source css out of main css when its output asset is imported', async () => {
    const { injectViteProcessedCssIntoMainCssAssets } = await import('@/bundlers/vite/processed-css-assets')
    const bundle = {
      'app.wxss': {
        type: 'asset',
        fileName: 'app.wxss',
        source: '@import "app-origin.wxss";',
      },
    } as any

    const injected = injectViteProcessedCssIntoMainCssAssets(bundle, {
      opts: {
        cssMatcher: (file: string) => file.endsWith('.wxss'),
        mainCssChunkMatcher: (file: string) => file === 'app.wxss',
        appType: 'taro',
      } as any,
      getViteProcessedCssAssetResults: () => [[
        '/project/src/app.css',
        {
          css: '.from-origin{color:red}',
          injectIntoMain: true,
          outputFile: 'app-origin.wxss',
        },
      ]],
    })

    const css = bundle['app.wxss'].source
    expect(injected).toBe(0)
    expect(css).toBe('@import "app-origin.wxss";')
    expect(css).not.toContain('.from-origin')
  })

  it('preserves mini-program local import shell css without resolving imported assets', async () => {
    const { injectViteProcessedCssIntoMainCssAssets } = await import('@/bundlers/vite/processed-css-assets')
    const bundle = {
      'app.wxss': {
        type: 'asset',
        fileName: 'app.wxss',
        source: '@import "./main.wxss";\n',
      },
      'main.wxss': {
        type: 'asset',
        fileName: 'main.wxss',
        source: '.from-main{color:red}',
      },
    } as any

    const injected = injectViteProcessedCssIntoMainCssAssets(bundle, {
      opts: {
        cssMatcher: (file: string) => file.endsWith('.wxss'),
        mainCssChunkMatcher: (file: string) => file === 'app.wxss',
        appType: 'uni-app-vite',
      } as any,
      getViteProcessedCssAssetResults: () => [[
        '/project/src/main.css',
        {
          css: '.from-main{color:red}',
          injectIntoMain: true,
          outputFile: 'main.wxss',
        },
      ]],
    })

    expect(injected).toBe(0)
    expect(bundle['app.wxss'].source).toBe('@import "./main.wxss";\n')
  })

  it('removes comment-only media rules after filtering imported vite-processed css', async () => {
    const { injectViteProcessedCssIntoMainCssAssets } = await import('@/bundlers/vite/processed-css-assets')
    const bundle = {
      'app.wxss': {
        type: 'asset',
        fileName: 'app.wxss',
        source: [
          '@import "app-origin.wxss";',
          '@media (prefers-color-scheme: dark) {',
          '  /* tokens: dark:bg-zinc-900 <= pages/index/index.wxml */',
          '  .dark_cbg-zinc-900{background-color:black}',
          '}',
          '.main-only{color:blue}',
        ].join('\n'),
      },
      'app-origin.wxss': {
        type: 'asset',
        fileName: 'app-origin.wxss',
        source: '@media (prefers-color-scheme: dark){.dark_cbg-zinc-900{background-color:black}}',
      },
    } as any

    const injected = injectViteProcessedCssIntoMainCssAssets(bundle, {
      opts: {
        cssMatcher: (file: string) => file.endsWith('.wxss'),
        mainCssChunkMatcher: (file: string) => file === 'app.wxss',
        appType: 'weapp-vite',
      } as any,
      getViteProcessedCssAssetResults: () => [],
    })

    const css = bundle['app.wxss'].source
    expect(injected).toBe(1)
    expect(css).toContain('@import "app-origin.wxss";')
    expect(css).toContain('.main-only{color:blue}')
    expect(css).not.toContain('@media (prefers-color-scheme: dark)')
    expect(css).not.toContain('dark:bg-zinc-900')
  })

  it('removes main css rules already covered by imported vite-processed output assets', async () => {
    const { injectViteProcessedCssIntoMainCssAssets } = await import('@/bundlers/vite/processed-css-assets')
    const bundle = {
      'app.wxss': {
        type: 'asset',
        fileName: 'app.wxss',
        source: [
          '@import "app-origin.wxss";',
          '.from-origin{color:red}',
          '.main-only{color:blue}',
        ].join('\n'),
      },
    } as any

    const injected = injectViteProcessedCssIntoMainCssAssets(bundle, {
      opts: {
        cssMatcher: (file: string) => file.endsWith('.wxss'),
        mainCssChunkMatcher: (file: string) => file === 'app.wxss',
        appType: 'taro',
      } as any,
      getViteProcessedCssAssetResults: () => [[
        '/project/src/app.css',
        {
          css: '.from-origin{color:red}',
          injectIntoMain: true,
          outputFile: 'app-origin.wxss',
        },
      ]],
    })

    const css = bundle['app.wxss'].source
    expect(injected).toBe(1)
    expect(css).toContain('@import "app-origin.wxss";')
    expect(css).not.toContain('.from-origin')
    expect(css).toContain('.main-only{color:blue}')
  })

  it('does not append vite-processed main css already covered by imported output css', async () => {
    const { injectViteProcessedCssIntoMainCssAssets } = await import('@/bundlers/vite/processed-css-assets')
    const bundle = {
      'app.wxss': {
        type: 'asset',
        fileName: 'app.wxss',
        source: '@import "app-origin.wxss"',
      },
      'app-origin.wxss': {
        type: 'asset',
        fileName: 'app-origin.wxss',
        source: [
          '.h-14{height:calc(var(--spacing)*14)}',
          '.bg-_b_h123456_B{background-color:#123456}',
        ].join('\n'),
      },
    } as any

    const injected = injectViteProcessedCssIntoMainCssAssets(bundle, {
      opts: {
        cssMatcher: (file: string) => file.endsWith('.wxss'),
        mainCssChunkMatcher: (file: string) => file === 'app.wxss',
        appType: 'taro',
      } as any,
      getViteProcessedCssAssetResults: () => [
        [
          'app-origin.wxss',
          {
            css: [
              '.h-14{height:calc(var(--spacing)*14)}',
              '.bg-_b_h123456_B{background-color:#123456}',
            ].join('\n'),
            injectIntoMain: false,
            outputFile: 'app-origin.wxss',
          },
        ],
        [
          '/project/src/app.css',
          {
            css: [
              '.h-14{height:calc(var(--spacing)*14)}',
              '.bg-_b_h123456_B{background-color:#123456}',
            ].join('\n'),
            injectIntoMain: true,
            outputFile: 'app-origin.wxss',
          },
        ],
      ],
    })

    const css = bundle['app.wxss'].source
    expect(injected).toBe(0)
    expect(css).toBe('@import "app-origin.wxss"')
    expect(css).not.toContain('.h-14')
    expect(css).not.toContain('.bg-_b_h123456_B')
  })

  it('removes main css rules already covered by imported bundle css assets', async () => {
    const { injectViteProcessedCssIntoMainCssAssets } = await import('@/bundlers/vite/processed-css-assets')
    const bundle = {
      'app.wxss': {
        type: 'asset',
        fileName: 'app.wxss',
        source: [
          '@import "app-origin.wxss";',
          '.from-origin{color:red}',
          '.main-only{color:blue}',
        ].join('\n'),
      },
      'app-origin.wxss': {
        type: 'asset',
        fileName: 'app-origin.wxss',
        source: '.from-origin{color:red}',
      },
    } as any

    const injected = injectViteProcessedCssIntoMainCssAssets(bundle, {
      opts: {
        cssMatcher: (file: string) => file.endsWith('.wxss'),
        mainCssChunkMatcher: (file: string) => file === 'app.wxss',
        appType: 'taro',
      } as any,
      getViteProcessedCssAssetResults: () => [],
    })

    const css = bundle['app.wxss'].source
    expect(injected).toBe(1)
    expect(css).toContain('@import "app-origin.wxss";')
    expect(css).not.toContain('.from-origin')
    expect(css).toContain('.main-only{color:blue}')
  })

  it('keeps minified vite-processed css out of main css when build output already contains it', async () => {
    const { injectViteProcessedCssIntoMainCssAssets } = await import('@/bundlers/vite/processed-css-assets')
    const bundle = {
      'app.wxss': {
        type: 'asset',
        fileName: 'app.wxss',
        source: [
          'view,text,:after,:before{box-sizing:border-box;margin:0;padding:0;border:0 solid}',
          ':host,page,.tw-root,wx-root-portal-content{--spacing:8rpx;--color-blue-500:#155dfc}',
          '.text-_b102_d43rpx_B{font-size:102.43rpx}',
          '.layer-card-v4{display:flex;align-items:center}',
        ].join(''),
      },
    } as any

    const injected = injectViteProcessedCssIntoMainCssAssets(bundle, {
      opts: {
        cssMatcher: (file: string) => file.endsWith('.wxss'),
        mainCssChunkMatcher: (file: string) => file === 'app.wxss',
        appType: 'uni-app-vite',
      } as any,
      getViteProcessedCssAssetResults: () => [[
        '/src/main.css',
        {
          css: [
            'view,text,::after,::before {',
            '  box-sizing: border-box;',
            '  margin: 0;',
            '  padding: 0;',
            '  border: 0 solid;',
            '}',
            ':host,page,.tw-root,wx-root-portal-content {',
            '  --spacing: 8rpx;',
            '  --color-blue-500: #155dfc;',
            '}',
            '/* Core plugin extractor sources are intentionally not loaded here. */',
            '.layer-card-v4 {',
            '  display: flex;',
            '  align-items: center;',
            '}',
            '.text-_b102_d43rpx_B {',
            '  font-size: 102.43rpx;',
            '}',
          ].join('\n'),
          injectIntoMain: true,
        },
      ]],
    })

    const css = bundle['app.wxss'].source
    expect(injected).toBe(0)
    expect(css.match(/view,text,:after,:before/g)).toHaveLength(1)
    expect(css).not.toContain('::after,::before')
    expect(css).not.toContain('Core plugin extractor')
    expect(css.match(/\.layer-card-v4/g)).toHaveLength(1)
  })

  it('honors disabled main injection even when app-origin matches taro main css fallback', async () => {
    const { injectViteProcessedCssIntoMainCssAssets } = await import('@/bundlers/vite/processed-css-assets')
    const bundle = {
      'app.wxss': {
        type: 'asset',
        fileName: 'app.wxss',
        source: '.app{color:red}',
      },
    } as any

    const injected = injectViteProcessedCssIntoMainCssAssets(bundle, {
      opts: {
        cssMatcher: (file: string) => file.endsWith('.wxss'),
        mainCssChunkMatcher: (file: string) => file.startsWith('app'),
        appType: 'taro',
      } as any,
      getViteProcessedCssAssetResults: () => [[
        'app-origin.wxss',
        {
          css: '.from-origin{color:blue}',
          injectIntoMain: false,
        },
      ]],
    })

    const css = bundle['app.wxss'].source
    expect(injected).toBe(0)
    expect(css).toBe('.app{color:red}')
    expect(css).not.toContain('.from-origin')
  })

  it('keeps vite-processed css marker blocks scoped to the matching output asset', async () => {
    const { createBundlerGeneratedCssMarker } = await import('@/bundlers/shared/generated-css-marker')
    const { collectViteProcessedCssAssetResults } = await import('@/bundlers/vite/processed-css-assets')
    const bundle = {
      'sub-independent/pages/index.wxss': {
        type: 'asset',
        fileName: 'sub-independent/pages/index.wxss',
        source: [
          createBundlerGeneratedCssMarker('vite', '/project/sub-independent/pages/index.css'),
          '.independent-only{}',
          createBundlerGeneratedCssMarker('vite', '/project/sub-normal/pages/index.css'),
          '.normal-only{}',
        ].join('\n'),
      },
    } as any
    const records: Array<[string, string]> = []

    const collected = collectViteProcessedCssAssetResults(bundle, {
      isViteProcessedCssAsset: () => true,
      recordCssAssetResult: (file, css) => records.push([file, css]),
      resolveViteProcessedCssOutputFile: file => file.replace(/^\/project\//, '').replace(/\.css$/, '.wxss'),
    })

    expect(collected).toBe(1)
    expect(bundle['sub-independent/pages/index.wxss'].source).toContain('.independent-only')
    expect(bundle['sub-independent/pages/index.wxss'].source).not.toContain('.normal-only')
    expect(records).toEqual([[
      'sub-independent/pages/index.wxss',
      expect.stringContaining('.independent-only'),
    ]])
  })

  it('does not force app-origin vite-processed css into main css during collection', async () => {
    const { collectViteProcessedCssAssetResults } = await import('@/bundlers/vite/processed-css-assets')
    const bundle = {
      'app-origin.wxss': {
        type: 'asset',
        fileName: 'app-origin.wxss',
        source: '.script-only{}',
      },
    } as any
    const records: Array<[string, string, { injectIntoMain?: boolean | undefined } | undefined]> = []

    const collected = collectViteProcessedCssAssetResults(bundle, {
      opts: {
        appType: 'taro',
        cssMatcher: (file: string) => file.endsWith('.wxss'),
        mainCssChunkMatcher: (file: string) => file === 'app.wxss',
      } as any,
      isViteProcessedCssAsset: () => true,
      recordViteProcessedCssAssetResult: (file, css, options) => records.push([file, css, options]),
    })

    expect(collected).toBe(1)
    expect(records).toEqual([[
      'app-origin.wxss',
      '.script-only{}',
      { injectIntoMain: undefined, outputFile: 'app-origin.wxss' },
    ]])
  })

  it('records vite marker source files with their emitted output asset', async () => {
    const { createBundlerGeneratedCssMarker } = await import('@/bundlers/shared/generated-css-marker')
    const { collectViteProcessedCssAssetResults } = await import('@/bundlers/vite/processed-css-assets')
    const bundle = {
      'app-origin.wxss': {
        type: 'asset',
        fileName: 'app-origin.wxss',
        source: [
          createBundlerGeneratedCssMarker('vite', '/project/src/app.css'),
          '.app-main{}',
        ].join('\n'),
      },
    } as any
    const records: Array<[string, string, { injectIntoMain?: boolean | undefined, outputFile?: string | undefined } | undefined]> = []

    const collected = collectViteProcessedCssAssetResults(bundle, {
      opts: {
        appType: 'taro',
        cssMatcher: (file: string) => file.endsWith('.wxss'),
        mainCssChunkMatcher: (file: string) => file === 'app.wxss',
      } as any,
      isViteProcessedCssAsset: () => true,
      recordViteProcessedCssAssetResult: (file, css, options) => records.push([file, css, options]),
      resolveViteProcessedCssOutputFile: file => file === '/project/src/app.css' ? 'app-origin.wxss' : file,
    })

    expect(collected).toBe(1)
    expect(records).toEqual([
      [
        'app-origin.wxss',
        '.app-main{}',
        { injectIntoMain: undefined, outputFile: 'app-origin.wxss' },
      ],
      [
        '/project/src/app.css',
        '.app-main{}',
        { injectIntoMain: undefined, outputFile: 'app-origin.wxss' },
      ],
    ])
  })

  it('matches Tailwind v4 cssSources by postcss source file when subpackages share index.css names', async () => {
    const root = '/project'
    const independentCss = `${root}/sub-independent/pages/index.css`
    const normalCss = `${root}/sub-normal/pages/index.css`
    const resolveTailwindV4Source = vi.fn(async (options: any = {}) => ({
      projectRoot: root,
      base: options.base ?? root,
      baseFallbacks: [],
      css: options.css ?? firstResolvedCssSourceOption(options).css ?? '@import "tailwindcss";',
      dependencies: [],
      version: 4,
    }))
    vi.doMock('@/generator', () => createDefaultGeneratorMock({
      resolveTailwindV4Source,
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: root,
        cwd: root,
        base: root,
        baseFallbacks: [root],
        cssSources: [
          {
            file: independentCss,
            base: `${root}/sub-independent/pages`,
            css: '@import "tailwindcss" source(none);\n@config "../../tailwind.config.sub-independent.js";',
          },
          {
            file: normalCss,
            base: `${root}/sub-normal/pages`,
            css: '@import "tailwindcss" source(none);\n@config "../../tailwind.config.sub-normal.js";',
          },
        ],
      })),
    }))
    const { resolveGeneratorSource } = await import('@/generation/source-resolver')

    const source = await resolveGeneratorSource(
      4,
      {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
      },
      '@import "tailwindcss" source(none);\n@config "../../tailwind.config.sub-normal.js";',
      'sub-normal/pages/index.wxss',
      {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: normalCss,
          },
        },
        majorVersion: 4,
        sourceOptions: {
          outputRoot: path.join(root, 'dist'),
        },
      } as any,
      normalizeGeneratorOptions(),
    )

    expect(source?.css).toContain('tailwind.config.sub-normal.js')
    expect(source?.css).not.toContain('tailwind.config.sub-independent.js')
    expect(source?.css).toContain(`@config "${root}/tailwind.config.sub-normal.js";`)
    expect(source?.css).not.toContain('@config "../../tailwind.config.sub-normal.js";')
    expect(resolveTailwindV4Source).toHaveBeenCalledWith(expect.objectContaining({
      base: path.dirname(normalCss),
      css: expect.stringContaining(`@config "${root}/tailwind.config.sub-normal.js";`),
    }))
  })

  it('normalizes Tailwind v4 @config against cssHandler sourceFile when source-side matching falls back to asset css', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-config-source-file-'))
    const sourceFile = path.join(root, 'src/sub-normal/pages/index.css')
    const configFile = path.join(root, 'tailwind.config.sub-normal.js')
    const rawSource = '@import "tailwindcss" source(none);\n@config "../../../tailwind.config.sub-normal.js";'
    await mkdir(path.dirname(sourceFile), { recursive: true })
    await writeFile(sourceFile, rawSource)
    await writeFile(configFile, 'export default {}')
    const resolveTailwindV4Source = vi.fn(async (options: any = {}) => ({
      projectRoot: root,
      base: options.base ?? root,
      baseFallbacks: [],
      css: options.css ?? '@import "tailwindcss";',
      dependencies: [],
      version: 4,
    }))
    vi.doMock('@/generator', () => createDefaultGeneratorMock({
      resolveTailwindV4Source,
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: root,
        cwd: root,
        base: root,
        baseFallbacks: [root],
      })),
    }))
    const { resolveGeneratorSource } = await import('@/generation/source-resolver')

    const source = await resolveGeneratorSource(
      4,
      {
        tailwindRuntime: {
          majorVersion: 4,
        } as any,
      },
      rawSource,
      'sub-normal/pages/index.wxss',
      {
        isMainChunk: false,
        postcssOptions: {
          options: {
            from: sourceFile,
          },
        },
        majorVersion: 4,
        sourceOptions: {
          outputRoot: path.join(root, 'dist'),
          sourceFile,
        },
      } as any,
      normalizeGeneratorOptions(),
    )

    expect(source?.css).toContain(`@config "${configFile}";`)
    expect(source?.css).not.toContain('../../../tailwind.config.sub-normal.js')
    expect(resolveTailwindV4Source).toHaveBeenCalledWith(expect.objectContaining({
      base: path.dirname(sourceFile),
      css: expect.stringContaining(`@config "${configFile}";`),
    }))
  })

  it('resolves imported SFC @config from its configured cssSource file', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-sfc-import-config-'))
    const mainCssFile = path.join(root, 'main.css')
    const configFile = path.join(root, 'tailwind.config.js')
    const pageFile = path.join(root, 'pages/index/index.uvue')
    const mainCss = '@import "tailwindcss" source(none);\n@config "./tailwind.config.js";'
    const flattenedCss = `${mainCss}\n.probe { @apply flex; }`
    await mkdir(path.dirname(pageFile), { recursive: true })
    await writeFile(mainCssFile, mainCss)
    await writeFile(configFile, 'export default {}')
    await writeFile(pageFile, '<style scoped>\n@import "../../main.css";\n.probe { @apply flex; }\n</style>')
    const resolveTailwindV4Source = vi.fn(async (options: any = {}) => ({
      projectRoot: root,
      base: options.base ?? root,
      baseFallbacks: [],
      css: options.css ?? '@import "tailwindcss";',
      dependencies: [],
      version: 4,
    }))
    vi.doMock('@/generator', () => createDefaultGeneratorMock({
      resolveTailwindV4Source,
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: root,
        cwd: root,
        base: root,
        baseFallbacks: [root],
        cssSources: [{
          file: mainCssFile,
          base: root,
          css: mainCss,
        }],
      })),
    }))
    const { resolveGeneratorSource } = await import('@/generation/source-resolver')

    const source = await resolveGeneratorSource(
      4,
      { tailwindRuntime: { majorVersion: 4 } as any },
      flattenedCss,
      `${pageFile}?vue&type=style&index=0&scoped=abc&lang.css`,
      {
        isMainChunk: false,
        majorVersion: 4,
        postcssOptions: { options: { from: pageFile } },
      } as any,
      normalizeGeneratorOptions(),
      {
        cssSources: [{
          file: pageFile,
          base: path.dirname(pageFile),
          css: flattenedCss,
        }],
      },
    )

    expect(source?.css).toContain(`@config "${configFile}";`)
    expect(source?.css).toContain('.probe { @apply flex; }')
    expect(source?.css).not.toContain(path.join(path.dirname(pageFile), 'tailwind.config.js'))
    expect(resolveTailwindV4Source).toHaveBeenCalledWith(expect.objectContaining({
      base: root,
      css: expect.stringContaining(`@config "${configFile}";`),
    }))
  })
})
