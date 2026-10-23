import type { InternalUserDefinedOptions, UserDefinedOptions } from '@/types'
import { createMpxWebpackStyleInjector } from '@/style-injector/webpack/mpx'
import { WebpackFrameworkPlugin } from '../../shared/create-framework-plugin'
import { mpxCssImportRewrite } from './css-import-rewrite'
import { createMpxLoaderAnchorFinders } from './loader-anchors'
import { setupMpxTailwindcssRedirect } from './runtime'

export class MpxWebpackPlugin extends WebpackFrameworkPlugin {
  constructor(options: UserDefinedOptions | InternalUserDefinedOptions = {}) {
    super(options, {
      frameworkName: 'mpx',
      loaderAnchorFinders: createMpxLoaderAnchorFinders(),
      cssImportRewrite: mpxCssImportRewrite,
      setupCssImportRewriteRedirect: packageDir => setupMpxTailwindcssRedirect(packageDir, true),
      styleInjectorDelegate: createMpxWebpackStyleInjector,
    })
  }
}
