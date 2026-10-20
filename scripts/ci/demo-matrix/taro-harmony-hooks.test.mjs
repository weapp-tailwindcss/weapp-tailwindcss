import { parseSync } from '@babel/core'
import { expect, it } from 'vitest'
import { packageSource, privateFunctions, taroRequire } from './taro-package.fixture.mjs'

it.each(['react', 'vue3'].flatMap(framework => ['harmony-hybrid', 'h5'].map(platform => [framework, platform])))('%s %s 开发与生产都提供 hooks，且保持各自的 taro 绑定', async (framework, platform) => {
  const source = packageSource(`plugin-platform-${platform}`, 'dist/runtime/apis/index.js')
  const helper = { ...taroRequire('@tarojs/helper'), fs: { readFile: async () => source } }
  const setTaroApi = privateFunctions(`plugin-framework-${framework}`, ['apiLoader', 'setTaroApi'], { helper, tslib: taroRequire('tslib'), process: { env: { NODE_ENV: 'production' } } })
  const plugin = setTaroApi()
  const ids = platform === 'h5'
    ? ['/deps/@tarojs/plugin-platform-h5/dist/runtime/apis/index.js']
    : [
        '/deps/@tarojs/plugin-platform-harmony-hybrid/dist/runtime/apis/index.js',
        String.raw`C:\deps\@tarojs\plugin-platform-harmony-hybrid\dist\runtime\apis\index.js`,
      ]
  for (const id of ids) {
    let onLoad
    let filter
    plugin.config().optimizeDeps.esbuildOptions.plugins[0].setup({
      onLoad(options, callback) {
        filter = options.filter
        onLoad = callback
      },
    })
    expect(filter.test(id)).toBe(true)
    const development = (await onLoad({ path: id })).contents
    const production = await plugin.load(id)
    for (const output of [development, production]) {
      expect(output).toContain('taro.useLoad = useLoad')
      const ast = parseSync(output, { babelrc: false, configFile: false })
      if (platform === 'h5') {
        expect(output).toContain('const taro = Taro__default')
      }
      else {
        expect(ast.program.body.filter(node => node.type === 'ImportDeclaration' && node.specifiers.some(item => item.local.name === 'taro'))).toHaveLength(1)
        expect(output).not.toContain('Taro__default')
      }
    }
    expect(development).toBe(production)
  }
  expect(await plugin.load('/deps/unrelated/dist/runtime/apis/index.js')).toBeUndefined()
})
