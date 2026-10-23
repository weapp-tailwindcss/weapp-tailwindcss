import type { Plugin } from 'vite'
import type { ViteFrameworkCssPipelineStrategy } from '../../shared/framework-strategy'
import type { InternalUserDefinedOptions, UserDefinedOptions } from '@/types'
import { resolveFrameworkEnvironment } from '@/framework-policies/environment-snapshot'
import { createTaroViteStyleInjector } from '@/style-injector/vite/taro'
import { createViteFrameworkPlugins } from '../../shared/create-framework-plugins'
import { createFrameworkAssetPlugin } from '../../shared/framework-asset-plugin'

export const taroCssPipelineStrategy: ViteFrameworkCssPipelineStrategy = {
  styles: {
    rootImportShell: 'extract',
  },
}

function createTaroAlipayBrowserslistAssetPlugin(target: string | undefined): Plugin {
  return createFrameworkAssetPlugin({
    name: 'weapp-tailwindcss:taro-alipay-browserslist-asset',
    enforce: 'pre',
    generateBundle(assets) {
      if (target !== 'alipay') {
        return
      }
      // Taro Alipay 插件会在 modifyBuildAssets 中写入该文件；Vite runner 需要它先存在于 bundle 图中。
      if (assets.read()['.browserslistrc']) {
        assets.replaceText('.browserslistrc', 'defaults and fully supports es6-module')
      }
      else {
        assets.emit('.browserslistrc', 'defaults and fully supports es6-module')
      }
    },
  })
}

export function createTaroVitePlugins(options: UserDefinedOptions | InternalUserDefinedOptions = {}) {
  const plugins = createViteFrameworkPlugins(options, {
    frameworkName: 'taro',
    cssPipelineStrategy: taroCssPipelineStrategy,
    styleInjectorDelegate: createTaroViteStyleInjector,
  })
  if (!plugins) {
    return undefined
  }
  return [
    createTaroAlipayBrowserslistAssetPlugin(resolveFrameworkEnvironment(options).values.TARO_ENV),
    ...plugins,
  ]
}
