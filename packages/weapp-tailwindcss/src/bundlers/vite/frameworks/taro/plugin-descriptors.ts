import type { VitePluginSlot } from '../../shared/plugin-slots'
import { createTaroViteStyleInjector } from '@/style-injector/vite/taro'
import { frameworkOutputSlots, frameworkTransformSlots, injectorPluginSlots, runtimeLifecycleSlot, sourcePluginSlots } from '../../shared/plugin-descriptors'

export const pluginSlots = [
  { name: 'weapp-tailwindcss:taro-alipay-browserslist-asset', enforce: 'pre', hooks: { generateBundle: true } },
  ...sourcePluginSlots,
  ...frameworkTransformSlots,
  ...injectorPluginSlots(createTaroViteStyleInjector.slots),
  ...frameworkOutputSlots,
  runtimeLifecycleSlot,
] satisfies VitePluginSlot[]
