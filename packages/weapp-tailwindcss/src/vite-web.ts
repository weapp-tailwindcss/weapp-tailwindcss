import type { UserDefinedOptions } from './types'
import { WeappTailwindcss } from './bundlers/vite'

/**
 * 创建面向普通 Vite Web 项目的 Tailwind 插件。
 *
 * 该入口固定 Web target，并跳过基于项目依赖的框架猜测；需要小程序、分包
 * 或框架专用能力时，请继续使用 `weapp-tailwindcss/vite` 主入口。
 */
export function WeappTailwindcssWeb(options: UserDefinedOptions = {}) {
  const generator = options.generator && typeof options.generator === 'object'
    ? { ...options.generator, target: 'web' as const }
    : { target: 'web' as const }
  return WeappTailwindcss({
    ...options,
    appType: undefined,
    platform: 'web',
    generator,
    __internalViteForceGenericWeb: true,
  } as UserDefinedOptions & { __internalViteForceGenericWeb: true })
}

/** 小写别名，兼容函数式 Vite 配置风格。 */
export const weappTailwindcssWeb = WeappTailwindcssWeb

export type { UserDefinedOptions }
