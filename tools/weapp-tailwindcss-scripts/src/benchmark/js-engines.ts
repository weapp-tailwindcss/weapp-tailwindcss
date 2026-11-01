import type { IJsHandlerOptions, JsHandlerResult } from 'weapp-tailwindcss/types'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolveCorePackagePath } from '../paths'

export type RunnableJsEngine = 'babel' | 'oxc'
export type ArchivedJsEngine = RunnableJsEngine | 'swc'
export type JsBenchmarkHandler = (code: string, options: IJsHandlerOptions) => JsHandlerResult | undefined

const require = createRequire(import.meta.url)

export function parseJsBenchmarkEngines(value = 'babel,oxc'): RunnableJsEngine[] {
  const entries = value.split(',').map(engine => engine.trim()).filter(Boolean)
  if (entries.length === 0) {
    throw new Error('--engines requires at least one engine')
  }
  return entries.map((engine) => {
    if (engine === 'swc') {
      throw new Error('SWC benchmark engine has been retired; archived SWC snapshots remain supported.')
    }
    if (engine !== 'babel' && engine !== 'oxc') {
      throw new Error(`Unknown benchmark engine: ${engine}`)
    }
    return engine
  })
}

export async function loadJsBenchmarkHandler(engine: RunnableJsEngine): Promise<JsBenchmarkHandler> {
  // 私有工具直接加载当前源码，测量仍使用原低级 handler，不加入外层缓存或生命周期。
  const source = engine === 'babel'
    ? resolveCorePackagePath('src', 'js', 'babel.ts')
    : resolveCorePackagePath('src', 'js', 'fast-path', 'oxc.ts')
  const implementation: { jsHandler?: JsBenchmarkHandler, oxcJsHandler?: JsBenchmarkHandler } = engine === 'babel'
    ? require(source)
    : await import(pathToFileURL(source).href)
  const handler = engine === 'babel' ? implementation.jsHandler : implementation.oxcJsHandler
  if (typeof handler !== 'function') {
    throw new TypeError(`Missing ${engine} benchmark handler in ${source}`)
  }
  return handler
}
