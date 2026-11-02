import type { Plugin, ResolvedConfig } from 'vite'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createStyleHandler } from '@weapp-tailwindcss/postcss'
import { expect, it } from 'vitest'
import { extractSfcStyleBlocks } from '@/bundlers/vite/generate-bundle/sfc-style-source'
import { createWeappTailwindcssGenerator, resolveTailwindV4Source } from '@/generator'
import { createJsHandler } from '@/js'
import { createUniAppXPlugins } from '@/uni-app-x/vite'

function hook(plugin: Plugin, name: 'load' | 'transform') {
  const value = plugin[name] as any
  return typeof value === 'object' ? value.handler : value
}

it('records the Vapor demo SFC and generated native CSS for every author style variant', async () => {
  const root = path.resolve(import.meta.dirname, '../../../../demo/uni-app-x-vapor-tailwindcss-v4')
  const candidates = new Set(['h-[32px]', 'w-[120px]', 'bg-[#0e7490]'])
  const plugins = createUniAppXPlugins({
    appType: 'uni-app-x',
    cssPreflight: { 'border-width': '0' },
    customAttributesEntities: [],
    disabledDefaultTemplateHandler: false,
    mainCssChunkMatcher: () => false,
    runtimeState: { readyPromise: Promise.resolve() },
    styleHandler: createStyleHandler({ appType: 'uni-app-x', majorVersion: 4, uniAppX: true, uniAppXCssTarget: 'uvue' }),
    jsHandler: createJsHandler({}),
    ensureRuntimeClassSet: async () => candidates,
    getResolvedConfig: () => ({ root, command: 'build', build: { outDir: 'dist/app-ios' } } as ResolvedConfig),
    isIosPlatform: true,
    isWebGeneratorTarget: () => false,
    uniAppX: { componentLocalStyles: { enabled: true, onlyWhenStyleIsolationVersion2: false, componentMatcher: () => true } },
    generateCss: async (_id, code) => {
      const source = await resolveTailwindV4Source({ base: root, css: `@import "tailwindcss" source(none);\n${code}` })
      return (await createWeappTailwindcssGenerator(source).generate({ target: 'weapp', candidates: [], scanSources: false })).css
    },
  })
  const sfc = plugins.find(plugin => plugin.name === 'weapp-tailwindcss:uni-app-x:nvue')!
  const css = plugins.find(plugin => plugin.name === 'weapp-tailwindcss:uni-app-x:css:pre')!
  const files = ['pages/issue-1325/index.uvue', 'components/issue-1325/matrix.uvue', ...['none', 'plain', 'scoped', 'multiple'].map(name => `components/issue-1325/${name}.uvue`)]
  const artifacts = []
  for (const file of files) {
    const source = await fs.readFile(path.resolve(root, file), 'utf8')
    // 使用稳定的逻辑 module id，避免把机器绝对路径写进静态基线。
    const id = `issue-1325/${file}`
    const output = await hook(sfc, 'transform').call({}, source, id)
    const styles = []
    for (const style of extractSfcStyleBlocks(output.code)) {
      const request = `${id}?vue&type=style&index=${style.index}&inline&lang.css`
      const loaded = await hook(css, 'load').call({}, request)
      const input = loaded?.code ?? style.source
      const compiled = await hook(css, 'transform').call({}, input, request)
      styles.push({ index: style.index, attrs: style.attrs, css: compiled?.code ?? input })
    }
    const generated = styles.map(style => style.css).join('\n')
    expect(generated).toContain('120px')
    expect(generated).toContain('32px')
    expect(generated).toContain('#0e7490')
    expect(generated).not.toContain('@apply')
    artifacts.push({ file, source, transformed: output.code, styles })
  }
  // 这是插件层静态产物，不代表 HBuilderX 编译或设备运行已通过。
  const appSource = await fs.readFile(path.resolve(root, 'App.uvue'), 'utf8')
  await expect(JSON.stringify({ appSource, artifacts }, null, 2)).toMatchFileSnapshot('./__snapshots__/vapor-style-demo.json')
})
