import type { VitePluginSlot } from '../../shared/plugin-slots'
import { createUniViteStyleInjector } from '@/style-injector/vite/uni'
import { frameworkOutputSlots, frameworkTransformSlots, injectorPluginSlots, runtimeLifecycleSlot, sourcePluginSlots } from '../../shared/plugin-descriptors'

export const pluginSlots = [
  { name: 'weapp-tailwindcss:uni-app-skyline-typography', enforce: 'pre', hooks: { transform: { order: 'pre' }, handleHotUpdate: { order: 'pre' }, watchChange: true, closeWatcher: true, closeBundle: true } },
  ...sourcePluginSlots,
  ...frameworkTransformSlots,
  ...injectorPluginSlots(createUniViteStyleInjector.slots),
  ...frameworkOutputSlots,
  runtimeLifecycleSlot,
] satisfies VitePluginSlot[]
