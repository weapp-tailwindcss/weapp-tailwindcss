// 默认配置生成逻辑，集中维护小程序环境下的基础能力开关
import type { IStyleHandlerOptions } from './types'

// getDefaultOptions 会根据用户传入的部分配置动态补全剩余字段
export function getDefaultOptions(options?: Partial<IStyleHandlerOptions>): Partial<IStyleHandlerOptions> {
  return {
    // 参考：https://github.com/postcss/postcss-calc
    cssPresetEnv: {
      features: {
        'is-pseudo-class': {
          specificityMatchingName: 'weapp-tw-ig',
        },
        'oklab-function': true,
        'color-mix': true,
        'color-functional-notation': options?.cssPresetEnv?.features?.['color-functional-notation']
          ?? { preserve: false },
        // calc 的变量静态化由作用域感知管线负责；仅保留用户显式开启的独立 preset。
        'custom-properties': options?.cssPresetEnv?.features?.['custom-properties'] ?? false,
      },
      autoprefixer: {
        add: false,
      },
    },
    // 支付宝小程序不支持，所以默认关闭
    cssRemoveProperty: true,
    cssRemoveFocusPseudoClass: true,
    uniAppXUnsupported: 'warn',
    // cssRemoveAtSupports: true,
    // cssRemoveAtMedia: true,
    cssSelectorReplacement: {
      root: ['page', '.tw-root', 'wx-root-portal-content'],
      universal: ['view', 'text'],
    },
  }
}
