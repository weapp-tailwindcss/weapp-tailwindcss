import type { ViteStyleInjectorDelegateFactory } from '../types'
import { weappStyleInjector } from 'weapp-style-injector/vite'

export const createGenericViteStyleInjector: ViteStyleInjectorDelegateFactory = options => [weappStyleInjector(options)]
