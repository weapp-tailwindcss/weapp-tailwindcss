import type { VitePluginSlot } from '../../shared/plugin-slots'
import { createUniViteStyleInjector } from '@/style-injector/vite/uni'
import { frameworkOutputSlots, frameworkTransformSlots, injectorPluginSlots, runtimeLifecycleSlot, sourcePluginSlots } from '../../shared/plugin-descriptors'

export const pluginSlots = [
  ...sourcePluginSlots,
  ...frameworkTransformSlots,
  ...injectorPluginSlots(createUniViteStyleInjector.slots),
  ...frameworkOutputSlots,
  runtimeLifecycleSlot,
] satisfies VitePluginSlot[]
