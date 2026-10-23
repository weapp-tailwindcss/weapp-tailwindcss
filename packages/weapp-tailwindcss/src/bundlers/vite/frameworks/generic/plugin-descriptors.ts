import type { VitePluginSlot } from '../../shared/plugin-slots'
import { createGenericViteStyleInjector } from '@/style-injector/vite/generic'
import { frameworkRuntimeSlots, injectorPluginSlots, runtimeLifecycleSlot, sourcePluginSlots } from '../../shared/plugin-descriptors'

export const pluginSlots = [
  ...sourcePluginSlots,
  ...frameworkRuntimeSlots,
  ...injectorPluginSlots(createGenericViteStyleInjector.slots),
  runtimeLifecycleSlot,
] satisfies VitePluginSlot[]
