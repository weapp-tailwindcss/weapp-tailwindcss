import type { Plugin } from 'vite'
import type { CreateJsHandlerOptions, InternalUserDefinedOptions } from '@/types'
import { vitePluginName } from '@/constants'
import { shouldSkipViteJsTransform } from './js-precheck'
import { isCSSRequest, isHTMLRequest } from './utils'

const SPECIAL_QUERY_RE = /[?&](?:worker|sharedworker|raw|url)\b/

interface ViteServeJsTransformOptions {
  createHandlerOptions: (absoluteFilename: string, extra?: CreateJsHandlerOptions) => CreateJsHandlerOptions
  getCommand: () => string | undefined
  jsHandler: InternalUserDefinedOptions['jsHandler']
  shouldTransform: () => boolean
  transformRuntime: (id: string, source: string) => Promise<Set<string>> | Set<string>
}

function isViteServeJsRequest(id: string, command: string | undefined) {
  if (command !== 'serve' || SPECIAL_QUERY_RE.test(id) || isCSSRequest(id) || isHTMLRequest(id)) {
    return false
  }
  return /\.(?:[cm]?[jt]sx?|vue|svelte)(?:$|\?)/.test(id)
}

export function createViteServeJsTransformPlugin(options: ViteServeJsTransformOptions): Plugin {
  return {
    name: `${vitePluginName}:js:serve`,
    apply: 'serve',
    enforce: 'post',
    async transform(code, id) {
      if (!options.shouldTransform() || !isViteServeJsRequest(id, options.getCommand())) {
        return
      }
      const handlerOptions = options.createHandlerOptions(id)
      if (shouldSkipViteJsTransform(code, handlerOptions)) {
        return
      }
      const runtime = await options.transformRuntime(id, code)
      const { code: transformed } = await options.jsHandler(code, runtime, handlerOptions)
      if (transformed === code) {
        return
      }
      return {
        code: transformed,
        map: null,
      }
    },
  }
}
