import type { InternalUserDefinedOptions, UserDefinedOptions } from '@/types'
import { createTaroWebpackStyleInjector } from '@/style-injector/webpack/taro'
import { WebpackFrameworkPlugin } from '../../shared/create-framework-plugin'
import { createDefaultLoaderAnchorFinders } from '../../shared/loader-anchors'

export class TaroWebpackPlugin extends WebpackFrameworkPlugin {
  constructor(options: UserDefinedOptions | InternalUserDefinedOptions = {}) {
    super(options, {
      frameworkName: 'taro',
      loaderAnchorFinders: createDefaultLoaderAnchorFinders(),
      styleInjectorDelegate: createTaroWebpackStyleInjector,
    })
  }
}
