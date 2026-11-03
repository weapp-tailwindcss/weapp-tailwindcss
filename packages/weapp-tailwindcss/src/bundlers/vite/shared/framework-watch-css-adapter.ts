import type { IStyleHandlerOptions, StyleHandler } from '@weapp-tailwindcss/postcss/types'
import type { ResolvedConfig } from 'vite'
import type { ViteSfcStyleSnapshot } from '../css-memory/sfc-snapshot'
import { hasBundlerGeneratedCssMarker } from '../../shared/generated-css-marker'
import { isSfcStyleSourceFile, resolveSfcStyleRequestFromBlocks } from '../generate-bundle/sfc-style-source'
import { cleanUrl, isCSSRequest } from '../utils'
import { wrapViteCssPostOutput } from '../watch-css-output'
import { wrapViteCssPostTransform } from '../watch-css-post'

interface FrameworkWatchCssAdapterOptions {
  shouldAdapt: () => boolean
  getKnownSfcStyleSnapshot: (file: string) => ViteSfcStyleSnapshot | undefined
  getCssHandlerOptions: (file: string) => Partial<IStyleHandlerOptions>
  styleHandler: StyleHandler
  debug: (format: string, ...args: unknown[]) => void
}

/** 将框架 CSS 缓存与空输出适配收敛到同一生命周期入口。 */
export function createFrameworkWatchCssCacheAdapter(options: FrameworkWatchCssAdapterOptions) {
  return (config: ResolvedConfig) => {
    if (!options.shouldAdapt()) {
      return
    }
    wrapViteCssPostOutput(config)
    const wrapped = wrapViteCssPostTransform(config, async (css, id) => {
      if (!isCSSRequest(id)) {
        return css
      }
      if (hasBundlerGeneratedCssMarker(css)) {
        options.debug('preserve adapted generated css before uni-app watch cache: %s', id)
        return css
      }
      const file = cleanUrl(id)
      const isSfc = isSfcStyleSourceFile(file)
      const sfcSnapshot = isSfc ? options.getKnownSfcStyleSnapshot(file) : undefined
      const styleRequest = isSfc
        ? resolveSfcStyleRequestFromBlocks(file, sfcSnapshot?.styles ?? [], css, id)
        : id
      const transformed = (await options.styleHandler(css, options.getCssHandlerOptions(styleRequest))).css
      options.debug('adapt css before uni-app watch cache: %s', id)
      return transformed
    })
    if (wrapped) {
      options.debug('adapt uni-app watch css before vite:css-post cache')
    }
  }
}
