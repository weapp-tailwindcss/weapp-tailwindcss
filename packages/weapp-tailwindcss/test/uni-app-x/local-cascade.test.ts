import type { Plugin, ResolvedConfig } from 'vite'
import path from 'node:path'
import { createStyleHandler, postcss } from '@weapp-tailwindcss/postcss'
import { UNI_APP_X_LOCAL_UTILITY_MARKER } from '@weapp-tailwindcss/postcss/transform'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { extractSfcStyleBlocks } from '@/bundlers/vite/generate-bundle/sfc-style-source'
import { createWeappTailwindcssGenerator, resolveTailwindV4Source } from '@/generator'
import { createUniAppXPlugins } from '@/uni-app-x/vite'
import { replaceWxml } from '@/wxml'

async function transform(plugin: Plugin, code: string, id: string) {
  const hook = plugin.transform!
  const handler = typeof hook === 'function' ? hook : hook.handler
  return await handler.call({} as never, code, id) as { code: string }
}

const root = process.cwd()
const entry = path.resolve(root, 'local-cascade-entry.css')
const css = '@import "tailwindcss" source(none);'
const rgb = 'bg-[rgb(12,34,56)]'
const hex = 'bg-[#000002]'

function candidateOrder(css: string, identities: Map<string, string>) {
  const order: string[] = []
  postcss.parse(css).walkRules((rule) => {
    for (const [utility, identity] of identities) {
      if (rule.selector.includes(`.${identity}`) && !order.includes(utility)) {
        order.push(utility)
      }
    }
  })
  return order
}

async function createFixture(target: 'weapp' | 'web') {
  vi.stubEnv('UNI_UTS_PLATFORM', target === 'web' ? 'web' : 'mp-weixin')
  let candidates = new Set<string>()
  const source = await resolveTailwindV4Source({ base: root, css })
  const generator = createWeappTailwindcssGenerator(source)
  const runtimeState = {
    readyPromise: Promise.resolve(),
    tailwindRuntime: {
      majorVersion: 4,
      options: { projectRoot: root, tailwindcss: { cwd: root, v4: {
        cssSources: [{ file: entry, base: root, css }],
      } } },
    },
  }
  const plugins = createUniAppXPlugins({
    appType: 'uni-app-x',
    customAttributesEntities: [],
    disabledDefaultTemplateHandler: false,
    mainCssChunkMatcher: () => false,
    runtimeState,
    styleHandler: createStyleHandler({ appType: 'uni-app-x', platform: 'mp-weixin', majorVersion: 4 }),
    jsHandler: source => ({ code: source }),
    ensureRuntimeClassSet: async () => candidates,
    getResolvedConfig: () => ({ root, command: 'build', build: { outDir: 'dist' } }) as ResolvedConfig,
    isWebGeneratorTarget: () => target === 'web',
    uniAppX: { componentLocalStyles: { pageMatcher: () => true } },
    generateCss: async (_id, code) => {
      const localSource = await resolveTailwindV4Source({ base: root, css: `${css}\n${code}` })
      return (await createWeappTailwindcssGenerator(localSource).generate({ target, candidates: [], scanSources: false })).css
    },
  })
  const sfcPlugin = plugins.find(plugin => plugin.name === 'weapp-tailwindcss:uni-app-x:nvue')!
  const cssPlugin = plugins.find(plugin => plugin.name === 'weapp-tailwindcss:uni-app-x:css')!
  const id = path.resolve(root, 'fixture/Cascade.uvue')
  return {
    async run(nodes: string[][]) {
      candidates = new Set(nodes.flat())
      const source = `<template>${nodes.map(utilities => `<view class="${utilities.join(' ')}" />`).join('')}</template>`
      const sfc = await transform(sfcPlugin, source, id)
      const localCss = extractSfcStyleBlocks(sfc.code).map(style => style.source).join('\n')
      const aliases = new Map<string, string>()
      postcss.parse(localCss).walkRules((rule) => {
        rule.walkAtRules('apply', (apply) => {
          aliases.set(apply.params, rule.selector.match(/wtu-[\w-]+/)![0])
        })
      })
      const generated = await transform(cssPlugin, localCss, `${id}?vue&type=style&index=0&lang.css`)
      const reference = await generator.generate({ target, candidates, scanSources: false })
      const expectedOrder = candidateOrder(reference.css, new Map([...candidates].map(candidate => [candidate, replaceWxml(candidate)])))
      // Web 原始选择器保留 CSS 转义，按原始产物提取同一参考顺序。
      const referenceOrder = target === 'web'
        ? candidateOrder(reference.rawCss, new Map([...candidates].map(candidate => [candidate, candidate.replace(/[^\w-]/g, character => `\\${character}`)])))
        : expectedOrder
      expect(referenceOrder.length).toBe(candidates.size)
      expect(candidateOrder(generated.code, aliases)).toEqual(referenceOrder)
      expect(generated.code).not.toContain(UNI_APP_X_LOCAL_UTILITY_MARKER)
      for (const alias of aliases.values()) {
        expect(sfc.code).toContain(alias)
      }
      return { aliases, css: generated.code, referenceOrder }
    },
  }
}

describe('uni-app x local utility cascade', () => {
  afterEach(() => vi.unstubAllEnvs())

  it.each(['weapp', 'web'] as const)('keeps %s utility precedence independent of class order', async (target) => {
    const fixture = await createFixture(target)
    await fixture.run([[rgb, hex]])
    await fixture.run([[hex, rgb]])
  })

  it('uses one generator order across nodes, duplicates, variants and HMR revisions', async () => {
    const fixture = await createFixture('weapp')
    const variantRgb = `max-[712px]:${rgb}`
    const variantHex = `max-[712px]:${hex}`
    for (const nodes of [
      [[variantRgb, rgb], [hex, variantHex, rgb]],
      [[hex, variantHex], [variantRgb, rgb, hex]],
      [[rgb, 'bg-[#000003]'], ['text-[34px]', 'text-[23px]']],
      [[rgb]],
      [[hex, rgb]],
    ]) {
      const result = await fixture.run(nodes)
      expect(result.aliases.size).toBe(new Set(nodes.flat()).size)
      if (!nodes.flat().includes('bg-[#000003]')) {
        expect(result.css).not.toContain('#000003')
      }
    }
  })
})
