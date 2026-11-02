import type { Plugin, ResolvedConfig } from 'vite'
import { parse } from '@vue/compiler-sfc'
import { postcss } from '@weapp-tailwindcss/postcss'
import { expect, it } from 'vitest'
import { createJsHandler } from '@/js'
import { createUniAppXPlugins } from '@/uni-app-x/vite'

function hook(plugin: Plugin, name: 'load' | 'transform') {
  const value = plugin[name] as any
  return typeof value === 'object' ? value.handler : value
}

function nativePlugins(extra: Partial<Parameters<typeof createUniAppXPlugins>[0]> = {}) {
  const plugins = createUniAppXPlugins({
    appType: 'uni-app-x',
    cssPreflight: { 'border-width': '0' },
    customAttributesEntities: [],
    disabledDefaultTemplateHandler: false,
    mainCssChunkMatcher: () => true,
    runtimeState: { readyPromise: Promise.resolve() },
    styleHandler: async code => await postcss().process(code, { from: undefined, map: { inline: false, annotation: false } }),
    jsHandler: createJsHandler({}),
    ensureRuntimeClassSet: async () => new Set(['h-8', 'h-12']),
    getResolvedConfig: () => ({ root: '/project', command: 'build', build: { outDir: 'dist/app-ios' } } as ResolvedConfig),
    isIosPlatform: true,
    isWebGeneratorTarget: () => false,
    uniAppX: {
      enabled: true,
      componentLocalStyles: { enabled: true, onlyWhenStyleIsolationVersion2: false, componentMatcher: () => true },
    },
    ...extra,
  })
  return {
    sfc: plugins.find(plugin => plugin.name === 'weapp-tailwindcss:uni-app-x:nvue')!,
    css: plugins.find(plugin => plugin.name === 'weapp-tailwindcss:uni-app-x:css:pre')!,
  }
}

const stringSource = `<script setup lang="uts">
const snippet = '<style>.example { color: red; }</style>';
</script>
<template><view class="h-8"><text>{{snippet}}</text></view></template>
<style>.author { color: blue; }</style>`
const commentSource = `<script setup lang="uts">
/** 说明见文件末尾 <style>。 */
function label(): string { return 'author'; }
</script>
<template><view class="h-8"><text>{{label()}}</text></view></template>
<style>.author { color: blue; }</style>`

// 本入口独立执行并保留失败；不得把这些断言标记为skip或预期失败来宣称修复。
it.each([['script字符串', stringSource], ['script注释', commentSource]])('%s内的style标签不得改变真实style索引', async (_name, source) => {
  const { sfc, css } = nativePlugins()
  const id = '/project/Probe.uvue'
  await hook(sfc, 'transform').call({}, source, id)
  const author = await hook(css, 'load').call({}, `${id}?vue&type=style&index=1&inline&lang.css`)
  const generated = await hook(css, 'load').call({}, `${id}?vue&type=style&index=2&inline&lang.css`)
  // 索引取自真实顶层结构，不用生产提取器生成正确预期。
  expect(author).toEqual({ code: '.author { color: blue; }', map: null })
  expect(generated?.code).toContain('@apply h-8;')
})

it('script字符串中的scoped标签不得成为生成载体', async () => {
  const { sfc } = nativePlugins()
  const source = stringSource.replace('<style>.example', '<style scoped>.example')
  const transformed = await hook(sfc, 'transform').call({}, source, '/project/Probe.uvue')
  expect(transformed.code).toContain(`const snippet = '<style scoped>.example { color: red; }</style>';`)
  expect(transformed.code).toContain('@apply h-8;')
})

it('style请求追随最新成功事务并保留旧transform自身的失败', async () => {
  let rejectOld!: (error: Error) => void
  let started!: () => void
  let calls = 0
  const ready = new Promise<void>((resolve) => {
    started = resolve
  })
  const staleError = new Error('stale transform failed')
  const { sfc, css } = nativePlugins({ registerModuleGraphCandidates: async () => {
    if (calls++ === 0) {
      started()
      await new Promise<void>((_resolve, reject) => {
        rejectOld = reject
      })
    }
    return new Set()
  } })
  const id = '/project/Probe.uvue'
  const old = hook(sfc, 'transform').call({}, '<template><view class="h-8" /></template>', id).then(() => null, (error: unknown) => error)
  await ready
  const loaded = hook(css, 'load').call({}, `${id}?vue&type=style&index=1&lang.css`).then((value: unknown) => ({ value }), (error: unknown) => ({ error }))
  await hook(sfc, 'transform').call({}, '<template><view class="h-12" /></template>', id)
  rejectOld(staleError)
  expect(await old).toBe(staleError)
  expect(await loaded).toMatchObject({ value: { code: expect.stringContaining('@apply h-12;'), map: null } })
})

it('自闭合scoped块展开后仍是合法局部样式载体', async () => {
  const { sfc } = nativePlugins()
  const result = await hook(sfc, 'transform').call({}, '<template><view class="h-8" /></template><style scoped />', '/project/Probe.uvue')
  const parsed = parse(result.code)
  expect(parsed.errors).toEqual([])
  expect(parsed.descriptor.styles).toHaveLength(2)
  expect(parsed.descriptor.styles[1]!.content).toContain('@apply h-8;')
  expect(parsed.descriptor.styles[1]!.scoped).toBe(true)
})
