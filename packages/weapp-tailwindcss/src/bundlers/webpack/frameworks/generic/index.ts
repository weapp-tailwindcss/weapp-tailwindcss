import type { InternalUserDefinedOptions, UserDefinedOptions } from '@/types'
import { createGenericWebpackStyleInjector } from '@/style-injector/webpack/generic'
import { WebpackFrameworkPlugin } from '../../shared/create-framework-plugin'
import { createDefaultLoaderAnchorFinders } from '../../shared/loader-anchors'

export class GenericWebpackPlugin extends WebpackFrameworkPlugin {
  constructor(options: UserDefinedOptions | InternalUserDefinedOptions = {}) {
    super(options, {
      frameworkName: 'generic',
      loaderAnchorFinders: createDefaultLoaderAnchorFinders(),
      styleInjectorDelegate: createGenericWebpackStyleInjector,
    })
  }
}
