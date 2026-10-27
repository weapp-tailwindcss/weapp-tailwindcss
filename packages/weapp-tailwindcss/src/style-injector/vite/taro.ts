import type { ViteStyleInjectorDelegateFactory } from '../types'
import type { VitePluginSlot } from '@/bundlers/vite/shared/plugin-slots'
import { StyleInjector } from 'weapp-style-injector/vite/taro'
import { omitUndefined } from '@/utils/object'
import { resolveStyleInjectorSubPackages } from '../options'
import { baseViteStyleInjectorSlot } from './descriptor'
import { toPluginArray } from './plugins'

export const createTaroViteStyleInjector: ViteStyleInjectorDelegateFactory = Object.assign(
  (options: Parameters<ViteStyleInjectorDelegateFactory>[0]) => toPluginArray(StyleInjector(omitUndefined({ ...options, subPackages: resolveStyleInjectorSubPackages(options.subPackages, 'appConfigPath') }))),
  {
    slots: [
      {
        name: 'weapp-tailwindcss:style-injector-pre',
        pluginName: 'weapp-style-injector:taro-source-style',
        apply: 'build',
        enforce: 'pre',
        overrideApply: true,
        hooks: { buildStart: true, transform: true },
      },
      baseViteStyleInjectorSlot,
    ] satisfies VitePluginSlot[],
  },
)
