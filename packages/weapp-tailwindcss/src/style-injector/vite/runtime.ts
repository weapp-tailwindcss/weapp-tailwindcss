import type { Plugin } from 'vite'
import type { WeappTailwindcssStyleInjectorUserOptions } from '../options'
import type { ViteStyleInjectorDelegateFactory } from '../types'
import { createDeferredVitePlugins } from '@/bundlers/vite/shared/plugin-slots'
import { normalizeStyleInjectorOptions } from '../options'

/** 公开工厂仅在配置解析后实例化；每个插件保留完整的钩子调用语义。 */
export function createBuiltinViteStyleInjectorPlugins(
  options: WeappTailwindcssStyleInjectorUserOptions | undefined,
  getDelegateFactory: () => ViteStyleInjectorDelegateFactory,
): Plugin[] {
  const normalized = normalizeStyleInjectorOptions(options)
  if (!normalized) {
    return []
  }
  const factory = getDelegateFactory()
  return createDeferredVitePlugins(factory.slots, () => factory(normalized))
}
