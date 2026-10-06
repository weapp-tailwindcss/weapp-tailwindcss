import path from 'node:path'
import { loadTailwindV4DesignSystem } from '@weapp-tailwindcss/engine'
import { postcss } from '@weapp-tailwindcss/postcss'
import { UNI_APP_X_LOCAL_UTILITY_MARKER } from '@weapp-tailwindcss/postcss/transform'
import { compileString } from 'sass'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { disposeCompilerOwner } from '@/compiler'
import { getCompilerContext } from '@/context'
import { generateTailwindV4Css } from '@/generation/service'
import { createWeappTailwindcssGenerator, resolveTailwindV4Source } from '@/generator'
import { createLocalUtilitySourcePreparation } from '@/tailwindcss/v4-engine/generator/local-utility-order'

const marker = `/*${UNI_APP_X_LOCAL_UTILITY_MARKER} */`
const localRules = `${marker}.local-alpha{@apply alpha;}\n${marker}.local-beta{@apply beta;}`

function localOrder(css: string) {
  const order: string[] = []
  postcss.parse(css).walkRules((rule) => {
    if (rule.selector.includes('.local-')) {
      order.push(rule.selector)
    }
  })
  return [...new Set(order)]
}

describe('local cascade generation source ownership', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('uses each resolved theme and recomputes order after source updates', async () => {
    for (const [first, second, expected] of [
      ['color:red', 'display:block', ['.local-beta', '.local-alpha']],
      ['display:block', 'color:blue', ['.local-alpha', '.local-beta']],
      ['color:red', 'display:block', ['.local-beta', '.local-alpha']],
    ] as const) {
      const source = await resolveTailwindV4Source({ base: process.cwd(), css: `@import "tailwindcss" source(none); @utility alpha{${first}} @utility beta{${second}} ${localRules}` })
      const generated = await createWeappTailwindcssGenerator(source).generate({ target: 'web', candidates: [], scanSources: false })
      expect(localOrder(generated.css)).toEqual(expected)
      expect(generated.css).not.toContain(UNI_APP_X_LOCAL_UTILITY_MARKER)
      expect(source.css).toContain(localRules)
    }
  })

  it('preserves Sass markers until ordering and consumes them before CSS output', async () => {
    const compiled = compileString(`${marker}.local-rgb{@apply bg-[rgb(12,34,56)];}${marker}.local-hex{@apply bg-[#000002];}`, { style: 'compressed' }).css
    expect(compiled).toContain(UNI_APP_X_LOCAL_UTILITY_MARKER)
    const source = await resolveTailwindV4Source({ base: process.cwd(), css: `@import "tailwindcss" source(none);${compiled}` })
    const generated = await createWeappTailwindcssGenerator(source).generate({ target: 'weapp', candidates: [], scanSources: false })
    expect(localOrder(generated.css)).toEqual(['.local-hex', '.local-rgb'])
    expect(generated.css).not.toContain(UNI_APP_X_LOCAL_UTILITY_MARKER)
  })

  it('normalizes rpx ranks without losing equivalent spellings', async () => {
    const source = await resolveTailwindV4Source({ base: process.cwd(), css: `@import "tailwindcss" source(none); ${marker}.local-large{@apply text-[34rpx];}${marker}.local-small{@apply text-[23rpx];}${marker}.local-explicit{@apply text-[length:23rpx];}${marker}.local-arbitrary{@apply p-[10%];}${marker}.local-padding{@apply p-2;}` })
    const preparation = createLocalUtilitySourcePreparation(source, 'weapp', { appType: 'uni-app-x' }, true)!
    const ordered = await preparation.prepareSource!(source, await loadTailwindV4DesignSystem(source))
    expect(localOrder(ordered)).toEqual(['.local-padding', '.local-arbitrary', '.local-small', '.local-explicit', '.local-large'])
  })

  it('keeps compiler errors observable instead of producing unordered fallback CSS', async () => {
    const source = await resolveTailwindV4Source({ base: process.cwd(), css: `@import "tailwindcss" source(none); ${marker}.local-invalid{@apply not-a-real-utility;}` })
    await expect(createWeappTailwindcssGenerator(source).generate({ target: 'weapp', candidates: [], scanSources: false })).rejects.toThrow()
  })
})

describe.each(['legacy', 'graph'].flatMap(compiler => [false, true].map(deferred => ({ compiler, deferred }))))('local cascade complete generation: $compiler deferred=$deferred', ({ compiler, deferred }) => {
  it.each(['web', 'weapp'] as const)('consumes owned markers after %s author CSS composition', async (target) => {
    vi.stubEnv('WEAPP_TAILWINDCSS_COMPILER', compiler)
    const opts = getCompilerContext({
      appType: 'uni-app-x',
      tailwindcssBasedir: process.cwd(),
      generator: { target },
      cssPreflight: false,
      logLevel: 'silent',
    })
    const runtimeState = { tailwindRuntime: opts.tailwindRuntime, readyPromise: Promise.resolve() }
    const source = {
      file: path.resolve(process.cwd(), 'local-cascade-pipeline.css'),
      base: process.cwd(),
      css: `@import "tailwindcss" source(none); ${marker}.local-rgb{@apply bg-[rgb(12,34,56)];}${marker}.local-hex{@apply bg-[#000002];} .author{color:red;}`,
    }
    try {
      const generated = await generateTailwindV4Css({
        opts,
        runtimeState,
        file: source.file,
        rawSource: source.css,
        runtime: new Set(),
        disableSourceScan: true,
        deferCssAdaptation: deferred,
        cssHandlerOptions: { majorVersion: 4, isMainChunk: false, sourceOptions: { cssSources: [source] } },
        cssUserHandlerOptions: { majorVersion: 4, isMainChunk: false },
        styleHandler: opts.styleHandler,
        debug: () => {},
      })
      expect(generated).toBeDefined()
      expect(localOrder(generated!.css)).toEqual(['.local-hex', '.local-rgb'])
      expect(generated!.css).toContain('.author')
      expect(generated!.css).not.toContain(UNI_APP_X_LOCAL_UTILITY_MARKER)
      expect(generated!.metadata.rawCss).not.toContain(UNI_APP_X_LOCAL_UTILITY_MARKER)
      expect(generated!.css).not.toContain('@apply')
    }
    finally {
      await disposeCompilerOwner(runtimeState)
      vi.unstubAllEnvs()
    }
  })
})
