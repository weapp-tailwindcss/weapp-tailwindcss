import type { Plugin, ResolvedConfig } from 'vite'
import path from 'node:path'
import { createStyleHandler, postcss } from '@weapp-tailwindcss/postcss'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { extractSfcStyleBlocks } from '@/bundlers/vite/generate-bundle/sfc-style-source'
import { createWeappTailwindcssGenerator, resolveTailwindV4Source } from '@/generator'
import { createUniAppXPlugins } from '@/uni-app-x/vite'

async function transform(plugin: Plugin, code: string, id: string) {
  const hook = plugin.transform!
  const handler = typeof hook === 'function' ? hook : hook.handler
  return await handler.call({} as never, code, id) as { code: string }
}

describe('uni-app x local structural utilities', () => {
  afterEach(() => vi.unstubAllEnvs())

  it.each(['weapp', 'web'] as const)('keeps %s spacing rules bound to current template aliases across SFC updates', async (target) => {
    vi.stubEnv('UNI_UTS_PLATFORM', target === 'web' ? 'web' : 'mp-weixin')
    const candidates = new Set(['space-y-2.5', 'space-x-3', 'space-y-4', 'space-x-5', 'text-[23px]'])
    const plugins = createUniAppXPlugins({
      appType: 'uni-app-x',
      customAttributesEntities: [],
      disabledDefaultTemplateHandler: false,
      mainCssChunkMatcher: () => false,
      runtimeState: { readyPromise: Promise.resolve() },
      styleHandler: createStyleHandler({ appType: 'uni-app-x', platform: 'mp-weixin', majorVersion: 4 }),
      jsHandler: source => ({ code: source }),
      ensureRuntimeClassSet: async () => candidates,
      getResolvedConfig: () => ({ root: process.cwd(), command: 'build', build: { outDir: 'dist' } }) as ResolvedConfig,
      isWebGeneratorTarget: () => target === 'web',
      uniAppX: { componentLocalStyles: { pageMatcher: () => true } },
      generateCss: async (_id, code) => {
        const source = await resolveTailwindV4Source({
          base: process.cwd(),
          css: `@import "tailwindcss" source(none);\n${code}`,
        })
        return (await createWeappTailwindcssGenerator(source).generate({
          target,
          candidates: ['flex'],
          scanSources: false,
        })).css
      },
    })
    const sfcPlugin = plugins.find(plugin => plugin.name === 'weapp-tailwindcss:uni-app-x:nvue')!
    const cssPlugin = plugins.find(plugin => plugin.name === 'weapp-tailwindcss:uni-app-x:css')!
    const id = path.resolve('fixture/Spacing.uvue')

    for (const utilities of ['space-y-2.5 space-x-3 text-[23px]', 'space-y-4 space-x-5 text-[23px]']) {
      const sfc = await transform(sfcPlugin, `<template><view class="${utilities}"><view /><view /></view></template>`, id)
      const authorCss = extractSfcStyleBlocks(sfc.code).map(style => style.source).join('\n')
      const aliases = new Map<string, string>()
      postcss.parse(authorCss).walkRules((rule) => {
        rule.walkAtRules('apply', apply => { aliases.set(apply.params, rule.selector.match(/wtu-[\w-]+/)![0]) })
      })
      const result = await transform(cssPlugin, authorCss, `${id}?vue&type=style&index=0&lang.css`)
      const root = postcss.parse(result.code)
      for (const utility of utilities.split(' ')) {
        const alias = aliases.get(utility)
        expect(alias, utility).toMatch(/^wtu-/)
        expect(sfc.code).toContain(alias)
        const declarations: string[] = []
        root.walkRules((rule) => {
          if (rule.selector.includes(`.${alias}`)) {
            rule.walkDecls(decl => { declarations.push(decl.prop) })
          }
        })
        const expected = utility.startsWith('space-y')
          ? target === 'web' ? 'margin-block-start' : 'margin-top'
          : utility.startsWith('space-x') ? target === 'web' ? 'margin-inline-start' : 'margin-left' : 'font-size'
        expect(declarations, `${utility}: ${result.code}`).toContain(expected)
      }
      expect(result.code).not.toContain('.flex')
      expect(result.code).not.toContain('@apply')
    }
  })
})
