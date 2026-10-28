import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

interface HtmlOptions {
  config: { designWidth: number, deviceRatio: Record<number, number>, htmlPluginOption?: Record<string, unknown> }
}

// 只执行真实 runner 的 HTML descriptor 与平台覆盖 hook，不实例化编译器或平台运行时。
export function createWebpackHtmlScript(templateRequire: NodeRequire) {
  const runnerRequire = createRequire(templateRequire.resolve('@tarojs/webpack5-runner/package.json'))
  const hybridRequire = createRequire(templateRequire.resolve('@tarojs/plugin-platform-harmony-hybrid/package.json'))
  const { H5WebpackPlugin } = runnerRequire('./dist/webpack/H5WebpackPlugin')
  const { H5 } = hybridRequire('./dist/index')
  return (_entry: string, options: HtmlOptions, platform: string) => {
    const config = { mode: 'production', ...options.config, postcss: { pxtransform: options } }
    const h5 = new H5WebpackPlugin({ config })
    h5.pxtransformOption = options
    const descriptor = h5.getHtmlWebpackPlugin('fixture.html') as { args: [{ script: string }] }
    if (platform === 'h5') {
      return `<script>${descriptor.args[0].script}</script>`
    }
    assert.equal(platform, 'harmony-hybrid')
    let htmlHooks = 0
    const rule = { test: () => rule, type: () => rule }
    const chain = {
      module: {
        rules: new Map([['script', { uses: new Map([['babelLoader', new Map([['options', {}]])]]) }]]),
        rule: () => rule,
      },
      resolve: { alias: new Map() },
      plugin: (name: string) => ({ tap: (callback: (args: typeof descriptor.args) => typeof descriptor.args) => {
        if (name === 'htmlWebpackPlugin') {
          htmlHooks++
          descriptor.args = callback(descriptor.args)
        }
      } }),
    }
    // mainPlugin 的运行时注册不执行；HTML tap 必须真实覆盖 H5 descriptor 中的脚本。
    H5.prototype.modifyWebpackConfig.call({
      ctx: { modifyWebpackChain: (callback: (input: { chain: typeof chain }) => void) => callback({ chain }) },
      config,
      libraryDefinition: hybridRequire.resolve('./dist/definition.json'),
      componentLibrary: 'fixture-components',
      componentAdapter: 'fixture-adapter',
      routerLibrary: 'fixture-router',
      apiLibrary: 'fixture-api',
    })
    assert.equal(htmlHooks, 1, '必须执行真实 Hybrid htmlWebpackPlugin 覆盖 hook')
    return `<script>${descriptor.args[0].script}</script>`
  }
}
