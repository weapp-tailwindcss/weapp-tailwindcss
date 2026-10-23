import type { VitePluginSlot } from '../../shared/plugin-slots'
import { createUniViteStyleInjector } from '@/style-injector/vite/uni'
import { frameworkRuntimeSlots, injectorPluginSlots, runtimeLifecycleSlot, sourcePluginSlots } from '../../shared/plugin-descriptors'

export const pluginSlots = [
  ...sourcePluginSlots,
  ...frameworkRuntimeSlots,
  ...injectorPluginSlots(createUniViteStyleInjector.slots),
  runtimeLifecycleSlot,
] satisfies VitePluginSlot[]
