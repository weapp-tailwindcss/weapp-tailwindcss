import type { Plugin } from 'vite'
import type { WebpackObjectPluginInstance } from 'weapp-style-injector/webpack'
import type { normalizeStyleInjectorOptions } from './options'
import type { normalizeWebpackStyleInjectorOptions } from './webpack/options'

export type ViteStyleInjectorDelegateFactory = (options: NonNullable<ReturnType<typeof normalizeStyleInjectorOptions>>) => Plugin[]
export type WebpackStyleInjectorDelegateFactory = (options: NonNullable<ReturnType<typeof normalizeWebpackStyleInjectorOptions>>) => WebpackObjectPluginInstance
