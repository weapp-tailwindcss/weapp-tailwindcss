import type { Plugin, ResolvedConfig } from 'vite'
import { postcss } from '@weapp-tailwindcss/postcss'
import { expect, it, vi } from 'vitest'
import { extractSfcStyleBlocks } from '@/bundlers/vite/generate-bundle/sfc-style-source'
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

it.each([
  '/project/Probe.uvue',
  'C:\\project\\Probe.uvue',
  'C:/project/Probe.uvue',
  '\\\\server\\share\\Probe.uvue',
  'D:\\Probe.uvue',
  '/Probe.uvue',
  'components/Probe.uvue',
])('keeps preflight and important author styles at their compiled native indices: %s', async (id) => {
  const { sfc, css } = nativePlugins()
  const source = '<template><view class="h-8" /></template><style lang="scss">.author { @apply h-8!; }</style>'
  const output = await hook(sfc, 'transform').call({}, source, id)
  const styles = extractSfcStyleBlocks(output.code, 'Probe.uvue')
  expect(styles).toHaveLength(3)
  expect(styles[0]!.source).toContain('.weapp-tw-border')
  // 原生 compiler 的主模块按转换后 descriptor 的索引请求每个 style。
  for (const [index, style] of styles.entries()) {
    const request = `${id}?vue&type=style&index=${index}&inline&lang.${index === 1 ? 'scss' : 'css'}`
    const loaded = await hook(css, 'load').call({}, request)
    expect(loaded?.code ?? style.source).toBe(style.source)
  }
})

it('does not let native script requests replace the complete SFC style snapshot', async () => {
  const { sfc, css } = nativePlugins()
  const id = '/project/Probe.uvue'
  const source = '<template><view class="h-8" /></template><style>.author { color: red; }</style>'
  const output = await hook(sfc, 'transform').call({}, source, id)
  const styles = extractSfcStyleBlocks(output.code, 'Probe.uvue')
  for (const [query, payload] of [
    ['type=script&setup=true&lang.uts', 'export default defineComponent({})'],
    ['type=script&lang.uts', 'export default {}'],
    ['type=template', '<template><view class="h-12" /></template>'],
    ['type=custom&index=0', '{}'],
  ]) {
    await hook(sfc, 'transform').call({}, payload, `${id}?vue&${query}`)
  }
  for (const [index, style] of styles.entries()) {
    const request = `${id}?vue&type=style&index=${index}&inline&lang.css`
    const transformed = await hook(css, 'transform').call({}, source, request)
    expect(transformed?.code ?? source).toBe(style.source)
  }
})

it('keeps external scoped styles outside the generated inline style carrier', async () => {
  const { sfc, css } = nativePlugins()
  const id = '/project/Probe.uvue'
  const external = '<style scoped lang="scss" src="./author.scss"></style>'
  const output = await hook(sfc, 'transform').call({}, `<template><view class="h-8" /></template>${external}`, id)
  expect(output.code).toContain(external)
  const styles = extractSfcStyleBlocks(output.code, 'Probe.uvue')
  expect(styles).toHaveLength(3)
  expect(styles[1]!.source).toBe('')
  expect(styles[2]!.source).toContain('@apply h-8;')
  expect(await hook(css, 'load').call({}, `${id}?vue&type=style&index=1&src&lang.scss`)).toBeUndefined()
})

it.each([
  '',
  '<style>.author { color: red; }</style>',
  '<style scoped lang="scss">.author { color: red; }</style>',
  '<style>.first { color: red; }</style><style scoped>.second { color: blue; }</style>',
])('replays each native style in request order through add, replace, delete and restore: %s', async (author) => {
  const { sfc, css } = nativePlugins()
  const id = '/project/Probe.uvue'
  let previousCount = 0
  for (const utility of ['h-8', 'h-12', '', 'h-8']) {
    const source = `<template><view class="${utility}" /></template>${author}`
    const output = await hook(sfc, 'transform').call({}, source, id)
    const styles = extractSfcStyleBlocks(output.code, 'Probe.uvue')
    // 样式可乱序加载，缓存不能按请求顺序消费或移动索引。
    for (const index of [...styles.keys()].reverse()) {
      const request = `${id}?vue&type=style&index=${index}&inline&lang.css`
      const loaded = await hook(css, 'load').call({}, request)
      expect(loaded?.code ?? styles[index]!.source).toBe(styles[index]!.source)
    }
    for (let index = styles.length; index < previousCount; index++) {
      expect(await hook(css, 'load').call({}, `${id}?vue&type=style&index=${index}&lang.css`)).toEqual({ code: '', map: null })
    }
    const repeated = await hook(sfc, 'transform').call({}, output.code, id)
    expect(extractSfcStyleBlocks(repeated.code, 'Probe.uvue')).toEqual(styles)
    if (utility) {
      const request = `${id}?vue&type=style&index=${styles.length - 1}&lang.css`
      expect((await hook(css, 'load').call({}, request)).code).toBe(styles.at(-1)!.source)
    }
    previousCount = styles.length
  }
})

it('keeps the latest complete native SFC when older asynchronous transforms finish later', async () => {
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  let started!: () => void
  const ready = new Promise<void>((resolve) => {
    started = resolve
  })
  const { sfc, css } = nativePlugins({
    registerModuleGraphCandidates: async (_id, source) => {
      if (source.includes('h-8')) {
        started()
        await pending
      }
      return new Set()
    },
  })
  const id = '/project/Probe.uvue'
  const old = hook(sfc, 'transform').call({}, '<template><view class="h-8" /></template>', id)
  await ready
  const current = await hook(sfc, 'transform').call({}, '<template><view class="h-12" /></template>', id)
  release()
  await old
  const style = await hook(css, 'load').call({}, `${id}?vue&type=style&index=1&inline&lang.css`)
  expect(style.code).toBe(extractSfcStyleBlocks(current.code, 'Probe.uvue')[1]!.source)
  expect(style.code).toContain('@apply h-12;')
  expect(style.code).not.toContain('@apply h-8;')
})

it('uses the complete SFC identity for native template aliases', async () => {
  const { sfc } = nativePlugins()
  const id = '/project/Probe.uvue'
  const source = '<template><view class="h-8" /></template>'
  const main = await hook(sfc, 'transform').call({}, source, id)
  const template = await hook(sfc, 'transform').call({}, source, `${id}?vue&type=template`)
  expect(template.code).toBe(main.code)
})

it('does not replay raw author Sass after the native compiler has preprocessed it', async () => {
  const { sfc, css } = nativePlugins()
  const id = '/project/Probe.uvue'
  const source = '<template><view class="h-8" /></template><style lang="scss">$color: red; .author { color: $color; }</style>'
  await hook(sfc, 'transform').call({}, source, id)
  const request = `${id}?vue&type=style&index=1&inline&lang.scss`
  // HBuilderX 的 vite:css 已在本插件前执行 compileCSS。
  const compiled = '.author { color: red; }'
  const transformed = await hook(css, 'transform').call({}, compiled, request)
  expect(transformed?.code ?? compiled).toBe(compiled)
})

it('does not publish stale Web scoped rules after a newer complete SFC', async () => {
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  let started!: () => void
  const ready = new Promise<void>((resolve) => {
    started = resolve
  })
  const { sfc, css } = nativePlugins({
    isWebGeneratorTarget: () => true,
    registerModuleGraphCandidates: async (_id, source) => {
      if (source.includes('h-8')) {
        started()
        await pending
      }
      return new Set()
    },
  })
  const id = '/project/Probe.uvue'
  const author = '<style scoped>.author { color: red; }</style>'
  const old = hook(sfc, 'transform').call({}, `<template><view class="h-8" /></template>${author}`, id)
  await ready
  await hook(sfc, 'transform').call({}, `<template><view class="h-12" /></template>${author}`, id)
  release()
  await old
  const transformed = await hook(css, 'transform').call({}, '.author { color: red; }', `${id}?vue&type=style&index=0&lang.css`)
  expect(transformed.code).toContain('@apply h-12;')
  expect(transformed.code).not.toContain('@apply h-8;')
})

it('preserves expanded CSS imports and rewritten URLs after native preprocessing', async () => {
  const { sfc, css } = nativePlugins()
  const id = '/project/Probe.uvue'
  const source = '<template><view class="h-8" /></template><style>@import "./shared.css"; .author { background-image: url("./image.png"); }</style>'
  await hook(sfc, 'transform').call({}, source, id)
  const request = `${id}?vue&type=style&index=1&inline&lang.css`
  const compiled = '.shared { color: blue; } .author { background-image: url("/assets/image.hash.png"); }'
  const transformed = await hook(css, 'transform').call({}, compiled, request)
  expect(transformed?.code ?? compiled).toBe(compiled)
})

it('waits for the current main transform when another transaction replaces the one being awaited', async () => {
  const releases: Array<() => void> = []
  const { sfc, css } = nativePlugins({
    registerModuleGraphCandidates: async () => {
      await new Promise<void>((resolve) => {
        releases.push(resolve)
      })
      return new Set()
    },
  })
  const id = '/project/Probe.uvue'
  const first = hook(sfc, 'transform').call({}, '<template><view class="h-8" /></template>', id)
  await vi.waitFor(() => expect(releases).toHaveLength(1))
  let settled = false
  const loaded = hook(css, 'load').call({}, `${id}?vue&type=style&index=1&lang.css`).finally(() => {
    settled = true
  })
  const second = hook(sfc, 'transform').call({}, '<template><view class="h-12" /></template>', id)
  await vi.waitFor(() => expect(releases).toHaveLength(2))
  releases[0]!()
  await first
  await Promise.resolve()
  expect(settled).toBe(false)
  releases[1]!()
  const output = await second
  expect((await loaded).code).toBe(extractSfcStyleBlocks(output.code, 'Probe.uvue')[1]!.source)
})
