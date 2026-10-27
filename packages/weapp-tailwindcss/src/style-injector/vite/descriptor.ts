import type { VitePluginSlot } from '@/bundlers/vite/shared/plugin-slots'

/** 内置消费保留公开 injector 的产物阶段元数据。 */
export const baseViteStyleInjectorSlot: VitePluginSlot = {
  name: 'weapp-tailwindcss:style-injector',
  pluginName: 'weapp-style-injector',
  apply: 'build',
  enforce: 'post',
  hooks: { generateBundle: { order: 'post' } },
}
