import type { VitePluginSlot } from '../../shared/plugin-slots'
import { vitePluginName } from '@/constants'
import { webStyleInjectorSlots } from '@/style-injector/vite-web'
import { cssFinalizerSlot, generationPluginSlots, hmrVersionSlot, injectorPluginSlots, postPluginSlot, runtimeLifecycleSlot, sourcePluginSlots } from '../../shared/plugin-descriptors'

export const webPluginSlots = [
  sourcePluginSlots[0]!,
  { name: `${vitePluginName}:web-source-candidates`, enforce: 'pre', hooks: { transform: true, watchChange: true, handleHotUpdate: true } },
  ...generationPluginSlots,
  postPluginSlot,
  { ...cssFinalizerSlot, name: `${vitePluginName}:web-css-finalizer` },
  hmrVersionSlot,
  ...injectorPluginSlots(webStyleInjectorSlots),
  runtimeLifecycleSlot,
] satisfies VitePluginSlot[]
