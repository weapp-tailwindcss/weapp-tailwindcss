import type { ViteStyleInjectorDelegateFactory } from '../types'
import type { VitePluginSlot } from '@/bundlers/vite/shared/plugin-slots'
import { StyleInjector } from 'weapp-style-injector/vite/uni-app'
import { omitUndefined } from '@/utils/object'
import { resolveStyleInjectorSubPackages } from '../options'
import { baseViteStyleInjectorSlot } from './descriptor'
import { toPluginArray } from './plugins'

export const createUniViteStyleInjector: ViteStyleInjectorDelegateFactory = Object.assign(
  (options: Parameters<ViteStyleInjectorDelegateFactory>[0]) => toPluginArray(StyleInjector(omitUndefined({ ...options, subPackages: resolveStyleInjectorSubPackages(options.subPackages, 'pagesJsonPath') }))),
  {
    slots: [
      {
        name: 'weapp-tailwindcss:style-injector-pre',
        pluginName: 'weapp-style-injector:uni-app-sub-packages',
        apply: 'build',
        enforce: 'pre',
        overrideEnforce: true,
        hooks: { configResolved: true, buildStart: true, load: true, transform: true },
      },
      baseViteStyleInjectorSlot,
    ] satisfies VitePluginSlot[],
  },
)
