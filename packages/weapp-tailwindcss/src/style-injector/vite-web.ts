import type { Plugin } from 'vite'
import type { WeappTailwindcssStyleInjectorUserOptions } from './options'
import { weappStyleInjector } from 'weapp-style-injector/vite'
import { createDeferredVitePlugins } from '@/bundlers/vite/shared/plugin-slots'
import { normalizeStyleInjectorOptions } from './options'
import { baseViteStyleInjectorSlot } from './vite/descriptor'

export const webStyleInjectorSlots = [{
  ...baseViteStyleInjectorSlot,
  name: 'weapp-tailwindcss:web-style-injector',
}]

/** Generic Web 继续使用公开工厂，完整保留产物钩子元数据。 */
export function createBuiltinViteWebStyleInjectorPlugins(
  options: WeappTailwindcssStyleInjectorUserOptions | undefined,
): Plugin[] {
  const normalized = normalizeStyleInjectorOptions(options)
  return normalized ? createDeferredVitePlugins(webStyleInjectorSlots, () => [weappStyleInjector(normalized)]) : []
}
