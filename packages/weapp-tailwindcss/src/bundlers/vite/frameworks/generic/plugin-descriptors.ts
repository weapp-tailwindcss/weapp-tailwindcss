import type { VitePluginSlot } from '../../shared/plugin-slots'
import { createGenericViteStyleInjector } from '@/style-injector/vite/generic'
import { frameworkOutputSlots, frameworkTransformSlots, injectorPluginSlots, runtimeLifecycleSlot, sourcePluginSlots } from '../../shared/plugin-descriptors'

export const pluginSlots = [
  ...sourcePluginSlots,
  ...frameworkTransformSlots,
  ...injectorPluginSlots(createGenericViteStyleInjector.slots),
  ...frameworkOutputSlots,
  runtimeLifecycleSlot,
] satisfies VitePluginSlot[]
