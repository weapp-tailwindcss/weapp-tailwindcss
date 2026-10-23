import type { WebpackObjectPluginInstance } from 'weapp-style-injector/webpack'
import type { WeappTailwindcssStyleInjectorUserOptions } from '../options'
import type { WebpackStyleInjectorDelegateFactory } from '../types'
import { normalizeWebpackStyleInjectorOptions } from './options'

export function createBuiltinWebpackStyleInjectorPlugin(
  options: WeappTailwindcssStyleInjectorUserOptions | undefined,
  delegateFactory: WebpackStyleInjectorDelegateFactory,
): WebpackObjectPluginInstance | undefined {
  const normalized = normalizeWebpackStyleInjectorOptions(options)
  if (!normalized) {
    return undefined
  }
  return delegateFactory(normalized)
}
