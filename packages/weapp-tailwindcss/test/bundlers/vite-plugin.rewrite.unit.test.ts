import type { Plugin, TransformResult } from 'vite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { slash } from '@/bundlers/vite/utils'
import { createRewriteCssImportsPlugins } from '@/bundlers/vite/rewrite-css-imports'
import { vitePluginName } from '@/constants'
import { resolvePackageDir } from '@/utils/resolve-package'
import {
  createContext,
  getCurrentContext,
  resetVitePluginTestContext,
  setCurrentContext,
} from './vite-plugin.testkit'

const TEST_TIMEOUT_MS = 30000

async function loadWeappTailwindcssPlugin() {
  const mod = await import('@/bundlers/vite')
  return mod.WeappTailwindcss
}

function getResolveIdHandler(plugin: Plugin) {
  return typeof plugin.resolveId === 'function'
    ? plugin.resolveId.bind(plugin)
    : plugin.resolveId?.handler?.bind(plugin)
}

function getTransformHandler(plugin: Plugin) {
  return typeof plugin.transform === 'function'
    ? plugin.transform.bind(plugin)
    : plugin.transform?.handler?.bind(plugin)
}

describe('bundlers/vite WeappTailwindcss rewrite', () => {
  beforeEach(() => {
    vi.resetModules()
    resetVitePluginTestContext()
  })

  it('keeps tailwindcss imports unresolved by default while retaining generator transform ownership', async () => {
    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const currentContext = getCurrentContext()
    currentContext.tailwindRuntime.majorVersion = 4
    const plugins = WeappTailwindcss()
    const rewritePlugin = plugins?.find(plugin => plugin.name === `${vitePluginName}:rewrite-css-imports`)
    expect(rewritePlugin).toBeTruthy()

    const resolveId = getResolveIdHandler(rewritePlugin as Plugin)
    expect(resolveId).toBeTypeOf('function')
    expect((rewritePlugin as Plugin).enforce).toBe('pre')

    expect(await resolveId?.('tailwindcss', '/src/app.css')).toBeNull()
    expect(await resolveId?.('tailwindcss/base', '/src/global.scss?inline')).toBeNull()
    expect(await resolveId?.('tailwindcss', '/src/*')).toBeNull()
  }, TEST_TIMEOUT_MS)

  it('rewrites tailwindcss imports for css entry files when enabled', async () => {
    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const currentContext = getCurrentContext()
    currentContext.tailwindRuntime.majorVersion = 4
    currentContext.rewriteCssImports = true
    const plugins = WeappTailwindcss()
    const rewritePlugin = plugins?.find(plugin => plugin.name === `${vitePluginName}:rewrite-css-imports`)
    expect(rewritePlugin).toBeTruthy()

    const resolveId = getResolveIdHandler(rewritePlugin as Plugin)
    expect(resolveId).toBeTypeOf('function')
    expect((rewritePlugin as Plugin).enforce).toBe('pre')

    const pkgDir = slash(resolvePackageDir('weapp-tailwindcss'))
    const cssImporter = '/src/app.css'
    const subpathImporter = '/src/global.scss?inline'

    const resolvedRoot = await resolveId?.('tailwindcss', cssImporter)
    expect(resolvedRoot).toBe(`${pkgDir}/generator-placeholder.css`)

    const resolvedBase = await resolveId?.('tailwindcss/base', subpathImporter)
    expect(resolvedBase).toBe(`${pkgDir}/base`)

    const resolvedFromPostcssImport = await resolveId?.('tailwindcss', '/src/*')
    expect(resolvedFromPostcssImport).toBe(`${pkgDir}/generator-placeholder.css`)

    const ignoredJs = await resolveId?.('tailwindcss', '/src/main.ts')
    expect(ignoredJs).toBeNull()

    const ignoredPackage = await resolveId?.('tailwindcss-forms', cssImporter)
    expect(ignoredPackage).toBeNull()
  }, TEST_TIMEOUT_MS)

  it('transforms css source to rewrite tailwindcss @import statements', async () => {
    const [rewritePlugin] = createRewriteCssImportsPlugins({
      rootImport: '/virtual/weapp-tailwindcss/generator-placeholder.css',
      shouldOwnTailwindGeneration: true,
      shouldRewrite: true,
      weappTailwindcssDirPosix: '/virtual/weapp-tailwindcss',
    })
    const transform = getTransformHandler(rewritePlugin!)
    expect(transform).toBeTypeOf('function')
    expect(rewritePlugin?.enforce).toBe('pre')

    const source = `
@import 'tailwindcss' layer(base);
@import url("tailwindcss/utilities");
.foo { color: red; }
`
    const result = await transform?.(source, '/src/app.css') as TransformResult
    expect(result?.code).toContain('@import \'/virtual/weapp-tailwindcss/generator-placeholder.css\' layer(base);')
    expect(result?.code).toContain('@import url("/virtual/weapp-tailwindcss/utilities");')
  }, TEST_TIMEOUT_MS)

  it('emits generated tailwind css during the pre transform when generator mode owns output', async () => {
    const addWatchFile = vi.fn()
    const generateTailwindCss = vi.fn(async (_id: string, _code: string, hookContext?: { addWatchFile?: (id: string) => void }) => {
      hookContext?.addWatchFile?.('/project/tailwind.config.ts')
      return '.bg-clip-text{background-clip:text}'
    })
    const onTailwindRootCss = vi.fn()
    const [rewritePlugin] = createRewriteCssImportsPlugins({
      generateTailwindCss,
      onTailwindRootCss,
      shouldOwnTailwindGeneration: true,
      shouldRewrite: true,
      weappTailwindcssDirPosix: '/virtual/weapp-tailwindcss',
    })
    const transform = typeof rewritePlugin?.transform === 'object'
      ? rewritePlugin.transform.handler
      : rewritePlugin?.transform
    expect(transform).toBeTypeOf('function')

    const source = '@import "tailwindcss";\n.foo { color: red; }'
    const result = await transform?.call({ addWatchFile }, source, '/project/src/app.css') as TransformResult

    expect(result?.code).toBe('.bg-clip-text{background-clip:text}')
    expect(generateTailwindCss).toHaveBeenCalledWith('/project/src/app.css', source, expect.objectContaining({
      addWatchFile: expect.any(Function),
      cssStage: 'raw',
    }))
    expect(onTailwindRootCss).toHaveBeenCalledWith('/project/src/app.css', source)
    expect(addWatchFile).toHaveBeenCalledWith('/project/tailwind.config.ts')
  })

  it('expands Tailwind v4 mini-program css before Vite PostCSS can consume source(none)', async () => {
    const addWatchFile = vi.fn()
    const generateTailwindCss = vi.fn(async (_id: string, code: string, hookContext?: { addWatchFile?: (id: string) => void }) => {
      expect(code).toContain('@import "tailwindcss" source(none);')
      expect(code).toContain('@config "/project/tailwind.config.ts";')
      hookContext?.addWatchFile?.('/project/tailwind.config.ts')
      return [
        '.bg-brand{background-color:#123456}',
        '.rounded-full{border-radius:9999px}',
        '.dark .text-foreground{color:#ffffff}',
      ].join('\n')
    })
    const [rewritePlugin] = createRewriteCssImportsPlugins({
      generateTailwindCss,
      shouldOwnTailwindGeneration: true,
      shouldRewrite: false,
      weappTailwindcssDirPosix: '/virtual/weapp-tailwindcss',
    })
    const transform = typeof rewritePlugin?.transform === 'object'
      ? rewritePlugin.transform.handler
      : rewritePlugin?.transform
    const source = [
      '@import "tailwindcss" source(none);',
      '@config "../../tailwind.config.ts";',
      '@theme {',
      '  --radius-full: 9999px;',
      '}',
      '@source "../../src/**/*.{js,jsx,ts,tsx,md,mdx}";',
      '@source "../../docs/**/*.{md,mdx}";',
      '@source "../../blog/**/*.{md,mdx}";',
      '@source "../../config/**/*.{ts,tsx}";',
      '@source "../../docusaurus.config.ts";',
      '@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));',
    ].join('\n')

    const result = await transform?.call(
      { addWatchFile },
      source,
      '/project/src/css/custom.css',
    ) as TransformResult

    expect(result?.code).toContain('.bg-brand{background-color:#123456}')
    expect(result?.code).not.toContain('@import "tailwindcss"')
    expect(result?.code).not.toContain('@media source(none)')
    expect(result?.code).not.toContain('source(none)')
    expect(result?.code).not.toContain(':not(#\\#)')
    expect(generateTailwindCss).toHaveBeenCalledWith(
      '/project/src/css/custom.css',
      expect.stringContaining('@config "/project/tailwind.config.ts";'),
      expect.objectContaining({
        addWatchFile: expect.any(Function),
        cssStage: 'raw',
      }),
    )
    expect(addWatchFile).toHaveBeenCalledWith('/project/tailwind.config.ts')
  })

  it('can emit generated css without rewriting imports for Tailwind v4 generator mode', async () => {
    const generateTailwindCss = vi.fn(async () => '.flex{display:flex}')
    const [rewritePlugin] = createRewriteCssImportsPlugins({
      generateTailwindCss,
      shouldOwnTailwindGeneration: true,
      shouldRewrite: false,
      weappTailwindcssDirPosix: '/virtual/weapp-tailwindcss',
    })
    expect(rewritePlugin).toBeTruthy()

    const resolveId = getResolveIdHandler(rewritePlugin!)
    const transform = getTransformHandler(rewritePlugin!)

    expect(await resolveId?.('tailwindcss', '/src/app.css')).toBeNull()
    const result = await transform?.('@tailwind utilities;', '/src/App.vue?vue&type=style&index=0&lang.scss') as TransformResult

    expect(result?.code).toBe('.flex{display:flex}')
    expect(generateTailwindCss).toHaveBeenCalledWith(
      '/src/App.vue?vue&type=style&index=0&lang.scss',
      '@tailwind utilities;',
      expect.anything(),
    )
  })

  it('defers Tailwind v4 root import generation when css import rewrite is disabled', async () => {
    const generateTailwindCss = vi.fn(async () => '.flex{display:flex}')
    const onTailwindRootCss = vi.fn()
    const [rewritePlugin] = createRewriteCssImportsPlugins({
      generateTailwindCss,
      onTailwindRootCss,
      shouldDeferGeneration: (_id, code) => code.includes('@import "tailwindcss"'),
      shouldOwnTailwindGeneration: true,
      shouldRewrite: false,
      weappTailwindcssDirPosix: '/virtual/weapp-tailwindcss',
    })
    const transform = getTransformHandler(rewritePlugin!)

    const source = '@import "tailwindcss";'
    const result = await transform?.(source, '/src/app.css') as TransformResult

    expect(result?.code).toContain(source)
    expect(result?.code).toContain('deferred-source:%2Fsrc%2Fapp.css')
    expect(onTailwindRootCss).toHaveBeenCalledWith('/src/app.css', source)
    expect(generateTailwindCss).not.toHaveBeenCalled()
  })

  it('can emit generated css for Tailwind v4 Sass @use entries before preprocessing', async () => {
    const source = [
      '@use "tailwindcss/base";',
      '@use "tailwindcss/components";',
      '@use "tailwindcss/utilities";',
      '.page { @apply flex min-h-screen; }',
    ].join('\n')
    const generateTailwindCss = vi.fn(async () => '.flex{display:flex}.min-h-screen{min-height:100vh}')
    const [rewritePlugin] = createRewriteCssImportsPlugins({
      generateTailwindCss,
      shouldOwnTailwindGeneration: true,
      shouldRewrite: false,
      weappTailwindcssDirPosix: '/virtual/weapp-tailwindcss',
    })
    const transform = getTransformHandler(rewritePlugin!)

    const result = await transform?.(source, '/src/App.vue?vue&type=style&index=0&lang.scss') as TransformResult

    expect(result?.code).toBe('.flex{display:flex}.min-h-screen{min-height:100vh}')
    expect(generateTailwindCss).toHaveBeenCalledWith(
      '/src/App.vue?vue&type=style&index=0&lang.scss',
      source,
      expect.anything(),
    )
  })

  it('rewrites tailwindcss imports in preprocessor and SFC style requests', async () => {
    const [rewritePlugin] = createRewriteCssImportsPlugins({
      shouldRewrite: true,
      weappTailwindcssDirPosix: '/virtual/weapp-tailwindcss',
    })
    const resolveId = getResolveIdHandler(rewritePlugin!)
    const transform = getTransformHandler(rewritePlugin!)

    expect(await resolveId?.('tailwindcss', '/src/app.scss?inline')).toBe('/virtual/weapp-tailwindcss/index.css')
    expect(await resolveId?.('weapp-tailwindcss', '/src/component.vue?vue&type=style&index=0&lang.scss')).toBe('/virtual/weapp-tailwindcss/index.css')

    const scss = await transform?.('$color: red;\n@import "tailwindcss";\n.app { color: $color; }', '/src/app.scss') as TransformResult
    expect(scss?.code).toContain('@import "/virtual/weapp-tailwindcss/index.css";')
    expect(scss?.code).toContain('$color: red;')

    const less = await transform?.('@import "weapp-tailwindcss";\n@color: red;\n.app { color: @color; }', '/src/component.vue?vue&type=style&index=0&lang=less') as TransformResult
    expect(less?.code).toContain('@import "/virtual/weapp-tailwindcss/index.css";')
    expect(less?.code).toContain('@color: red;')
  })

  it('rewrites tailwindcss root imports to generator placeholder in force generator mode', async () => {
    const [rewritePlugin] = createRewriteCssImportsPlugins({
      rootImport: '/virtual/weapp-tailwindcss/generator-placeholder.css',
      shouldOwnTailwindGeneration: true,
      shouldRewrite: true,
      weappTailwindcssDirPosix: '/virtual/weapp-tailwindcss',
    })
    const transform = getTransformHandler(rewritePlugin!)
    const result = await transform?.('@import "tailwindcss";\n@import "tailwindcss/theme.css";', '/src/app.css') as TransformResult
    expect(result?.code).toContain('@import "/virtual/weapp-tailwindcss/generator-placeholder.css";')
    expect(result?.code).toContain('@import "/virtual/weapp-tailwindcss/theme.css";')
  }, TEST_TIMEOUT_MS)

  it('runs rewrite transform ahead of other pre plugins so tailwindcss imports are replaced first', async () => {
    const [rewritePlugin] = createRewriteCssImportsPlugins({
      generateTailwindCss: () => undefined,
      rootImport: '/virtual/weapp-tailwindcss/generator-placeholder.css',
      shouldOwnTailwindGeneration: true,
      shouldRewrite: true,
      weappTailwindcssDirPosix: '/virtual/weapp-tailwindcss',
    })

    const tailwindLikePlugin: Plugin = {
      name: '@tailwindcss/vite:generate',
      enforce: 'pre',
      transform: {
        order: 'post',
        handler(code) {
          return { code: `tailwind:${code}`, map: null }
        },
      },
    }

    function collectOrderedTransforms(pluginList: Plugin[]) {
      const pluginPre: Array<{ name: string, hook: NonNullable<Plugin['transform']> }> = []
      const pluginNormal: typeof pluginPre = []
      const pluginPost: typeof pluginPre = []
      for (const plugin of pluginList) {
        const hook = plugin.transform
        if (!hook) {
          continue
        }
        const target = plugin.enforce === 'post'
          ? pluginPost
          : plugin.enforce === 'pre'
            ? pluginPre
            : pluginNormal
        target.push({
          name: plugin.name,
          hook,
        })
      }
      const orderedPlugins = [...pluginPre, ...pluginNormal, ...pluginPost]
      const hookPre: Array<{ name: string, handler: NonNullable<Plugin['transform']> }> = []
      const hookNormal: typeof hookPre = []
      const hookPost: typeof hookPre = []
      for (const plugin of orderedPlugins) {
        const hook = plugin.hook
        const target = typeof hook === 'object'
          ? hook.order === 'post'
            ? hookPost
            : hook.order === 'pre'
              ? hookPre
              : hookNormal
          : hookNormal
        target.push({
          name: plugin.name,
          handler: typeof hook === 'object' ? hook.handler!.bind(plugin) : hook.bind(plugin),
        })
      }
      return [...hookPre, ...hookNormal, ...hookPost]
    }

    const orderedTransforms = collectOrderedTransforms([tailwindLikePlugin, rewritePlugin!])
    expect(orderedTransforms.map(item => item.name)).toEqual([
      `${vitePluginName}:rewrite-css-imports`,
      '@tailwindcss/vite:generate',
    ])

    let source = '@import "tailwindcss";'
    const id = '/src/app.css'

    for (const { handler } of orderedTransforms) {
      const result = await handler(source, id) as TransformResult
      if (result?.code) {
        source = result.code
      }
    }

    expect(source).toContain('@import "/virtual/weapp-tailwindcss/generator-placeholder.css";')
    expect(source.startsWith('tailwind:')).toBeTruthy()
  }, TEST_TIMEOUT_MS)

  it('does not keep tailwindcss imports resolvable by default when plugin is disabled for tailwind v4 projects', async () => {
    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const currentContext = createContext({ disabled: true })
    setCurrentContext(currentContext)
    currentContext.tailwindRuntime.majorVersion = 4
    const plugins = WeappTailwindcss()
    expect(plugins).toBeUndefined()
  }, TEST_TIMEOUT_MS)

  it('keeps tailwindcss imports resolvable when plugin is disabled and css import rewrite is enabled', async () => {
    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const currentContext = createContext({ disabled: true, rewriteCssImports: true })
    setCurrentContext(currentContext)
    currentContext.tailwindRuntime.majorVersion = 4
    const plugins = WeappTailwindcss()
    expect(plugins?.length).toBe(1)
    const rewritePlugin = plugins?.[0]
    expect(rewritePlugin?.name).toBe(`${vitePluginName}:rewrite-css-imports`)

    const transform = getTransformHandler(rewritePlugin as Plugin)
    expect(transform).toBeTypeOf('function')

    const result = await transform?.('@import "tailwindcss";', '/src/app.css') as TransformResult
    const pkgDir = slash(resolvePackageDir('weapp-tailwindcss'))
    expect(result?.code).toContain(`@import "${pkgDir}/index.css";`)
  }, TEST_TIMEOUT_MS)

  it('supports trailing package directories and importer-less resolution in rewrite factory', async () => {
    const [rewritePlugin] = createRewriteCssImportsPlugins({
      shouldRewrite: true,
      weappTailwindcssDirPosix: '/virtual/weapp-tailwindcss/',
    })
    const resolveId = getResolveIdHandler(rewritePlugin!)
    expect(resolveId).toBeTypeOf('function')

    expect(resolveId?.('tailwindcss/base', undefined)).toBe('/virtual/weapp-tailwindcss/base')
  })

  it('returns null for css transforms without tailwindcss imports', async () => {
    const [rewritePlugin] = createRewriteCssImportsPlugins({
      shouldRewrite: true,
      weappTailwindcssDirPosix: '/virtual/weapp-tailwindcss',
      getAppType: () => 'taro',
    })
    const transform = getTransformHandler(rewritePlugin!)
    expect(transform).toBeTypeOf('function')

    await expect(transform?.('.foo { color: red; }', '/src/app.css')).resolves.toBeNull()
  })

  it('strips @config directives before Vite CSS handling in generator mode', async () => {
    const [rewritePlugin] = createRewriteCssImportsPlugins({
      shouldOwnTailwindGeneration: true,
      shouldRewrite: true,
      weappTailwindcssDirPosix: '/virtual/weapp-tailwindcss',
    })
    const transform = getTransformHandler(rewritePlugin!)
    expect(transform).toBeTypeOf('function')

    const result = await transform?.('@import "tailwindcss";\n@config "../tailwind.config.js";\n.foo { color: red; }', '/src/app.css') as TransformResult
    expect(result?.code).toContain('@import "/virtual/weapp-tailwindcss/index.css";')
    expect(result?.code).not.toContain('@config')
  })

  it('normalizes relative @config directives from the css module file before registration and generation', async () => {
    const generateTailwindCss = vi.fn(async () => undefined)
    const onTailwindRootCss = vi.fn()
    const [rewritePlugin] = createRewriteCssImportsPlugins({
      generateTailwindCss,
      onTailwindRootCss,
      shouldOwnTailwindGeneration: true,
      shouldRewrite: true,
      weappTailwindcssDirPosix: '/virtual/weapp-tailwindcss',
    })
    const transform = getTransformHandler(rewritePlugin!)
    expect(transform).toBeTypeOf('function')

    const result = await transform?.(
      '@import "tailwindcss";\n@config "../tailwind.config.js";\n.foo { color: red; }',
      '/project/src/app.css',
    ) as TransformResult

    expect(onTailwindRootCss).toHaveBeenCalledWith(
      '/project/src/app.css',
      expect.stringContaining('@config "/project/tailwind.config.js";'),
    )
    expect(generateTailwindCss).toHaveBeenCalledWith(
      '/project/src/app.css',
      expect.stringContaining('@config "/project/tailwind.config.js";'),
      expect.anything(),
    )
    expect(result?.code).toContain('@import "/virtual/weapp-tailwindcss/index.css";')
    expect(result?.code).not.toContain('@config')
  })

  it('preserves relative @config directives that came from an imported SFC style source', async () => {
    const generateTailwindCss = vi.fn(async () => undefined)
    const onTailwindRootCss = vi.fn()
    const [rewritePlugin] = createRewriteCssImportsPlugins({
      generateTailwindCss,
      onTailwindRootCss,
      shouldOwnTailwindGeneration: true,
      shouldRewrite: false,
      weappTailwindcssDirPosix: '/virtual/weapp-tailwindcss',
    })
    const transform = getTransformHandler(rewritePlugin!)
    const source = '@import "tailwindcss";\n@config "./tailwind.config.js";'
    const id = '/project/pages/index/index.uvue?vue&type=style&index=0&scoped=abc&lang.css'

    await transform?.(source, id)

    expect(onTailwindRootCss).toHaveBeenCalledWith(id, source)
    expect(generateTailwindCss).toHaveBeenCalledWith(id, source, expect.anything())
  })

  it('normalizes relative @config directives from scss source files before generation', async () => {
    const generateTailwindCss = vi.fn(async () => undefined)
    const onTailwindRootCss = vi.fn()
    const [rewritePlugin] = createRewriteCssImportsPlugins({
      generateTailwindCss,
      onTailwindRootCss,
      shouldOwnTailwindGeneration: true,
      shouldRewrite: true,
      weappTailwindcssDirPosix: '/virtual/weapp-tailwindcss',
    })
    const transform = getTransformHandler(rewritePlugin!)
    expect(transform).toBeTypeOf('function')

    const source = [
      '@config "../tailwind.config.js";',
      '@tailwind base;',
      '@tailwind components;',
      '@tailwind utilities;',
    ].join('\n')
    const result = await transform?.(source, '/project/packageA/pages/cat.scss') as TransformResult

    expect(onTailwindRootCss).toHaveBeenCalledWith(
      '/project/packageA/pages/cat.scss',
      expect.stringContaining('@config "/project/packageA/tailwind.config.js";'),
    )
    expect(generateTailwindCss).toHaveBeenCalledWith(
      '/project/packageA/pages/cat.scss',
      expect.stringContaining('@config "/project/packageA/tailwind.config.js";'),
      expect.anything(),
    )
    expect(result?.code).not.toContain('@config')
  })

  it('normalizes relative @config directives before css source registration without tailwind imports', async () => {
    const onCssSourceTransform = vi.fn()
    const [rewritePlugin] = createRewriteCssImportsPlugins({
      onCssSourceTransform,
      shouldOwnTailwindGeneration: true,
      shouldRewrite: true,
      weappTailwindcssDirPosix: '/virtual/weapp-tailwindcss',
    })
    const transform = getTransformHandler(rewritePlugin!)
    expect(transform).toBeTypeOf('function')

    const result = await transform?.(
      '@config "../tailwind.config.js";\n.foo { color: red; }',
      '/project/src/app.css',
    ) as TransformResult

    expect(onCssSourceTransform).toHaveBeenCalledWith(
      '/project/src/app.css',
      expect.stringContaining('@config "/project/tailwind.config.js";'),
    )
    expect(result?.code).not.toContain('@config')
    expect(result?.code).toContain('.foo { color: red; }')
  })

  it('returns normalized @config css when import rewrite is disabled', async () => {
    const onCssSourceTransform = vi.fn()
    const [rewritePlugin] = createRewriteCssImportsPlugins({
      onCssSourceTransform,
      shouldOwnTailwindGeneration: true,
      shouldRewrite: false,
      weappTailwindcssDirPosix: '/virtual/weapp-tailwindcss',
    })
    const transform = getTransformHandler(rewritePlugin!)
    expect(transform).toBeTypeOf('function')

    const result = await transform?.(
      '@config "../tailwind.config.js";\n.foo { color: red; }',
      '/project/src/app.css',
    ) as TransformResult

    expect(result?.code).toContain('@config "/project/tailwind.config.js";')
    expect(onCssSourceTransform).toHaveBeenCalledWith(
      '/project/src/app.css',
      expect.stringContaining('@config "/project/tailwind.config.js";'),
    )
  })

  it('returns null for non-css transform requests', async () => {
    const [rewritePlugin] = createRewriteCssImportsPlugins({
      shouldRewrite: true,
      weappTailwindcssDirPosix: '/virtual/weapp-tailwindcss',
    })
    const transform = getTransformHandler(rewritePlugin!)
    expect(transform).toBeTypeOf('function')

    await expect(transform?.('@import "tailwindcss";', '/src/main.ts')).resolves.toBeNull()
  })

  it('skips css import rewrite plugin when main plugin is disabled by default for tailwind v4 projects', async () => {
    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    setCurrentContext(createContext({ disabled: { plugin: true } }))
    getCurrentContext().tailwindRuntime.majorVersion = 4
    const plugins = WeappTailwindcss({
      disabled: { plugin: true },
    })
    expect(plugins).toBeUndefined()
  }, TEST_TIMEOUT_MS)

  it('keeps css import rewrite plugin when main plugin is disabled and css import rewrite is enabled', async () => {
    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    setCurrentContext(createContext({ disabled: { plugin: true }, rewriteCssImports: true }))
    getCurrentContext().tailwindRuntime.majorVersion = 4
    const plugins = WeappTailwindcss({
      disabled: { plugin: true },
      rewriteCssImports: true,
    })
    expect(plugins?.map(plugin => plugin.name)).toEqual([`${vitePluginName}:rewrite-css-imports`])
  }, TEST_TIMEOUT_MS)

})
