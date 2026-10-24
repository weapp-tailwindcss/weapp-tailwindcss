import type { InternalUserDefinedOptions, UserDefinedOptions } from '@/types'
import { createUniAppWebpackStyleInjector } from '@/style-injector/webpack/uni-app'
import { WebpackFrameworkPlugin } from '../../shared/create-framework-plugin'
import { createDefaultLoaderAnchorFinders } from '../../shared/loader-anchors'

export class UniAppWebpackPlugin extends WebpackFrameworkPlugin {
  constructor(options: UserDefinedOptions | InternalUserDefinedOptions = {}) {
    super(options, {
      frameworkName: 'uni-app',
      loaderAnchorFinders: createDefaultLoaderAnchorFinders(),
      styleInjectorDelegate: createUniAppWebpackStyleInjector,
    })
  }
}
