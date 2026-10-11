import { describe, expect, it, vi } from 'vitest'
import { createViteCssGenerationPlugins } from '@/bundlers/vite/serve-css-generation'

function createPlugins(overrides: Record<string, any> = {}) {
  const options = {
    generateCss: vi.fn((id: string, code: string) => `${code}\n/* ${id} */`),
    getCommand: vi.fn(() => 'serve'),
    onTailwindRootCss: vi.fn(),
    shouldGenerate: vi.fn(() => true),
    ...overrides,
  }
  return {
    options,
    plugins: createViteCssGenerationPlugins(options),
  }
}

describe('vite serve css generation plugins', () => {
  it('generates root css during serve transform and skips unchanged or unsupported requests', async () => {
    const { options, plugins } = createPlugins()
    const rootPlugin = plugins[0]!

    await expect(rootPlugin.transform?.call({} as any, '@import "tailwindcss";', '/src/app.css?raw' as any)).resolves.toBeUndefined()
    await expect(rootPlugin.transform?.call({} as any, '.plain{color:red}', '/src/app.css' as any)).resolves.toBeUndefined()

    const result = await rootPlugin.transform?.call({} as any, '@import "tailwindcss";', '/src/app.css' as any)

    expect(result).toEqual({
      code: '@import "tailwindcss";\n/* /src/app.css */',
      map: null,
    })
    expect(options.onTailwindRootCss).toHaveBeenCalledWith('/src/app.css', '@import "tailwindcss";')

    options.generateCss.mockReturnValueOnce('@import "tailwindcss";')
    await expect(rootPlugin.transform?.call({} as any, '@import "tailwindcss";', '/src/app.css' as any)).resolves.toBeUndefined()
  })

  it('rewrites Vite css hmr modules only when they contain Tailwind generation directives', async () => {
    const { options, plugins } = createPlugins({
      generateCss: vi.fn((_id: string, code: string) => `${code}\n.next{color:blue}`),
    })
    const hmrPlugin = plugins[2]!
    const plainCode = [
      'const __vite__css = ".root{color:red}"',
      '__vite__updateStyle(__vite__id, __vite__css)',
    ].join('\n')
    const rootCode = [
      'const __vite__css = "@import \\"tailwindcss\\";\\n.root{color:red}"',
      '__vite__updateStyle(__vite__id, __vite__css)',
    ].join('\n')
    const applyCode = [
      'const __vite__css = ".root{@apply text-red-500}"',
      '__vite__updateStyle(__vite__id, __vite__css)',
    ].join('\n')

    await expect(hmrPlugin.transform?.call({} as any, rootCode, '/src/app.css?direct&worker' as any)).resolves.toBeUndefined()
    await expect(hmrPlugin.transform?.call({} as any, '__vite__updateStyle(id, css)', '/src/app.css?direct' as any)).resolves.toBeUndefined()
    await expect(hmrPlugin.transform?.call({} as any, plainCode, '/src/app.css?direct' as any)).resolves.toBeUndefined()
    expect(options.generateCss).not.toHaveBeenCalled()

    const result = await hmrPlugin.transform?.call({} as any, rootCode, '/src/app.css?direct' as any)

    expect(result).toEqual({
      code: [
        'const __vite__css = "@import \\"tailwindcss\\";\\n.root{color:red}\\n.next{color:blue}"',
        '__vite__updateStyle(__vite__id, __vite__css)',
      ].join('\n'),
      map: null,
    })
    expect(options.onTailwindRootCss).toHaveBeenCalledWith('/src/app.css?direct', '@import "tailwindcss";\n.root{color:red}')

    const applyResult = await hmrPlugin.transform?.call({} as any, applyCode, '/src/app.css?vue&type=style&direct' as any)
    expect(applyResult).toEqual({
      code: [
        'const __vite__css = ".root{@apply text-red-500}\\n.next{color:blue}"',
        '__vite__updateStyle(__vite__id, __vite__css)',
      ].join('\n'),
      map: null,
    })
    expect(options.onTailwindRootCss).toHaveBeenCalledTimes(1)

    options.generateCss.mockReturnValueOnce('@import "tailwindcss";\n.root{color:red}')
    await expect(hmrPlugin.transform?.call({} as any, rootCode, '/src/app.css?direct' as any)).resolves.toBeUndefined()
  })

  it('defers full uni-app x SFC payloads during CSS HMR', async () => {
    const shouldDeferGeneration = vi.fn((id: string, code: string) => {
      return id.includes('.uvue?') && code.includes('@apply') && !code.includes('@import "tailwindcss"')
    })
    const { options, plugins } = createPlugins({ shouldDeferGeneration })
    const hmrPlugin = plugins[2]!
    const fullSfc = [
      '<template><text>{{ theme.themeClass }}</text></template>',
      '<style scoped>',
      '@reference "../../main.css";',
      '.content { @apply flex; }',
      '</style>',
    ].join('\n')
    const hmrCode = [
      `const __vite__css = ${JSON.stringify(fullSfc)}`,
      '__vite__updateStyle(__vite__id, __vite__css)',
    ].join('\n')
    const id = '/src/pages/index/index.uvue?vue&type=style&index=0&scoped=true&lang.css&direct'

    await expect(hmrPlugin.transform?.call({} as any, hmrCode, id as any)).resolves.toBeUndefined()

    expect(shouldDeferGeneration).toHaveBeenCalledWith(id, fullSfc)
    expect(options.onTailwindRootCss).not.toHaveBeenCalled()
    expect(options.generateCss).not.toHaveBeenCalled()
  })

  it('scopes serve, build and hmr transforms to their command and generation settings', async () => {
    const disabled = createPlugins({ shouldGenerate: vi.fn(() => false) })
    await expect(disabled.plugins[0]!.transform?.call({} as any, '@import "tailwindcss";', '/src/app.css' as any)).resolves.toBeUndefined()
    await expect(disabled.plugins[1]!.transform?.call({} as any, '__vite__updateStyle(id, css)', '/src/app.css?direct' as any)).resolves.toBeUndefined()
    await expect(disabled.plugins[2]!.transform?.call({} as any, '__vite__updateStyle(id, css)', '/src/app.css?direct' as any)).resolves.toBeUndefined()

    const build = createPlugins({ getCommand: vi.fn(() => 'build') })
    await expect(build.plugins[0]!.transform?.call({} as any, '@import "tailwindcss";', '/src/app.css' as any)).resolves.toBeUndefined()
    await expect(build.plugins[1]!.transform?.call({} as any, '@import "tailwindcss";', '/src/app.css' as any)).resolves.toEqual({
      code: '@import "tailwindcss";\n/* /src/app.css */',
      map: null,
    })
    await expect(build.plugins[2]!.transform?.call({} as any, '__vite__updateStyle(id, css)', '/src/app.css?direct' as any)).resolves.toBeUndefined()

    const buildDisabled = createPlugins({
      getCommand: vi.fn(() => 'build'),
      shouldGenerateBuild: vi.fn(() => false),
    })
    await expect(buildDisabled.plugins[1]!.transform?.call({} as any, '@import "tailwindcss";', '/src/app.css' as any)).resolves.toBeUndefined()
  })

  it('defers selected build style requests without skipping Tailwind root generation', async () => {
    const shouldDeferGeneration = vi.fn((id: string, code: string) => {
      return id.includes('.uvue?') && code.includes('@apply') && !code.includes('@import "tailwindcss"')
    })
    const { options, plugins } = createPlugins({
      getCommand: vi.fn(() => 'build'),
      shouldDeferGeneration,
    })
    const buildPlugin = plugins[1]!
    const authorStyleId = '/src/components/card.uvue?vue&type=style&index=0&scoped=true&lang.css'

    await expect(buildPlugin.transform?.call({} as any, '.card { @apply p-4; }', authorStyleId as any)).resolves.toBeUndefined()
    expect(options.generateCss).not.toHaveBeenCalled()

    const rootCss = '@import "tailwindcss";\n.card { @apply p-4; }'
    await expect(buildPlugin.transform?.call({} as any, rootCss, '/src/main.css' as any)).resolves.toEqual({
      code: `${rootCss}\n/* /src/main.css */`,
      map: null,
    })
    expect(options.generateCss).toHaveBeenCalledTimes(1)
    expect(options.onTailwindRootCss).toHaveBeenCalledWith('/src/main.css', rootCss)
  })
})
