import type { VitePluginSlot } from '../../shared/plugin-slots'
import { createUniViteStyleInjector } from '@/style-injector/vite/uni'
import { frameworkOutputSlots, frameworkTransformSlots, injectorPluginSlots, runtimeLifecycleSlot, sourcePluginSlots } from '../../shared/plugin-descriptors'

export const pluginSlots = [
  { name: 'weapp-tailwindcss:runtime-invalidation', enforce: 'pre', hooks: { watchChange: true, handleHotUpdate: { order: 'pre' } } },
  { name: 'weapp-tailwindcss:uni-app-x:css:pre', enforce: 'pre', hooks: { transform: true, load: { order: 'pre' }, handleHotUpdate: { order: 'pre' } } },
  { name: 'weapp-tailwindcss:uni-app-x:css', hooks: { transform: true } },
  ...sourcePluginSlots,
  { name: 'weapp-tailwindcss:uni-app-x:nvue', enforce: 'pre', hooks: { buildStart: true, transform: { order: 'pre' }, handleHotUpdate: { order: 'post' }, buildEnd: true, closeBundle: true } },
  ...frameworkTransformSlots,
  ...injectorPluginSlots(createUniViteStyleInjector.slots),
  { name: 'weapp-tailwindcss:uni-app-x:style-placeholder', enforce: 'post', hooks: { generateBundle: { order: 'post' } } },
  ...frameworkOutputSlots,
  runtimeLifecycleSlot,
  { name: 'weapp-tailwindcss:framework-css-emission-finalizer', enforce: 'post', hooks: { generateBundle: { order: 'post' } } },
] satisfies VitePluginSlot[]
