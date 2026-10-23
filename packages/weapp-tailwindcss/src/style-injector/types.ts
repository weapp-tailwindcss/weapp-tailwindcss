import type { Plugin } from 'vite'
import type { WebpackObjectPluginInstance } from 'weapp-style-injector/webpack'
import type { normalizeStyleInjectorOptions } from './options'
import type { normalizeWebpackStyleInjectorOptions } from './webpack/options'
import type { VitePluginSlot } from '@/bundlers/vite/shared/plugin-slots'

export interface ViteStyleInjectorDelegateFactory {
  (options: NonNullable<ReturnType<typeof normalizeStyleInjectorOptions>>): Plugin[]
  readonly slots: readonly VitePluginSlot[]
}
export type WebpackStyleInjectorDelegateFactory = (options: NonNullable<ReturnType<typeof normalizeWebpackStyleInjectorOptions>>) => WebpackObjectPluginInstance
