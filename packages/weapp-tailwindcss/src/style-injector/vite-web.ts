import type { Plugin } from 'vite'
import type { WeappTailwindcssStyleInjectorUserOptions } from './options'
import { weappStyleInjector } from 'weapp-style-injector/vite'
import { getViteHookHandler } from '@/bundlers/vite/plugin-hook'
import { normalizeStyleInjectorOptions } from './options'

/** Generic Web 专用 style injector，避免引入其他构建器和框架适配。 */
export function createBuiltinViteWebStyleInjectorPlugins(
  options: WeappTailwindcssStyleInjectorUserOptions | undefined,
): Plugin[] {
  const normalized = normalizeStyleInjectorOptions(options)
  if (!normalized) {
    return []
  }
  const injector = weappStyleInjector(normalized)
  const transform = getViteHookHandler(injector.transform)
  const generateBundle = getViteHookHandler(injector.generateBundle)
  return [
    {
      name: 'weapp-tailwindcss:web-style-injector-pre',
      apply: 'build',
      enforce: 'pre',
      configResolved(config) {
        return getViteHookHandler(injector.configResolved)?.call(this, config)
      },
      async buildStart(buildOptions) {
        await getViteHookHandler(injector.buildStart)?.call(this, buildOptions)
      },
      async transform(code, id, options2) {
        return transform?.call(this, code, id, options2)
      },
    },
    {
      name: 'weapp-tailwindcss:web-style-injector',
      apply: 'build',
      enforce: 'post',
      configResolved(config) {
        return getViteHookHandler(injector.configResolved)?.call(this, config)
      },
      async generateBundle(outputOptions, bundle, isWrite) {
        await generateBundle?.call(this, outputOptions, bundle, isWrite)
      },
    },
  ]
}
