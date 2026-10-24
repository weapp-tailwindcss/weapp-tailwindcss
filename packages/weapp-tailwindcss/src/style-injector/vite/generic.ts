import type { ViteStyleInjectorDelegateFactory } from '../types'
import { weappStyleInjector } from 'weapp-style-injector/vite'
import { baseViteStyleInjectorSlot } from './descriptor'

export const createGenericViteStyleInjector: ViteStyleInjectorDelegateFactory = Object.assign(
  (options: Parameters<ViteStyleInjectorDelegateFactory>[0]) => [weappStyleInjector(options)],
  { slots: [baseViteStyleInjectorSlot] },
)
