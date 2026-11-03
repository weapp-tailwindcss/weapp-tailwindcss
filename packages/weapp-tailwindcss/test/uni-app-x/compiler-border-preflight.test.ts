import type { NodeTransform } from '@vue/compiler-dom'
import type { Plugin } from 'vite'
import path from 'node:path'
import { compileTemplate, parse } from '@vue/compiler-sfc'
import { postcss } from '@weapp-tailwindcss/postcss'
import { build } from 'vite'
import { describe, expect, it, vi } from 'vitest'
import { createJsHandler } from '@/js'
import { createUniAppXPlugins } from '@/uni-app-x/vite'

function handler(plugin: Plugin, name: 'load') {
  const hook = plugin[name]
  return typeof hook === 'function' ? hook : hook!.handler
}

async function compileMappedSource(position: 'before' | 'after', author = '<style scoped></style>') {
  const root = process.cwd()
  const file = path.join(root, 'MappedBorder.uvue')
  const snapshot: { sfc?: string, render?: string, styles: string[], loaded: string[] } = { styles: [], loaded: [] }
  const authorExit = vi.fn()
  const authorTransform: NodeTransform = () => authorExit
  const originalTransforms = [authorTransform]
  let vueOptions = { template: { compilerOptions: { nodeTransforms: originalTransforms } } }
  const api = {
    get options() { return vueOptions },
    set options(value) { vueOptions = value },
  }
  const plugins = createUniAppXPlugins({
    appType: 'uni-app-x',
    cssPreflight: { 'border-width': '0' },
    customAttributesEntities: [],
    disabledDefaultTemplateHandler: false,
    mainCssChunkMatcher: () => true,
    runtimeState: { readyPromise: Promise.resolve() },
    styleHandler: async code => postcss().process(code, { from: undefined }),
    jsHandler: createJsHandler({}),
    ensureRuntimeClassSet: async () => new Set(['border-t-[1px]', 'border-solid', 'border-[#e2e8f0]']),
    getResolvedConfig: () => ({ root, command: 'build', build: { outDir: 'dist/app-harmony', watch: false } }),
    uniAppX: {
      enabled: true,
      componentLocalStyles: { enabled: true, onlyWhenStyleIsolationVersion2: false, componentMatcher: () => true },
    },
  })
  const css = plugins.find(plugin => plugin.name === 'weapp-tailwindcss:uni-app-x:css:pre')!
  const mapper: Plugin = {
    name: 'fixture:html-to-native',
    enforce: 'pre',
    transform(code, id) {
      if (id === file) {
        return code.replaceAll('<div', '<view').replaceAll('</div', '</view')
      }
    },
  }
  const compiler: Plugin = {
    name: 'vite:vue',
    api,
    async transform(code, id) {
      if (id !== file) {
        return
      }
      snapshot.sfc = code
      const { descriptor, errors } = parse(code, { filename: file })
      expect(errors).toEqual([])
      snapshot.styles = descriptor.styles.map(style => style.content)
      for (const index of descriptor.styles.keys()) {
        const loaded = await handler(css, 'load').call({} as never, `${file}?vue&type=style&index=${index}&inline&lang.css`)
        snapshot.loaded.push(typeof loaded === 'object' && loaded !== null ? loaded.code : loaded ?? snapshot.styles[index]!)
      }
      const result = compileTemplate({
        source: descriptor.template!.content,
        filename: file,
        id: 'border-fixture',
        compilerOptions: api.options.template.compilerOptions,
      })
      expect(result.errors).toEqual([])
      snapshot.render = result.code
      return `export default ${JSON.stringify(result.code)}`
    },
  }
  await build({
    configFile: false,
    root,
    logLevel: 'silent',
    plugins: [
      {
        name: 'fixture:source',
        resolveId: id => id === file ? file : undefined,
        load: id => id === file
          ? `<template><div id="target" class="border-t-[1px] border-solid border-[#e2e8f0]"/><CustomCard /></template>${author}`
          : undefined,
      },
      ...(position === 'before' ? [mapper, ...plugins] : [...plugins, mapper]),
      compiler,
    ],
    build: { write: false, minify: false, rollupOptions: { input: file } },
  })
  expect(authorExit).toHaveBeenCalled()
  expect(originalTransforms).toEqual([authorTransform])
  return snapshot
}

describe('原生编译器边界的边框基础类', () => {
  it.each(['before', 'after'] as const)('HTML 映射在插件配置的 %s 位置也按真实宿主补齐', async (position) => {
    const output = await compileMappedSource(position)
    expect(output.render).toContain('weapp-tw-border')
    expect(output.sfc).toMatch(/<view id="target" class="wtu-/)
    expect(output.sfc).toContain('<CustomCard />')
    expect(output.styles).toHaveLength(2)
    expect(output.loaded).toEqual(output.styles)
    expect(output.styles[0]).toContain('.weapp-tw-border')
    expect(output.styles[1]).toContain('@apply border-t-[1px];')
  })

  it('保留多个作者块的真实索引与内容', async () => {
    const output = await compileMappedSource('after', '<style>.author { border-left-width: 3px; }</style><style scoped>.override { border-top-width: 2px; }</style>')
    expect(output.render).toContain('weapp-tw-border')
    expect(output.styles).toHaveLength(3)
    expect(output.loaded).toEqual(output.styles)
    expect(output.styles[1]).toBe('.author { border-left-width: 3px; }')
    expect(output.styles[2]).toContain('.override { border-top-width: 2px; }')
  })
})
