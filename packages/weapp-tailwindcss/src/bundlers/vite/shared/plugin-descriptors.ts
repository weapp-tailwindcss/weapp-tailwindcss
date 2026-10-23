import type { VitePluginSlot } from './plugin-slots'
import { vitePluginName } from '@/constants'

export const rewriteCssImportsSlot = {
  name: `${vitePluginName}:rewrite-css-imports`,
  enforce: 'pre',
  hooks: { resolveId: true, transform: true },
} satisfies VitePluginSlot

export const sourcePluginSlots = [
  rewriteCssImportsSlot,
  { name: `${vitePluginName}:source-candidates`, enforce: 'pre', runtimeApply: true, hooks: { load: true, transform: { order: 'pre' }, watchChange: true, handleHotUpdate: { order: 'post' }, closeBundle: true, buildStart: true, moduleParsed: true, shouldTransformCachedModule: true, buildEnd: true, generateBundle: true } },
] satisfies VitePluginSlot[]

export const generationPluginSlots = [
  { name: `${vitePluginName}:generate:serve`, apply: 'serve', enforce: 'pre', hooks: { transform: true } },
  { name: `${vitePluginName}:generate:build`, apply: 'build', enforce: 'pre', hooks: { transform: true } },
  { name: `${vitePluginName}:generate:serve-hmr`, apply: 'serve', enforce: 'post', hooks: { transform: true } },
] satisfies VitePluginSlot[]

export const postPluginSlot = {
  name: `${vitePluginName}:post`,
  enforce: 'post',
  hooks: { config: true, configResolved: true, buildStart: true, generateBundle: { order: 'post' } },
} satisfies VitePluginSlot

export const cssFinalizerSlot = {
  name: `${vitePluginName}:css-finalizer`,
  enforce: 'post',
  hooks: { generateBundle: { order: 'post' } },
} satisfies VitePluginSlot

export const hmrVersionSlot = {
  name: 'weapp-tailwindcss:hmr-css-module-version',
  enforce: 'post',
  hooks: { handleHotUpdate: { order: 'post' } },
} satisfies VitePluginSlot

export const runtimeLifecycleSlot = {
  name: 'weapp-tailwindcss:runtime-lifecycle',
  ownsSession: true,
  enforce: 'post',
  hooks: { buildEnd: true, closeBundle: { order: 'post', sequential: true }, closeWatcher: { order: 'post', sequential: true } },
} satisfies VitePluginSlot

export const frameworkTransformSlots = [
  { name: 'weapp-tailwindcss:configured-css-entry-observer', hooks: { transform: true } },
  ...generationPluginSlots,
  { name: `${vitePluginName}:js:serve`, apply: 'serve', enforce: 'post', hooks: { transform: true } },
  { name: `${vitePluginName}:watch-css-cache`, hooks: { configResolved: { order: 'post' } } },
] satisfies VitePluginSlot[]

/** injector 先提交来源资产，再由 post 与 finalizer 完成生成和平台收尾。 */
export const frameworkOutputSlots = [
  postPluginSlot,
  cssFinalizerSlot,
  hmrVersionSlot,
] satisfies VitePluginSlot[]

/** 内置 injector 本身也是逐插件代理，因此包含静态初始化钩子。 */
export function injectorPluginSlots(slots: readonly VitePluginSlot[]): VitePluginSlot[] {
  return slots.map(({ name, enforce, apply, hooks }) => ({ name, ...(enforce ? { enforce } : {}), ...(apply ? { apply } : {}), hooks: { configResolved: true, ...hooks } }))
}
